# BKT AI-Apply: Job-Board Research & Revised Headless-Prep Architecture (2026)

## TL;DR

- **Point discovery at the public ATS read-APIs first (Greenhouse, Lever, Ashby) — not at LinkedIn/Indeed/Workday — because those three expose free, auth-free JSON job + application-schema feeds, carry near-zero anti-bot risk for unattended reading, and host the application form themselves; build those three adapters before anything else.**
- **The highest-volume Salesforce/AI/tech sources (LinkedIn ~127,000 US Salesforce jobs; Dice for contract Salesforce; Workday behind the highest-volume enterprise postings) are exactly the platforms most hostile to unattended automation** — LinkedIn's User Agreement §8.2 bans all bots/extensions on its own site, Indeed killed its seeker search API, and Workday sits behind Akamai bot management requiring a per-employer login. These must be forced into Hybrid-with-review or extension-session-only, never touched by Auto-mode background prep.
- **The "headless prep + human submit" model is sound and should ship in this order:** deterministic field map + UI Profile persistence + `prepared_applications` schema (Phase 1) → Greenhouse/Lever/Ashby read adapters (Phase 2) → background prep pipeline with mode gating (Phase 3) → MV3 extension hydrator with hard stop-conditions (Phase 4) → AI free-text drafting (Phase 5) → QA/fixtures (Phase 6).

## Key Findings

### Where the volume actually is

