/**
 * browserAdapter — Browserbase + Stagehand fallback channel (ADR-006 §4, BR-134).
 *
 * The browser channel handles every posting that is not an addressable ATS
 * (application_method 'manual' / null, or an 'api'/'ats' posting on an unknown
 * host). Edge Functions cannot run a browser, so we drive a cloud browser via
 * Browserbase's REST API.
 *
 * HONEST SCOPE FOR THIS BUILD (brief): bootstrap + handoff only. We do NOT
 * attempt full unattended form-filling here — Stagehand form-driving is the
 * GAP-010 follow-up spike. Behavior:
 *
 *   • If BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID is missing →
 *       { success:false, channel:'browser', error:'browser_not_configured' }
 *     (graceful; never throws).
 *
 *   • If both present → bootstrap a Browserbase session via their REST API and
 *     return the session/connect info as audit metadata, but still a FAILURE
 *     outcome:
 *       { success:false, channel:'browser', error:'manual_required',
 *         metadata:{ browserbaseSessionId, note:'Stagehand form-driving is the
 *                    GAP-010 follow-up spike' } }
 *     The RPC refunds the credit and records the failure; the row falls to
 *     manual with a visible reason — never a silent or fabricated submit.
 *
 * BR-032/033/034 remain binding and are NOT bypassed here: no CAPTCHA solving,
 * no rate-limit circumvention, no driving behind an auth wall. A bootstrap that
 * cannot proceed within those rules stays a manual_required failure.
 *
 * Documented endpoint (cited):
 *   POST https://api.browserbase.com/v1/sessions
 *   headers: X-BB-API-Key: <key>, content-type: application/json
 *   body:    { projectId: <project id> }
 *   → 201 { id, connectUrl?, seleniumRemoteUrl?, ... }
 */

import type { SubmissionInput, SubmissionOutcome } from './types.ts'

const BROWSERBASE_SESSIONS_ENDPOINT = 'https://api.browserbase.com/v1/sessions'

export async function browserAdapter(input: SubmissionInput): Promise<SubmissionOutcome> {
  const apiKey = Deno.env.get('BROWSERBASE_API_KEY')
  const projectId = Deno.env.get('BROWSERBASE_PROJECT_ID')

  // Not configured → graceful failure, no network call.
  if (!apiKey || !projectId) {
    return {
      success: false,
      channel: 'browser',
      error: 'browser_not_configured',
      metadata: {
        reason: 'BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID not set',
        sourceUrl: input.sourceUrl,
      },
    }
  }

  // Bootstrap a cloud browser session (handoff point — no autopilot).
  let sessionId: string | undefined
  let connectInfo: Record<string, unknown> | undefined
  try {
    const res = await fetch(BROWSERBASE_SESSIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-BB-API-Key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId }),
    })

    if (!res.ok) {
      // Bootstrap itself failed — report as a browser failure (credit refunded).
      const status = res.status
      return {
        success: false,
        channel: 'browser',
        error: `browser_bootstrap_http_${status}`,
        metadata: {
          reason: 'Browserbase session create failed',
          status,
          sourceUrl: input.sourceUrl,
        },
      }
    }

    const data = (await res.json()) as {
      id?: string
      connectUrl?: string
      seleniumRemoteUrl?: string
      signingKey?: string
    }
    sessionId = data.id
    // Capture connect info for the follow-up Stagehand spike — but NEVER echo a
    // secret. We deliberately omit signingKey/any credential from metadata.
    connectInfo = {
      connectUrl: data.connectUrl,
      seleniumRemoteUrl: data.seleniumRemoteUrl,
    }
  } catch (err) {
    return {
      success: false,
      channel: 'browser',
      error: 'browser_bootstrap_failed',
      metadata: {
        message: err instanceof Error ? err.message : String(err),
        sourceUrl: input.sourceUrl,
      },
    }
  }

  // Session bootstrapped. Hand off — do not attempt unattended form-filling.
  return {
    success: false,
    channel: 'browser',
    error: 'manual_required',
    metadata: {
      browserbaseSessionId: sessionId ?? null,
      connectInfo,
      sourceUrl: input.sourceUrl,
      note: 'Stagehand form-driving is the GAP-010 follow-up spike',
    },
  }
}
