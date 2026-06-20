# ADR-012: Candidate Profile Expansion + Hybrid Answer Library

- **Status:** Accepted
- **Date:** 2026-06-19
- **Relates:** ADR-009 (apply-macro extension), ADR-011 (extension session handoff),
  migration `20260614000001` (original `candidate_profiles`)

## Context

The apply-macro autofilled only 5 contact fields and `candidate_profiles` had **no
write path in the app** (it was populated only by a one-off manual SQL seed — see the
`candidate-profiles-writer-gap` finding). To autofill the full surface of a real ATS
application (Greenhouse/Lever/Ashby/Workday) we need (a) a self-service way for the user
to maintain their profile, (b) a wider column set, and (c) somewhere to store EEO /
demographic answers and arbitrary custom screener answers reusably across applications.

## Decision

**Expand `candidate_profiles` and add a hybrid "answer library."** (Chosen by JB,
2026-06-19.)

- **`candidate_profiles` +7 scalar columns:** `preferred_name`, `phone_country`,
  `state`, `requires_sponsorship` (nullable boolean — tri-state: Yes/No/unset),
  `security_clearance`, `drivers_license`, `employment_history` (jsonb). These are the
  identity/eligibility fields ATS forms request; one row per user, RLS `user_id = auth.uid()`.
- **Hybrid answer storage:**
  - **Fixed** EEO/demographic answers → the existing `eeo_disclosures` jsonb on
    `candidate_profiles` (shape: `gender, race_ethnicity, hispanic_latino,
    veteran_status, disability_status`). A small, fixed key set doesn't justify a table.
  - **Arbitrary / growing** custom screener Q&A → a new **`application_answers`** table
    (`question_key` unique per user, `question_label`, `answer`, `answer_type`), full
    own-row RLS. Reusable across postings, queryable, audit-friendly.
- **Self-service UI:** the Preferences → "Job Preferences" + "Answer Library" mockup is
  wired to a new `candidateProfileWriteService.ts` (read/upsert; mirrors the
  `settingsService` upsert pattern; `user_id` forced server-trusted, BR-004/005). This
  retires the manual SQL seed.
- **Extension:** `ContactProfile`/`buildPayload` + the background reader carry the new
  fields; per-board `FieldConfig`s map them. **No EEO/PII is sent to the LLM** — scoring
  still carries only fit-relevant fields (ADR-011). Autofill never auto-submits (BR-151).

## Alternatives considered

- **All answers in one jsonb blob** — simplest migration, but poor for searching/reusing
  or auditing arbitrary questions. Rejected for the custom-screener case; kept for the
  fixed EEO set.
- **One relational table for EEO + custom** — most uniform, but over-normalizes a fixed
  5-key EEO set that already has a home. Rejected.
- **Merge into the legacy `masterProfile.ts`** — that stays the scoring keyword profile;
  `candidate_profiles` is the PII/identity source. Kept separate.

## Consequences

- **`fillReactSelect` anti-collision:** matching options by substring mis-selected
  EEO/gender (`"Male"` ⊂ `"Female"`). The macro now matches **exact label → unique prefix
  → unique substring**, refusing to guess on ambiguity (UAT-4). Required for trustworthy
  EEO/choice autofill.
- **Workday** config + manifest hosts added, but **selectors are best-effort/unverified**
  (multi-step wizard) — live-tune before trusting. Same caveat (lighter) for Ashby hashed
  ids and Lever native-`<select>` value maps.
- `employment_history` is modeled (jsonb) but its repeatable UI + autofill are deferred.
- File uploads (resume, cover letter) stay `manual_required` (browser security).
