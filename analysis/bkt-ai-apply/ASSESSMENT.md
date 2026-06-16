# Modernization Assessment — BKT AI-Apply

| | |
|---|---|
| **System** | `bkt-ai-apply` (`C:\Users\johnb\bkt-ai-apply`) |
| **Assessment date** | 2026-06-15 |
| **Method** | `find` + `wc -l` for LOC, decision-keyword heuristic for complexity (`scc`/`cloc`/`lizard` not installed on host); 3-agent parallel deep analysis (2× legacy-analyst, 1× security-auditor) with a 1-vote adversarial verification pass over every debt + security finding |
| **Verification** | 18 of 19 findings kept after verification; 1 debt finding (match-scoring mispricing) refuted and dropped |
| **Git** | git repository, current branch HEAD as of 2026-06-15 |

---

## 1. Executive Summary

BKT AI-Apply is a **modern, well-engineered, well-documented** single-operator job-application automation pipeline (~37 KSLOC application code: React 19 + Vite + TypeScript-strict SPA over a Supabase backend of PostgreSQL + RLS + 9 Deno Edge Functions). This is **not a decayed legacy system** — it has co-located unit tests (~30 Vitest suites), 7 Playwright e2e specs, an RLS-everywhere security model, an event-sourced pipeline, and an unusually deep `docs/` corpus (PRD, 9 requirements docs, 8 ADRs, 86 numbered business rules). The headline risk is therefore **not rot but drift and concentration**: a small number of god-files concentrate change-risk, the security posture leaves two server endpoints publicly invokable, error handling silently masks failures as demo data, and the rich documentation has drifted out of sync with the code in several load-bearing places.

**Headline recommendation: `Refactor` in place** (not rehost/rebuild). Prioritize a short security-hardening pass (auth-gate the cron endpoints, fix CRLF injection), then a correctness fix (model-id mismatch), then targeted decomposition of the three god-files and an error-handling convention. There is no architectural rewrite warranted.

---

## 2. System Inventory

### 2.1 Size (LOC by language — `find`+`wc`, vendored dirs excluded)

| Language | Files | LOC | Notes |
|---|---:|---:|---|
| TypeScript (`.ts`) | 136 | 20,380 | incl. ~1,424 auto-generated `db.types.ts` |
| TSX (`.tsx`) | 75 | 14,140 | React components/screens |
| SQL (`.sql`) | 32 | 2,735 | 31 migrations + RPCs/RLS |
| CSS | 4 | 812 | Tailwind v4 layer + injected styles |
| JS | 1 | 29 | config |
| HTML | 1 | 19 | Vite entry |
| **Application code subtotal** | **249** | **~38,115** | ~36.7 KSLOC excluding generated types |
| Markdown | 187 | 22,201 | **only ~36 are product docs** — 150 are `.agents/`/`.claude/`/`.github/` tooling scaffolding |

### 2.2 Technology fingerprint (with evidence)

| Layer | Technology | Evidence |
|---|---|---|
| Frontend | React **19.2** + Vite 8 + TypeScript 6 (strict) | `package.json:31,52,54` (note: CLAUDE.md & architecture.md say "React 18" — drift) |
| UI | Tailwind CSS v4, Radix UI primitives, shadcn (`components.json`), lucide-react, sonner | `package.json:18-34` |
| Backend | Supabase — PostgreSQL + Auth (GoTrue) + Realtime + Storage + Edge Functions (Deno) | `supabase/config.toml`, `supabase/functions/*` |
| Edge Functions (9) | `prospector-cron`, `gmail-sync`, `gmail-send`, `ai-chat`, `score-job-fit`, `generate-document`, `format-jd`, `submission-worker`, `provider-status` + `_shared/*` | `supabase/functions/` |
| Data | 31 SQL migrations, generated `src/types/db.types.ts` (`pnpm db:gen-types`) | `supabase/migrations/` |
| AI | Multi-model routing (Anthropic / OpenAI / Gemini) via `src/lib/ai-router.ts` + `_shared/llm/factory.ts` | `docs/conventions/model-routing.md` |
| Integrations | SerpAPI (job discovery), Gmail API + Google OAuth, Browserbase/Stagehand (browser submission), ATS APIs (Greenhouse/Lever/Ashby) | `.env.example`, `_shared/submission/atsAdapters.ts` |
| Hosting | Vercel (`vercel.json`, `@vercel/analytics`) | `package.json:27` |
| Tests | Vitest unit (~30 co-located `*.test.ts`), Playwright e2e (7 specs) | `package.json:12-14`, `e2e/`, `src/**/*.test.ts` |
| Build/CI | pnpm, `tsc -b && vite build`, eslint (max-warnings 0), `pnpm validate` gate | `package.json:6-15` |

