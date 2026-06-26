# BKT AI-Apply — LLM Strategy & Routing (2026)

> **Status:** Draft for review · **Owner:** John Burkhardt (john@bktadvisory.com)
> **Created:** 2026-06-16 · **Scope:** All LLM use across the BKT AI-Apply product + its build/operate workflows
> **Subscriptions in scope:** OpenAI (Pro Workspace) · Anthropic Claude (Pro Max 5x) · Gemini (Google Workspace) · GitHub Copilot (Pro+)

## How to use this document

This is a **self-contained, portable reference**. It can be pasted into a fresh chat (any model) to
give full context on how LLMs are — and should be — assigned across BKT AI-Apply. It covers the
as-built state, the recommended target state, per-model role cards, the connector/tool map, and a
prioritized roadmap. Two open decisions are tracked at the end.

Source of truth for runtime routing remains `src/lib/ai-router.ts`; this doc is the strategy layer
above it.

---

## 0. The one insight that frames everything: two layers, not one

The four subscriptions are **not** interchangeable engines for the app. They live on two layers, and
conflating them is the single biggest cost leak.

| Layer | What runs it | Billing | Subscriptions |
| --- | --- | --- | --- |
| **Runtime** (features the app calls) | **API keys** in Supabase Edge Functions (`ANTHROPIC_KEY`, `OPENAI_KEY`, `GEMINI_KEY`) | Metered, pay-per-token, under the `$75/mo` cap | *Not* the chat subscriptions |
| **Build & Operate** (humans + agents building/running the app) | **Subscriptions** (Claude Max, ChatGPT Pro, Gemini Workspace, Copilot Pro+) | Flat monthly fee, effectively unlimited human/agent use | All four |

**Runtime features cannot run on the subscriptions** (provider ToS + no API access through a chat
seat). Subscriptions = the cockpit for building/operating; API keys = the engine for features.
Optimize each layer independently. Everything below is organized on this split.

---

## 1. Executive summary

**Current state (as-built — genuinely strong):**

- A real **multi-model router** (`src/lib/ai-router.ts`): an 11-task routing matrix, a **`$75/mo`
  hard cap** (warn at 80% / 90%), per-call cost logging to `ai_model_usage`, and a clean provider
  abstraction (Anthropic / OpenAI / Google) behind thin Edge Functions. Documented in
  `docs/adr/005-multi-model-llm-provider-abstraction.md`.
- **Live today:** match scoring (Opus), cover letters (Opus), resume rewriting (GPT-5), JD formatting
  (Haiku), email classification + drafts + intent routing (Gemini Flash), general chat (Sonnet),
  autonomous Prospector cron (SerpApi → format → score).
- **Deferred / stub:** browser auto-apply, company market research, interview prep (routing entries
  exist, no implementation).

**Three problems to fix:**

1. **Stale model IDs.** Repo targets Opus 4.6 / GPT-5 / Gemini 2.5; mid-2026 GA is **Opus 4.8,
   GPT-5.5, Gemini 3.5 Pro/Flash**. There is also a mismatch: display name "Claude Opus 4.6" maps to
   API id `claude-opus-4-8` in `supabase/functions/_shared/llm/anthropic.ts`.
2. **Opus on every match score is the big cost leak.** Opus is the most expensive model
   (`$15 / $75` per 1M in/out) yet it runs on *every* manually-scored job **and** twice-daily on
   *every* Prospector job. Scoring is rubric-driven JSON; a mid-tier model handles it.
3. **Zero connectors / zero Copilot wired in.** Gmail is hand-rolled, and there is no job-board,
   document-design, or ops automation — despite a full MCP connector suite being available (Indeed,
   Dice, ZipRecruiter, Upwork, Gmail, Calendar, Drive, Canva, Supabase, Vercel, GitHub, Notion,
   Linear, Jam, Lucid, Figma).

**Future state (target):** refresh to current models; convert match scoring to a **two-tier triage**
(cheap first-pass, Opus only on the borderline 60–79 band); move JD formatting to Gemini Flash
(cheaper than Haiku); build the three deferred tasks on the right specialist; and wire MCP connectors
for job discovery, the email/calendar backbone, document design, and the **production ticket → fix →
deploy** loop. Net effect: **same-or-better quality at materially lower runtime cost**, plus the
automation surface the product is currently missing.

---

## 2. As-built routing matrix (today)

Source: `src/lib/ai-router.ts` `ROUTING_MATRIX` + `docs/conventions/model-routing.md`.

