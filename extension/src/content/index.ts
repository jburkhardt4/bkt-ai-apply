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
import type { BoardConfig } from '../types'
import { buildPayload } from '../payload'
import {
  MSG,
  type AuthStatusResponse,
  type BackgroundRequest,
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

async function onAutofill(config: BoardConfig): Promise<void> {
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
  const report = await applyAutofill({ config, payload: buildPayload(res.profile) })
  const fileNote = report.skipped.some((s) => s.reason === 'manual_required')
    ? ' Attach your resume manually.'
    : ''
  setStatus(`Filled ${report.filled.length} field(s). Review, then submit yourself.${fileNote}`)
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