**Test presence signal:** ~37 test files for 249 source files — a genuine, living test suite co-located with services. This is the single biggest differentiator from a typical "legacy" subject and materially de-risks the refactor.

---

## 3. Architecture-at-a-Glance

11 functional domains. Dependency diagram: `analysis/bkt-ai-apply/ARCHITECTURE.mmd`.

| Domain | Responsibility | Key files |
|---|---|---|
| App Shell & Auth | Pseudo-router, AppShell chrome, single Supabase client, sole auth boundary | `src/App.tsx`, `src/contexts/AuthContext.tsx`, `src/lib/supabase.ts` |
| Applications Pipeline & Events | Stage transitions via `transition_stage` RPC → immutable `application_events`; board, analytics, audit log | `src/features/applications/*`, `migrations/...transition_stage_rpc.sql` |
| Job Discovery & Prospector | SerpAPI cron upsert into `jobs`; dashboard, search table, graduation into pipeline | `supabase/functions/prospector-cron/index.ts`, `src/features/jobs/*` |
| AI Routing & Scoring | Routing matrix + monthly cost cap; thin JWT-gated edge bridges for scoring/doc-gen | `src/lib/ai-router.ts`, `functions/score-job-fit`, `functions/_shared/llm/*` |
| Conversational AI Assistant | Chat UI, model selector, conversation/`chat_memory` RAG via `ai-chat` | `src/features/ai-agent/*`, `functions/ai-chat/index.ts` |
| Documents | Master-profile resume/cover-letter generation, sanitizing, storage | `src/features/applications/services/documentGenerationService.ts`, `functions/generate-document` |
| Auto-Apply Workspace & Settings | Redesigned dashboard shell + `user_settings` autonomy controls | `src/features/auto-apply/*` |
| Auto-Submission Engine | Kill-default (dry-run/shadow/live) worker draining `application_queue` via ATS-first / browser-fallback | `functions/submission-worker`, `functions/_shared/submission/*` |
| Gmail Integration | Scheduled `gmail-sync` pull + Gemini classification + auto-transition; `gmail-send` compose | `functions/gmail-sync/*`, `functions/gmail-send/*` |
| Settings & Provider Status | Booleans-only provider key status feeding model selector | `src/features/settings/*`, `functions/provider-status` |
| Data Schema & RLS Migrations | ~26 tables + RPCs + RLS + Realtime/Storage; surfaced as `db.types.ts` | `supabase/migrations/*` |

### 3.1 Dangling / orphaned references (re-sync targets)

- **`docs/architecture.md` describes Edge Functions `gmail-webhook` and `calendar-webhook` and `src/lib/gmail.ts` — none exist.** Live Gmail path is the scheduled *pull* `gmail-sync` (not a webhook); there is no calendar function.
- **`CLAUDE.md` "Source Directory Contract" lists `src/features/gmail/`, `src/features/documents/`, `src/hooks/` — none exist.**
- **Orphaned/dead code:** `calendarIntelligenceService.ts` (no non-test importer — logic half of the never-built calendar webhook), `gmailIntelligenceService.ts` (superseded by server-side `gmail-sync/logic.ts`), and a **second, dead chat implementation** `ChatAssistantPanel.tsx` + `chatAssistantService.ts` (AppShell wires only `ai-agent/AiAssistantPanel.tsx`).
- **Duplicate ADR id `001`:** `001-auto-apply-threshold.md` and `001-gdpr-vs-event-immutability.md` both claim `001`, violating the `NNN-description.md` convention.
- **ATS vendor mismatch:** architecture doc names Greenhouse/Ashby/**Workday** as MVP, but implemented adapters are Greenhouse/**Lever**/Ashby — Workday documented-but-unimplemented, Lever implemented-but-undocumented.

