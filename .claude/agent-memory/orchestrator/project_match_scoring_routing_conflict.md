---
name: match-scoring-routing-conflict
description: match_scoring routes to Claude Opus 4.6 in ai-router.ts + model-routing.md + BR-103, but Phase 2c Edge Function mandates Gemini 2.5 Flash — a model/cost-logging conflict (AI-RULE-001/002, BR-103) needing JB sign-off; ESCALATED to JB 2026-06-13
metadata:
  type: project
---

Phase 2c (real LLM match scoring) has a model-routing conflict that needs JB resolution. Re-verified against live code 2026-06-13 and ESCALATED to JB (no dispatch until resolved).

- `src/lib/ai-router.ts` `ROUTING_MATRIX.match_scoring` (lines 31-36) and `docs/conventions/model-routing.md` (line 30) AND `BR-103` (business-rules.md) ALL pin `match_scoring` -> **Claude Opus 4.6 / anthropic**, `isCritical: false`.
- Phase 2c intake mandated the new `score-job` Edge Function call **Gemini 2.5 Flash** (with `thinkingBudget: 0`).
- `aiScoringService.persistAiScore()` logs `route.modelName` (= Opus 4.6 from the router) into BOTH `ai_scores.model_used` (line 93) AND `ai_model_usage.model_name` (line 103). `getModelPricing('Claude Opus 4.6')` = $75/Mtok out vs Gemini Flash $2.5/Mtok = ~30x mispricing of the $75 cap.
- Confirmed NO ADR or sign-off authorizes Gemini for match_scoring (ADR-005 governs chat/general_qa only; ADR-006 mentions scoring as a pipeline stage, not the model). grep of docs/adr confirms.
- Gemini LLM infra EXISTS and is proven: `_shared/llm/{factory,google,types}.ts` present; `types.ts:26` supports `thinkingBudget?`; `google.ts:49-52` wires it; `gmail-sync/index.ts:170` + `gmail-send/index.ts:194` pass `thinkingBudget:0`. `score-job/` does NOT yet exist. So the build is feasible the moment authority is granted.

**Why it matters:** if the Edge Function runs Gemini but the client logs Opus, `ai_model_usage` records the wrong model (violates AI-RULE-002/BR-054 "log the model that actually ran") and mis-prices the cap ~30x. Same LSN-001 failure class: one value (the scoring model) specified differently in multiple places. DoD #2 (log task_type/model from router) and DoD #5 (no non-negotiable violated) cannot both pass under the current router while the function runs Gemini.

**Resolution paths for JB (pick one, then dispatch):**
1. Approve override: repoint `ROUTING_MATRIX.match_scoring` -> Gemini 2.5 Flash/google in ai-router.ts (single source of truth), update model-routing.md line 30 + BR-103 together, log AI-RULE-007 `jb_manual` reason. Then persistAiScore naturally logs Gemini + correct pricing. CLEANEST — keeps one source of truth.
2. Keep Opus in router, pass the actually-executed model from the Edge Function through to persistAiScore and log THAT (decouples logged model from router model) — but this breaks "no model names outside ai-router" and the router-as-truth invariant; weaker.
3. Run match_scoring on Opus 4.6 after all (drop the Gemini mandate) — no router change, but contradicts the intake's stated cost rationale.

**How to apply:** Do NOT let an agent hardcode Gemini into the Edge Function while the router still says Opus. Any scoring-model change updates ai-router.ts + model-routing.md + BR-103 together, and persistAiScore must log the model that actually executed. See [[match-scoring-callsite-map]].
