# Dashboard E2E / UAT Audit — post-consolidation (ADR-016)

> **Status: COMPLETE** (audit cycle 2026-06-23). No regression fixes this cycle — remediation is a
> **plan only** (§6); the UI merge architecture decision is deferred to next cycle per JB.
>
> **Method:** live signed-in app on the forwarded `…-5174.app.github.dev` host (real data) +
> Supabase service-role row-count truth (project `rmoyuwesfljuygvpdolf`) + code review of committed
> HEAD + review of 5 real ATS job postings JB supplied.
>
> **Git reconciliation:** the II.C consolidation + Prospector removal are **committed**, not a pending
> working tree — commit `63acd49` ("refactor: remove Prospector feature…"), now an ancestor of `HEAD`
> (`63acd49` → `da3c611` v0.1.3 → `5fc909d` add extension zip). The audit therefore targets *committed*
> code. The old `/prospector` was **restored as a temporary parallel route** (recovered from
> `63acd49~1`; nav "Prospector (legacy)") for side-by-side comparison only; `pnpm validate` + `pnpm
> build` green after restore.

---

## 1. Executive Summary

The app is **functional and healthy end-to-end**: all 13 sidebar routes render real data with no
crashes or error boundaries, auth works, Gmail ingestion + classification works, multi-model keys are
configured (server-side), event-sourcing is intact (104 `stage_transition` events), and AI scoring
coverage is ~99% (177/178 jobs scored). Documents, Preferences/candidate-profiles, Pipeline, and
Ingestion all render live persisted data.

Two **HIGH-severity** issues stand out, both relevant to the auto-apply go-live:

1. **Inbox 100-row cap** (ADR-016 regression) — the dashboard prospect/corpus feed is hard-capped at
   100 with no pagination; with **112** prospect/corpus jobs lacking an application, **~12 are
   currently unreachable**, and the gap grows as the crawler runs.
2. **No hard eligibility/location filter** — scoring rewards skill overlap but ignores JB's hard
   constraints (US Citizen, US locations). Of 5 real postings reviewed, **3 are ineligible** (2 Swans
   roles explicitly "not considering candidates residing in the US"; 1 Plative role is India-based),
   yet they scored 78–82 and one reached the **Ready-to-Apply** queue. An autonomous applier would
   waste effort — or worse, apply JB to roles that bar US residents.

MEDIUM issues: the new dashboard table dropped the old Prospector's rich affordances (board-source,
match-score column, job-type/environment/salary/dates, per-column filters, server pagination, ranked
ready-queue); the formatted job description is disconnected (plain text on the dashboard vs. formatted
markdown on the old prospector sheet); an auth-hydration race bounces deep-links/refreshes of
sub-routes to `/login`; the "Sort" button is a no-op; and the "Applications Submitted/Applied = 38"
stat doesn't reconcile to DB `applied` = 32.

**Environment limitation (tooling, not an app bug):** interactive automation (synthetic clicks, JS
eval, console/network interception) **fails on the `*.app.github.dev` host** — the Claude-in-Chrome
extension's content-script channel times out there (`E353: csPostMessage`). Passive reads (DOM /
accessibility / page text) work fully, and eval works on ordinary sites (verified on `jobs.lever.co`).
So this audit drove the app via navigate + read + DB truth + code review; click-dependent live checks
(filter tabs, JD sidebar open, Save/Apply/Decline write paths) were verified at the **code + data**
level instead. See §7 for the durable workaround.

---

## 2. Scope & Method

- **In scope:** restore `/prospector` (only code change); live read-driven audit of the new dashboard
  + restored prospector side-by-side; every sidebar route load; console/network sweep; DB-vs-UI data
  integrity; review of 5 real ATS postings; 12–14 day retrospective; formalized UAT framework.
- **Out of scope (next cycle):** fixing the 100-cap / filters / formatted-JD / dropped fields /
  eligibility filter; choosing the UI merge architecture (Reuse rich table / Enhance JobsScreen /
  Hybrid); building any never-executed backlog item.
- **Observation tools:** `navigate`, `read_page`, `get_page_text`, `read_console_messages`,
  `read_network_requests` (Claude-in-Chrome); `execute_sql` (Supabase service-role); `git` + `grep`.

---

## 3. Data Integrity & Lost Rows  ⬅ PRIMARY FINDING

**DB truth (Supabase, service-role count, 2026-06-23):**

