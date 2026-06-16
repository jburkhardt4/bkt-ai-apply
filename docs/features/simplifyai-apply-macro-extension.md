# BKT Apply-Macro — Chrome Extension Design Spec (Phase 2b)

**Status:** Proposed — gated by [ADR-009](../adr/009-apply-macro-chrome-extension.md)
**Owner:** JB · **Branch:** `simplifyAI-apply-macro` · **Date:** 2026-06-16
**Models:** match scoring reuses `match_scoring → anthropic` from `src/lib/ai-router.ts` (latest Claude per the routing matrix); no model IDs are hardcoded in the extension.

> This spec covers the **Phase 2b** browser extension only. Phase 1 (source-link
> handoff + Manual/In-progress) and Phase 2a (Match Score + Fit Summary in the JD
> sidebar) are **built** on this branch and are the foundation the extension layers on.

---

## 1. What we are modelling (Simplify, accurately)

Simplify is marketed as "AI auto-apply" but is fundamentally a **human-in-the-loop RPA
macro**:

1. **Dynamic DOM mapping** — the content script reads the ATS page's DOM.
2. **JSON field configs** — a backend config maps each standard profile field
   (first name, email, work authorization, EEO, …) to selectors/XPaths per ATS.
3. **Macro execution** — it injects the user's stored profile/resume data into the
   form in real time. The **user stays in control**: they watch it fill, can
   pause/resume, fix fields, answer screener questions, solve CAPTCHAs, and click
   **Submit** themselves.

We replicate this as an assistive macro — never an unattended auto-submitter (see
ADR-009 and BR-151). It pairs with Phase 1: in `review`/`assist` mode, clicking "Apply"
opens the real posting (`jobs.source_url`); the extension autofills it; the user submits
and returns to "Mark as applied."

---

## 2. Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│  BKT SPA (bkt-ai-apply.vercel.app)                                    │
│   • Phase 1 Apply button → opens jobs.source_url (Manual/In-progress) │
│   • Phase 2a JobFitPanel (Match Score + Fit Summary)                  │
│   • Supabase auth session (single client, src/lib/supabase.ts)        │
└───────────────▲───────────────────────────────────────┬──────────────┘
                │ shared Supabase session (token handoff)  │
                │                                           ▼
