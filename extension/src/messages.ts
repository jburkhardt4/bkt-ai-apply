// BKT Apply-Macro — message protocol between the content scripts and the MV3
// background worker. Centralised so both ends stay in lock-step.

import type { FitPanelData } from './types'
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
} as const

/** The JD scraped from the ATS page, passed verbatim to score-job-fit as `job`. */
export interface ScrapedJob {
  title: string
  description: string
  url: string
  host: string
}

export type BackgroundRequest =
  | { type: typeof MSG.SESSION_PUSH; session: ExtractedSession | null }
  | { type: typeof MSG.AUTH_STATUS }
  | { type: typeof MSG.SCORE; job: ScrapedJob }
  | { type: typeof MSG.PROFILE }

export interface AuthStatusResponse {
  signedIn: boolean
  userId: string | null
}

export type ScoreResponse =
  | { ok: true; score: FitPanelData }
  | { ok: false; reason: 'needs_login' | 'error'; message?: string }

export type ProfileResponse =
  | { ok: true; profile: ContactProfile }
  | { ok: false; reason: 'needs_login' | 'no_profile' | 'error'; message?: string }
