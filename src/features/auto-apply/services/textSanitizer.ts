// BKT AI-Apply — document copy sanitizer.
//
// Em-dashes (—, U+2014) and en-dashes (–, U+2013) are a well-known "AI tell".
// The resume + cover-letter pipeline must NEVER surface them — not in summaries,
// experience bullets, skills, or any cover-letter paragraph. This is the
// safety net behind the prompt instructions: every piece of generated copy
// passes through here before it reaches the editable builder state.
//
//   " — " (spaced clause separator)  → ", "    (a natural pause)
//   "2021–2024" / "9–5" (tight range) → "2021-2024" (hyphen-minus)
//   any stray em/en dash              → hyphen-minus
//
// Doubled spaces/commas left by the substitution are tidied so the result reads
// like human-written prose.

const EM_EN_DASH = /[—–]/

/** Replaces every em/en dash with clean punctuation. Idempotent. */
export function sanitizeDashes(text: string): string {
  if (!text || !EM_EN_DASH.test(text)) return text
  return text
    .replace(/\s+[—–]\s+/g, ', ') // spaced dash → comma pause
    .replace(/[—–]/g, '-') // tight dash (ranges/compounds) → hyphen
    .replace(/ {2,}/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.;:!?])/g, '$1')
    .trim()
}

/** Sanitizes every string in a list, dropping any that become punctuation-only. */
export function sanitizeDashList(values: string[]): string[] {
  return values.map(sanitizeDashes).filter((v) => /[a-z0-9]/i.test(v))
}
