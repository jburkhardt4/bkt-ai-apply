# 🌙 Overnight Run

**2026-06-22**
Branch: `worktree-prepare-application-wiring`

All authorized items done.
**No blockers hit.**

---

## ✅ At a glance

**1. Deploy edge fn**
→ v1 → **v2 ACTIVE**

**2. `test:e2e`**
→ 55 pass · 16 skip · 3 fail
→ 3 fails = Codespace URL
  blocker only (not a
  regression)

**3. PR #29 monitor**
→ **ARMED** (hourly,
  auto-stops on
  merge/close)

**4. This briefing**
→ written ✅

B4 (inc 1–3) stays
complete + green.
Only thing left:
**your live test (inc 4).**

---

## 1 · Edge fn deploy

**Status: ✅ v2, ACTIVE**

- Shipped the Part-A
  version (`6f06f82` —
  first/last name now
  authoritative).
- Bundled all 9 files
  via Supabase CLI
  (708 kB).
- Verified live:
  `VERSION 2`,
  08:40 UTC.

**Note:** this backs the
*prepared* (server-prep)
path. Your live test
uses the *profile* path,
so this deploy doesn't
change live-test
behavior — it was a
standing Part-A cleanup,
now cleared.

---

## 2 · `test:e2e`

**Status: ✅ attempted**

74 tests, ~1.7 min:

- **55 pass** — every
  B4/B5/B7 extension
  spec + all SPA
  auth/login specs.
- **16 skip** —
  conditional ai-uat.
- **3 fail** —
  `ai-uat/smoke.spec`
  only.

The 3 fails are a known
**Codespace env blocker,
not a regression.**
Those specs need
`AI_UAT_BASE_URL`;
unset, they 404 here.

Re-run WITH the var →
**5/5 pass:**

```
AI_UAT_BASE_URL=http://localhost:5173 \
  pnpm exec playwright \
  test e2e/ai-uat/smoke.spec.ts
```

Also: `pnpm validate`
= 385 green,
`pnpm build` clean.

---

## 3 · PR #29 monitor

**Status: ✅ armed**

Watches PR #29
(`job-search-indexing-
platform` — your other
agent's corpus branch).

At arm time:
- CI green (validate ✅
  / Vercel ✅ / e2e
  skipped)
- All 6 Codex+Copilot
  review threads already
  addressed.

Monitor fixes only
small/mechanical CI
breaks, surfaces
anything architectural
to you, and auto-stops
on merge/close. It does
**not** touch corpus
code beyond CI.

---

# 🌅 Your morning action

**B4 Increment 4 —
live test.**

Everything's in place:
23 answers seeded to
your `application_answers`
row; extension v0.1.2
wired DB → engine.

### Steps

**1. Get the extension**
Download
`bkt-extension.zip`
from repo root
(on `main` @ `50c57a8`).
Unzip it.

**2. Load it**
`chrome://extensions`
→ remove old BKT card
→ **Load unpacked**
→ pick `bkt-extension`
folder.
Confirm card shows
**version 0.1.2**.

**3. Sign in**
to the BKT web app in
another tab (extension
reads that session).

**4. Open a target**
(all verified live):

- Tech Holding —
  SF Architect
  `job-boards.greenhouse.io/techholding/jobs/4704029005`
- Monster Energy —
  SF Eng Manager
  `job-boards.greenhouse.io/monsterenergy/jobs/4278377009`
- Monster Energy —
  Product Owner, SF TPM
  `job-boards.greenhouse.io/monsterenergy/jobs/4260758009`

**5. Click "BKT:
Autofill".**

### What SHOULD fill

Contact fields
(first/last/email/
phone/linkedin) +
years-of-skill
(Salesforce 8,
Architect 5, Apex 2,
LWC 6, API 7,
Sales Cloud 8,
Service Cloud 4, PM 8,
AI 6), implementations
7, relocation Yes,
age-18 Yes,
prior-employer/family
No, notice period,
pronouns,
certifications.

### What STAYS held

(BR-156, by design):
**desired salary, work
authorization,
sponsorship, EEO.**
Status line shows
*"N sensitive answer(s)
held for your review."*

### Capture for me

Which screeners filled
vs. which you did by
hand (a Jam is ideal).

The matcher pairs each
form's visible `<label>`
to your stored question
label/aliases
(unambiguous-or-skip —
never mis-fills).
First-run misses are
expected tuning targets.
Send them and I'll
adjust
`answerSignals.ts` or
your stored question
labels.

**Known likely miss:**
Tech Holding's
*combined*
"Apex/LWC/SOQL/APIs"
question (your skills
are stored
individually).

---

## Commit ledger (B4)

- `91f67fd` inc1 fill
- `d00caf3` type-cond fix
- `c67b085` inc2 wiring
  + seed
- `65113ef` inc3 typed
  editor

Extension zip on `main`:
`50c57a8` (v0.1.2).
