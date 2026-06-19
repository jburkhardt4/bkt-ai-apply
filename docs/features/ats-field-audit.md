# Apply-Macro — ATS Field Audit (Greenhouse / Lever / Ashby / Workday)

**Status:** Wave 1 verified (Greenhouse/Lever/Ashby) · Wave 2 best-effort (Workday)
**Owner:** JB · **Branch:** `simplifyAI-apply-macro` · **Date:** 2026-06-19
**Source of truth for selectors:** `extension/src/configs/{greenhouse,lever,ashby,workday}.ts`
**Related:** [ADR-009](../adr/009-apply-macro-chrome-extension.md), [ADR-011](../adr/011-extension-session-handoff.md),
spec [`simplifyai-apply-macro-extension.md`](./simplifyai-apply-macro-extension.md)

> This audit maps the **standard ATS application input set** to the macro's
> **canonical profile keys** (emitted by `buildPayload()` in
> `extension/src/payload.ts`) and the **per-board selector** the macro uses to
> fill each one. The macro fills only what its config maps and **reports the
> rest** — it never fabricates an answer (UAT-4) and **never submits** (BR-151).
>
> **Grounding / honesty:** Greenhouse contact + work-auth selectors are grounded
> in the Jam recording's Greenhouse form and the existing verified config.
> Everything tagged **LIVE-TUNE** is a best-effort selector that needs
> verification against a real posting before it can be trusted; it degrades
> safely to `not_found` / `needs_strategy` (reported, never thrown) until tuned.

---

## 1. Canonical profile keys

`buildPayload()` emits these flat keys from the user's `candidate_profiles` row
(+ `eeo_disclosures` jsonb and the `application_answers` table). A board config
references a key to fill it.

| Payload key | Source column / field | Notes |
| --- | --- | --- |
| `full_name` | `full_name` | Combined name (Lever/Ashby) |
| `first_name` / `last_name` | split of `full_name` (or explicit) | Greenhouse/Workday |
| `preferred_name` | `preferred_name` | |
| `email` | `email` | |
| `phone` | `phone` | |
| `phone_country` | `phone_country` | Country dialing code / region |
| `linkedin` | `linkedin_url` | |
| `website` | `website_url` | Portfolio / personal site |
| `location` | `location` | City |
| `state` | `state` | State / region |
| `work_auth` | `work_authorization` | Choice widget on most boards |
| `requires_sponsorship` | `requires_sponsorship` (bool) | Emitted as `'Yes'` / `'No'`; omitted when `null` (unknown) |
| `eeo_gender` | `eeo_disclosures.gender` | Voluntary |
| `eeo_race` | `eeo_disclosures.race_ethnicity` | Voluntary |
| `eeo_hispanic_latino` | `eeo_disclosures.hispanic_latino` | Voluntary |
| `eeo_veteran` | `eeo_disclosures.veteran_status` | Voluntary |
| `eeo_disability` | `eeo_disclosures.disability_status` | Voluntary |
| `answer:<question_key>` | `application_answers` (per row) | Custom screeners; only filled if a config maps the exact key |

**Never sent to the LLM.** EEO + custom answers are autofill-only. The scoring
path (`score-job-fit`) carries fit-relevant fields only — location,
work-authorization, website, resume text (ADR-011). No contact PII, no EEO.

**Files (resume / cover letter)** are always `manual_required`: browsers forbid
setting a file input's value programmatically, so the human attaches them.

---

## 2. Cross-board field map

Legend: ✅ verified-ish (grounded in fixture / existing config) · 🟡 **LIVE-TUNE**
(best-effort selector, verify on a real posting) · ➖ field not present on that
board's standard form (macro reports `not_found`, which is expected).