- **LinkedIn** is the largest professional-role board with roughly 127,000 US Salesforce jobs and 47,000 US "Salesforce Administrator" listings indexed (LinkedIn's own displayed counts); it is the single biggest discovery surface for Salesforce/AI/tech but is the most automation-hostile.
- **Indeed** is the largest job site by traffic. Indeed's own About page claims the "#1 job site" position (Comscore, Total Visits, March 2026), and Money (June 2026) reports Indeed had over 177 million monthly U.S. visits in January 2026 per Similarweb, which also ranks indeed.com #1 in the US Jobs & Employment category (May 2026). Broad volume across all categories.
- **Dice** is the strongest tech/contract board and is disproportionately rich in Salesforce contract/W2 roles (admin, developer, architect, consultant, BA); Dice's own homepage advertises "70,000+" tech openings.
- **Workday** is not a board but the ATS that the highest-volume enterprise/tech postings funnel into (~32% of US tech/enterprise postings per the Ongig ATS Market Share Report 2024 and Phenom 2024); it is also the most defended.
- **Greenhouse (~18%), Lever (~12%), Ashby (~5%, fastest-growing)** collectively carry a large share of startup/scale-up tech + AI postings and — critically — expose public read APIs. For scale context: Greenhouse cites 7,500+ customers and reported $266.3M in 2024 revenue (SelectSoftware Reviews); Ashby describes itself as "the fastest growing ATS solution with over 4,000 active customers" (ashbyhq.com).
- **Salesforce-specific:** Salesforce's own **Trailblazer Career Marketplace** (Career Mode, built on Trailhead) is partner-post/all-apply and is the ecosystem-native discovery source; **Mason Frank / Tenth Revolution** is recruiter-mediated (no public API); **SalesforceBen job board** aggregates ecosystem roles. These are discovery-only/secondary.
- **AI-specific:** **ai-jobs.net** offers a clean public JSON API (`https://ai-jobs.net/api/list-jobs/`, ~200 most-recent jobs, refreshed ~2h) and RSS — an ideal low-risk discovery feed; **Y Combinator Work at a Startup** aggregates 1,000+ vetted YC startups (AI-heavy) but has no official public API; **Wellfound** (ex-AngelList, 100,000+ tech jobs, 10M+ candidates) is startup-focused with no individual public API.

### The ATS routing reality (this orders adapter priority)

- **Greenhouse:** Public Job Board API — `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` and `/jobs/{id}` returns jobs + the full `questions` application schema, **no auth for GET** (Greenhouse docs: "Job Board data is publicly available, so authentication is not required for any GET endpoints"), cached, not rate-limited. The apply form itself is Greenhouse-hosted and protected by **Google reCAPTCHA (invisible, escalating to challenge + email verification)**.
- **Lever:** Public Postings API — `GET https://api.lever.co/v0/postings/{company}?mode=json`, no auth, returns postings + apply URLs; supports `team`/`location`/`commitment` filters. Lever-hosted apply forms.
- **Ashby:** Public Posting API — `GET https://api.ashbyhq.com/posting-api/job-board/{client}?includeCompensation=true`; `jobPosting.info` returns the application-form field spec (the schema BKT needs to map). Ashby-hosted apply.
- **SmartRecruiters:** Public Posting API (no auth for read) — `GET https://api.smartrecruiters.com/v1/companies/{company}/postings` plus `/postings/{id}/configuration` returns screening + diversity questions and privacy policy. Good secondary adapter.
- **Workday:** No friendly public board API. There is a readable CXS JSON endpoint pattern `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` returning paginated JSON without login — but it is behind **Akamai bot management** (IP-blocked within minutes of naive scraping per scraping-vendor reports), has a 10,000-result query cap, and many large tenants (e.g., Shell, Goldman Sachs, Adidas) gate it behind a browser session entirely. Applying requires a **separate candidate account per employer**.
- **Indeed:** The seeker-facing Publisher Job Search API is **deprecated/decommissioned**; remaining APIs (Sponsored Jobs, Job Sync) are employer/paid and usage-gated (US since Dec 1 2024). No legitimate individual discovery API.
- **LinkedIn:** No individual job API; User Agreement §8.2 explicitly bans bots, scrapers, crawlers, **and browser extensions** that scrape or automate activity on LinkedIn's site. Enforcement is behavioral (fingerprinting, velocity). Contractual exposure is real even for "public" data: the Dec 6–7, 2022 stipulated consent judgment in *hiQ Labs v. LinkedIn* imposed a $500,000 judgment against hiQ plus a permanent injunction requiring it to cease all scraping on LinkedIn and destroy all source code, data, and algorithms derived from scraped profile data, following LinkedIn's Nov 2022 breach-of-contract summary-judgment win.
- **Google for Jobs:** Aggregation layer only — no submission API and no read API; it surfaces `JobPosting` JSON-LD crawled from employer/ATS pages. Useful as an SEO-discovery concept, not an integration target.

### Anti-bot posture for *reading* (this is the gating input)

Even though BKT's prep does **not** submit and does **not** log into the platform account, reading still carries risk on some platforms. The spectrum, lowest→highest risk for read/parse:

1. **Greenhouse / Lever / Ashby / SmartRecruiters public APIs** — designed to be read by third parties; effectively zero detection risk for GET.
2. **ai-jobs.net / Jobicy JSON+RSS** — explicitly published for reuse (Jobicy asks ≤1 poll/hour + attribution).
3. **Workday CXS JSON** — readable on open tenants but Akamai-defended; unattended reading risks IP blocks and is tenant-dependent. Defer to in-session/extension or read cautiously.
4. **Indeed / Glassdoor / LinkedIn** — scraping-detected, ToS-prohibited; reading headlessly is a real account/legal risk. Do not read headlessly.

## Details

### Job-board volume + routing table

| Source | Rel. volume (SF / AI / tech) | Underlying ATS on "apply" | Public discovery API for individuals? | Anti-bot/ToS posture for reading | Recommended role in BKT |
|---|---|---|---|---|---|
| **Greenhouse (boards)** | Med / High / High | Self-hosted form (reCAPTCHA) | **Yes** — auth-free Job Board API (jobs + schema) | Very low (API meant for this) | **Primary discovery + first adapter** |
| **Lever** | Low / High / High | Self-hosted form | **Yes** — `v0/postings` JSON, no auth | Very low | **Primary discovery + second adapter** |
| **Ashby** | Low / High / High | Self-hosted form | **Yes** — posting-api + `jobPosting.info` schema | Very low | **Primary discovery + third adapter** |
| **SmartRecruiters** | Med / Med / High | Self-hosted form | **Yes** — Posting API + config (questions) | Low | Secondary adapter |
| **Workday** | High / Med / High | Workday (per-employer account) | Partial — CXS JSON on open tenants only | High (Akamai, per-tenant, IP blocks) | Discovery-cautious; **extension-session only for apply** |
| **LinkedIn** | **Highest** / High / Highest | Easy Apply or external ATS | **No** (ToS bans bots/extensions) | Very high (ToS + behavioral detection) | Discovery-only (manual); **avoid headless** |
| **Indeed** | High / High / Highest | Indeed Apply or external ATS | **No** (seeker API deprecated) | High (ToS, scraping-detected) | Discovery-only (manual); avoid headless |
| **Dice** | **High (contract SF)** / Med / High | **Easy Apply (Dice-hosted) OR external redirect** | No official seeker API/RSS; new MCP server exists | Medium (public listings readable) | Secondary discovery for SF contract |
| **Glassdoor** | Med / Med / High | Redirect (now Indeed-owned) | No | High | Avoid |
| **Wellfound** | Low / High / High | Self-hosted (one-app) | No individual API | Medium | Discovery-only (AI/startups) |
| **YC Work at a Startup** | Low / High / High | Self-hosted / external | No official API | Medium | Discovery-only (AI/startups) |
| **ai-jobs.net** | Low / **High** / Med | Redirect to employer/ATS | **Yes** — JSON API + RSS | Very low (published for reuse) | **Primary AI discovery feed** |
| **Salesforce Trailblazer Career Marketplace** | **High (SF)** / Med / Low | Self-hosted/partner | No public API | Low–Med | Discovery-only (SF-native) |
| **Mason Frank / Tenth Revolution** | High (SF) / Low / Med | Recruiter-mediated | No | Low | Discovery-only (SF) |
| **Monster / SimplyHired / CareerBuilder** | Low / Low / Med | Redirect | No (SimplyHired feeds Indeed) | Med | Avoid / low priority |
| **Google for Jobs** | — | Redirect to source | No (aggregation only) | n/a | Not an integration target |

**Lead conclusion:** Build adapters in this order — **Greenhouse → Lever → Ashby → SmartRecruiters** (auth-free read APIs that also host the apply form, so the extension has a clean DOM target), then treat **Workday** as extension-session-only, and **LinkedIn/Indeed/Dice** as manual discovery surfaces whose external-ATS redirects (often back to Greenhouse/Lever/Ashby/Workday) are handled by the adapters you already built.

### Anti-bot challenge ranking table (highest → lowest control density)

| Platform | CAPTCHA | Bot-mgmt (Akamai etc.) | Login wall | MFA | Multi-step/dynamic form | Fingerprinting | Verdict for BKT |
|---|---|---|---|---|---|---|---|
| **LinkedIn** | Yes | Yes (proprietary) | Yes | Yes | Yes (Easy Apply varies) | Yes (behavioral) | **Extension-session only; do not read headlessly** |
| **Workday** | Tenant-configurable | **Yes (Akamai)** | Yes (per-employer acct) | Sometimes | **Yes (5–7 pages)** | Yes | **Extension-session only for apply; read CXS cautiously, defer protected tenants** |
| **Indeed** | Yes | Yes | For apply | Sometimes | Yes | Yes | **Discovery-only manual; avoid headless read** |
| **Glassdoor** | Yes | Yes | Yes | Sometimes | Yes | Yes | Avoid |
| **Dice** | Sometimes | Some | For apply | No | Moderate | Some | Hybrid-with-review; listings readable |
| **SmartRecruiters** | On apply | Minimal for API | No (read) | No | Moderate | Minimal | **Safe for unattended Auto-mode prep (read)** |
| **Greenhouse** | reCAPTCHA on submit | No (board API) | No | No | Low (single form) | reCAPTCHA-only at submit | **Safe for unattended Auto-mode prep (read)** |
| **Lever** | Minimal | No | No | No | Low (single-page) | Minimal | **Safe for unattended Auto-mode prep (read)** |
| **Ashby** | On submit | No | No | No | Low | Minimal | **Safe for unattended Auto-mode prep (read)** |

Note: reCAPTCHA/Akamai matter at *submit*, which BKT never does headlessly — but for **Workday/LinkedIn/Indeed even reading** trips detection, so those are quarantined from Auto-mode regardless.

### prepared_applications data model (Supabase)

Two tables, RLS on both, every row carries `user_id`, every state change writes an `application_events` row.

**`prepared_applications`** (one row per job prep attempt):

- `id uuid pk`, `user_id uuid not null` (RLS), `application_id uuid` (FK to lifecycle row), `job_ref jsonb` (source board, source URL, external job id), `ats_family text` (`greenhouse|lever|ashby|smartrecruiters|workday|other`), `form_schema_snapshot jsonb` (raw detected schema at prep time, immutable), `match_score numeric` (Job Score), `mode text` (`auto|hybrid`), `status text` (`prepared|needs_review|ready_to_fill|submitted|stale|blocked`), `gating_reason text` (why it landed in needs_review/blocked), `document_versions jsonb` (FKs to immutable resume/cover-letter versions), `created_at`, `updated_at`, `prepared_by text` (`cron|on_demand`).
- RLS: `using (user_id = auth.uid())` on all CRUD.

**`prepared_application_fields`** (one row per mapped field — keeps confidence/sensitivity per field):

- `id uuid pk`, `prepared_application_id uuid fk`, `user_id uuid` (denormalized for RLS), `field_key text`, `field_label text`, `field_type text`, `mapped_value jsonb`, `value_source text` (`profile|derived|ai_draft|default`), `confidence numeric`, `is_sensitive bool` (demographic/EEO/work-auth/salary/legal), `review_gate bool` (forced true whenever `is_sensitive`), `free_text_draft text` (nullable), `redaction_safe bool`.
- Hard rule: `is_sensitive = true ⇒ review_gate = true` enforced by a CHECK/trigger; sensitive fields are stored but never auto-filled.

**How modes write:** Auto-mode cron inserts `prepared_applications` rows with `mode='auto', prepared_by='cron'`, only for ATS families ranked low anti-bot AND when no sensitive/legal gating is detected; otherwise it writes `status='needs_review'` with a `gating_reason`. Hybrid-mode on-demand (Job Score > 80) writes `mode='hybrid', prepared_by='on_demand', status='needs_review'`.

**How the extension consumes:** the MV3 extension (running in the user's logged-in session) reads `prepared_applications` + `prepared_application_fields` via the single Supabase client (anon/user JWT only — **service-role key never in the extension bundle**), hydrates the live DOM form, skips any field where `review_gate=true` (surfacing it for human input), and on user submit writes `status='submitted'` + an `application_events` audit row.

———

### Revised Phased Build Order

#### Phase 1 — Deterministic fields + persistence + schema (Required for MVP)

- Areas: UI Profile store, PreferencesScreen (fix the known non-persistence bug), Supabase migration for `prepared_applications` + `prepared_application_fields`, `pnpm db:gen-types`.
- Tests: persistence regression test (PreferencesScreen), RLS tests on both new tables, deterministic field-map unit tests.
- Acceptance: profile persists across reload; a `prepared_application` row can be created/read only by its owner; sensitive fields auto-flag `review_gate`.
- Mode logic: none yet (manual prep only).

#### Phase 2 — ATS Schema-Read Adapters (Required for MVP) — Ordered by Research

**Greenhouse → Lever → Ashby → SmartRecruiters.**

- Areas: `adapters/{ats}` read modules, schema-normalizer, Edge Function to fetch+normalize.
- Migrations: none (reads only).
- Tests: per-ATS schema-parse fixtures; normalizer maps each ATS `questions`/`fields` spec to the canonical field map.
- Acceptance: given a public job URL/token, adapter returns normalized schema for all four ATS families; Workday explicitly returns "unsupported for headless read" for protected tenants.
- Mode logic: adapter exposes an `antibot_tier` so Phase 3 can gate.

#### Phase 3 — Headless background PREP pipeline (Required for safe auto-apply)

- Areas: Supabase Edge Function cron (Auto-mode), on-demand trigger (Hybrid), field-mapping engine writing `prepared_application_fields`.
- Tests: Auto vs Hybrid routing tests; Job Score gate (≥75 global, >80 for Hybrid kickoff); anti-bot tier gate; sensitive-field quarantine.
- Acceptance: Auto cron only produces `status='prepared'` rows for low-anti-bot ATS with no sensitive gating; everything else → `needs_review`.
- Mode logic: **this is where Auto vs Hybrid lands** (see policy below).

#### Phase 4 — MV3 browser extension hydrator (Required for safe auto-apply)

- Areas: MV3 content script + background service worker, Supabase client (user JWT only), DOM-fill mappers per ATS.
- Tests: per-ATS fill fixtures; stop-condition tests.
- Acceptance: extension fills deterministic fields in the user's session; **hard stops on CAPTCHA, MFA, EEO/demographic, legal attestations, salary, work-auth, or any unknown required field**, surfacing them to the user; submit is human-clicked; writes `submitted` + audit row.
- Mode logic: extension is always human-in-the-loop regardless of Auto/Hybrid.

#### Phase 5 — AI free-text drafting (Recommended)

- Areas: drafting service for "why this company/role", layered on top of the deterministic map; writes `free_text_draft` with `confidence`.
- Tests: draft generated only after deterministic map complete; always `review_gate=true`.
- Acceptance: free-text is never auto-submitted; always review-gated.

#### Phase 6 — QA / fixtures (Recommended)

- Areas: Playwright detection+mapping tests, per-ATS fill fixtures, RLS test suite, persistence regression.
- Acceptance: `pnpm validate` gate green; fixtures cover Greenhouse/Lever/Ashby/SmartRecruiters; RLS denies cross-user reads.

———

### Mode-gating policy (the core rule set)

Auto-mode unattended PREP is allowed **only when ALL** of the following hold:

1. ATS family is in the **low-anti-bot tier** (Greenhouse, Lever, Ashby, SmartRecruiters) — read via public API; AND
2. The job's detected schema contains **no** sensitive/legal gating fields (demographic/EEO, work authorization, salary, legal attestations); AND
3. Job Score (match_score) ≥ 75 (global gate); AND
4. The source is a read-API surface, **not** a scraping-detected platform (LinkedIn/Indeed/Glassdoor/Workday).

If **any** condition fails → route to the **Hybrid queue** (`status='needs_review'`) for human review. Hybrid-mode on-demand prep additionally requires **Job Score > 80** to auto-kick-off. **Workday, LinkedIn, Indeed are never eligible for Auto-mode read**; their roles are prepared only via the in-session extension (extension reads the live DOM the user is already viewing, so no headless platform contact occurs).

## Recommendations

1. **Ship Phase 1 + the Greenhouse adapter first.** Greenhouse gives the best ratio of volume to ease (auth-free jobs+schema API, self-hosted form), and many LinkedIn/Indeed/Dice "external apply" redirects land on Greenhouse anyway, so this adapter covers more real applications than its board share suggests.
2. **Order adapters strictly by read-API quality, not by raw board traffic:** Greenhouse, Lever, Ashby, SmartRecruiters before any consideration of Workday. Skip headless Workday entirely in v1; handle Workday roles only through the extension.
3. **Make the anti-bot tier a first-class field on every adapter** and let Phase 3 gating read it directly — do not hard-code platform names in the prep pipeline.
4. **For discovery, wire ai-jobs.net's JSON API and the four ATS board APIs as the primary feeds;** use LinkedIn/Indeed/Dice/Trailblazer Marketplace as manual, human-driven discovery that produces a job URL the adapters then resolve.
5. **Thresholds that change the plan:** if Greenhouse/Lever/Ashby ever add Akamai-class read protection on their board APIs, demote them to Hybrid-only. If Workday opens an auth-free, un-Akamai'd seeker API, promote it. If a platform's apply redirect rate to Greenhouse/Lever/Ashby drops, reprioritize adapters accordingly.
6. **Keep sensitive fields review-gated in every mode forever** — this is both an ethics/compliance control and the thing that keeps Auto-mode from ever submitting something legally fraught.

## Ranked risks

1. **ToS / account-suspension risk on LinkedIn/Indeed/Workday (highest).** Even read/parse trips detection; the *hiQ* judgment shows contractual exposure for scraping public data. Mitigation: never touch these headlessly — extension-session-only, in the user's own authenticated tab.
2. **Akamai/CAPTCHA breakage on submit (high but mostly out of scope).** Because BKT never submits headlessly, this is contained to the extension's human-in-the-loop step; stop-conditions handle it.
3. **ATS API drift (medium).** Greenhouse Harvest v1/v2 deprecate Aug 31 2026 — but the Job Board GET API BKT uses is separate and remains auth-free; still, re-verify each adapter before shipping and pin behavior with fixtures.
4. **Schema-mapping errors on dynamic/multi-step forms (medium).** Mitigate with the immutable `form_schema_snapshot` + per-ATS fill fixtures + Playwright mapping tests.
5. **Sensitive-field mishandling (medium, high-consequence).** Mitigate with the DB-enforced `is_sensitive ⇒ review_gate` invariant and the extension's hard stop-conditions.

**Final recommendation on build sequence:** Phase 1 (persistence fix + schema) → **Greenhouse adapter** → Lever → Ashby → SmartRecruiters → Phase 3 gated prep pipeline → Phase 4 extension hydrator → Phase 5 AI free-text → Phase 6 QA. This sequences the smallest safe architecture that reliably covers standard fields, keeps every risky platform interaction inside the user's own browser session, and never lets Auto-mode submit or touch a defended platform.

## Caveats

- ATS market-share percentages (Workday ~32%, Greenhouse ~18%, Lever ~12%, iCIMS ~10%, Ashby ~5%; "~77% of US enterprise postings" combined) come from the Ongig ATS Market Share Report 2024 and Phenom 2024 — directional, non-audited secondary estimates.
- The "Akamai on Workday" attribution comes from commercial scraping vendors, not Workday's official docs — high confidence the CXS endpoint exists and is bot-defended, medium confidence on the specific vendor name.
- Dice's "70,000+" is first-party marketing copy and conflicts with a third-party scraper's ~7,600 figure; the true real-time active count is uncertain.
- Whether a CAPTCHA appears in Workday's apply flow could not be verified; bot defense appears to operate at the network layer. Treat as tenant-configurable.
- Job-count signals for LinkedIn (127,000 Salesforce, 47,000 admin) and Indeed traffic figures are platform-displayed counts that include duplicate/aggregated postings and self-reported metrics; they indicate scale, not unique openings.
- Public ATS read APIs can change; Greenhouse is migrating Harvest to v3 (v1/v2 deprecated after Aug 31 2026) — but the **Job Board** GET API (the one BKT uses) remains auth-free and separate. Re-verify before each adapter ships.