| Task type | Model (current) | Provider | Critical? | Status |
| --- | --- | --- | --- | --- |
| `cover_letter_generation` | Claude Opus 4.6 | anthropic | no | live |
| `interview_prep` | Claude Opus 4.6 | anthropic | no | deferred |
| `match_scoring` | Claude Opus 4.6 | anthropic | no | live |
| `resume_rewriting` | GPT-5 | openai | no | live |
| `browser_form_automation` | GPT-5 | openai | no | deferred (Phase 4) |
| `company_market_research` | Gemini 2.5 Pro | google | no | deferred |
| `email_classification` | Gemini 2.5 Flash | google | **yes** | live (never cost-capped) |
| `email_draft` | Gemini 2.5 Flash | google | no | live (human-reviewed) |
| `intent_routing` | Gemini 2.5 Flash | google | no | live |
| `general_qa` | Claude Sonnet 4.6 (default) | anthropic | no | live (user-selectable) |
| `jd_formatting` | Claude 3.5 Haiku | anthropic | no | live |

**Cost controls (live):** hard cap `$75/mo` per user; warnings at 80% (`$60`) and 90% (`$67.50`);
non-critical tasks deferred/queued at 100%; `email_classification` bypasses the cap (BR-053). Every
call logs provider, model, task, tokens, and estimated cost to `ai_model_usage` (immutable).

**Not present:** no RAG/vector store (knowledge is relational rows: resume, work history, outcomes,
preferences), no MCP connectors wired into the app, no Copilot integration.

**Reference list prices used for estimation** (`$` per 1M tokens, input / output):

| Model | Input | Output |
| --- | --- | --- |
| Claude Opus 4.6 | 15 | 75 |
| Claude Sonnet 4.6 | 3 | 15 |
| Claude 3.5 Haiku | 0.8 | 4 |
| GPT-5 | 5 | 15 |
| GPT-4o | 2.5 | 10 |
| Gemini 2.5 Pro | 1.25 | 5 |
| Gemini 2.5 Flash | 0.3 | 2.5 |

---

## 3. Current vs. recommended routing (the core decision table)

| Feature / Task | Current (as-built) | Recommended runtime model | Effort | Rationale |
| --- | --- | --- | --- | --- |
| **Job searching online** | SerpApi only (no LLM) | **MCP boards** (Indeed/Dice/ZipRecruiter/Upwork) + **Gemini 3.5 Flash** normalize | none–low | Multi-board beats single SerpApi; Flash is the cheapest normalizer |
| **Match scoring** | Opus 4.6 on *every* job | **Tier 1:** Gemini 3.5 Flash *or* Sonnet 4.6 first-pass → **Tier 2:** Opus 4.8 *only* on the 60–79 "consider" band | none → high | **Biggest savings.** Opus-on-everything is overkill for rubric JSON; reserve judgment for marginal calls |
| **Resume tailoring / ATS align** | GPT-5 | **GPT-5.5** (low–med effort) | low–med | Keep OpenAI — strongest at ATS keyword + structured rewrite |
| **Cover letter** | Opus 4.6 | **Opus 4.8** (or Sonnet draft → Opus polish) | medium | Quality justified; low volume keeps cost acceptable |
| **JD formatting** | Claude 3.5 Haiku | **Gemini 3.5 Flash** | none | Flash (`$0.3/$2.5`) cheaper than Haiku (`$0.8/$4`); mechanical task |
| **Email classification** *(critical)* | Gemini 2.5 Flash | **Gemini 3.5 Flash** (keep, bump) | none | Already correct — high-volume, low-latency, never cost-capped |
| **Email drafting** | Gemini 2.5 Flash | **Gemini 3.5 Flash** (keep) | none–low | Fine; human-reviewed (BR-038) |
| **Intent routing** | Gemini 2.5 Flash | Deterministic + **Flash** fallback | none | Fine |
| **AI assistant (general Q&A)** | Sonnet 4.6 | **Sonnet 4.6** (keep) | low–med | Best cost/quality default for chat |
| **Interview prep** *(deferred)* | Opus (planned) | **Opus 4.8** | high | Build it — deep reasoning task |
| **Company / industry market research** *(deferred)* | Gemini Pro (planned) | **Gemini 3.5 Pro + Deep Research** | high | Native research/synthesis + Workspace grounding |
| **Full auto-apply (browser/form)** *(deferred)* | GPT-5 (planned) | **GPT-5.2-Codex / Operator** + Browserbase (already in `.env`) | medium | Agentic browser control is OpenAI's lane |
| **Build / ops / ticket→fix** | none | **Copilot Pro+** and/or **Claude Code** | agent | Dev-loop, *not* a runtime feature (see §5) |