| Canonical field | Key | Greenhouse | Lever | Ashby | Workday |
| --- | --- | --- | --- | --- | --- |
| First name | `first_name` | ✅ `#first_name` | ➖ (combined) | ➖ (combined) | 🟡 `[data-automation-id="legalNameSection_firstName"]` |
| Last name | `last_name` | ✅ `#last_name` | ➖ (combined) | ➖ (combined) | 🟡 `[data-automation-id="legalNameSection_lastName"]` |
| Full name | `full_name` | ➖ (split) | ✅ `input[name="name"]` | ✅ `input[name="_systemfield_name"]` | ➖ (split) |
| Preferred name | `preferred_name` | 🟡 `#preferred_name, input[name*="preferred"]` | ➖ | 🟡 `input[aria-label*="Preferred"]` | 🟡 `[data-automation-id="preferredNameSection_firstName"]` |
| Email | `email` | ✅ `#email` | ✅ `input[name="email"]` | ✅ `input[name="_systemfield_email"]` | 🟡 `[data-automation-id="email"]` |
| Phone | `phone` | ✅ `#phone` | ✅ `input[name="phone"]` | 🟡 `input[name="_systemfield_phone"], input[type="tel"]` | 🟡 `[data-automation-id="phone-number"]` |
| Phone country | `phone_country` | ➖ | ➖ | (in phone widget) | 🟡 `[data-automation-id="countryPhoneCode"] button` (custom listbox) |
| LinkedIn | `linkedin` | ✅ `input[name*="urls"][name*="LinkedIn"]` | ✅ `input[name="urls[LinkedIn]"]` | ✅ `input[aria-label*="LinkedIn"]` | 🟡 `[data-automation-id="linkedinQuestion"]` |
| Website / portfolio | `website` | 🟡 `input[name*="urls"][name*="Website\|Portfolio"]` | 🟡 `input[name="urls[Portfolio\|Website]"]` | 🟡 `input[aria-label*="Website\|Portfolio"]` | 🟡 `[data-automation-id="websiteQuestion"]` |
| Location (city) | `location` | 🟡 `#job_application_location, input[name*="location"]` | ✅ `input[name="location"]` | 🟡 `input[aria-label*="Location"]` | 🟡 `[data-automation-id="addressSection_city"]` |
| State / region | `state` | ➖ (usually in location) | ➖ | ➖ | 🟡 `[data-automation-id="addressSection_countryRegion"] button` (custom listbox) |
| Work authorization | `work_auth` | ✅ `#work_auth_control` (react-select) | ➖ (usually a custom card) | ✅ `#ashby_work_auth_control` (react-select) | 🟡 `[data-automation-id="workAuthorization"] button` (custom listbox) |
| Requires sponsorship | `requires_sponsorship` | 🟡 `#sponsorship_control` (react-select) | ➖ | 🟡 `#ashby_sponsorship_control` (react-select) | 🟡 `[data-automation-id="sponsorship"] button` (custom listbox) |
| EEO — gender | `eeo_gender` | 🟡 `#gender_control` (react-select) | 🟡 `select[name="eeo[gender]"]` (native) | 🟡 `#ashby_gender_control` (react-select) | 🟡 `[data-automation-id="gender"] button` (custom listbox) |
| EEO — race/ethnicity | `eeo_race` | 🟡 `#race_control` (react-select) | 🟡 `select[name="eeo[race]"]` (native) | 🟡 `#ashby_race_control` (react-select) | 🟡 `[data-automation-id="ethnicity\|race"] button` (custom listbox) |
| EEO — Hispanic/Latino | `eeo_hispanic_latino` | 🟡 `#hispanic_ethnicity_control` (react-select) | ➖ | ➖ | 🟡 `[data-automation-id="hispanicOrLatino"] button` (custom listbox) |
| EEO — veteran status | `eeo_veteran` | 🟡 `#veteran_status_control` (react-select) | 🟡 `select[name="eeo[veteran]"]` (native) | 🟡 `#ashby_veteran_control` (react-select) | 🟡 `[data-automation-id="veteranStatus"] button` (custom listbox) |
| EEO — disability status | `eeo_disability` | 🟡 `#disability_status_control` (react-select) | 🟡 `select[name="eeo[disability]"]` (native) | 🟡 `#ashby_disability_control` (react-select) | 🟡 `[data-automation-id="disabilityStatus"] button` (custom listbox) |
| Resume (file) | `resume` | ✅ `input[type="file"][name*="resume"]` → manual | ✅ `input[type="file"][name="resume"]` → manual | ✅ `input[type="file"]` → manual | 🟡 `[data-automation-id="file-upload-input-ref"]` → manual |
| Cover letter (file) | `cover_letter` | 🟡 `input[type="file"][name*="cover_letter"]` → manual | ➖ | ➖ | ➖ |
| Custom screeners | `answer:<key>` | label/key match per posting | `cards[...]` (posting-specific) | hashed react-selects | tenant-authored questions |

