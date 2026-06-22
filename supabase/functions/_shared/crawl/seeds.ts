/**
 * Curated crawl seed boards. crawler-discover upserts these into ats_boards on
 * each run, in addition to harvesting boards from existing jobs.source_url rows.
 *
 * Policy: NEVER add an unverified board_token. Every token below was confirmed
 * live against its ATS API on 2026-06-22 (returned real postings). The board_token
 * is the path segment after the host — boards.greenhouse.io/{token},
 * jobs.lever.co/{token}, jobs.ashbyhq.com/{token}. The harvest step additionally
 * bootstraps boards from real URLs the prospector has already ingested.
 */

import type { CrawlFamily } from './types.ts'

export interface SeedBoard {
  ats_family: CrawlFamily
  board_token: string
  display_name?: string
}

// JB's verified targets (jb-answer-library-seed). Live-verified job counts at
// seed time: techholding=19, monsterenergy=185, directive=78, swans=6.
export const SEED_BOARDS: readonly SeedBoard[] = [
  { ats_family: 'greenhouse', board_token: 'techholding', display_name: 'Tech Holding' },
  { ats_family: 'greenhouse', board_token: 'monsterenergy', display_name: 'Monster Energy' },
  { ats_family: 'ashby', board_token: 'directive', display_name: 'Directive' },
  { ats_family: 'ashby', board_token: 'swans', display_name: 'Swans' },
]