┌───────────────┴───────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)                                         │
│                                                                         │
│  background (service worker)                                            │
│   • holds the Supabase session (or brokers a short-lived token)         │
│   • calls Edge Functions: score-job-fit, (optional) format-jd           │
│   • fetches profile + resume from Supabase (RLS-scoped, user's own)     │
│   • fetches/caches per-ATS field-mapping configs (versioned)            │
│                                                                         │
│  content script (injected on supported ATS hosts)                       │
│   • detects ATS vendor from host (reuses detectAtsVendor logic)         │
│   • extracts the JD text from the DOM                                   │
│   • renders the Fit panel (Match Score + Fit Summary) in a shadow root  │
│   • runs the autofill macro from the JSON config                        │
│   • NEVER auto-submits — surfaces a "Review & submit" affordance only   │
│                                                                         │
│  popup / options                                                        │
│   • login (Supabase), profile status, per-board on/off, macro settings  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Reuse, don't rebuild:**

- AI scoring → existing `score-job-fit` Edge Function (ADR-007). Keys stay server-side
  (BR-122); the extension only sends `{ provider, model, job, profile }` over a
  JWT-gated call, exactly like the SPA.
- ATS host detection → port `supabase/functions/_shared/submission/resolveChannel.ts`
  `detectAtsVendor()` into a shared TS module the extension imports.
- Profile/resume → `candidate_profiles` + `documents` bucket, read over the user's own
  RLS-scoped Supabase session (no service role in the extension — ever).

---

## 3. PLAN

### 3.1 AI matching engine

- **Engine:** reuse `score-job-fit` end-to-end. The content script extracts the JD; the
  background worker fetches the user's profile (and resume text when available) and
  POSTs `{ provider, model, job:{title, description}, profile }` to the Edge Function;
  the structured `{ score, usage }` JSON is rendered in the injected Fit panel.
- **Resume parsing:** prefer a pre-extracted resume **text** (the Phase 2a follow-up:
  populate `candidate_profiles.master_resume_text` at upload via real PDF extraction).
  Until then, use the `.txt` resume in the `documents` bucket; if only a PDF exists,
  send the structured `CandidateProfile` keyword profile (graceful degradation — same
  as Phase 2a).
- **Prompt:** unchanged from `score-job-fit` (`DEFAULT_SYSTEM_PROMPT` already instructs
  strict JSON, integer sub-scores 0–100, machine-readable `recommendation`, and that
  full resume text — when present — is authoritative over keyword lists).
- **Token-limit management for long JDs:**
  - Extract only the JD body (drop nav/footer/related-jobs) via the per-ATS config's
    `jdContainer` selector.
  - Truncate JD to a budget (≈8–12k chars) and resume text to ≈12k chars (Phase 2a
    already caps resume text at 12k).
  - Optionally pre-normalize very long JDs through the existing `format-jd` Edge
    Function (`jd_formatting → Claude Haiku`) before scoring.
  - Cost cap (BR-052/104, $75/user/mo) is enforced server-of-client exactly as today;
    on block, show the heuristic/estimated state in the panel (no hard failure).

### 3.2 JSON field-mapping config schema

Per-ATS, versioned, remotely updatable (cached in the background worker; fetched from a
Supabase table or storage JSON so mappings can be fixed without a Web Store release):

```jsonc
{
  "ats": "greenhouse",
  "version": "2026-06-16",
  "match": { "hosts": ["boards.greenhouse.io", "job-boards.greenhouse.io"] },
  "jd": { "container": "#content, .job__description", "title": "h1.app-title" },
  "fields": [
    { "key": "first_name", "selector": "#first_name", "type": "text" },
    { "key": "last_name",  "selector": "#last_name",  "type": "text" },
    { "key": "email",      "selector": "#email",      "type": "text" },
    { "key": "phone",      "selector": "#phone",       "type": "tel" },
    { "key": "resume",     "selector": "input[type=file][name*=resume]", "type": "file" },
    { "key": "linkedin",   "selector": "input[name*=urls][name*=LinkedIn]", "type": "text" },
    { "key": "work_auth",  "selector": "[id^=react-select]", "type": "select",
      "strategy": "react-select", "valueFrom": "profile.work_authorization" }
  ],
  "screeners": { "strategy": "label-match", "confirmRequired": true },
  "submit": { "selector": "button[type=submit]", "autoClick": false }
}
```

- `autoClick: false` is **mandatory** (BR-151) — the macro fills, the human submits.
- `react-select`/custom widgets get a typed `strategy` so the macro dispatches the
  right synthetic events (the Jam shows Simplify driving `react-select-*` option divs).
- Screener/EEO questions are filled only when a confident label match exists; otherwise
  left blank and flagged for the user.

### 3.3 Data flow

`ATS page load → detect vendor → load config → extract JD → [background] fetch profile +
score-job-fit → render Fit panel → user clicks "Autofill" → macro fills fields →
user reviews, answers screeners, submits → user returns to SPA → "Mark as applied"
(Phase 1 → discovery→applied, audited).`

---

## 4. BUILD (illustrative)

### 4.1 Extract the JD from the DOM (content script)

```ts
function extractJd(cfg: AtsConfig): { title: string; description: string } {
  const root = document.querySelector(cfg.jd.container) ?? document.body
  const title = document.querySelector(cfg.jd.title)?.textContent?.trim() ?? document.title
  // innerText (not innerHTML) → strips markup; collapse whitespace; budget-cap.
  const description = (root as HTMLElement).innerText.replace(/\s+\n/g, '\n').trim().slice(0, 12_000)
  return { title, description }
}
```

### 4.2 Score + render the Fit panel

```ts
// background service worker — keys NEVER touch the content script
async function scoreJob(job: { title: string; description: string }) {
  const { provider, model } = routeMatchScoring()            // mirrors ai-router match_scoring
  const profile = await fetchCandidateProfile()              // RLS-scoped, user's own
  const { data } = await supabase.functions.invoke('score-job-fit', {
    body: { provider, model, job, profile },                 // JWT attached by supabase-js
  })
  return data.score                                          // { overall_score, strengths[], gaps[], recommendation }
}
```

The content script receives `score` via `chrome.runtime.sendMessage` and renders the
**same** Match Score + Fit Summary UI as Phase 2a's `JobFitPanel` inside a shadow root
(so host-page CSS can't break it), **before** the user applies.

### 4.3 Autofill macro (config-driven)

```ts
async function runMacro(cfg: AtsConfig, profile: Profile) {
  for (const f of cfg.fields) {
    const el = document.querySelector<HTMLElement>(f.selector)
    if (!el) { report(f.key, 'not_found'); continue }
    await fillField(el, f, profile)        // text/tel: set value + dispatch input/change;
  }                                        // select/react-select: open + click matching option;
  // file: programmatic upload only if the browser permits; else prompt the user.
  highlightUnfilled()                      // screeners/EEO left for the human
  // NOTE: no submit() — cfg.submit.autoClick is always false (BR-151)
}
```

---

## 5. DEFINE UAT & TEST

### 5.1 UAT acceptance criteria

| # | Criterion |
| - | --------- |
| UAT-1 | On a supported ATS posting, the Fit panel renders a 0–100 Match Score + matched/missing keywords **before** any apply action. |
| UAT-2 | "Autofill" fills first/last name, email, phone, LinkedIn, and attaches/【prompts for】the resume; filled fields visibly highlight. |
| UAT-3 | The macro **never** clicks Submit. The user always submits manually. |
| UAT-4 | Unmapped/low-confidence screener + EEO questions are left blank and visibly flagged (no fabricated answers). |
| UAT-5 | On an unsupported host, the extension is inert (no panel, no macro) and the SPA Phase 1 handoff still works. |
| UAT-6 | After the user submits on the ATS and returns to the SPA, "Mark as applied" transitions `discovery → applied` and writes the audit event. |
| UAT-7 | Match scoring respects the $75/mo cap: when capped, the panel shows the "estimated / full AI scoring queued" state, never an error. |
| UAT-8 | No LLM key is present in any extension bundle, content script, or network call originating from the page; scoring goes only through `score-job-fit` with a Supabase JWT. |
| UAT-9 | Cross-user isolation: the extension only ever reads the signed-in user's own profile/resume/scores (RLS). |

### 5.2 Edge-case scenarios (grounding / anti-hallucination)

- **Highly formatted / multi-column PDF resume:** extraction may scramble order →
  require the pre-extracted `.txt`/`master_resume_text` path; if only a messy PDF, fall
  back to the keyword profile and label the score "estimated" rather than scoring on
  garbled text.
- **Vague JD ("rockstar ninja"):** the model must not invent specific skill matches.
  `score-job-fit` returns sub-scores + `strengths[]`/`gaps[]` grounded in the JD text;
  validate that empty/low-signal JDs yield a low-confidence score, not a confident 95%.
- **Highly technical JD with niche stack:** confirm `gaps[]` surfaces concretely missing
  keywords rather than hedging; matched skills must appear in BOTH the resume and JD.
- **JD truncated at the token budget:** verify the truncation keeps the requirements
  section (config `jdContainer` targets the body, not nav).
- **ATS DOM drift (selector changed):** macro reports `not_found` per field and degrades
  to "filled what it could," never throws or fills the wrong field.
- **react-select / custom widgets:** verify option matching is exact (the Jam shows
  `react-select-*-option-N` clicks) and falls back to leaving the field for the user.
- **Determinism check:** the persisted `recommendation` is always derived from
  `overall_score` via BR-020/021/022 thresholds (BR-142) — the model's own recommendation
  is advisory; assert no threshold drift.

### 5.3 Automated test surface

- Unit: config loader, `detectAtsVendor`, JD extractor, field-fill strategies (jsdom).
- Fixtures: saved ATS HTML snapshots per board → assert selectors resolve + macro fills.
- Reuse the repo's Stagehand/Playwright `e2e/ai-uat` harness for an extension-loaded
  smoke (load unpacked, navigate to a fixture posting, assert the panel + autofill).
- The SPA-side Phase 1/2a paths are covered by `pnpm validate` (already green).

---

## 6. DEPLOY

See the full operational checklist: [`docs/deploy/apply-macro-deploy-checklist.md`](../deploy/apply-macro-deploy-checklist.md).

Summary:

- **SPA (Phase 1 + 2a) → Vercel:** standard `vite` build (`vercel.json` already set);
  client env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` only — never any LLM key.
- **Supabase Edge secrets:** `ANTHROPIC_KEY` / `OPENAI_KEY` / `GEMINI_KEY` set via
  `supabase secrets set` (read only in `_shared/llm/factory.ts`, BR-122). `score-job-fit`
  must be deployed/live for the extension's panel to score.
- **Extension:** packaged MV3 zip → Chrome Web Store (unlisted/dev first), with a
  privacy disclosure (it reads ATS page content + the user's profile), a remote
  field-config channel, and a signed auto-update. The extension ships **no** secrets.

---

## 7. Defined job-board list (the macro's operating set)

Per the locked decision, the macro targets **Simplify's full board set**, rolled out in
waves. Two classes: **ATS** (direct application forms — full autofill) and
**aggregators/boards** (often redirect to an ATS; autofill where the form is on-page,
else hand off to the underlying ATS).

### Tier 1 — ATS form autofill (priority; API-first ATS already partially supported server-side)

| Board / ATS | Detect host(s) | Notes |
| ----------- | -------------- | ----- |
| **Greenhouse** | `boards.greenhouse.io`, `job-boards.greenhouse.io` | Server-side send already live (ADR-006). First macro target (matches the Jam recording). |
| **Lever** | `jobs.lever.co` | Server-side send already live. |
| **Ashby** | `jobs.ashbyhq.com`, `*.ashbyhq.com` | Server preview-only (resume upload is multi-step); macro autofills the on-page form. |
| **Workday** | `*.myworkdayjobs.com`, `*.workday.com` | Multi-step wizard; macro fills per-step, user advances. High value, high drift. |
| **iCIMS** | `*.icims.com` | Common enterprise ATS. |
| **SmartRecruiters** | `jobs.smartrecruiters.com` | |
| **Workable** | `apply.workable.com`, `*.workable.com` | |
| **Jobvite** | `jobs.jobvite.com`, `*.jobvite.com` | |
| **Taleo / Oracle** | `*.taleo.net`, `*.oraclecloud.com` | Legacy, heavily framed — later wave. |
| **SuccessFactors (SAP)** | `*.successfactors.com` | Enterprise — later wave. |
| **BrassRing / Kenexa** | `*.brassring.com` | Legacy — later wave. |
| **Teamtailor / Recruitee / Breezy / JazzHR / Rippling / Dover** | respective hosts | Long-tail SMB ATS — config-driven, added as demand appears. |

### Tier 2 — Aggregators & job boards

| Board | Detect host(s) | Notes |
| ----- | -------------- | ----- |
| **LinkedIn (Easy Apply)** | `linkedin.com/jobs` | Easy Apply modal autofill; external applies hand off to the ATS. |
| **Indeed** | `indeed.com` | On-site apply autofill; many redirect to ATS. |
| **Glassdoor** | `glassdoor.com` | Often proxies Indeed/ATS. |
| **ZipRecruiter** | `ziprecruiter.com` | |
| **Dice** | `dice.com` | (Repo already integrates Dice search.) |
| **Wellfound (AngelList)** | `wellfound.com`, `angel.co` | Startup roles. |
| **Monster / SimplyHired / Handshake / Google Jobs** | respective hosts | Lower priority; mostly redirect to an ATS where the macro then runs. |

### Rollout waves

1. **Wave 1 (pilot):** Greenhouse → Ashby → Lever (align with the locked Phase 4
   API-first decision; Greenhouse mirrors the Jam recording).
2. **Wave 2:** Workday, iCIMS, SmartRecruiters, Workable.
3. **Wave 3:** LinkedIn Easy Apply, Indeed, Jobvite, plus the long-tail ATS.

`deriveSourceLabel()` (`src/features/jobs/components/prospectorJobFields.ts`) already
maps most of these hosts to display labels and is the source of truth for board naming
in the UI.

---

## 8. Open questions / follow-ups

- Pre-extracted `master_resume_text` (real PDF→text) so scoring + autofill are universal,
  not gated on a `.txt` resume existing.
- Where field-mapping configs live (Supabase table vs storage JSON) + an authoring/QA
  loop for DOM drift.
- Session handoff mechanics SPA↔extension (shared Supabase session vs a short-lived
  token mint) and the privacy disclosure copy for the Web Store listing.
