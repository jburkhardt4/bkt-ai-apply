# Apply‑Macro — Phase 1 + 2a UAT & Phase‑2b Gate

**Branch:** `simplifyAI-apply-macro` · **Date:** 2026‑06‑16 ·
**ADR:** [009](../adr/009-apply-macro-chrome-extension.md) ·
**Spec:** [simplifyai-apply-macro-extension.md](../features/simplifyai-apply-macro-extension.md) ·
**Deploy:** [apply-macro-deploy-checklist.md](../deploy/apply-macro-deploy-checklist.md)

This is the acceptance gate for the manual source‑link handoff (Phase 1) and the Match Score / Fit
Summary (Phase 2a). **All of Part 4 must hold before Phase 2b (the Chrome extension) starts.**

---

## 1. Run the app

```bash
pnpm install        # if needed
pnpm dev            # Vite
```

- Codespace URL: open the forwarded port from the **Ports** panel. In this session the dev server is
  on **:5174** → `https://vigilant-space-adventure-pjp4vv9vvvrv264vp-5174.app.github.dev`
  (5173 was already in use; either serves the same working tree).
- Supabase creds are already in `.env.local` (hosted project `rmoyuwesfljuygvpdolf`) → **live data**.

**Sign in for real** at `/login` with a real account. A real session is **mandatory** — the
synthetic/demo session sets `live = false` and **skips every DB write** (`AutoApplyDashboard.tsx:47`),
so it cannot validate the event‑sourcing criteria.

---

## 2. Real test‑target jobs (account `john@bktadvisory.com`)

The Fit tab renders on **any** opened job regardless of stage, so the fit‑state criteria are reachable
via the JobsScreen filter tabs. Identify jobs by title.

| Need | Job (title) | Where to find | Expected |
| ---- | ----------- | ------------- | -------- |
| **Ready** score + **Phase 1 handoff** | "Salesforce Consultant / Administrator – Remote" (88) | **Review** filter (discovery) | Fit tab → `88/100` **Perfect fit**; Apply → handoff |
| **Ready** score + handoff | "Project Manager Remote 100%" (68) | **Review** filter | Fit tab → `68/100` **Strong fit** |
| **Ready** score + handoff | "Salesforce Developer – REMOTE @ Michigan" (68) | **Review** filter | Fit tab → `68/100` **Strong fit** |
| **Estimated** chip | "AI Testing Architect – REMOTE" (90) or "Senior Salesforce Administrator" (90) | **Applied** filter | Fit tab → score + **"Estimated — full AI scoring queued"** chip |
| **Unscored** state | "Salesforce Marketing Cloud Senior Associate" | **Declined** filter | Fit tab → **"Not scored yet…"**, badge `0` |

> JB has exactly **3 discovery jobs** (the three above), all with links. ⚠️ "Mark as applied"
> transitions them out of discovery — do the full open → in‑progress → applied flow on **one** you
> actually intend to apply to; for the others, test only the first click (in‑progress) and reset with
> the cleanup query in §5.

**Not reproducible on current real data (no fixtures, per decision):**

- **Phase 1 no‑link path** (`No source link — mark as applied manually` + "View Job" disabled) — JB
  has 0 link‑less jobs.
- **Prospector "queued" state** — needs an `ai_scores` row with `reasoning_trace.reason='cost_cap'`;
  all 25 of JB's heuristic fallbacks are `edge_function_error` (see §6). Verified by code path only,
  unless we seed one disposable row on request.

---

## 3. Manual criteria (must PASS)

### 3.1 Mode toggle unification

- [ ] Dashboard top‑right **ReviewModeMenu** shows current mode; switching toasts `Switched to <label>`.
- [ ] **Preferences → Application/Quick Settings** cards reflect the same value after navigation, and
      a change there is mirrored back in the Dashboard menu. (Hybrid↔`assist`, Review↔`review`,
      Auto↔`auto`; persisted to `user_settings.review_mode`.)

### 3.2 Phase 1 handoff — Review/Assist mode (Dashboard)

- [ ] Apply on a discovery job **with** a link → opens the posting in a **new tab** + toast
      `Opened <company> — mark as applied when done`; row → **In progress** (warning tone); the
      **In progress** filter count increments.
- [ ] Apply again on that In‑progress row → toast `Marked as applied — <company>`; row → **Applied**;
      "Submitted" stat increments. **No credit** is spent on the manual handoff.