---

## 4. The four LLMs — role cards

Each card: Model Type · Effort · Tools/Connectors · Knowledge Docs · Predefined Prompts.

### Anthropic Claude — Pro Max 5x (`$100/mo`) — "Judgment, prose & the builder"

- **Model Type:** Opus 4.8 (cover-letter polish, borderline scoring rationale, interview prep) ·
  Sonnet 4.6 (general/app chat default, first-draft scoring, doc-builder chat) · Haiku (retire from
  formatting; see Gemini).
- **Effort:** cover letter = medium · scoring rationale = high (borderline only) · chat = low–med ·
  interview prep = high.
- **Tools/Connectors:** Claude Projects (knowledge grounding) · MCP connectors (Gmail, Calendar,
  Drive, Supabase, GitHub, Notion, Linear) · Claude Code for the dev loop.
- **Knowledge Docs:** master profile + work history; `docs/domain/business-rules.md`,
  `pipeline-stages.md`; **house style (BR-073: no em/en-dashes in candidate docs)**; brand voice.
- **Predefined Prompts (owns):** `COVER_LETTER_SYSTEM_PROMPT` ·
  `score-job-fit/DEFAULT_SYSTEM_PROMPT` · chat `buildSystemPrompt` · *(add)* `interview_prep`.

### OpenAI — Pro Workspace — "Structured/ATS + agentic browser"

- **Model Type:** GPT-5.5 (resume/ATS, structured extraction) · GPT-5.2-Codex / GPT-5.4 Pro (browser
  form automation, field mapping). Effort levels: none / low / medium / high / xhigh.
- **Effort:** resume = low–med · browser automation = medium · field extraction = low.
- **Tools/Connectors:** Custom GPTs + Actions · ChatGPT Connectors (Drive/Gmail) · runtime via
  OpenAI API · browser via Operator + Browserbase (`BROWSERBASE_API_KEY` already in `.env`).
- **Knowledge Docs:** ATS keyword libraries, resume style guide, master profile, target-JD corpus.
- **Predefined Prompts (owns):** `RESUME_SYSTEM_PROMPT` · *(add)* `browser_form_automation` +
  structured field-map prompt.

### Gemini — via Google Workspace — "High-volume, low-latency & native Workspace"

- **Model Type:** Gemini 3.5 Flash (email classification *critical path*, intent routing, drafts, JD
  formatting — cheapest) · Gemini 3.5 Pro (market research, long-context grounding).
- **Effort:** classification / routing = none (zero `thinkingBudget`, keep it cheap & fast) · market
  research = high (Deep Research).
- **Tools/Connectors:** native Gmail / Calendar / Drive / Docs · Gems (saved assistants) · Deep
  Research · runtime via Gemini API · MCP (Gmail, Google Calendar, Google Drive, Indeed company data).
- **Knowledge Docs:** classification taxonomy + `gmail_label_map`; company-research corpus;
  resumes/letters in Drive.
- **Predefined Prompts (owns):** `GEMINI_SYSTEM_PROMPT` (classification) · `gmail-send` draftReply
  prompt · *(add)* market-research Gem · *(move here)* `JD_FORMAT_SYSTEM_PROMPT`.

### GitHub Copilot — Pro+ — "Not a feature model — the build/operate engine"

> The top individual tier is **Pro+** (300+ premium requests); there is no "Pro Max." Use it to
> build and run the app, never as a runtime feature provider.

- **Model Type:** multi-model — GPT-5.2-Codex (code), Claude Opus 4.6 (reasoning-heavy refactors),
  Gemini 3 Pro (long context). Agent mode + coding agent (GA in VS Code / JetBrains).
- **Effort:** agent mode (multi-step, autonomous PRs); high for complex refactors.
- **Tools/Connectors:** GitHub MCP (PRs/issues/CI) · MCP servers in the IDE (Supabase, etc.) · assign
  coding-agent to issues.
- **Knowledge Docs:** the repo itself — `CLAUDE.md`, `docs/adr/`, `docs/conventions/`, `docs/domain/`.
- **Predefined Prompts:** repo conventions as custom instructions · PR-review template ·
  "production ticket → PR" workflow.

---

## 5. Connector / tool map (which tools to call, by workflow)

> Availability of any given MCP server varies per session; treat this as the target wiring.

**Job discovery & auto-apply**