---

## 4. Production Runtime Profile

**No production telemetry available.** No APM/observability MCP server, batch logs, or runtime exports were supplied, so the highest-operational-risk domain cannot be identified empirically. The static-analysis proxy for operational risk is the **prospector-cron** path (twice-daily, fans out paid SerpAPI + Anthropic Haiku calls per profile, 1112 LOC / ~248 decision points) and the **submission-worker** (real-world side effects). **Recommendation:** before any phase ships, wire minimal structured logging (function name, duration, outcome) on the 9 Edge Functions so the brief's exit criteria can be measured rather than asserted.

---

## 5. Technical Debt (ranked by remediation value)

> 10 candidates were found; **9 confirmed** below. Candidate #4 ("match_scoring routes to Opus pricing, ~30× over-charging the $75 cap") was **investigated and REFUTED**: `score-job-fit` is model-agnostic and the sole caller passes the pinned `Claude Opus 4.6`, which is also what's logged and priced; `scoreJobFitWithLlm.test.ts` asserts it. No mispricing exists. (Retained here for audit transparency.)

| # | Finding | Category | Location | Verdict |
|---|---|---|---|---|
| 1 | **`anthropic.ts` maps pinned `"Claude Opus 4.6"` → API id `claude-opus-4-8`** — every cover-letter, interview-prep & match-scoring call silently runs a *different* model than is specified, priced, and logged | correctness / version-drift | `functions/_shared/llm/anthropic.ts:14-15` | CONFIRMED |
| 2 | **`PreferencesScreen` "Save" is a no-op toast** — 1029-line god-component never reads/writes Supabase; ships hardcoded PII (`john@bktadvisory.com`, phone, salary) as `useState` defaults; bypasses the existing `settingsService` | dead-code / data-loss | `screens/PreferencesScreen.tsx:634,479-533` | CONFIRMED |
| 3 | **Service+hook layer swallows all errors into demo data** — 6 fetchers use bare `catch { return {source:'demo'} }`; `useAsyncData` exposes no `error`; a real RLS/auth/outage failure is indistinguishable from "no rows" and renders seed data as the user's real pipeline | missing-error-handling | `services/autoApplyService.ts:130,236,271,350,396,507` + `hooks/useAutoApplyData.ts:45` | CONFIRMED |
| 4 | `ProspectorSearchResults` is a **1523-line god-component** mixing ~20 sub-components + DnD/keyboard/sort/filter/persistence/injected-CSS/job-sheet (121 decisions) | god-object | `features/jobs/components/ProspectorSearchResults.tsx` | CONFIRMED |
| 5 | **`prospector-cron` god-function: 1112 LOC / ~248 decisions** — two near-identical upsert loops that have already *diverged*; 13 unexported (untestable) parsers/mappers | god-object | `functions/prospector-cron/index.ts:779-1112` | CONFIRMED |
| 6 | `prospector-cron` diverges from `_shared` conventions — inline `CORS_HEADERS` duplicate, hand-built JSON, 5× `@ts-expect-error Deno` (a future "unused @ts-expect-error" would break `pnpm validate`) | inconsistency | `functions/prospector-cron/index.ts:27-31,973-991` | CONFIRMED |
| 7 | **Duplicated helpers** — `relativeTime`/`formatComp` reimplemented (already drifting `$73k` vs `$73K`); `createServiceClient()` copy-pasted in **all 4** server functions | duplication | `services/autoApplyService.ts:23-50` + 4 Edge fns | CONFIRMED |
| 8 | `application_events.actor` CHECK lists **6 AI-model enum values no code ever writes**, encoding stale versions (`claude-opus-4`, `claude-sonnet-4-5`) | dead-code / schema | `migrations/...create_application_events.sql:65-70` | CONFIRMED |
| 9 | **CLAUDE.md references convention docs that don't exist** (`error-handling.md`, `golden-principles.md`) — so the `catch {}` swallowing in #3 has no canonical rule to enforce; agent-protocol mandates a HOLD on missing paths | doc drift | `CLAUDE.md:63-64` | CONFIRMED |

