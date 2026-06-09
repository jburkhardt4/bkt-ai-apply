# Model Routing Conventions

task_id: BKT-AIAPPLY-PHASE1-REQS-LOCK-002
status: CANONICAL MIRROR FOR IMPLEMENTATION
last_synced_from: docs/requirements/05-ai-routing.md
last_synced_at: 2026-06-05

---

## Cost Policy

- Hard cap: $75.00 per month across all providers (BR-050).
- 80% of cap ($60.00): warning state.
- 90% of cap ($67.50): approaching-cap notification threshold (BR-051).
- 100% of cap ($75.00): non-critical calls are blocked or queued (BR-052).
- Critical calls continue at cap (BR-053):
  - email classification
  - stage-transition critical paths

---

## Pinned Model Routing Matrix

Use these pinned model names exactly through src/lib/ai-router.ts.

| Task Type | Model | Provider | Priority | Notes |
| --- | --- | --- | --- | --- |
| cover_letter_generation | Claude Opus 4.6 | anthropic | Primary | High-quality narrative writing |
| interview_prep | Claude Opus 4.6 | anthropic | Primary | Complex reasoning and coaching |
| match_scoring | Claude Opus 4.6 | anthropic | Primary | RAG + structured analysis |
| resume_rewriting | GPT-5 | openai | Primary | ATS keyword optimization |
| browser_form_automation | GPT-5 | openai | Post-MVP | Deferred in MVP (SIGN-OFF-004) |
| company_market_research | Gemini 2.5 Pro | google | Primary | Retrieval and synthesis |
| email_classification | Gemini 2.5 Flash | google | Primary | High-volume, low-latency |
| intent_routing | Gemini 2.5 Flash | google | Primary | Chat intent detection |
| general_qa | Claude Sonnet 4.6 | anthropic | Primary | Cost-efficient general chat |

---

## Routing Rules

- AI-RULE-001: Select model by task_type. Manual override requires JB confirmation.
- AI-RULE-002: Log tokens_in, tokens_out, estimated_cost_usd to ai_model_usage for every call (BR-054).
- AI-RULE-003: At monthly cost >= $75.00, queue non-critical calls.
- AI-RULE-004: Critical calls are never blocked by cost cap.
- AI-RULE-005: Email confidence < 0.70 is stored but does not auto-action.
- AI-RULE-006: match_score >= 60 routes to Consideration; match_score >= 80 routes to Auto-Submit Prep.
- AI-RULE-007: JB override must log reason in application_events as jb_manual.
- AI-RULE-008: RAG context sources are resume, work history, outcomes, and preferences.
- AI-RULE-009: Store reasoning traces in the appropriate scoring tables.

---

## Implementation Contract

- All model calls route through src/lib/ai-router.ts.
- No model names are hardcoded outside src/lib/ai-router.ts.
- Cost-cap checks execute before dispatch.
- Usage logging executes after dispatch.

---

## Multi-Provider Execution (ADR-005)

- The conversational assistant (general_qa) supports a user-selectable model via
  `CHAT_MODEL_CATALOG` in `src/lib/ai-router.ts`. Selecting a non-default model is
  a JB manual override (AI-RULE-001), confirmed by the UI selection. The catalog
  is the single source of truth for selectable model display names.
- The `ai-chat` Edge Function is provider-agnostic. It accepts `{ provider, model,
  system, messages, maxTokens }`, routes through `_shared/llm/factory.ts` to the
  matching provider client (Anthropic / OpenAI / Gemini), and returns
  `{ text, usage }` or a normalized error `{ error, code, provider }`.
- Provider keys are project-level Supabase Edge Function secrets read only via
  `Deno.env`: `ANTHROPIC_KEY` (legacy fallback `ANTHROPIC_API_KEY`), `OPENAI_KEY`,
  `GEMINI_KEY`. Never shipped to the client.
- The `provider-status` Edge Function reports which providers are configured
  (booleans only). The model selector greys out models whose provider key is
  missing.
- Cost is still gated by the $75/month cap and logged to `ai_model_usage`; the
  logged provider/model is the one that actually ran, priced via `getModelPricing`.

### Selectable chat model catalog

| Model | Provider |
| --- | --- |
| Claude Sonnet 4.6 (default) | anthropic |
| Claude Opus 4.6 | anthropic |
| GPT-5 | openai |
| GPT-4o | openai |
| Gemini 2.5 Pro | google |