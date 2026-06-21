# ADR-014: Master Application-Field Schema + Master Answers Library

- **Status:** Accepted — Part A landed (2026-06-21); Part B follow-on pending JB review
- **Date:** 2026-06-21
- **Relates:** ADR-012 (candidate profile + answer library), ADR-013 (headless prep + prepared_*),
  migration `20260621000001_candidate_first_last_name`
- **Research/spec:** `docs/research/ats-master-field-schema.md`,
  `docs/research/application_profile_schema.json`,
  `docs/research/BKT_AI-Apply–Job-Board-Research—Headless-Prep-2026.md`

## Context

The Preferences page + extension autofill need one canonical, typed field vocabulary spanning
Greenhouse / Ashby / Lever. The research delivered a 35-field **Master Application-Field Schema**
(6 categories) and an importable `application_profile_schema.json` Answer Library with
`reviewRules` (`neverAutoSubmit` / `stopConditions` / `redactFromLogs`). It also surfaced the need
for a **Master Answers Library** that stores *typed* standing answers for recurring questions, where
one underlying fact surfaces as different field types — e.g. "Are you a U.S. Citizen?" → boolean
`Yes` vs "What's your Work Authorization?" → select `U.S. Citizen`.

These docs describe a **superset SPEC**, but ~80% of the backend already exists (ADR-012/013):
`candidate_profiles`, `eeo_disclosures` jsonb, `application_answers` (**already has `answer_type`**),
`prepared_application_fields` (`field_key`, `redaction_safe`, `review_gate`, the DB-enforced
`is_sensitive ⇒ review_gate` invariant). So adoption is **mapping + extension, not a rebuild** — and
NOT a stack-wide key rename.

## Decision

- **D1 — Vocabulary: keep the deployed snake_case `field_key` contract; normalize the master
  schema's camelCase onto it.** The docs assert `canonicalKey → field_key` with "no translation
  layer", but the deployed/tested/DB-persisted keys are snake_case. We honor the intent by making
  the *existing* keys the canonical target via one documented map (below) — not by renaming.
- **D2 — Storage: hybrid (matches existing patterns).** Typed `candidate_profiles` columns for
  stable 1-per-user identity/contact/presence; `eeo_disclosures` jsonb for EEO; **`application_answers`
  (typed) IS the Master Answers Library** for recurring screeners / work-auth questions / salary /
  notice / education / free-text. `answer_type` is already a free `string` column, so extending it
  to `boolean|select|textarea` is UI + writes only — **no migration**. Add a *few* new columns only
  for genuinely new deterministic fields (github, portfolio, country).
- **D3 — Sequencing: Part A first (done), Part B follow-on.** Part A landed explicit first/last name
  + the wiring audit + Ashby selector + panel CSS (see ADR-013 Part A rollout).
- **D4 — Matcher: adopt the doc's multi-signal scorer** (autocomplete → name → id → aria-label →
  `<label>` text → placeholder), replacing brittle single-selector configs over time. Ashby React
  native-setter (Risk #1) and file-assisted resume fallback (Risk #3) are mandatory.

## Vocabulary reconciliation map (master `canonicalKey` → existing `field_key` → storage)

`pii → redaction_safe`, `reviewGate → review_gate` (enforces `is_sensitive ⇒ review_gate`).

| Master canonicalKey | field_key | Storage | Flags | Status |
| --- | --- | --- | --- | --- |
| firstName / lastName | `first_name` / `last_name` | `candidate_profiles` col | AF·PII | **Part A (done)** |
| fullName | `full_name` | `candidate_profiles` col (recomposed) | AF·PII | done |
| email / phone | `email` / `phone` | `candidate_profiles` col | AF·PII | done |
| locationCity / locationState | `location` / `state` | `candidate_profiles` col | AF·PII | done |
| locationCountry | `country` *(new)* | `candidate_profiles` col *(new)* | AF·PII | Part B |
| linkedinUrl / otherWebsiteUrl | `linkedin` / `website` | `candidate_profiles` col | AF | done |
| githubUrl / portfolioUrl / upworkUrl | `github` / `portfolio` *(new)* | `candidate_profiles` col *(new)* | AF | Part B |
| resumeFile | `resume` | `master_resume_path` | AF*·PII | done (assisted) |
| coverLetterFile / coverLetterText | `cover_letter` / `cover_letter_text` | storage / answers | AF*/RG | Part B |
| authorizedToWork / requiresSponsorshipNow / …Future | `work_auth` / `requires_sponsorship` / `requires_sponsorship_future` *(new)* | col + Answer Library | **RG** | partial |
| noticePeriod / desiredSalary / salaryCurrency | `answer:notice_period` / `answer:desired_salary` / `answer:salary_currency` | Answer Library | AF/**RG**/AF | Part B |
| gender / hispanicLatino / raceEthnicity / veteranStatus / disabilityStatus | `eeo_*` | `eeo_disclosures` jsonb | **RG**·PII | done |
| yearsExperience / highestEducation / englishProficiency / howDidYouHear / referralName | `answer:<key>` (`source` for how-did-you-hear) | Answer Library | AF | Part B |
| whyCompany / whyRole / additionalInformation | `answer:why_company` / `why_role` / `additional_information` | Answer Library (ai-drafted) | **RG** | Part B (Phase 5) |

Existing `candidate_profiles` columns with no master equivalent are kept: `preferred_name`,
`phone_country`, `security_clearance` (sensitive — stored, never auto-filled), `drivers_license`,
`employment_history`.

## Consequences / Part B scope

- Land the 3 research docs in-repo (done in Part A's doc commit) as the design source of truth.
- Build a typed `canonicalFieldMap` module = single source mapping master key ↔ `field_key` ↔
  storage ↔ flags; convert `application_profile_schema.json` into the extension storage-init shape.
- Extend `candidate_profiles` (github, portfolio, country) + seed the Master Answers Library
  (typed `application_answers`) with the standard recurring questions.
- Implement the multi-signal matcher + Ashby React setter + file-assisted resume in the extension.
- Sensitive fields stay review-gated forever (`reviewRules.neverAutoSubmit`); EEO/answers are never
  sent to the LLM. This ADR changes no gating semantics — it only widens the vocabulary.