**Top remediation notes**
- **#1** is a real correctness bug with the highest value/effort ratio: decide the intended model, make `MODEL_ID_BY_NAME` honest (`Claude Opus 4.6 → claude-opus-4-6`), and add a unit test asserting every catalog display-name resolves to a matching version id.
- **#2/#3** together are why a user could not trust the UI: preferences silently don't persist, and failures silently render fake data. Fix `save` to await a real upsert; add an `error` channel to `useAsyncData`; reserve the demo fallback for the genuinely-unconfigured case only.
- **#4/#5** are the change-risk concentration points — decompose using the existing sibling-hook precedent (`useProspectorTableControls`, `_shared/submission/resolveChannel.ts` was deliberately kept pure + tested).

---

## 6. Security Findings

> No hardcoded credential **values** were found (`secretsFound: false`); `.env.example` contains placeholders only. No `SECRETS.local.md` is required. Severities below reflect the adversarial verification pass.

| Severity | CWE | Finding | Location |
|---|---|---|---|
| **High** | CWE-306 | **`prospector-cron` is publicly invokable with no auth** — deployed `--no-verify-jwt`, no `CRON_SECRET`/JWT check (unlike `submission-worker`); goes straight to reading `SERPAPI_KEY` + service-role processing of *all* users' profiles. Each call burns paid SerpAPI + Anthropic Haiku quota | `functions/prospector-cron/index.ts:974-992` |
| **High → Medium** | CWE-306 | **`gmail-sync` is publicly invokable with no auth** — only a 60s `MIN_SECONDS_BETWEEN_RUNS` throttle (a frequency cap, not authentication). Verifier downgraded to Medium: throttle bounds amplification, but anonymous callers can still force paid Gemini classification + service-role stage transitions | `functions/gmail-sync/index.ts:331-347` |
| **Medium** | CWE-93 | **Email header (CRLF) injection in `gmail-send`** — `to`/`subject` interpolated into MIME headers with no `\r`/`\n` stripping; all-ASCII subject with embedded CRLF passes through → `Bcc:` injection / exfiltration from JB's Gmail | `functions/gmail-send/mime.ts:38-52` |
| **Low** | CWE-942 | **Wildcard CORS** (`Access-Control-Allow-Origin: *`) on every function incl. JWT-gated ones; removes a defense layer (bearer-token, so CSRF impact limited) | `functions/_shared/http.ts:2-6` |
| **Low** | CWE-602 | **Self-writable autonomy guardrails** — RLS lets a user UPDATE `review_mode`/`auto_submit_score_threshold`/`credits`/budget on their own row, the same fields `claim_submission` treats as "server-authoritative"; self-scoped (not cross-user), bounded in single-operator deploy | `migrations/...create_user_settings.sql:48-52` |
| **Low** (PLAUSIBLE) | CWE-918 | **PII misdirection via `source_url`** — `sendAtsForm` POSTs candidate PII/resume to board/posting ids derived from attacker-influenceable `jobs.source_url` (host is pinned, identifiers are not). *Browser-adapter half refuted* (it only POSTs to hardcoded `api.browserbase.com`). Heavily gated by `SUBMISSION_LIVE` | `functions/_shared/submission/atsAdapters.ts:288-311` |
| **Low** | CWE-1287 | **Prompt injection into Gemini classifier** — raw attacker email From/Subject/snippet embedded in the classification prompt; bounded by strict enum+clamp output, ≥0.70 gate, legal-transition + offer-protection guards → worst case is a wrong stage on the victim's own pipeline | `functions/gmail-sync/logic.ts:166-172` |
| **Info** | CWE-1188 | **Open signup + 6-char password** in `config.toml` for a single-operator OAuth tool (governs local dev; verify prod Auth settings match) | `supabase/config.toml:176-185` |
| **Info** | CWE-200 | **No recipient allow-list on `gmail-send` compose** — JWT-gated + 10/min rate-limited, but a compromised session can send arbitrary mail from JB's mailbox | `functions/gmail-send/index.ts:273-309` |

**Net posture:** strong baseline (RLS-always-on, `user_id` scoping, service-role isolation, kill-default submission gate, no leaked secrets). The two **High** items share one root cause — **inconsistent auth on `--no-verify-jwt` endpoints** — and should be fixed by generalizing `submission-worker`'s `isCronAuthorized()` into a shared gate, not by bolting one-off checks onto each function.

