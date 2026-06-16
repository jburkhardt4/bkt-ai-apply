# LLM Routing Strategy — Review & Verification

**Reviews:** `docs/strategy/llm-routing-2026.md` (on branch `claude/practical-fermi-bqcx4k`, read-only)
**Date:** 2026-06-15 · **Method:** 4 parallel lenses (cost / capability-fit / tenancy / adversarial fact-check), web-verified where noted
**Decisions in force:** Q1 = multi-tenant (per-use-case isolation) · Q2 = `claude-opus-4-8` is the intended model

> **Verdict:** The doc is a genuinely strong strategy artifact — the runtime-vs-subscription split is correct, the two-tier scoring direction is right, and Q2 is confirmed in code. But it must not become ADR-009 as written: (1) its **price table is wrong by 2–5×**, so every savings figure is unverified; (2) the **multi-tenant decision (Q1) breaks the cost-cap architecture** it assumes; and (3) several **model/product names are stale**. Ship the safe cosmetic+cost PR now; sequence the multi-tenant safety work *first or in parallel*, not as a §6 tail item.

---

## 1. What the doc gets right (confirmed against code)

- **Runtime-vs-subscription split (§0) is correct and load-bearing.** Provider API keys (`ANTHROPIC_KEY`/`OPENAI_KEY`/`GEMINI_KEY`) are Edge secrets read via `Deno.env`; chat-subscription seats cannot serve metered API traffic. Keep this as the doc's spine.
- **Q2 confirmed in code.** `_shared/llm/anthropic.ts:14` maps display `"Claude Opus 4.6"` → id `claude-opus-4-8`; line 15 maps `"Claude Opus 4.8"` → the same id. Execution already hits 4.8 — so roadmap #1 is a **rename/relabel**, not a behavior change.
- **Match-score bands (60 consider / 80 auto-submit) confirmed** in `aiScoringService.ts` + `model-routing.md` (BR-020/021/022). The doc's "60–79 → Tier-2 Opus" matches the implemented thresholds exactly.
- **The cost cap mechanics** (hard $75, warn 80/90%, block non-critical at 100%, `email_classification` exempt) are implemented as described.
- **JD `Haiku → Flash` is cheaper** at any realistic token ratio (but small in absolute terms — JD-format is already bounded at 25/run; rank it below two-tier + caching).

---

## 2. Must-fix: the price table is wrong (web-verified — re-confirm against provider billing)

The whole cost case is computed from §2's reference prices, and three are materially off (mid-2026, $/1M in/out):

| Model | Doc says | Verified (≈) | Impact |
|---|---|---|---|
| Claude Opus 4.6/4.8 | **15 / 75** | **5 / 25** | The Opus leak is real but **~3× smaller** than the doc implies |
| Gemini 2.5 Flash → **3.5 Flash** (adopt target) | 0.30 / 2.50 | **1.50 / 9** | Tier-1 "cheap Flash" is **~5×/3.6× pricier** than the old-Flash number suggests |
| GPT-5 → **GPT-5.5** (adopt target) | 5 / 15 | **5 / 30** | Resume output cost doubles |
| Claude Sonnet 4.6 | 3 / 15 | 3 / 15 ✓ | — |

**Action:** replace §2 with verified numbers (mark Gemini 3.5 Pro "TBD-confirm-at-GA"), and **re-derive every savings figure** before any cost-driven approval. Treat the above as "verify against the live Anthropic/OpenAI/Google pricing pages" — they came from web search, not provider invoices.

---

## 3. Must-fix: stale model / product names (deferred-task footguns)

- **Gemini 3.5 Pro is not GA** as of today (announced May 2026, GA only *targeted* June 2026). The market-research build task hard-depends on it → **gate behind a GA check; fallback Gemini 2.5 Pro / 3.5 Flash.**
- **"Operator" was absorbed into ChatGPT Agent (Aug 2025); GPT-5.2/5.3-Codex sunset June 2026.** The browser-auto-apply target names two retired products → update to current Codex base / "ChatGPT Agent," and add "verify at Phase-4 build time."
- **Copilot facts:** Pro+ includes **1,500** premium requests (300 is the *Pro* tier), and GitHub moved all Copilot plans to **usage-based AI Credits on 2026-06-01** — the premium-request framing is legacy. (The "no Pro Max tier" point is correct.)
- **Pin exact model-snapshot ids + a fallback** for the OpenAI and Gemini runtime calls, mirroring the `anthropic.ts` name→id discipline the doc is already fixing — OpenAI sunset Codex variants on short notice in this window.

---

## 4. Must-add: multi-tenant changes the architecture (Q1) — the biggest gap

The doc reads single-operator throughout. Under Q1 these become blockers (all grounded in code):

