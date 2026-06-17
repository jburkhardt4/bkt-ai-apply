import type { BoardConfig } from '../types'
import { greenhouseConfig } from './greenhouse'
import { leverConfig } from './lever'
import { ashbyConfig } from './ashby'

/** All board configs the macro currently knows (Wave 1; spec §7). */
export const BOARD_CONFIGS: BoardConfig[] = [greenhouseConfig, leverConfig, ashbyConfig]

/**
 * Resolves the board config for a host (JSON-config referencing, spec §3.1).
 * Returns null for an unsupported host so the extension stays inert (UAT-5).
 * Matches an exact host or any subdomain of a registered host (e.g.
 * acme.ashbyhq.com → ashbyhq.com).
 */
export function resolveBoardConfig(
  host: string,
  configs: BoardConfig[] = BOARD_CONFIGS,
): BoardConfig | null {
  const h = host.trim().toLowerCase()
  if (!h) return null
  for (const cfg of configs) {
    for (const pattern of cfg.match.hosts) {
      const p = pattern.toLowerCase()
      if (h === p || h.endsWith(`.${p}`)) return cfg
    }
  }
  return null
}
