// BKT Apply-Macro — MV3 content script entry (ATS pages).
//
// On a supported ATS host it renders the Match-Score panel + a human-triggered
// "Autofill" affordance, both powered by the user's own Supabase session
// (brokered by the background worker — the session handoff, spec §8). The user
// stays in control and submits manually (BR-151). Inert on unsupported hosts
// (UAT-5). NO keys here (BR-122) — all auth + data access lives behind the
// background worker.

import { resolveBoardConfig } from '../configs'
import { applyAutofill } from '../autofill'
import { renderMatchScorePanel } from '../matchScorePanel'
import type { AutofillPayload, BoardConfig } from '../types'
import { buildPayload } from '../payload'
import { detectStopConditions, describeStopReason } from '../stopConditions'
import {
  MSG,
  type AuthStatusResponse,
  type BackgroundRequest,
  type PreparedResponse,
  type ProfileResponse,
  type ScoreResponse,
  type ScrapedJob,
} from '../messages'

const SIGN_IN_HINT = 'Sign in at the BKT web app to score & autofill.'

/** Round-trips a request to the background worker; null on any failure. */
function send<T>(msg: BackgroundRequest): Promise<T | null> {
  try {
    return (chrome.runtime.sendMessage(msg) as Promise<T>).catch(() => null)
  } catch {
    return Promise.resolve(null)
  }
}

function setStatus(text: string): void {
  const el = document.getElementById('bkt-apply-status')
  if (el) el.textContent = text
}