1. **The $75 cap is per-user, client-side, and bypassable.** `routeAiTask`/`evaluateAiCostPolicy`/`getMonthlyAiSpendUsd` run in the React bundle; the Edge Functions execute the provider call on the **shared platform key** using the provider/model the *client* sends. A tenant calling the Edge Function directly with their JWT spends your key with **no server-side cap** → denial-of-wallet. **Move cap enforcement server-side** (each LLM Edge Function re-checks tenant month-to-date spend with the service-role client and records `ai_model_usage` itself, so a tampered client can't skip the meter).
2. **No tenant dimension exists.** Everything is `user_id`-scoped (own-row RLS). "Per-use-case tenant isolation" needs a `tenants`/`tenant_id` (or memberships) primitive, `tenant_id` on `ai_model_usage` and scoped tables, the tenant id in the JWT/app_metadata, and RLS rewritten to own-tenant where sharing is intended.
3. **No global ceiling.** Platform bill = N × per-user spend, unbounded (≈$2k/mo at 100 tenants, $20k at 1,000) on your keys. Add a per-tenant inference cap column **and** a global platform ceiling; derive the 80/90% warnings from the per-tenant cap, not the hardcoded `$60/$67.50`.
4. **Two budgets already collide.** `AI_MONTHLY_COST_CAP_USD=$75` (inference, client-enforced) vs `user_settings.monthly_budget_usd=$240` (submission credits, 1 credit=$1, **server-enforced** in `claim_submission`). The doc treats "$75 cap" as the single knob — name these as two distinct meters.
5. **Subscriptions can NEVER power other tenants' runtime** (hard ToS + technical boundary). State it explicitly. Subscriptions legitimately serve: **build/operate** (Claude Code, Copilot, the team's chat seats) and, at most, the **owner's own tenant via BYOK of metered keys** (not a chat seat).
6. **Recommended tenancy model:** **shared platform keys + per-tenant accounting & hard caps by default**, with **optional BYOK** (encrypted per-tenant keys in Supabase Vault, resolved in `factory.getApiKeyForProvider(tenantCtx)`; BYOK tenants pay their provider directly and are exempt from the platform cap but still metered). Job-seekers won't manage API keys, so BYOK-only would kill conversion.
7. **`email_classification` is "never cost-capped"** — on a shared key that's an uncapped per-tenant drain. Add a per-tenant rate/volume guard even if dollars stay uncapped.

---

## 5. Should-fix: capability-fit refinements (grounded in code)

- **`intent_routing` is already deterministic** — `classifyChatIntent()` is a pure regex classifier, yet `runChatAssistant()` still calls `routeAiTask({taskType:'intent_routing'})` + `logAiUsage()` for a Gemini call that **never happens**, logging phantom `ai_model_usage` rows on the critical chat path. **Retire the LLM route** (don't "upgrade it to 3.5 Flash" as the doc suggests).
- **Add a Tier-0 deterministic gate.** `pipelineService.scoreJobFit` (keyword/bucket matcher, already the cost-cap fallback) can drop obvious no-matches for **$0** before any token is spent. Recommended scoring shape: **Tier-0 deterministic → Tier-1 Sonnet → Tier-2 Opus on the borderline band.**
- **Use Sonnet, not Flash, for Tier-1 near the 60 line** (or widen the escalation band to ~50–79). Flash mis-ranks transferable-skill / adjacent-domain / seniority nuance more often; a Tier-1 false-negative (a real 65 scored 55) is silently dropped and never reaches Opus — a funnel leak the cost win would mask. De-risk with a small labeled-JD offline eval before committing the cheap tier (it doubles as a regression guard for future model-id refreshes).
- **Browser auto-apply** should be **Browserbase + Stagehand (DOM automation) with an LLM only for field-mapping** (per ADR-006/BR-134/BR-146) — not "Operator." Naming a hosted computer-use agent invites re-platforming onto something the codebase doesn't use.
- **Two-tier scoring is also a *quality* fix, not just cost.** Opus-on-every-job already exceeds the $75/user cap (even at the corrected $5/$25 it's well over for an active prospector user), so today most scores **silently fall back to the deterministic heuristic** once the cap trips. Two-tier is what makes LLM scoring actually fit under the cap. Measure the real 60–79 band share from `ai_scores` history before quoting a savings %.

---

## 6. Cheaper-but-equal levers the doc misses

- **Prompt caching** on the Opus rescore: the system prompt + master profile are identical across a run; cache the stable prefix (~45% off Opus input). One `cache_control` marker, no routing change.
- **Batch API (≈50% off)** for `prospector-cron` scoring + JD-format — it's scheduled (`0 8,18 * * *`), so latency is irrelevant. Free ~50% on the whole batch path.

---

## 7. Recommended sequencing

1. **Now — safe PR, `pnpm validate`-gated (doc's #1–#3, corrected):**
   (a) rename display `"Claude Opus 4.6"` → `"Claude Opus 4.8"` across `ai-router.ts` (ROUTING_MATRIX, CHAT_MODEL_CATALOG, MODEL_PRICING_BY_NAME) + retire the stale alias in `anthropic.ts:14`; (b) two-tier scoring (Tier-0 deterministic → Sonnet → Opus on 50/60–79); (c) `jd_formatting → Gemini 3.5 Flash`; (d) **fix the §2 price table first** so (b) is sized correctly; (e) retire the phantom `intent_routing` LLM call.
   *(This is the routing analog of — and should follow — the Modernization Brief's Phase 2.)*
2. **First or parallel (NOT deferred) — multi-tenant safety:** tenant primitive + `tenant_id` on `ai_model_usage`; **server-side cap enforcement** in the LLM Edge Functions; per-tenant + global ceilings; optional BYOK via Vault; per-tenant guard on the `email_classification` bypass.
3. **Then — build the deferred tasks** on corrected, GA-verified models (interview prep → Opus 4.8; market research → Gemini Pro *gated on GA*; browser auto-apply → Browserbase+Stagehand).
4. **ADR:** promote to `docs/adr/009-llm-routing-2026.md` **after** §2 prices are corrected and the multi-tenant cap model is decided — those are the two load-bearing inputs the ADR would otherwise bake in wrong.

---

*Cross-references: Modernization Brief §3 (Phase 2 = the model-id/name fix), ASSESSMENT.md Tech-Debt #1 (the same `anthropic.ts` mismatch, independently found), BUSINESS_RULES.md RULE-001/004/062 (cost cap, score thresholds, model mapping).*
