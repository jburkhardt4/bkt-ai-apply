# AI Routing

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## Cost Policy (SIGN-OFF-001)

> **Hard cap: $75.00/month** across all AI model providers combined.
>
> This is a non-negotiable ceiling. The system must track spend in real time via
> `ai_model_usage` and enforce the cap automatically.

### Cost Enforcement Tiers

| Threshold | Action |
| --- | --- |
| 80% of cap ($60) | Dashboard warning banner displayed |
| 90% of cap ($67.50) | JB notification: "Approaching AI cost ceiling" |
| 100% of cap ($75) | Non-critical AI calls blocked/queued; JB alert sent |
| At cap | Critical pipeline transitions (stage changes, email classification) continue unblocked |

---

## Model Routing Matrix

| Task Type | Model | Provider | Priority | Notes |
| --- | --- | --- | --- | --- |
| Cover letter generation | Claude Opus 4.6 | Anthropic | Primary | High-quality narrative writing |
| Interview prep | Claude Opus 4.6 | Anthropic | Primary | Complex reasoning and coaching |
| Match scoring | Claude Opus 4.6 | Anthropic | Primary | RAG + structured analysis |
| Resume rewriting | GPT-5 | OpenAI | Primary | ATS keyword optimization |
| Browser form automation | GPT-5 | OpenAI | Post-MVP | Deferred (SIGN-OFF-004) |
| Company/market research | Gemini 2.5 Pro | Google | Primary | Retrieval and synthesis |
| Email classification | Gemini 2.5 Flash | Google | Primary | High-volume, low-latency |
| Intent routing | Gemini 2.5 Flash | Google | Primary | Chat intent detection |
| General Q&A | Claude Sonnet 4.6 | Anthropic | Primary | Cost-efficient general chat |

> **Superseded (2026-06-16, ADR-010):** `match_scoring`, `cover_letter_generation`, and
> `interview_prep` standardized from Claude Opus 4.6 to **Claude Sonnet 4.6**; `jd_formatting`
> (added post-lock) moved from the retired Claude 3.5 Haiku to **Claude Sonnet 4.6** — the fix for
> the `format-jd` 502. Non-Anthropic routes unchanged. Implementation mirror:
> `docs/conventions/model-routing.md`.

---

## Routing Rules

| Rule ID | Rule |
| --- | --- |
| AI-RULE-001 | Model selection is determined by task_type; manual override requires JB confirmation |
| AI-RULE-002 | All calls log tokens_in, tokens_out, estimated_cost_usd to `ai_model_usage` |
| AI-RULE-003 | When monthly cost >= $75, non-critical calls are queued until next billing cycle |
| AI-RULE-004 | Critical calls (email classification, stage transitions) are never blocked by cost cap |
| AI-RULE-005 | Email confidence < 0.70 → store event but do not auto-action (see BR-011) |
| AI-RULE-006 | match_score >= 60 → Consideration pipeline; match_score >= 80 → Auto-Submit prep (SIGN-OFF-005) |
| AI-RULE-007 | Score override by JB writes reason to `application_events` with actor = 'jb_manual' |
| AI-RULE-008 | RAG context is sourced from: JB resume, work history, past application outcomes, stated preferences |
| AI-RULE-009 | All AI responses include reasoning trace stored in relevant table (e.g., `ai_scores.reasoning_trace`) |

---

## Score Threshold Specification (SIGN-OFF-005)

| Range | Label | Action |
| --- | --- | --- |
| 0–59 | Reject | Job stays in `discovery`; no promotion; JB can override |
| 60–79 | Consideration | Job promoted to manual review pipeline; JB reviews and decides |
| 80–100 | Auto-Submit Prep | System prepares full packet; JB approval gate triggered before any submission |

---

## Cost Estimation Reference

The following are approximate per-call cost estimates for budgeting purposes. Actual costs
depend on prompt engineering and token counts. All values in USD.

| Task | Estimated Cost/Call | Volume/Month | Est. Monthly |
| --- | --- | --- | --- |
| Match scoring (800 jobs) | $0.03 | 800 | $24.00 |
| Cover letter (100 packets) | $0.10 | 100 | $10.00 |
| Resume variant (100 packets) | $0.08 | 100 | $8.00 |
| Email classification (300 emails) | $0.005 | 300 | $1.50 |
| General chat (50 sessions) | $0.02 | 50 | $1.00 |
| Research (50 companies) | $0.05 | 50 | $2.50 |
| **Estimated total** | | | **~$47.00** |
| **Hard cap** | | | **$75.00** |

These estimates leave ~$28 buffer. Monitor via dashboard and adjust routing if needed.

---

## Implementation Reference

Router logic lives in `src/lib/ai-router.ts`. Key responsibilities:

- Accept `task_type` and `context`
- Return correct `model_id` per routing matrix
- Check cost cap before dispatching
- Log usage to `ai_model_usage` after each call
