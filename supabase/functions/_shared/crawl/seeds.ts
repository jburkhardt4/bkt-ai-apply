/**
 * Curated crawl seed boards. crawler-discover upserts these into ats_boards on
 * each run, in addition to harvesting boards from existing jobs.source_url rows.
 *
 * This list is intentionally EMPTY by default: we do not fabricate company board
 * tokens. Populate it with JB's verified targets (the board_token is the path
 * segment after the host — e.g. boards.greenhouse.io/{token}, jobs.lever.co/{token},
 * jobs.ashbyhq.com/{token}). Until then, the harvest step bootstraps the registry
 * from real URLs the prospector has already ingested.
 */

import type { CrawlFamily } from './types.ts'

export interface SeedBoard {
  ats_family: CrawlFamily
  board_token: string
  display_name?: string
}

export const SEED_BOARDS: readonly SeedBoard[] = [
  // Example shape (commented — replace with verified targets):
  // { ats_family: 'greenhouse', board_token: 'acme', display_name: 'Acme' },
  // { ats_family: 'lever',      board_token: 'acme', display_name: 'Acme' },
  // { ats_family: 'ashby',      board_token: 'acme', display_name: 'Acme' },
]