- `Indeed.search_jobs`, `get_job_details`, `get_company_data`, `get_resume` · `Dice.search_jobs` ·
  `ZipRecruiter.search_jobs` · `Upwork.*` (contract roles) → replace/augment SerpApi in
  `prospector-cron`.
- Submission: OpenAI Operator / Browserbase (already configured), gated by `SUBMISSION_LIVE`.

**Email + interview automation (currently hand-rolled)**

- `Gmail.search_threads`, `create_draft`, `label_thread` · `Google_Calendar.list_events`,
  `suggest_time`, `create_event` → augments `gmail-sync` / `gmail-send`, auto-schedules on
  `interview_invite`.

**Documents & design**

- `Canva.create-design-from-brand-template`, `export-design` (branded resume/cover-letter PDFs) ·
  `Google_Drive.create_file` (store variants) · `PDF_Viewer.display_pdf` (preview).

**Market research**

- Gemini Deep Research + web search + `Indeed.get_company_data` → feeds the deferred
  `company_market_research` task.

**Ops loop: production ticket → improvement**

- `Jam.*` (capture bug/console/network from live prod) → `Linear.save_issue` *or*
  `Notion.notion-create-pages` (ticket) → Copilot coding agent /
  `github.create_pull_request_with_copilot` (fix) → `Supabase.get_advisors` + `get_logs` (verify) →
  `Vercel.deploy_to_vercel` + `get_runtime_logs` (ship & confirm).

**DB / schema / deploy**

- `Supabase.list_tables`, `apply_migration`, `generate_typescript_types`, `deploy_edge_function`,
  `get_advisors` · `Vercel.list_deployments`, `get_deployment_build_logs`.

---

## 6. Future-state roadmap (prioritized)

1. **Refresh model IDs** in `ai-router.ts` + `_shared/llm/*.ts` → Opus 4.8, GPT-5.5, Gemini 3.5
   Pro/Flash; fix the 4.6 → `claude-opus-4-8` display/ID mismatch.
2. **Two-tier match scoring** → Flash/Sonnet first-pass, Opus only on the 60–79 band. Largest cost
   reduction; touches `aiScoringService` + `score-job-fit`.
3. **JD formatting → Gemini 3.5 Flash** (cheaper than Haiku).
4. **Build the three deferred tasks** on their assigned specialists (interview prep → Opus; market
   research → Gemini Pro + Deep Research; browser auto-apply → GPT-5.2-Codex + Browserbase).
5. **Wire job-board MCP connectors** into Prospector; **Gmail/Calendar MCP** into the email pipeline.
6. **Stand up the ops loop** (Jam → Linear/Notion → Copilot/Claude Code → Vercel/Supabase).
7. Keep the **subscription/API split** explicit — never route runtime traffic through chat seats.

---

## 7. Open decisions (tracked)

- **(a) Artifact / formalization:** this strategy doc lives at `docs/strategy/llm-routing-2026.md`.
  Decide whether to additionally promote it (or its decisions) into a formal ADR
  (`docs/adr/009-...`) once approved.
- **(b) Implementation:** approve moves **#1–#3** (model-ID refresh + two-tier scoring + JD → Flash)
  as a focused, low-risk PR. `pnpm validate` (typecheck + lint + test) gates the change.

---

## 8. Key references

**Repo files**

- `src/lib/ai-router.ts` — routing matrix, cost policy, chat model catalog (source of truth)
- `docs/conventions/model-routing.md` — documented routing policy
- `docs/requirements/05-ai-routing.md` — cost enforcement rules (AI-RULE-001..009)
- `docs/adr/005-multi-model-llm-provider-abstraction.md` — provider abstraction decision
- `supabase/functions/_shared/llm/*` — provider clients (anthropic/openai/google/factory)
- `supabase/functions/{ai-chat,score-job-fit,format-jd,generate-document,gmail-sync,gmail-send}` —
  AI Edge Functions
- `supabase/functions/prospector-cron/` — autonomous discovery + scoring

**External (2026 model landscape)**

- OpenAI: <https://openai.com/index/introducing-gpt-5-5/> ·
  <https://help.openai.com/en/articles/9624314-model-release-notes>
- Anthropic Claude plans: <https://www.glbgpt.com/hub/claude-ai-plans-2026/> ·
  <https://intuitionlabs.ai/articles/claude-max-plan-pricing-usage-limits>
- Gemini: <https://www.eesel.ai/blog/google-gemini-3-pricing> ·
  <https://nettpilot.com/google-gemini-business-guide-2026/>
- GitHub Copilot: <https://www.nxcode.io/resources/news/github-copilot-complete-guide-2026-features-pricing-agents>
