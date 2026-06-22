# Build Backlog — tabled for later (2026-06-22)

> **Purpose.** Capture *everything not yet built* so a future session (or agent) can resume
> without re-deriving context. This is the "pause here" marker on branch
> `worktree-prepare-application-wiring`. Nothing below is broken — it is **deliberately deferred**.
>
> **Companion doc:** [`UAT_CHECKLIST.md`](./UAT_CHECKLIST.md) — what to manually verify of what
> *is* built. **Authoritative plans:** [`docs/adr/014-master-field-schema-and-answer-library.md`](docs/adr/014-master-field-schema-and-answer-library.md)
> + the three research files in [`docs/research/`](docs/research/).

---

## 0. Baseline — what IS shipped on this branch (the "resume from here" line)

All committed + `pnpm validate` green (397 tests). 11 extension commits ahead of `main`.

| Area | Commit(s) | State |
|---|---|---|
| **Resume Builder verbatim transcription** | `ac27a5c` | `.txt`/`.md` upload + paste-text → verbatim into builder (no AI rewrite) |
| **B4 Answer Library** — DB → background → engine, typed editor, fill pass | `91f67fd` `d00caf3` `c67b085` `65113ef` | Increments 1–3 complete |
| **B4 accept-list** — notice-period ≤30-day picklist fallback | `77ae094` | Code complete, **not yet in a loadable build** |
| **A1/A2** — first/last name authoritative + broadened Ashby selectors | `e5a038a` `6f06f82` | Schema + UI + both fill paths + edge fn redeployed (v2 ACTIVE) |
| **A3/A5** — full field×hop wiring matrix + research docs landed + ADR-014 | `b96aa94` | Static audit done; runtime Ashby tune pending live DOM |
| **A4** — Match-Score panel CSS (un-squish) | `4936a86` | Done |
| **B5/B7** — label-text matcher, Ashby+Lever `applySignals`, native quick-apply detect | `777eb3e` `596dd5d` `d3f37b8` | Done |

**Carried-over uncommitted (NOT mine — leave alone):** drag-panel WIP
(`extension/src/content/index.ts` modified, `extension/src/dragPanel.ts/.test.ts` untracked) and
`OVERNIGHT_HANDOVER_MOBILE.md`. These belong to the other agent's working set.

---

## 1. Resume Builder — in-browser PDF / DOCX text extraction  *(deferred dependency decision)*

**Today:** `.txt`/`.md` files transcribe directly; **PDF/Word route to the paste box** (JB copies
the text in). No client-side binary parser exists in the repo (confirmed — not in `package.json`).

**To finish:** add a lazy-loaded extractor so a *dropped* `.pdf`/`.docx` transcribes without the
paste step.
- PDF → `pdfjs-dist` (text layer extraction). DOCX → `mammoth` (→ text/HTML).
- Wire into `DocsScreen.tsx` `UploadZone` → feed extracted text to `transcribeResume()` (already
  built in `docContentParser.ts`). Keep the paste box as the fallback for scanned/image PDFs.
- **Open decision for JB:** accept the bundle-size cost (`pdfjs` ≈ several hundred KB, lazy-loaded
  so it only loads on first PDF) vs. keep paste-only. **Not added autonomously — needs your yes.**

## 2. Extension packaging — cut a coherent build  *(blocks half the UAT)*

The loadable `bkt-extension.zip` on `main` predates **all 11** of this branch's extension commits.
The manifest still reads `0.1.2` despite the new work, so the version number is **not** a reliable
indicator of contents.

**To finish:** bump `extension/manifest.json` → `0.1.3`, `pnpm build:ext`, and either load unpacked
`extension/dist/` or repackage the zip. (UAT_CHECKLIST has JB build from branch directly, so this
is a convenience/distribution step, not a UAT blocker.)

## 3. Master Field Schema spine — Part B  *(the big remaining chunk; see ADR-014 + research docs)*

Adopt the 35-field master schema as the canonical spine. ~80% of backend already exists (ADR-013).
Remaining, by deliverable (numbering per the plan / ADR-014):

- **B1 — Canonical field-map module + JSON import.** Land `docs/research/application_profile_schema.json`
  as runtime config; typed `canonicalFieldMap` = single source mapping master key ↔ deployed
  `field_key` ↔ storage location (column | `eeo_disclosures` | `application_answers`) ↔ flags
  (autoFill / reviewGate / pii).