---

## 3. Widget-strategy notes (why a field can fail)

- **Greenhouse / Ashby choice fields → `react-select`.** The macro opens the
  control (mousedown + click) and clicks the option whose visible text *contains*
  the stored value (case-insensitive). If no option text matches the stored value
  (e.g. the stored `work_authorization` string differs from the board's option
  labels), it reports `needs_strategy` rather than picking the wrong option.
  → **Tuning lever:** the stored values must read like the board's option labels.
- ⚠️ **SUBSTRING-collision hazard (react-select matching).** Because matching is
  *contains*, not *equals*, a short stored value that is a substring of a longer
  option label selects the WRONG option. The concrete EEO case: storing
  `gender = "Male"` matches the `"Female"` option (which contains `male`). Same
  risk for `"Hispanic"` vs `"Not Hispanic or Latino"` and any `"Yes"`/`"Yes, …"`
  pair. **Action for live tuning / QA:** either store the full option label, or
  upgrade `fillReactSelect` to prefer an exact (case-insensitive) label match
  before falling back to contains. Until then, EEO gender + any
  substring-overlapping choice must be treated as **not yet trustworthy**.
- **Lever EEO → native `<select>`.** Filled by setting `.value`. This only works
  if the stored value equals an `<option>` *value* (not just its visible label).
  Where Lever's option values are coded (e.g. `decline`), a label→value map will
  be needed; flagged for live tuning.
- **Ashby container ids are hashed per posting.** The `#ashby_*_control`
  selectors are the fixture's deterministic stand-ins; live Ashby needs the
  `aria-label` fallbacks (already included) to be verified/tightened.
- **Workday is a multi-step wizard, not a form.** Every selector is `data-automation-id`
  based (the most stable Workday hook) but still tenant/version-specific. The
  macro runs per visible step; the human advances each step. Workday "dropdowns"
  are custom `button`+`listbox` widgets — the react-select strategy is the
  closest fit but is the **highest-risk** part; several may fall back to
  `needs_strategy` until tuned against a real tenant. **All Workday selectors are
  UNCERTAIN.**

---

## 4. Uncertain selectors — live-tuning backlog

These must be verified against a real posting before they are trusted. Until
then they degrade safely (the field is reported `not_found`/`needs_strategy`,
never mis-filled).

- **Greenhouse:** `preferred_name`, `website`, `location`, `requires_sponsorship`,
  all five `eeo_*` react-select container ids (Greenhouse occasionally hashes the
  `.select__control` container).
- **Lever:** `website`, all four `eeo_*` native `<select>` option *values*
  (label→value map may be required).
- **Ashby:** everything except the system fields (name/email) and the fixture's
  `#ashby_work_auth_control` — Ashby hashes container ids, so the `aria-label`
  fallbacks need real-posting verification.
- **Workday (ALL):** every selector. Highest priority for live tuning; collect a
  real tenant's `data-automation-id` values per step (My Information, My
  Experience, Application Questions, Voluntary Disclosures, Self-Identify).

---

## 5. Guardrails (unchanged by this audit)

- `submit.autoClick` is `false` on every board — the human submits (BR-151).
- No provider/service-role key in the bundle (BR-122); profile + answers are read
  over the user's own RLS-scoped session (BR-005, ADR-011).
- Files are always `manual_required`; EEO + custom answers are autofill-only and
  never sent to the LLM.
