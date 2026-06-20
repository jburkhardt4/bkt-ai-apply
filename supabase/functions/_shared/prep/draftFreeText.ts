/**
 * draftFreeText — Phase 5 SCAFFOLD ONLY.
 *
 * Future home for AI-drafted free-text answers to open-ended application
 * screeners (e.g. "Why do you want to work here?"). It is deliberately a no-op
 * today: it returns { draft: null } so the prep layer never emits an AI draft
 * before the routed/cost-gated path exists.
 *
 * HARD INVARIANTS (must hold when this is implemented):
 *   • Any AI draft is ALWAYS review_gate=true and is NEVER auto-submitted
 *     (BR-151 — the human edits/approves and clicks submit).
 *   • EEO/demographic disclosures and stored screener answers are NEVER sent to
 *     the LLM (ADR-011). Only fit-relevant, non-sensitive context may be passed.
 *   • All model calls MUST route through src/lib/ai-router.ts (the routed,
 *     cost-gated, usage-logged path) — never a hardcoded model name here.
 *
 * Pure today (no I/O, no Deno.*); the async signature reserves the eventual
 * routed call without forcing callers to change when it lands.
 */

import type { NormalizedField } from './types.ts'

export interface DraftContext {
  /** Non-sensitive job context (title, company) — NEVER EEO/answers. */
  jobTitle?: string
  company?: string
  /** Non-sensitive candidate summary the user opted to share for drafting. */
  candidateSummary?: string
}

export interface DraftResult {
  draft: string | null
}

/**
 * Returns { draft: null } unconditionally (scaffold). When implemented, route
 * through src/lib/ai-router.ts and mark the resulting field review_gate=true.
 */
export function draftFreeText(
  _field: NormalizedField,
  _context: DraftContext,
): Promise<DraftResult> {
  // TODO(phase-5): route a free-text draft through src/lib/ai-router.ts
  // (cover_letter_generation / general_qa task type per docs/conventions/
  // model-routing.md). The returned draft must set review_gate=true and must
  // never be auto-submitted; EEO/answers must never be included in `context`.
  return Promise.resolve({ draft: null })
}
