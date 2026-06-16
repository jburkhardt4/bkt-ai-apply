# ADR-010: Standardize Claude tasks on Sonnet 4.6 + fail-loud scoring errors

**Status:** Accepted
**Date:** 2026-06-16
**Extends:** ADR-005 (multi-provider execution); ADR-007 (server-side match scoring)
**Branch:** `simplifyAI-apply-macro`

---

## Context

Two defects surfaced while preparing the Phase 2b gate:

1. **`format-jd` returned 502 for every call.** The `jd_formatting` task routed to the display name
   `Claude 3.5 Haiku` → `claude-3-5-haiku-latest`, a retired model. The Edge Function shares the
   exact code path as `score-job-fit` (which succeeds on a current model), so the failure was the
   **stale model**, not auth/CORS/keys. A 404 from Anthropic normalized to `unknown` → 502.

2. **Scoring failures were masked.** `aiScoringService.scoreJobFitWithLlm` swallowed every Edge
   Function failure into a generic `reasoning_trace.reason = 'edge_function_error'` heuristic
   fallback, with no provider code logged. A 6/14–6/15 outage (≈25 of `john@`'s tracked scores
   degraded to heuristic) was therefore undiagnosable after the fact, and the function had silently
   recovered by 6/16 with no record of the cause.

A third latent issue: any Anthropic display name not present in
`supabase/functions/_shared/llm/anthropic.ts`'s map silently falls back to `claude-sonnet-4-6`, so a
routing rename could silently downgrade a task instead of erroring.

The product owner chose to **standardize on Claude Sonnet 4.6** (current, consistent, cheaper than
Opus; acceptable scoring-quality trade-off) and to **surface real errors** instead of masking them.

## Decision

### Model standardization (client-side; `src/lib/ai-router.ts`)
Pin all **Anthropic** routing tasks to `Claude Sonnet 4.6`: `match_scoring`, `jd_formatting`,
`cover_letter_generation`, `interview_prep` (`general_qa` already was). This is the **fix for the
`format-jd` 502** (no Edge redeploy needed — `anthropic.ts` already maps
`Claude Sonnet 4.6 → claude-sonnet-4-6`, and Edge Functions receive the model in the request body).
**Non-Anthropic routes are unchanged** (resume_rewriting/browser_form_automation → GPT-5;
company_market_research/email_*/intent_routing → Gemini) to preserve the multi-model cost design.
`CHAT_MODEL_CATALOG` is untouched — **Claude Opus 4.6 remains a user-selectable chat model**.

### Fail-loud scoring observability (`aiScoringService.ts` + `runScoreForJob`)
`scoreJobFitWithLlm` now **throws a typed `ScoreJobFitEdgeError`** carrying the real `{ code,
provider }` read from the Edge Function's normalized error body, instead of silently persisting a
generic fallback. The caller `runScoreForJob` catches it, logs
`[score-job-fit] <provider> <code>: <message>` for real-time diagnosis, and persists a degraded
score tagged with the **specific** reason `edge_function_error:<code>` — so batch ingestion stays
resilient while the trace is now diagnosable. The cost-cap (`cost_cap`) and success paths are
unchanged. `format-jd`'s client caller (`jdFormattingService`) logs the specific code on failure
while keeping its raw-text fallback.

### Stale-data reconciliation
`scripts/rescore-stale.ts` re-scores jobs whose latest `ai_scores` row is an `edge_function_error`
fallback (run by the owner with their session; writes new latest rows, preserves history).

## Consequences

- **Positive:** `format-jd` recovers; scoring runs on a current model; provider outages are now
  logged with a specific code and a specific persisted `reason`; all fixes are client-side (ship via
  Vercel, no Edge redeploy). `pnpm validate` green (263 tests).
- **Trade-offs:** `match_scoring` drops Opus→Sonnet (slightly lower ceiling, lower cost). The
  `anthropic.ts` map still defaults unmapped names to Sonnet — acceptable now that Sonnet is the
  standard, but a future guard could throw instead.
- **Docs:** `docs/conventions/model-routing.md` (implementation mirror) updated; the locked
  `docs/requirements/05-ai-routing.md` carries a supersession note pointing here.
- **Follow-ups:** reconcile cost-estimate tables if Sonnet pricing materially differs; consider a
  CI check that diffs the routing doc against `ROUTING_MATRIX`; per-display-name "supported/retired"
  status so a retired model can't be routed (the root cause of the 502).

## Business Rules
No new BRs. Routing remains governed by AI-RULE-001 (model by task type) and the $75 cap
(BR-050/052); thresholds (BR-020/021/022) stay owned by `persistAiScore`.
