# Apply-Macro Phase 2b — Human Verification Checklist (Sections A + B)

**Status:** Ready to run · **Owner:** JB · **Branch:** `simplifyAI-apply-macro` · **Date:** 2026-06-18
**Decisions:** [ADR-009](../adr/009-apply-macro-chrome-extension.md) (extension) · [ADR-011](../adr/011-extension-session-handoff.md) (session handoff)
**Spec:** [`docs/features/simplifyai-apply-macro-extension.md`](../features/simplifyai-apply-macro-extension.md) (UAT-1…9)

> This is the **human half** of the Phase 2b acceptance gate. The automated half is already
> green (`pnpm validate` → typecheck/lint/264 tests; `pnpm test:ext` → 12/12 under xvfb).
> These checks need a **real signed-in session** against live Supabase and cannot be mocked.
>
> ⚠️ **Live-data caveat:** any "Mark as applied" step (Section B4) writes real
> `discovery → applied` transitions + `application_events` rows. Use jobs you actually
> intend to apply to. The Match-Score / Autofill checks (A1–A6, B1–B3) are read-only and
> safe to run on any posting.

---

## Prerequisites

**Build & data — tick before starting:**

- [ ] **P1** — Build the extension: `pnpm build:ext` (injects the public anon key from `.env.local`)
- [ ] **P2** — `extension/dist/` exists with `manifest.json`, `content.js`, `background.js`, `spa-session.js`
- [ ] **P3** — A `candidate_profiles` row exists for your user (full_name/email/phone/linkedin + location/work_authorization)
- [ ] **P4** — *(for a meaningful score)* a **`.txt`** master resume in the `documents` bucket (PDF won't parse — BR-150; without it, scoring is keyword-only)
- [ ] **P5** — `score-job-fit` Edge Function is deployed/live on the hosted project
- [ ] **P6** — No-key sanity: `grep -ri "ANTHROPIC\|OPENAI\|GEMINI" extension/dist/` returns nothing (only the public anon key / URL may appear)

**Setup steps:**

1. **Load the extension** — Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`.
2. **Open the extension's service-worker console** (where background logs/errors appear) — on the extension card click **service worker** → a DevTools window opens. Keep it visible.
3. **Sign in** to the BKT web app (the deployed SPA, or `pnpm dev` → forwarded `:5173` URL). Confirm you're logged in.
4. For each ATS page below, also open the **page DevTools** (F12 → Console + Network) to capture errors and the `score-job-fit` response.

---

## Section A — Live functional verification (read-only, safe)

For each: tick **PASS / FAIL / PARTIAL** and capture the evidence noted.

### A1 — Match Score renders on a real posting (UAT-1)
1. Open a **Greenhouse** posting (e.g. `boards.greenhouse.io/...`).
2. Wait for the BKT Fit panel to appear; click **Get Match Score**.
- [ ] PASS [ ] FAIL [ ] PARTIAL
- **Expected:** a 0–100 score + a label + "Key Matches" / "Key Gaps", no error in either console.
- **Capture:** the **score number + recommendation**, the matches/gaps text, and a screenshot of the panel.

### A2 — Autofill fills the form, never submits (UAT-2, UAT-3)
1. On the same posting, click **Autofill**.
- [ ] PASS [ ] FAIL [ ] PARTIAL
- **Expected:** name / email / phone / LinkedIn fill; filled fields visibly highlight; **Submit is never auto-clicked**.
- **Capture:** which fields filled vs. were skipped/`not_found`; a screenshot of the filled form.

### A3 — Signed-out → signed-in propagation (ADR-011 token re-read)
1. **Before signing in** (or after signing out), open an ATS posting → confirm panel reports **signed-out**.
2. Sign in at the BKT app, return to the ATS tab, click into it (focus), retry **Get Match Score**.
- [ ] PASS [ ] FAIL [ ] PARTIAL
- **Expected:** after focus, the panel works without reloading the extension.
- **Capture:** note whether a tab refresh was needed.

### A4 — Cross-user isolation / RLS (UAT-9)
1. Confirm the returned profile/score is **yours** (your name/location, your resume signals).
- [ ] PASS [ ] FAIL [ ] PARTIAL
- **Capture:** confirm no other-user data appeared.

### A5 — Cost-cap "estimated" state, not an error (UAT-7)
1. If you have a cost-capped job (or can trigger the cap), score it.
- [ ] PASS [ ] FAIL [ ] N/A
- **Expected:** the panel shows "estimated / full AI scoring queued," never a hard error.

### A6 — No LLM key in the bundle (UAT-8)
1. Re-confirm P6, and in the page **Network** tab confirm scoring goes only to `score-job-fit` with a Supabase JWT (no direct api.anthropic.com call from the page).
- [ ] PASS [ ] FAIL
- **Capture:** the `score-job-fit` request domain + that it carries an `Authorization: Bearer` header.

---

## Section B — Visual / UX testing

### B1 — Panel rendering across ATS vendors
- [ ] Greenhouse  [ ] Ashby  [ ] Lever — panel readable, not broken by host-page CSS (shadow root).
- **Capture:** one screenshot per vendor; note any layout breakage.

### B2 — Unsupported-host inertness (UAT-5)
- [ ] On a random non-ATS page (e.g. a news site), **nothing** injects — no panel, no buttons, no console noise.

### B3 — DOM-drift grace (UAT-2 edge case)
- [ ] On a posting where some fields don't match, Autofill reports "filled what it could" — never fills the **wrong** field, never throws.
- **Capture:** which fields were `not_found`.

### B4 — Phase 1/2a handoff walkthrough ⚠️ writes real data
- [ ] Review/Assist mode: **Apply** on a discovery job opens the posting + moves the row to **In progress**; **Apply** again → **Applied**.
- [ ] No-link job: toast "No source link — mark as applied manually," moves to In progress, no tab opens.
- **Capture:** confirm the `application_events` audit rows look right (see `docs/qa/apply-macro-phase1-2a-uat.md` B6).

### B5 — Responsive
- [ ] Desktop and ≤640px mobile — Fit panel + Apply affordances usable.

---

## What to send back (so the next iteration is precise)

For **each** test, report in this shape:

```
A1  PASS|FAIL|PARTIAL
  score: <number> / recommendation: <apply|consider|reject>
  matches: <short list>   gaps: <short list>
  page console errors: <none | paste>
  SW console errors:   <none | paste>
  screenshot: <attached>
  notes: <anything odd>
```

**Highest-value captures if you only have time for a few:**
1. The **service-worker console** output during a score (any red errors there = the auth/Edge path).
2. The **`score-job-fit` network response** JSON (the panel's raw input).
3. **Screenshots** of the panel + the autofilled form.
4. The **exact score + matches/gaps** for one real job you know well — so we can judge whether the scoring is *grounded* (anti-hallucination) vs. generic.

---

## Sign-off

- [ ] Section A complete — date: ______  result: ______
- [ ] Section B complete — date: ______  result: ______
- [ ] Blocking failures filed back to Claude for fix
- [ ] Phase 2b human gate **CLEARED** → proceed to packaging / broader rollout
