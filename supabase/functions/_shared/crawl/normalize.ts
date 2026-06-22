/**
 * normalize — pure helpers that turn a raw ATS posting into a UnifiedPosting.
 *
 * No I/O, no Deno.* — unit-testable under vitest. content_hash is intentionally
 * NOT computed here: the upsert_job_postings RPC computes it in SQL (single
 * source of truth), so this layer stays synchronous and crypto-free.
 */

import type { CrawlFamily, RemoteType, SalaryInterval, UnifiedPosting } from './types.ts'

export interface PostingInput {
  ats_family: CrawlFamily
  external_job_id: string | null | undefined
  title: string | null | undefined
  application_url: string | null | undefined
  company_name?: string | null
  location_raw?: string | null
  /** Raw platform remote signal (e.g. Lever workplaceType, Ashby isRemote→'remote'). */
  remote_hint?: string | null
  /** Pre-validated remote_type when the adapter already knows it. */
  remote_type?: RemoteType | null
  department?: string | null
  team?: string | null
  employment_type?: string | null
  description_html?: string | null
  description_text?: string | null
  external_url?: string | null
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string | null
  salary_interval?: string | null
  posted_at?: string | number | null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/** Decode HTML entities (named + numeric). Greenhouse `content` is entity-encoded. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10)
      return Number.isFinite(cp) && cp > 0 ? safeFromCodePoint(cp, m) : m
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, code) ? NAMED_ENTITIES[code] : m
  })
}

function safeFromCodePoint(cp: number, fallback: string): string {
  try {
    return String.fromCodePoint(cp)
  } catch {
    return fallback
  }
}

/** Strip HTML to readable plaintext: block tags → newlines, then decode entities. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  const tagged = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(tagged)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Classify remote/hybrid/onsite. Prefer an explicit platform hint; else scan
 * text (hybrid wins over remote — a hybrid role often also says "remote"); else
 * 'onsite' only when a physical location is present, otherwise null (unknown).
 */
export function classifyRemoteType(
  hint: string | null | undefined,
  text: string | null | undefined,
  hasLocation: boolean,
): RemoteType | null {
  const h = (hint ?? '').toLowerCase().trim()
  if (h) {
    if (h.includes('hybrid')) return 'hybrid'
    if (h.includes('remote')) return 'remote'
    if (h.includes('on-site') || h.includes('onsite') || h.includes('on site') ||
        h.includes('in office') || h.includes('in-office')) return 'onsite'
  }
  const t = (text ?? '').toLowerCase()
  if (/\bhybrid\b/.test(t)) return 'hybrid'
  if (/\bremote\b/.test(t)) return 'remote'
  return hasLocation ? 'onsite' : null
}

/** Map a free-text pay interval (e.g. Lever 'per-year-salary') to the enum. */
export function coerceInterval(raw: string | null | undefined): SalaryInterval | null {
  if (!raw) return null
  const r = raw.toLowerCase()
  if (r.includes('year') || r.includes('annual') || r.includes('annum')) return 'year'
  if (r.includes('month')) return 'month'
  if (r.includes('week')) return 'week'
  if (r.includes('hour')) return 'hour'
  if (r.includes('day') || r.includes('daily')) return 'day'
  return null
}

/** Epoch ms → ISO string; null on invalid. */
export function epochMsToIso(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Accept an ISO string or epoch ms → ISO string; null on invalid/empty. */
export function coercePostedAt(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return epochMsToIso(raw)
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export interface ParsedSalary {
  min: number | null
  max: number | null
  currency: string | null
  interval: SalaryInterval | null
}

/** Best-effort salary-range extraction from free text (e.g. Greenhouse content). */
export function parseSalaryFromText(text: string | null | undefined): ParsedSalary {
  const none: ParsedSalary = { min: null, max: null, currency: null, interval: null }
  if (!text) return none
  const t = text.replace(/,/g, '')
  const re = /\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?\s*(?:-|–|—|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/
  const m = re.exec(t)
  if (!m) return none
  const scale = (s?: string) => (s ? (s.toLowerCase() === 'k' ? 1000 : 1_000_000) : 1)
  const min = Math.round(parseFloat(m[1]) * scale(m[2]))
  let max = Math.round(parseFloat(m[3]) * scale(m[4]))
  // "$120K-150K": second bound inherits the first's K/M scale when it had none.
  if (m[2] && !m[4] && max < min) max = Math.round(parseFloat(m[3]) * scale(m[2]))
  if (min <= 0 || max <= 0 || max < min) return none
  const currency = /£/.test(text) ? 'GBP' : /€/.test(text) ? 'EUR'
    : /\$|usd/i.test(text) ? 'USD' : null
  const interval: SalaryInterval | null = /hour|hr|\/\s*hr/i.test(text) ? 'hour'
    : /year|annual|yr|p\.?a\.?/i.test(text) ? 'year' : null
  return { min, max, currency, interval }
}

function trimToNull(s: string | null | undefined): string | null {
  const v = (s ?? '').trim()
  return v === '' ? null : v
}

function numOrNull(n: number | null | undefined): number | null {
  if (n == null) return null
  const v = typeof n === 'number' ? n : parseFloat(String(n))
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

/**
 * Assemble a UnifiedPosting from adapter input, applying every normalization.
 * Returns null when a posting lacks an identity, title, or application URL —
 * the adapter filters those out (they are unusable downstream).
 */
export function buildPosting(input: PostingInput): UnifiedPosting | null {
  const external_job_id = trimToNull(input.external_job_id)
  const title = trimToNull(input.title)
  const application_url = trimToNull(input.application_url)
  if (!external_job_id || !title || !application_url) return null

  const description_html = trimToNull(input.description_html)
  const description_text = trimToNull(input.description_text) ?? trimToNull(stripHtml(description_html))
  const location_raw = trimToNull(input.location_raw)

  const remote_type = input.remote_type ?? classifyRemoteType(
    input.remote_hint,
    `${title} ${location_raw ?? ''} ${description_text ?? ''}`,
    !!location_raw,
  )

  let salary_min = numOrNull(input.salary_min)
  let salary_max = numOrNull(input.salary_max)
  let salary_currency = trimToNull(input.salary_currency)
  let salary_interval = coerceInterval(input.salary_interval)

  if (salary_min == null && salary_max == null && input.ats_family === 'greenhouse' && description_text) {
    const s = parseSalaryFromText(description_text)
    salary_min = s.min
    salary_max = s.max
    salary_currency = salary_currency ?? s.currency
    salary_interval = salary_interval ?? s.interval
  }
  if (salary_min != null && salary_max != null && salary_max < salary_min) {
    salary_min = null
    salary_max = null
  }

  return {
    ats_family: input.ats_family,
    external_job_id,
    title,
    application_url,
    company_name: trimToNull(input.company_name),
    location_raw,
    remote_type,
    department: trimToNull(input.department),
    team: trimToNull(input.team),
    employment_type: trimToNull(input.employment_type),
    description_html,
    description_text,
    external_url: trimToNull(input.external_url),
    salary_min,
    salary_max,
    salary_currency,
    salary_interval,
    posted_at: coercePostedAt(input.posted_at),
  }
}
