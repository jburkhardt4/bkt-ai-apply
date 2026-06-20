# Overnight Run — Candidate Profile Expansion + Answer Library + Autofill Surface

**Date:** 2026-06-19 (overnight, autonomous) · **Branch:** `simplifyAI-apply-macro`
**Exit condition MET:** schema + configs mapped, suite passes with **0 errors**.

> **TL;DR** — The apply-macro now has a real, self-service candidate profile. The
> Preferences UI persists to `candidate_profiles` (no more manual SQL seeding), the
> schema grew to the full ATS field surface + a hybrid Answer Library, and the
> extension fills the expanded field set across Greenhouse / Lever / Ashby (+ a
> best-effort Workday config). **Not committed/pushed — left staged + green for your
> review.**

---

## Green status (authoritative)

| Gate | Result |
| --- | --- |
| `pnpm validate` (typecheck + lint + unit) | ✅ tsc 0 · eslint 0 · **279/279** tests (was 264) |
| `pnpm build:ext` | ✅ builds content/background/spa-session + manifest |
| `pnpm test:ext` (xvfb) | ✅ **22/22** (incl. loaded-extension smoke + new payload/config specs) |
| Tailwind arbitrary-value grep (changed UI files) | ✅ clean |
| MV3 guardrail (`requireNative`/`bindingUtil`) | ✅ none — standard `chrome.*` only |

---

## What shipped, by your Step A–E

### Step A + B — Schema (orchestrator) — `migration 20260619000001`
Additive, RLS-on, applied via MCP; types regenerated into `src/types/db.types.ts`.
- **`candidate_profiles` +7 columns:** `preferred_name`, `phone_country`, `state`,
  `requires_sponsorship` (bool, tri-state nullable), `security_clearance`,
  `drivers_license`, `employment_history` (jsonb).
- **Hybrid Answer Library:**
  - Fixed EEO/demographics → existing `eeo_disclosures` jsonb
    (`{ gender, race_ethnicity, hispanic_latino, veteran_status, disability_status }`).
  - Arbitrary custom screeners → **new `application_answers` table**
    (`question_key`, `question_label`, `answer`, `answer_type`; UNIQUE(user_id,
    question_key); full own-row RLS).

### Step A — UI/DB wiring (delegated → @feature-dev)
- New **`candidateProfileWriteService.ts`** (read/upsert profile + answers; mirrors
  `settingsService` upsert; BR-004/005 — `user_id` forced from the trusted arg) + **15 unit tests**.
- **`PreferencesScreen.tsx`** "Personal Information" + "Eligibility" now **load from /
  save to `candidate_profiles`** (mock `useState` replaced; Save persists). Added the
  missing inputs (preferred name, city, state, website, sponsorship tri-state).
- **Answer Library tab** (was a stub): EEO/demographics editor (→ `eeo_disclosures`)
  + add/edit/remove custom screener answers (→ `application_answers`).
- Exported helpers split into sibling `preferencesProfile.ts` (react-refresh rule);
  mount loader sets state only inside promise callbacks (set-state-in-effect rule).

### Step C — Configs + field audit (delegated → @ai-integrations)
- **`payload.ts` / `background/index.ts`:** `ContactProfile` + `buildPayload` expanded
  (preferredName, phoneCountry, location, state, website, requiresSponsorship→Yes/No,
  `eeo_*`, `answer:<key>`); background reads the new columns + `application_answers`
  (concurrent read), maps `eeo_disclosures`. No PII/EEO sent to the LLM (ADR-011 upheld).
- **Configs:** Greenhouse (+12), Lever (+6), Ashby (+9) field mappings; **new
  `workday.ts`** registered. `docs/features/ats-field-audit.md` written.

### Step D — Delegation
Orchestrated: I owned the schema/types (delicate MCP work) + integration; the two
specialists ran **in parallel on disjoint trees** (`src/features` vs `extension/src`),
then I integrated and ran the authoritative full suite.

### Step E — Validation + self-heal (orchestrator)
Two real issues the specialists surfaced, **fixed at integration**:
1. **react-select substring collision** (`"Male"` ⊂ `"Female"` → wrong EEO option).
   Rewrote the matcher to **exact-label → unique-prefix → unique-substring**, refusing
   to guess on ambiguity (`autofill.ts`). Flipped the test to assert `gender:"Male"` →
   `"Male"` as a **regression guard** (the fixture lists `Female` before `Male`).
2. **Workday manifest gap** — added `*.myworkdayjobs.com` / `*.workday.com` to
   `host_permissions` + the ATS `content_scripts` match so the macro actually injects.

---

## ⚠️ Honest caveats / live-tuning needed (not blockers, flagged)

- **Workday config is best-effort — every selector is UNCERTAIN** (multi-step wizard;
  `data-automation-id` guesses). Degrades safely to `not_found`/`needs_strategy`. Needs
  a pass against a real tenant before trusting.
- **Ashby** uses hashed control ids in the live DOM; configs lean on aria-label
  fallbacks — verify live. **Lever** native-`<select>` EEO fills by option *value*, not
  label — coded values (e.g. `decline`) need a label→value map.
- **`employment_history`** column exists; the repeatable UI + autofill of employment
  blocks is **deferred** (high-effort, like Workday wizards).
- **File uploads** (resume, cover letter) remain `manual_required` (browsers block
  programmatic file-set) — by design; the human attaches + submits (BR-151).

---

## What needs you

1. **Review + commit.** 23 files staged, **uncommitted** (you didn't ask me to push, and a
   big diff is safer reviewed first). `git diff` / `git status` to review; say the word and
   I'll commit to `simplifyAI-apply-macro`.
2. **Try the self-service profile live:** `pnpm dev` → Preferences → Job Preferences →
   fill Personal Info / Eligibility / Answer Library → Save → reload re-hydrates from
   `candidate_profiles`. Then rebuild the extension (`pnpm build:ext`) and re-test Autofill
   on the Headspace/Greenhouse page — more fields should fill now.
3. **Your seeded row:** your earlier row has `location:"Los Angeles, CA"` (city+state in one
   field); the new `state` column is empty — fix via the new UI when convenient.
4. **Housekeeping:** `BKT-Autofill-Bug-Screenshot.webp` landed untracked in the repo root
   (your paste) — gitignore or remove it.

---

## File inventory

**New:** `supabase/migrations/20260619000001_candidate_profile_expansion_and_answers.sql`,
`src/features/applications/services/candidateProfileWriteService.ts` (+`.test.ts`),
`src/features/auto-apply/screens/preferencesProfile.ts`,
`extension/src/configs/workday.ts`, `e2e/extension/payload.spec.ts`,
`docs/features/ats-field-audit.md`, `docs/adr/012-candidate-profile-expansion-and-answer-library.md`.
**Modified:** `src/types/db.types.ts`, `src/features/auto-apply/screens/PreferencesScreen.tsx`,
`extension/src/{payload,background/index,autofill}.ts`,
`extension/src/configs/{greenhouse,lever,ashby,index}.ts`, `extension/manifest.json`,
`e2e/extension/autofill.spec.ts`, `e2e/extension/fixtures/greenhouse.ts`.
