// BKT Apply-Macro — message protocol between the content scripts and the MV3
// background worker. Centralised so both ends stay in lock-step.

import type { AnswerEntry, AutofillPayload, FitPanelData } from './types'
import type { ContactProfile } from './payload'
import type { ExtractedSession } from './auth/session'

export const MSG = {
  /** SPA reader → background: the user's session (or null when signed out). */
  SESSION_PUSH: 'BKT_SESSION_PUSH',
  /** ATS content → background: is the user signed in? */
  AUTH_STATUS: 'BKT_AUTH_STATUS',
  /** ATS content → background: score this scraped JD via score-job-fit. */
  SCORE: 'BKT_SCORE',
  /** ATS content → background: the contact profile for autofill. */
  PROFILE: 'BKT_PROFILE',
  /** ATS content → background: the prepared-application payload for this page. */
  PREPARED: 'BKT_PREPARED',
} as const

/** The JD scraped from the ATS page, passed verbatim to score-job-fit as `job`. */
export interface ScrapedJob {
  title: string
  description: string
  url: string
  host: string
}

/** Identifies the prepared_applications row to consume for the current page. */
export interface PreparedJobRef {
  /** The page URL — matched against job_ref->>source_url when jobId is absent. */
  url: string
  /** The job_id, when the page can supply it (preferred, hits the unique index). */
  jobId?: string
}

export type BackgroundRequest =
  | { type: typeof MSG.SESSION_PUSH; session: ExtractedSession | null }
  | { type: typeof MSG.AUTH_STATUS }
  | { type: typeof MSG.SCORE; job: ScrapedJob }
  | { type: typeof MSG.PROFILE }
  | { type: typeof MSG.PREPARED; job: PreparedJobRef }

export interface AuthStatusResponse {
  signedIn: boolean
  userId: string | null
}

export type ScoreResponse =
  | { ok: true; score: FitPanelData }
  | { ok: false; reason: 'needs_login' | 'error'; message?: string }

export type ProfileResponse =
  | { ok: true; profile: ContactProfile; answers: AnswerEntry[] }
  | { ok: false; reason: 'needs_login' | 'no_profile' | 'error'; message?: string }

/**
 * The server-prepared application for this page. `payload` carries ONLY the
 * non-gated fields the macro may auto-fill; `gated` lists the field_keys held
 * back for the human (review_gate=true — all sensitive fields are gated at the
 * DB level, BR-156). `status` is the row's prepared_applications.status so the
 * content script can surface 'needs_review' / 'blocked' etc. The macro still
 * never auto-submits (BR-151).
 */
export type PreparedResponse =
  | { ok: true; payload: AutofillPayload; gated: string[]; status: string }
  | { ok: false; reason: 'needs_login' | 'no_prep' | 'error'; message?: string }