- [ ] JD sidebar footer: primary button reads **"Mark as applied"** for an In‑progress job, else
      **"Apply"**; **"View Job"** opens the posting (disabled only when there's no link).

### 3.3 Phase 1 auto‑mode regression (test on a job you're OK auto‑applying to)

- [ ] In **Auto** mode, Apply does **not** do the handoff — it sets **Applied**, spends a credit, and
      toasts `Application queued — <company>` (the existing autonomous path).

### 3.4 Phase 2a Fit panel — dashboard JD sidebar (also /search)

- [ ] **Ready** job → `<score>/100` + label (**≥80 Perfect / ≥65 Strong / else Possible**), "Why this
      might be a good fit", **Key Matches**, **Key Gaps** — visible before Apply, no errors.
- [ ] **Estimated** job → **"Estimated — full AI scoring queued"** chip present.
- [ ] **Unscored** job → **"Not scored yet. This role has not been matched against your profile."**

### 3.5 Phase 2a Fit panel — Prospector job sheet

- [ ] Opening a scored job renders the fit panel (score + matched + missing + recommendation),
      `ready`, no errors. (Cost‑cap `queued` not reproducible on real data — see §2/§6.)

### 3.6 Event‑sourcing audit (verify in SQL — BR‑002 / BR‑149)

- [ ] After first Apply: `application_events` row `event_type='submission_attempt'`,
      `actor='jb_manual'`, `metadata.outcome='in_progress'`, `metadata.source='manual-apply'`,
      `from_stage/to_stage` NULL; `applications.stage` still `discovery`.
- [ ] After "Mark as applied": `stage_transition` row `discovery→applied`, `actor='jb_manual'`,
      reason `Marked as applied (manual)`; `applications.stage='applied'`.

```sql
select event_type, actor, from_stage, to_stage, reason, metadata, created_at
from application_events where application_id = '<APP_ID>' order by created_at desc;
```

### 3.7 Non‑functional / regression

- [ ] `pnpm validate` green.  - [ ] No console errors on /your‑jobs, /search, /prospector, /settings.
- [ ] Responsive desktop + mobile (≤640px).  - [ ] `git diff` touches no `supabase/migrations/**` or
      `src/types/db.types.ts`.  - [ ] After `pnpm build`, no LLM key in `dist/`.

---

## 4. Phase‑2b gate (all must hold)

- [ ] All §3 criteria PASS (incl. §3.6 audit rows).
- [ ] `pnpm validate` green.
- [ ] `pnpm test:uat:smoke` green (no creds needed).
- [ ] `e2e/ai-uat/job-fit.spec.ts`, `apply-handoff.spec.ts`, and `discovery-applied.spec.ts` pass in a **credentialed** run.
- [ ] No migration / no `db.types.ts` change / no LLM key in `dist/`.

### Running the automated specs

They `test.skip` without credentials. Point `TEST_USER_*` at **<uat-test@bktadvisory.com>** — its
`[UAT] Senior Salesforce Administrator` fixture is seeded (discovery + a ready 88 score), so the
destructive Discovery→Applied flow runs there and never touches `john@`:

```bash
TEST_USER_EMAIL=uat-test@bktadvisory.com TEST_USER_PASSWORD=<set in Supabase dashboard> \
ANTHROPIC_KEY=<…> AI_UAT_BASE_URL=http://localhost:5174 \
pnpm test:uat              # ai-uat except @explorer: @job-fit + @apply-handoff + @discovery-applied
```

`uat-test@` needs a password set first (Supabase dashboard → Authentication → Users). Browserbase
keys optional (falls back to local Playwright). Re-arm the destructive fixture between runs — see §5.

---

## 5. Reset / cleanup

Reset an In‑progress marker back to **Review** (stage was never changed, so this fully reverts the
first click):

```sql
delete from application_events
where application_id = '<APP_ID>'
  and event_type = 'submission_attempt' and actor = 'jb_manual'
  and metadata->>'source' = 'manual-apply';
```

Undoing a `discovery→applied` transition requires a **compensating** transition (re‑open), not a
delete — which is why §2 recommends doing the full apply only on jobs you mean to apply to.

**Re-arm the `uat-test@` Discovery→Applied fixture** (reset to a clean discovery state before each
destructive automated run — safe, it's a throwaway account):

```sql
update applications a set stage='discovery', submitted_at=null
from jobs j
where a.job_id=j.id and a.user_id='dd1124da-a571-4216-a5f7-b61578149ddd' and j.title like '[UAT]%';
delete from application_events e using applications a, jobs j
where e.application_id=a.id and a.job_id=j.id
  and a.user_id='dd1124da-a571-4216-a5f7-b61578149ddd' and j.title like '[UAT]%'
  and e.event_type in ('submission_attempt','stage_transition');
```

---

## 6. Watch‑items (surface, triage — not all are Phase‑1/2a blockers)

1. **Stale error‑fallback scores — root‑caused & fixed.** ~25 of `john@`'s tracked scores were
   `heuristic_fallback / reason='edge_function_error'` from a **transient 6/14–6/15 outage**; the
   function has since recovered (live LLM 200s today). The related `format-jd` 502 was a **stale
   model** (`Claude 3.5 Haiku`, retired) — fixed by standardizing Anthropic tasks on **Sonnet 4.6**
   ([ADR‑010](../adr/010-claude-sonnet-standardization-and-scoring-observability.md)). Observability
   now logs the specific provider code and persists `reasoning_trace.reason='edge_function_error:<code>'`
   instead of the generic string. **Action:** run `scripts/rescore-stale.ts` (with `john@` creds) to
   refresh the 25 stale rows so their "Estimated" chips become live scores.
2. **"Estimated" chip mislabels error‑fallbacks.** The JD sidebar shows
   `Estimated — full AI scoring queued` for **any** `heuristic_fallback` (`JDSidebar.tsx:85`), so the
   25 *errored* scores read as "queued". The Prospector panel only treats `reason='cost_cap'` as
   queued (`useJobFitScore.ts:61`) — so the same job shows an estimate chip in the sidebar but a plain
   score in the Prospector sheet. Align the two definitions.
3. **Fit‑label scales differ:** JD sidebar = **Perfect/Strong/Possible** (≥80/≥65); Prospector
   `JobFitPanel` = **Strong/Possible/Weak**. Confirm intended.
4. **Resume‑text enrichment (BR‑150) is inert** until a `.txt` resume exists in the `documents` bucket,
   and there's no UI re‑score trigger — verify at the function/log level. Follow‑up: PDF→text extraction.