---

## 7. Documentation Gaps (top 5)

The problem here is the inverse of most legacy systems: documentation is *abundant* but has **drifted** from code. The 5 things a new engineer/agent would be misled by:

1. **`CLAUDE.md` dead links** — `docs/conventions/error-handling.md` and `golden-principles.md` are referenced (and the agent-protocol mandates pre-flight reads) but don't exist. The missing error-handling doc is exactly the rule that would govern debt #3.
2. **`architecture.md` describes a webhook ingestion model that was never built** (`gmail-webhook`, `calendar-webhook`, `src/lib/gmail.ts`); the real system polls via `gmail-sync`. A reader will look for the wrong files.
3. **Framework version drift** — docs say "React 18"; the project is React 19. Small but erodes trust in the docs.
4. **ATS vendor list is wrong** in both directions (Workday documented-not-built; Lever built-not-documented) — affects anyone scoping ATS work.
5. **Business rules have no machine-readable priority** — 86 `BR-` rules exist but none carry a `P0` tag; the de-facto P0 set is the "Core Invariants (Never Violate)" section (BR-001…BR-008). The Behavior Contract in the brief must derive P0 from that section, and SMEs should confirm the boundary.

---

## 8. Effort Estimation

COCOMO-II basic (organic, nominal scale factors), as a **size proxy** — `scc` was unavailable, so KSLOC is from `find`+`wc` (hand-written application code, generated `db.types.ts` excluded ≈ **37.0 KSLOC**):

```
PM = 2.94 × (KSLOC)^1.10
   = 2.94 × (37.0)^1.10
   = 2.94 × 53.1
   ≈ 156 person-months  (nominal greenfield build, ±25% → ~117–195 PM)
```

At a loaded ~$13k/PM this implies a **~$2.0M nominal from-scratch replacement cost** — useful only as a scale anchor.

**This is NOT the modernization effort.** The recommended work is in-place hardening + targeted refactor, not a rebuild. Bottom-up estimate of the actual program (detailed phasing belongs in the Modernization Brief):

| Workstream | Rough effort |
|---|---|
| Security hardening (shared auth gate for cron fns, CRLF fix, CORS allow-list, guardrail RPCs) | ~0.5–1.0 PM |
| Correctness fix + model-name single-source-of-truth + test | ~0.25 PM |
| Error-handling convention + propagate error state through services/hooks | ~0.5–1.0 PM |
| Decompose 3 god-files (`ProspectorSearchResults`, `prospector-cron`, `PreferencesScreen`) + wire real persistence | ~2.0–3.0 PM |
| Doc re-sync (re-point CLAUDE.md, fix architecture.md, dedupe ADR, author missing convention docs) | ~0.5 PM |
| **Total recommended program** | **~4–6 PM** |

**Key cost drivers:** the three god-files (change-risk concentration) and the absence of an error-handling convention. **Cost *reducers*:** existing co-located test suite, strict TS, `pnpm validate` gate, and the deep requirements/ADR corpus.

---

## 9. Recommended Modernization Pattern

### `Refactor` (in-place improvement)

This codebase is modern, tested, and actively documented; there is no obsolete runtime, no untestable monolith, and no platform lock-in to escape. Rehost/Replatform are irrelevant (it's already cloud-native on Supabase + Vercel), and Rearchitect/Rebuild/Replace would destroy a healthy, working system and its test suite to no benefit.

The right move is a **bounded Refactor**, sequenced by risk:

1. **Harden** the two unauthenticated Edge endpoints and the CRLF injection — generalize `submission-worker`'s auth gate into `_shared` rather than special-casing each function (altitude: fix the mechanism, not the instances).
2. **Correct** the model-id mapping bug and collapse model names to a single source of truth.
3. **Discipline** error handling — author the missing convention, then propagate real error state so failures stop masquerading as demo data.
4. **Decompose** the three god-files using the project's own established patterns.
5. **Re-sync** docs to code (the docs are an asset worth keeping accurate).

> Next pipeline steps: `/modernize-map` (topology + flows) → `/modernize-extract-rules` (lift the 86 BR rules into testable Given/When/Then specs) → `/modernize-brief` (the approvable plan).
