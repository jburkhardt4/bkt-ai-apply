# Overnight Handover — Part A (apply-macro wiring audit + live-test fixes)

**Run:** autonomous overnight · **Branch:** `worktree-prepare-application-wiring` · **Date:** 2026-06-21
**Status:** ✅ **Part A 100% complete, tested, committed.** 0 blockers hit the retry limit. No Part B started.

---

## ✅ Completed & committed (6 milestone commits)

| Commit | Sub-part | What shipped |
| --- | --- | --- |
| `1075bd0` | A1 schema | Migration `20260621000001` adds `candidate_profiles.first_name`/`last_name` (`text NOT NULL DEFAULT ''`); `db.types.ts` regenerated. Applied to hosted DB under the approved plan; additive + RLS-neutral (`get_advisors`: 0 new lints). |
| `25f5e9a` | A1 SPA + A2 label | Preferences "Full name" → **First name** + **Last name** inputs; `profileRowToForm` seeds them by splitting `full_name` for existing users; `formToProfilePatch` recomposes `full_name` from first+last. Phone label "Phone number" → **"Phone"**. |
| `4936a86` | A4 CSS | Fixed the squished extension Match-Score panel (`content/index.ts injectStyles`): heading weight + spacing, recommendation styling, `#bkt-apply-root` flex-wrap/max-width. |
| `e5a038a` | A1 ext + A2 selectors | Extension fetches + maps `first_name`/`last_name`; Ashby config gains split-name entries and **broadened** phone/linkedin/location/website selectors (autocomplete tokens + case-insensitive). |
| `6f06f82` | A1 edge fn | `toCandidateData` reads first/last → prep field map resolves them authoritative (`profile`/conf 1, not split-derived 0.6). New fieldMap test. **Not deployed** (see below). |
| `b96aa94` | A3 + A5 docs | Landed the 3 research docs in `docs/research/`; ADR-013 Part A rollout + **field×hop audit matrix**; new **ADR-014** (master-schema adoption + vocab map). |

### Key diagnostic finding

A read-only DB query proved JB's `candidate_profiles` row is **fully populated** (phone, location,
linkedin, website all set). So "only name+email filled" on Ashby was **selector drift, NOT a
persistence bug** — the fix was broadening the Ashby selectors, which are still best-effort/LIVE-TUNE
until verified against the real AshbyQ DOM.

### Validation — all GREEN (local)

- `pnpm validate` → 380 tests, 0 type errors, 0 lint warnings
- `pnpm build:ext` → clean · `xvfb-run -a pnpm test:ext` → 25/25
- `deno check` (prepare-application + _shared/prep) → clean
- `pnpm test:e2e` → **47 passed** (15 ai-uat live-session skipped without `TEST_USER_*`)
- All 10 wiring hops + all 3 safety checks (BR-151 `autoClick:false`, BR-122 no service-role key, BR-156 sensitive fields unchanged) verified by Qa-Uat.

---

## ⚠️ Blockers / things needing YOU (none hit the 3-retry limit)

1. **Edge-function deploy is DEFERRED to your review** (overnight safety boundary — no hosted deploy).
   The `prepare-application` first/last change is committed + `deno check`'d but **not live**. To deploy:

   ```bash
   supabase functions deploy prepare-application --project-ref rmoyuwesfljuygvpdolf
   ```

2. **Manual LIVE verify (the real acceptance gate)** — sign in, open an AshbyQ posting, hit Autofill, and
   confirm First/Last land in the right boxes and phone/LinkedIn/location/website now fill. If any still
   miss, paste that form's field HTML so the Ashby selectors can be tuned to the real DOM.
3. **e2e in Codespace quirk (resolved, FYI):** `ai-uat/smoke.spec.ts` 404s unless you run e2e with
   `AI_UAT_BASE_URL=http://localhost:5173` (otherwise `CODESPACE_NAME` points it at an unforwarded
   public URL). Not a code issue.

No changes were stashed; nothing failed after retries.

---

## 📋 Copy-paste prompt to start Part B tomorrow

```
@orchestrator Part A is merged-ready and reviewed. Execute Part B (Master Field Schema + Answer Library spine)
per ADR-014 and docs/research/ats-master-field-schema.md + application_profile_schema.json. Branch from the
current worktree branch.

Scope, in order:
B1. Add a typed `canonicalFieldMap` module = single source mapping master canonicalKey ↔ snake_case field_key
    ↔ storage (candidate_profiles col | eeo_disclosures | application_answers) ↔ flags (autoFill/reviewGate/pii).
    Convert application_profile_schema.json into the extension's storage-init shape.
B2/B3. Extend candidate_profiles with the new deterministic columns only (github_url, portfolio_url,
    location_country) via MCP apply_migration; regen types; get_advisors.
B4. Master Answers Library = typed application_answers (answer_type is already a free string → no migration):
    seed the standard recurring questions with boolean|select|text|textarea + option sets, incl. the
    "U.S. Citizen? = Yes" vs "Work Authorization? = U.S. Citizen" multi-type case; expand the Preferences
    Answer Library tab editor to typed entries.
B5. Implement the multi-signal matcher in the extension (autocomplete→name→id→aria→label→placeholder),
    plus the Ashby React native-setter (Risk #1) and file-assisted resume (Risk #3), and shadow-DOM walk (#4).
B6. Render the standardized field list in Preferences grouped by the 6 master categories.

Constraints unchanged: BR-151 (human submits), BR-122 (extension anon key + user JWT only), BR-156 +
reviewRules.neverAutoSubmit (sensitive/EEO always review-gated, never sent to the LLM). Keep the deployed
snake_case field_key contract (D1 — no stack-wide rename). Commit per milestone; qa-uat-verify before each.
```

---

## Notes for review

- 6 commits are granular and independently revertable. The hosted migration (first/last columns) is the only
  applied DB change; everything else is worktree-local.
- ADR-013 (Part A rollout + audit matrix) and ADR-014 (master-schema adoption + vocab map) are the design record.
- The `docs/research/*` files were untracked in main; they are now committed in this branch as the spine spec.