| Table / metric | bucket | count |
|---|---|---|
| `jobs.source` | prospector | 161 |
| `jobs.source` | corpus | 15 |
| `jobs.source` | manual_entry | 2 |
| `jobs` (total) | — | **178** |
| `jobs` prospector+corpus **without an application** | — | **112** |
| `applications.stage` | applied | 32 |
| `applications.stage` | discovery | 20 |
| `applications.stage` | rejected | 13 |
| `applications.stage` | screening | 1 |
| `applications` (total) | — | **66** |
| `job_postings` (shared corpus) | total | 291 |
| `documents` | rows / users | 8 / 1 |
| `ai_scores` | rows / distinct jobs | 202 / 177 |
| `application_events` | stage_transition / submission_attempt / approval | 104 / 8 / 1 |

**LOST ROWS (root-caused, code-confirmed):** `fetchProspectInboxJobs`
([autoApplyService.ts:213](../../src/features/auto-apply/services/autoApplyService.ts#L213)) ends the
prospect query with `.limit(100)` and **no pagination** (orders by `ai_scores.scored_at desc,
created_at desc`). There are **112** prospector+corpus jobs with no application, so **12 (112 − 100)
never render** anywhere — the dashboard merge drops them and the old `/prospector` page (which
paginated server-side via `.range()`) was removed in ADR-016. Because the cut is by `scored_at`/age,
the dropped rows are arbitrary, not "lowest relevance." **Severity: High** (discovered jobs that can't
be reviewed/applied; grows as the crawler adds postings). **Where:** dashboard "Your Jobs" inbox.

**UI-vs-DB reconciliation (live tab counts):** All **112** · Review Matches **65** · In progress **1**
· Applied **38** · Declined **13**. Notes:
- "All / Job Matches Found = 112" maps exactly to the prospect/corpus-no-application pool.
- **Applied 38 ≠ DB `applied` 32** and ≠ `submission_attempt` events (8): the "Applications Submitted"
  stat uses a derivation that doesn't equal any single DB count — **stat-reconciliation bug** to chase
  in the stats logic (autoApplyService). (Medium.)
- 65 + 1 + 38 + 13 = 117 ≠ 112 — the tab badges count different pools than "All", reinforcing the
  derivation inconsistency.

**Corrected (was suspected seed):** Documents (Resumes 5 + Cover Letters 3 = 8) are **real DB rows**,
not demo fallback. Minor: the Preferences-uploaded resume (`John Burkhardt - Resume (Final) -
06.2026.pdf`) differs from the Documents-library base (`John_Burkhardt_Resume_2026.pdf`) → resume
tracked in two stores (`candidate_profiles` vs `documents`), not unified. (Low.)

**Healthy:** scoring coverage ~99% (177/178 jobs scored; "Score 11 jobs" is a transient crawl backlog,
not permanent); event sourcing intact (104 stage transitions).

---

## 4. Job-Openings Review (5 real ATS postings)

JB supplied five live application pages. Skills fit is strong across the board (all Salesforce-centric,
matching JB's certs: Admin / BA / App Builder / AI Associate / Agentforce). **Eligibility is the
problem.**

| # | Role (ATS) | Location / eligibility | Eligible? | Fit note |
|---|---|---|---|---|
| 1 | Swans — Implementation Consultant, CRM/Automation/Data/AI (Ashby) | Remote, **"not considering candidates residing in the US"**; no outside employment | ❌ | strong skills; **scored 78, in Ready-to-Apply queue** |
| 2 | Swans — Salesforce Consultant (Ashby) | same US-exclusion + no outside employment | ❌ | strong skills; scored 82 |
| 3 | Plative — Salesforce Consultant (Greenhouse) | **India** | ❌ | excellent skills (Agentforce/Flows/Apex/LWC/Claude+Gemini), wrong geography |
| 4 | Aledade — Director of Product Management, Salesforce (Lever) | Remote **US** | ✅ | PM-leadership stretch vs hands-on SF |
| 5 | Komodo Health — Sr Salesforce Solutions Consultant (Greenhouse) | Remote **US**, $128–175k | ✅ | strong SF platform fit; **pharma/life-sciences domain gap** |

**Finding (HIGH for auto-apply):** the pipeline surfaces and ranks roles JB cannot hold because
**location / work-authorization is not a hard filter** — only 2 of 5 are US-eligible, and the two
US-excluded Swans roles scored highest (78/82). JB's stated prefs (US Citizen, US cities) should gate
or heavily penalize geographically ineligible postings *before* they reach the inbox/ready-queue.

Cross-ref: postings #1 and #2 already appear in both the dashboard inbox and the restored prospector
results (Ashby, scores 78/82), confirming they flowed through the real corpus → scoring → surfacing
path. The BKT Apply-Macro extension's "Get Match Score / Autofill / Signed in — ready" controls are
present on the Ashby forms (extension live on ATS hosts).

### 4b. Additional Ashby roles (JB-supplied, batch 2)

| Role (Ashby) | Geo / comp | Eligible | Fit |
|---|---|---|---|
| **G2 — Senior Salesforce Engineer** | Remote **US**, $125–135k | ✅ | **Strong** — 8+ yr SF, Apex/LWC/Experience+Service Cloud, AI-assisted dev (Claude Code); best fit reviewed. Likely the "Forward Deployed Engineer" (score 78) already in prospector results. Comp just under $150k target |
| **Lean Layer** (7 roles) | US + Brazil, remote | ✅ (6 US) | Good — Salesforce Technical Consultant, RevOps Analytics Eng, RevOps BI Architect, Sr BA on-profile; wide $35–165k bands = global tiering |
| **Nooks** (35 roles) | mostly **SF/Seattle hybrid** | ⚠️ | Weak — RevOps roles SF-hybrid (JB is LA); remote roles are Sales/SDR (off-profile); no SF-admin roles |
| **Pareto** (5 roles) | US Remote | ✅ geo | Weak — AI/data-eng roles, no Salesforce; AI Engagement Manager / Strategic Projects Lead are PM stretches |

**Reinforces §4 + extends remediation #2:** the matcher *does* surface strong, US-eligible fits (G2),
but the gaps compound across the listing pages — **geo mismatch** (Nooks SF-hybrid vs JB's LA+remote),
**role-type mismatch** (sales/SWE/data-eng vs desired Salesforce/RevOps titles), and **comp below
target**. The eligibility gate (remediation #2) should weigh country + work-auth +
on-site/hybrid-vs-remote + city + role-type-vs-desired-titles + comp floor — not just country.

### 4c. Live apply-macro validation (BKT extension, G2 form)

End-to-end attempted on the G2 application form (`…/g2/…/application`). **Automation cannot drive the
extension's own buttons:** while BKT is active (its "Autofill"/"Get Match Score" controls injected),
the Claude-in-Chrome automation's clicks *and* JS eval are blocked on that tab ("Cannot access a
chrome-extension:// URL of different extension") — the same cross-extension limitation as the app host.
The test was therefore run **collaboratively** (human clicks the BKT buttons, agent reads/verifies the
result via `read_page`/`get_page_text`).

**Result (collaborative run, 2026-06-23) — Autofill _and_ Match Score both validated.**

*Autofill* (BKT: Autofill) populated **real, persisted** values — visually confirmed: Name "John
Burkhardt", email, phone "(952) 334-6093", LinkedIn `…/johndavisburkhardt` — on G2 (5 fields), Lean
Layer (4), Nooks (5). On every form the extension **held 3 sensitive answers** (work-auth / sponsorship
/ EEO) for review, **deferred résumé attachment** (file inputs can't be set programmatically — known
gap) and **CAPTCHA** to the human, and **never auto-submitted** — exactly the human-in-the-loop design
(aligns with BR-156 review-gating + the manifest's "never auto-submits").

*Match Score* (BKT: Get Match Score) produced sensible, well-reasoned scores against each live JD:

| Role (Ashby) | Score | Verdict | Extension's reasoning (abridged) |
|---|---|---|---|
| **G2 — Senior Salesforce Engineer** | **72/100** | Possible fit · _consider_ | + 12+ yr SF consulting/architecture, CPQ/quote-to-cash, Sales/Revenue/Service Cloud, US Citizen · − sparse JD; profile is consulting/architecture (Accenture), not IC engineering; no explicit Apex/LWC |
| **Lean Layer — Engagement Manager** | **52/100** | Weak fit · _consider_ | + 12+ yr consulting, engagement leadership (6→31 team), US Citizen · − very sparse JD; Industrials/Lead-to-Cash domain gap |
| **Nooks — AI Deployment Strategist** | **42/100** | Weak fit · _**reject**_ | + US Citizen, enterprise consulting, built an AI-assisted pipeline · − Salesforce/CRM-focused, "distant from AI deployment"; no MLOps/LLMOps |
| Pareto | — | not scored | tab left on listings page (no single role opened) |

**Notable:**
1. **The per-form Match Score catches role-fit gaps the bulk/corpus scoring missed** — Nooks is
   correctly **rejected (42)** as off-profile; G2 is flagged for missing Apex/LWC. The signal exists at
   the Match-Score layer; remediation #2's gap is that the **dashboard/ready-queue surfacing doesn't
   apply it as a pre-filter**. (Also: the extension's G2 = 72 vs the dashboard's corpus score 78 for the
   same role — the live-form and corpus scoring paths diverge slightly.)
2. **Minor extension UI bug (Ashby-only):** the Match-Score panel's "Matched skills / Missing keywords"
   text renders **overlapping/squished on Ashby** forms (cosmetic — the underlying DOM text is correct);
   worth a CSS fix in the panel layout.

**Caveat:** automation can't read filled values or screenshot BKT-active tabs (cross-extension limit),
so the field counts are the extension's own report and the values above were confirmed **visually by
JB**.

---

## 5. Interactive / Route Audit Log

> Legend: ✅ pass · ⚠️ degraded/thin · 🔴 fail · 🔒 code-verified (live click blocked by env)

| Surface | What was checked | Result | Status |
|---|---|---|---|
| Auth gate | unauth `/` → `/login` | redirects | ✅ |
| Dashboard `/` | renders inbox + stats, real data | 1395 credits, 112 matches, real rows | ✅ |
| Inbox cap | prospect feed completeness | **100-cap → 12 unreachable** | 🔴 |
| Filter tabs | All/Review/In-progress/Applied/Declined | render; counts don't fully reconcile (§3) | 🔒⚠️ |
| "Sort" button | sort behavior | **no `onClick` — dead no-op** (JobsScreen.tsx:153) | 🔒🔴 |
| Row → JD sidebar | formatted JD render | renders **plain `job.overview`**; no markdown; source badge hardcoded "Review Matches" (JDSidebar.tsx:177,192) | 🔒⚠️ |
| Dropped columns | source-board/job-type/env/salary/dates | fetched in some paths, **not surfaced** in dashboard table | 🔒⚠️ |
| "Job Board" badge | corpus rows | renders (verified live) | ✅ |
| Search Profile panel | Auto-Search config | present on dashboard (JB wants kept — ADR-016) | ✅ |
| "Score N jobs" | unscored backlog | "Score 11" shown — **not clicked (LLM cost)** | ⏸ |
| `/prospector` (legacy) | restored old table | **renders fully** — rich columns, per-column filters, server pagination "1 of 4" (~200), ranked "Ready to Apply" (50) | ✅ |
| `/inbox` | Gmail ingestion | 40 classified emails, labels + priority, detail pane | ✅ |
| `/search` | job search | renders but **sparse (1 result)** | ⚠️ |
| `/saved` | saved jobs | renders (1 saved) | ✅ |
| `/preferences` | candidate_profiles editor | full + populated (titles, cities, excludes, auth, resume, modes) | ✅ |
| `/resumes` | document library | 5 real docs (base + 3 customized + archived) | ✅ |
| `/cover-letters` | document library | 3 real docs | ✅ |
| `/interview-prep` | prep screen | **thin stub** (heading only) | ⚠️ |
| `/pipeline` | kanban / events | renders; real activity event | ✅ |
| `/ingestion` | CSV + manual ingest | renders, functional controls | ✅ |
| `/settings` (Integrations) | model keys | Anthropic/OpenAI/Gemini "Configured", **server-side secrets, never in browser** | ✅ |
| `/notifications` | — | **placeholder "coming soon"** | ⚠️ |
| Deep-link to sub-route | hard nav / refresh | **bounces to `/login`** if session not restored within ~2s (auth-hydration race); resolves with ~6s | 🔴 |
| Console sweep | app errors per route | only `E353` *extension* noise; **zero app errors** | ✅ |

**Side-by-side (new dashboard vs restored `/prospector`):**

| Aspect | New Dashboard "Your Jobs" | Old `/prospector` (restored) |
|---|---|---|
| Columns | Company · Job Posting · Comp · Updated · Action | Title · **Source(board)** · **Match Score** · **Job Type** · **Environment** · **Salary** · **Date Posted** · **Date Created** |
| Source detail | generic "Job Board" badge | actual board: Ashby/LinkedIn/Dice/Upwork/Indeed/Wellfound… |
| Filters | status tabs only | per-column filters (type, environment) |
| Pagination | client-side over **≤100 fetched** (12 lost) | **server-side "1 of 4" (~200)** — no loss |
| Ready queue | none | ranked "Ready to Apply" — 50 matches (100→63) |
| Formatted JD | plain `job.overview` text | `description_formatted` via `JobDescriptionMarkdown` |

---

## 6. Breaking Points, Root Cause & Remediation Plan (PLAN ONLY)

- **Blocker:** none.

**HIGH**
1. **Inbox 100-row cap** — `fetchProspectInboxJobs` `.limit(100)`, no pagination.
   *Fix:* (a) paginate the prospect fetch + merge per page; (b) order by `overall_score desc` so the
   most relevant surface; (c) reintroduce server-side pagination into the merged list. Recommend
   (a)+(b). File: `autoApplyService.fetchProspectInboxJobs`.
2. **No hard eligibility/location filter** — ineligible (US-excluded / wrong-country) roles scored
   high and reach the ready-queue.
   *Fix:* gate or heavily penalize postings whose location/work-auth conflict with `candidate_profiles`
   (country, cities, work authorization) *before* surfacing/auto-apply; add an "eligibility" reason to
   the score trace. Files: scoring/graduation path + `score-job-fit`. **Must precede auto-apply
   go-live** (BR / ADR-006).

**MEDIUM**
3. **Lost result-table affordances** — port source-board / match-score / job-type / environment /
   salary / dates columns + per-column filters (+ optional ranked ready-queue) into `JobsScreen`, or
   adopt the rich table; update ADR-016.
4. **Formatted-JD disconnect** — `JDSidebar` renders plain `job.overview`; reconnect
   `description_formatted` + `JobDescriptionMarkdown` (the working path on `ProspectorJobSheet`), and
   replace the hardcoded "Review Matches" source label with the row's real source.
5. **Auth-hydration race** — deep-link/refresh of a protected sub-route bounces to `/login`. *Fix:*
   gate the route guard on auth-loading (render a splash until the Supabase session resolves) instead
   of redirecting while `loading`.
6. **Dead "Sort" button** — wire `onClick` (sort by score/date/company) or remove it.
7. **Stat reconciliation** — "Applications Submitted/Applied = 38" ≠ DB `applied` 32 ≠
   `submission_attempt` 8; reconcile the stat derivation.

**LOW / hygiene**
8. "Unknown company" on corpus rows — `companies.name` null / projector not mapping
   `job_postings.company_name` → company; backfill or map.
9. Sparse compensation ("—") on most rows; `/search` sparse (1 result); `/interview-prep` is a stub;
   `/notifications` is a placeholder; unify the dual resume store (`candidate_profiles` vs
   `documents`); dead-code sweep of orphaned prospector leaf components once the temp route is removed.

---

## 7. Formalized E2E / UAT Framework (durable template)

**Environment prerequisites**
- `pnpm dev` up; forwarded `*-5174.app.github.dev` host set **public** for browser access; signed-in
  session present; Supabase project `rmoyuwesfljuygvpdolf` for DB row-count truth; `pnpm validate`
  green.

**Sanity checklist**
- auth gate redirects unauth `/` → `/login`; dashboard renders real data; `pnpm validate` + `pnpm
  build` green; DB counts reconcile with UI stats.

**Tooling note — Codespaces + Claude-in-Chrome (important):**
- On the forwarded `*.app.github.dev` host, the extension's content-script channel times out
  (`E353: csPostMessage`), so **synthetic clicks, JS eval, and console/network interception fail**;
  only DOM/accessibility **reads** work. This is host-wide (not BKT-specific; BKT being on/off makes no
  difference; eval works on ordinary sites like `jobs.lever.co`).
- **Workarounds:** (1) drive via `navigate` + `read_page`/`get_page_text` + DB truth + code review;
  (2) wait **~6 s** after each `navigate` so the auth-hydration race resolves before reading;
  (3) for genuinely click-dependent checks (open JD sidebar, Save/Apply/Decline, per-tab counts), do
  them collaboratively (human clicks, agent reads) or try a non-proxied host; (4) verify interactive
  behaviors at the **code + DB** level when live clicks are blocked.

**Core journeys (scripted test cases)**
1. discovery → review → apply; 2. score → graduate → Ready/Review; 3. prospector run (Run Now /
   Play-Pause); 4. inbox filters + pagination across all tabs; 5. Preferences + Answer Library edit;
   6. per-route load + console-clean; 7. **eligibility gate** — an out-of-geo posting must not reach
   the ready-queue.

**Audit-log table schema:** | Surface | What was checked | Result | Status |

**Bug report template:** id · severity (Blocker/High/Medium/Low) · surface · steps · expected ·
actual · console/network evidence · suspected root cause · file:line.

**Sign-off template:** build green ✅/❌ · all routes load ✅/❌ · zero app console errors ✅/❌ ·
data-integrity reconciled ✅/❌ · eligibility gate enforced ✅/❌ · blockers count · approver · date.

**This cycle's sign-off:** build green ✅ · all 13 routes load ✅ · zero app console errors ✅ ·
data-integrity reconciled ✅ (2 HIGH gaps documented) · eligibility gate enforced ❌ (HIGH #2) ·
blockers 0 · approver _JB pending_ · date 2026-06-23.

---

## 8. 12–14 Day Retrospective — planned vs unexecuted

**Shipped (✅):** ADR-005 multi-model routing · ADR-007 `score-job-fit` · ADR-008
`generate-documents` · ADR-009/011/012 extension + session handoff + Answer Library · ADR-013 headless
prep (on-demand) · ADR-014 Part A (first/last name, B5 label-text matcher, B7 native quick-apply) ·
ADR-015 ATS crawler + corpus (live, ~287 postings, CRON_SECRET active) · resume verbatim transcription
· II.B corpus visibility + II.C consolidation (now committed `63acd49`) · extension v0.1.3.

**Never executed / deferred (highest value first):**

| Item | Where planned | Status | Impact |
|---|---|---|---|
| **Phase-4 submission worker logic** | ADR-006, phase4-golive | scaffold (501) | Blocks auto-apply go-live |
| **GAP-010 ATS endpoint validation** | ADR-006 / phase4-golive | never started | Blocks the worker; `resolveCandidatePayload` returns null |
| **Eligibility / location hard-filter** | (this audit) | never built | Ineligible roles surface + reach ready-queue (HIGH) |
| **ADR-014 Part B (master schema B1–B6)** | BUILD_BACKLOG §3 | never started | github/portfolio/country cols, full Answer-Library seed, multi-signal matcher |
| **Resume PDF attachment / tailored PDF** | phase4-golive | not built | Auto-apply can't attach a resume |
| **Notification send (Resend)** | phase4-golive | secret wired, no send | No apply notifications |
| **corpus-projector cron flip** | OVERNIGHT_SUMMARY | deployed, unscheduled | Corpus → jobs only via manual trigger |
| **Workday crawler** | ADR-015 / BUILD_BACKLOG | deferred Phase 4 | No Workday postings |
| **Prep cron batch + `draftFreeText` AI** | ADR-013 / BUILD_BACKLOG | scaffolds | Batch prep + free-text drafting absent |
| **PDF/DOCX resume parsing** | BUILD_BACKLOG §1 | paste-only | Convenience gap |
| **Multi-tenant `jobs UNIQUE(user_id,source_url)`** | ADR-015 | never | Dedup is global, not per-user |
| **ADR-016 regressions** (this audit) | ADR-016 | introduced this week | 100-cap, lost affordances, formatted-JD, dropped fields, dead Sort |

**~2026-06-09…06-11 window:** infrastructure/foundation only (multi-model routing, ADR-006 schema +
mode semantics, design tooling). No user-facing feature shipped *in that window*; delivery accelerated
after 06-13. The Phase-4 *backend* promised around then (submission worker) was deferred and remains
the largest unexecuted block — and the new **eligibility filter** is now a co-equal must-fix before
auto-apply go-live.

> PR numbers / hashes from automated retro passes are directional; the deferred-item set is
> corroborated by `BUILD_BACKLOG.md`, the overnight handovers, and agent memory.

---

### Audit progress
- [x] DB row-count truth captured + refreshed (§3)
- [x] Lost-rows root cause confirmed in committed HEAD (`.limit(100)` → 12 unreachable)
- [x] `/prospector` restored (temp parallel route) + validate/build green
- [x] All 13 sidebar routes loaded + reviewed; console clean of app errors
- [x] 5 ATS postings reviewed → eligibility-filter gap (HIGH)
- [x] Data integrity reconciled (documents real; stat-derivation + tab-count discrepancies noted)
- [x] §6 remediation plan (not executed) + §7 UAT framework + §8 retrospective
- [ ] **Next cycle:** JB reviews → choose UI merge architecture → execute fixes (keep the Search Profile panel)