- **B2 — Vocabulary reconciliation table** (master 35 → existing `field_key` → storage) checked into
  ADR-014. New fields the master adds: `github`, `portfolio`, `country`, `notice_period`,
  `desired_salary`/`salary_currency`, `requires_sponsorship_future`, screeners (`years_experience`,
  `highest_education`, `english_proficiency`, how-did-you-hear, `referral_name`), free-text
  (`why_company`, `why_role`, `additional_information`).
- **B3 — Extend `candidate_profiles`** with the few new *deterministic* columns (`github_url`,
  `portfolio_url`, `location_country`); MCP migration → regen `db.types.ts` → `get_advisors`.
- **B4 — Typed Answer Library expansion.** *Partially realized* by the apply-macro B4 increments
  (`application_answers.answer_type` now carries `text|textarea|select|boolean`). Remaining: seed
  the **full** master standard-question set with types + option sets, and model JB's one-fact /
  many-phrasings example ("U.S. Citizen?" = boolean `Yes`; "Work Authorization?" = select
  `U.S. Citizen`) as distinct keyed answers.
- **B5 — Multi-signal matcher** in the extension. *Partially realized* by B5/B7 (label-text +
  `applySignals`). Remaining: full confidence-scored scorer (autocomplete → name → id → aria →
  `<label>` → placeholder), fill-only-above-confidence else `unknown_required_field` hard-stop;
  Risk #1 (Ashby React native setter), #3 (file-assisted), #4 (shadow-DOM walk), #7
  (input→change→blur). Per-ATS fixtures.
- **B6 — Preferences UI** rendered as the standardized list grouped by the 6 categories with correct
  input types, plus the typed Answer Library tab.

## 4. Part C reconciled roadmap  *(longer horizon)*

- **P3 — Cron batch prep packet.** On-demand `prepare-application` is DEPLOYED (v2); the scheduled
  batch path is a 501 scaffold. Build the cron trigger + queue drain.
- **P5 — AI free-text.** `supabase/functions/_shared/prep/draftFreeText.ts` is a scaffold only. Wire
  to `ai-router`; **always review-gated**; EEO/answers never sent to the LLM.
- **P2 — Per-ATS live-tune** of the four adapters (Greenhouse → Lever → Ashby → SmartRecruiters)
  against real DOM, in order. (Ashby starts with item 5 below.)
- **P4 — Stop-condition coverage** — extend `stopConditions` + content hydrator per ATS.
- **P6 — QA/fixtures** — expand per-ATS vitest fixtures + an RLS suite.

## 5. Part A residual — Ashby selector live-tune  *(needs JB at desktop)*

The static wiring matrix is done (ADR-014). The **runtime** half needs a live AshbyQ DOM capture:
phone / linkedin / location / website reached the payload in code but didn't fill on the original
live test. Capture the real field DOM during UAT (see UAT_CHECKLIST §3) → tune
`extension/src/configs/ashby.ts`.

---

## Constraints carried forward (do not violate when resuming)

- **BR-151** — human submits; never auto-submit / auto-click the final apply.
- **BR-156** + `reviewRules.neverAutoSubmit` — sensitive answers (salary, work-auth, sponsorship,
  EEO, clearance, legal) always review-gated; first/last name are **not** sensitive.
- **BR-122** — extension uses anon key + user JWT only; edge fn re-derives the caller.
- Single Supabase client (`src/lib/supabase.ts`); every query `user_id`-scoped; RLS always on.
- Complements (does **not** unfreeze) the ADR-006 headless-submit path.
- **Leave the ATS-job-corpus work alone** — the other Architect agent owns it (branch
  `job-search-indexing-platform` / PR #29). Don't touch beyond CI/mechanical.

## Open decisions for JB

1. **PDF/DOCX library** — add `pdfjs-dist`(+`mammoth`) for direct file-drop, or keep paste-only? (§1)
2. **Extension version cadence** — cut `v0.1.3` now to bundle branch work, or wait for Part B? (§2)
3. **Part B sequencing** — land B1/B2/B3 (map + columns) first, or B4/B5 (answers + matcher) first?
