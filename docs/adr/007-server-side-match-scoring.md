# ADR-007: Server-Side LLM Match Scoring (`score-job-fit` Edge Function)

**Status:** Accepted
**Date:** 2026-06-13
**Extends:** ADR-005 (Multi-Model LLM Provider Abstraction); ADR-001 (Auto-Apply Threshold)

---

## Context

`pipelineService.scoreJobFit()` produced a job-fit `MatchResult` from a keyword
heuristic (counting profile/JD term overlap). The `ai_scores` table,
`aiScoringService.persistAiScore()`, and the `match_scoring` routing entry all
existed, but nothing ever invoked a model — so the dashboard's "match score"
never reflected real LLM judgement, and `ai_scores` was never populated by a
running code path.

We need real scoring without putting a provider key in the browser, and without
duplicating the cost-cap / persistence / usage-logging machinery that already
lives client-side in `src/lib/ai-router.ts` and `aiScoringService`.

## Decision

1. **New `score-job-fit` Edge Function** (`supabase/functions/score-job-fit/`),
   built to the exact `ai-chat` pattern: JWT-gated via `_shared/auth.ts`, CORS +
   OPTIONS from `_shared/http.ts`, provider/model routed through
   `_shared/llm/factory.ts`, errors normalized to `{ error, code, provider }`.

2. **The function is thin: no DB writes, no service-role key.** It takes
   `{ provider?, model?, job, profile, system?, maxTokens? }`, prompts the routed
   model for strict JSON, robustly parses it (code-fence stripping, brace
   extraction, per-field clamp of every `*_score` to an integer 0–100,
   `recommendation` enum validation), and returns
   `{ score: {...}, usage: { input_tokens, output_tokens } }`. Unparseable model
   output returns a normalized `502 / code:"bad_request"` rather than leaking a
   half-formed score.

3. **Cost-gating, persistence, and usage-logging stay client-side** (mirrors the
   `ai-chat` convention). The client calls `routeAiTask({ taskType:'match_scoring' })`;
   on `costDecision.shouldBlock` it falls back to the heuristic (flagged in
   `reasoning_trace`) consistent with `persistAiScore`'s existing `queued`
   semantics; otherwise it invokes the function with the routed
   `provider`/`model`, maps `score` → `MatchResult`, prices `usage` via
   `getModelPricing`, and persists through the **existing**
   `aiScoringService.persistAiScore()` path into `ai_scores`.

4. **No model IDs or score thresholds in the function.** Model name/provider come
   from `ROUTING_MATRIX.match_scoring`; recommendation is passed through. The
   authoritative `apply ≥ 80 / consider ≥ 60 / reject < 60` mapping (BR-020/021/022)
   stays in `aiScoringService` (`getScoreLabel` / `toDbRecommendation`).

5. **Heuristic is retained as the explicit fallback** — used on cost-cap and on
   any Edge Function error — so the dashboard always receives a score.

## Consequences

- **Positive:** `ai_scores` is now populated by real model judgement and lights
  up the Search/dashboard consumers that already read it
  (`useProspectorSearchResults`, `autoApplyService`) with zero changes to them.
  No provider key reaches the browser. Tested persistence/cost/logging code is
  reused, not duplicated.
- **Trade-offs:** scoring now incurs model cost (guarded by the existing
  `$75/user/month` cap) and adds a model round-trip vs. the instant heuristic. The
  client double-reads cost policy (once to route, once inside `persistAiScore`);
  accepted as cheap and idempotent rather than refactoring the persistence
  primitive.
- **Follow-ups:** live deployment of the function to the Supabase project is a
  gated step; batch/re-scoring strategy and score staleness are future work.