/** Scrapes the JD per the board config; clamped to the scoring token budget. */
function scrapeJob(config: BoardConfig): ScrapedJob {
  const titleEl = config.jd.title ? document.querySelector(config.jd.title) : null
  const containerEl = config.jd.container ? document.querySelector(config.jd.container) : null
  const title = (titleEl?.textContent ?? document.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const description = (containerEl?.textContent ?? document.body?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12_000)
  return { title, description, url: location.href, host: location.host }
}

/** Injects the floating-panel styles once. Fixed top-right, max z-index, and
 *  !important rules so the panel is visible regardless of the host page's CSS
 *  (a lightweight stand-in for the shadow-root isolation noted in spec §2). */
function injectStyles(): void {
  if (document.getElementById('bkt-apply-styles')) return
  const style = document.createElement('style')
  style.id = 'bkt-apply-styles'
  style.textContent = `
#bkt-apply-root, #bkt-fit-panel {
  position: fixed !important; right: 16px !important; z-index: 2147483647 !important;
  box-sizing: border-box !important; background: #ffffff !important;
  border: 1px solid #e2e8f0 !important; border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(15,23,42,.18) !important; color: #0f172a !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}
#bkt-apply-root { top: 16px !important; display: flex !important; align-items: center !important; gap: 8px !important; padding: 10px 12px !important; }
#bkt-fit-panel { top: 74px !important; width: 320px !important; max-height: 70vh !important; overflow: auto !important; padding: 12px 14px !important; font-size: 13px !important; line-height: 1.45 !important; }
#bkt-fit-panel ul { margin: 4px 0 8px !important; padding-left: 18px !important; }
#bkt-fit-panel [data-bkt="score"] { font-weight: 700 !important; font-size: 15px !important; }
#bkt-score-btn, #bkt-autofill-btn { cursor: pointer !important; border: 0 !important; border-radius: 8px !important; padding: 8px 10px !important; font-size: 13px !important; font-weight: 600 !important; color: #fff !important; white-space: nowrap !important; }
#bkt-score-btn { background: #2563eb !important; }
#bkt-autofill-btn { background: #0f172a !important; }
#bkt-apply-status { font-size: 12px !important; color: #475569 !important; max-width: 220px !important; }
`
  ;(document.head ?? document.documentElement).appendChild(style)
}

/** Initial panel so #bkt-fit-panel exists before the user scores (UAT-1);
 *  renderMatchScorePanel replaces it in place once a score arrives. */
function renderInitialPanel(): void {
  document.getElementById('bkt-fit-panel')?.remove()
  const panel = document.createElement('div')
  panel.id = 'bkt-fit-panel'
  panel.setAttribute('data-bkt', 'fit-panel')
  panel.setAttribute('role', 'complementary')
  const msg = document.createElement('div')
  msg.setAttribute('data-bkt', 'score')
  msg.textContent = 'Not scored yet — click “Get Match Score”.'
  panel.appendChild(msg)
  document.body.appendChild(panel)
}

async function onScore(config: BoardConfig): Promise<void> {
  setStatus('Scoring this role…')
  const res = await send<ScoreResponse>({ type: MSG.SCORE, job: scrapeJob(config) })
  if (!res) {
    setStatus('Could not reach the extension background.')
    return
  }
  if (res.ok) {
    renderMatchScorePanel(res.score)
    setStatus('Match score updated.')
  } else if (res.reason === 'needs_login') {
    setStatus(SIGN_IN_HINT)
  } else {
    setStatus(`Scoring failed: ${res.message ?? 'unknown error'}`)
  }
}

/** Surfaces hard stop-conditions on the page (CAPTCHA / MFA / login wall). The
 *  macro stands down on these — it never bypasses or auto-submits past them
 *  (BR-151). Returns a human-readable clause appended to the status, or ''. */
function stopConditionNote(): string {
  const { reasons } = detectStopConditions(document)
  if (!reasons.length) return ''
  const list = reasons.map(describeStopReason).join(', ')
  return ` This page also has ${list} — finish that step yourself.`
}

/** Note for any review-gated fields the macro deliberately left for the human
 *  (sensitive: work auth, sponsorship, EEO, salary, legal — always DB-gated). */
function gatedNote(gated: string[]): string {
  if (!gated.length) return ''
  return ` ${gated.length} sensitive field(s) need your review — fill those yourself.`
}

/** Runs the autofill macro with a payload and reports the outcome to the user,
 *  appending file/gated/stop-condition guidance. Never auto-submits (BR-151). */
async function runAutofill(
  config: BoardConfig,
  payload: AutofillPayload,
  gated: string[],
  source: 'prepared' | 'profile',
): Promise<void> {
  const report = await applyAutofill({ config, payload })
  const fileNote = report.skipped.some((s) => s.reason === 'manual_required')
    ? ' Attach your resume manually.'
    : ''
  const label = source === 'prepared' ? 'Prepared autofill' : 'Filled'
  setStatus(
    `${label}: ${report.filled.length} field(s). Review, then submit yourself.` +
      `${fileNote}${gatedNote(gated)}${stopConditionNote()}`,
  )
}

/** Prefer a server-prepared application for this page (non-gated fields only);
 *  null when none exists / not signed in / on error → caller falls back to the
 *  profile path. Best-effort and never throws. */
async function tryPreparedAutofill(config: BoardConfig): Promise<boolean> {
  const res = await send<PreparedResponse>({ type: MSG.PREPARED, job: { url: location.href } })
  if (!res || !res.ok) return false
  // A blocked prepared row is a hard stop — surface it, do not fill.
  if (res.status === 'blocked') {
    setStatus(`This application is blocked from autofill — open it in the BKT app.${gatedNote(res.gated)}`)
    return true
  }
  await runAutofill(config, res.payload, res.gated, 'prepared')
  return true
}

async function onAutofill(config: BoardConfig): Promise<void> {
  setStatus('Looking for a prepared application…')
  // Prefer server-prepared data when it exists for this page (it carries only the
  // non-gated fields; sensitive fields stay with the human). Fall back to the
  // static-config profile path otherwise.
  if (await tryPreparedAutofill(config)) return

  setStatus('Fetching your profile…')
  const res = await send<ProfileResponse>({ type: MSG.PROFILE })
  if (!res) {
    setStatus('Could not reach the extension background.')
    return
  }
  if (!res.ok) {
    setStatus(
      res.reason === 'needs_login'
        ? SIGN_IN_HINT
        : res.reason === 'no_profile'
          ? 'No candidate profile found — add one in the BKT app.'
          : `Autofill failed: ${res.message ?? 'unknown error'}`,
    )
    return
  }
  await runAutofill(config, buildPayload(res.profile), [], 'profile')
}

function buildControls(config: BoardConfig): void {
  if (document.getElementById('bkt-apply-root')) return
  const root = document.createElement('div')
  root.id = 'bkt-apply-root'
  root.setAttribute('data-bkt', 'apply-root')

  const scoreBtn = document.createElement('button')
  scoreBtn.id = 'bkt-score-btn'
  scoreBtn.type = 'button'
  scoreBtn.textContent = 'BKT: Get Match Score'
  scoreBtn.addEventListener('click', () => void onScore(config))

  const fillBtn = document.createElement('button')
  fillBtn.id = 'bkt-autofill-btn'
  fillBtn.type = 'button'
  fillBtn.textContent = 'BKT: Autofill'
  // Human-triggered only — never auto-runs, never auto-submits (BR-151).
  fillBtn.addEventListener('click', () => void onAutofill(config))

  const status = document.createElement('div')
  status.id = 'bkt-apply-status'
  status.setAttribute('data-bkt', 'status')

  root.append(scoreBtn, fillBtn, status)
  document.body.appendChild(root)
}

async function init(): Promise<void> {
  const config = resolveBoardConfig(location.host)
  if (!config) return // inert on unsupported hosts (UAT-5)

  // Marker so a loaded-extension smoke (and the background) can confirm injection.
  document.documentElement.setAttribute('data-bkt-apply', config.ats)
  injectStyles()
  renderInitialPanel()
  buildControls(config)

  // Reflect auth status — also proves the content↔background handoff is live.
  const status = await send<AuthStatusResponse>({ type: MSG.AUTH_STATUS })
  document.documentElement.setAttribute(
    'data-bkt-auth',
    status ? (status.signedIn ? 'signed-in' : 'signed-out') : 'unavailable',
  )
  setStatus(status?.signedIn ? 'Signed in — ready.' : SIGN_IN_HINT)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init())
} else {
  void init()
}
