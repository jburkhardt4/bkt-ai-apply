# Manual UAT Checklist — branch `worktree-prepare-application-wiring` (2026-06-22)

> Everything built on this branch that needs a **human at a desktop** to verify. Companion:
> [`BUILD_BACKLOG.md`](./BUILD_BACKLOG.md) (what's deferred). Tick `[x]`, jot misses inline, send
> back the **What to capture** notes at the bottom.

---

## ⚙️ Setup — do this first (one critical gotcha)

> **The pre-built `bkt-extension.zip` is STALE.** It predates all 11 of this branch's extension
> commits (first/last name, phone, panel CSS, B5/B7 matcher, B4 Answer Library, accept-list). The
> manifest still says `0.1.2` even with the new code, so the version number won't tell you what's in
> it. **Build fresh from this branch** or you'll be testing old behavior.

- [✓] **S1.** `git switch worktree-prepare-application-wiring` (or open the worktree) → `pnpm build:ext`
- [✓] **S2.** `chrome://extensions` → toggle **Developer mode** → remove the old BKT card →
      **Load unpacked** → select **`extension/dist/`** (NOT the zip).
- [✓] **S3.** Sign in to the BKT web app in another tab (the extension reads that session).
- [✓] **S4.** Have ready: your **`.md` resume** (`John Burkhardt – Resume - 6.2026.md` is in the repo
      root — perfect), **plus a PDF or Word copy** of a resume for the paste-path test.
- [ ] **S5.** (Optional, for §3 Greenhouse path) confirm your `application_answers` are seeded
      (Preferences → Answer Library shows your years/certs/etc.).

---

## 1. Resume Builder — verbatim transcription  ⭐ *(the fix you asked for — highest priority)*

**Where:** Documents → Resume builder. **Expectation:** your uploaded/pasted resume lands in the
builder **in your own words**, NOT rewritten by AI.

- [ ] **1.1 — `.md`/`.txt` upload.** Upload `John Burkhardt – Resume - 6.2026.md`. → Toast
      "Transcribed…"; builder opens populated. **Verify:** name, contact, headline, summary,
      experience roles + bullets, education, skills are **your exact wording** (spot-check a bullet
      verbatim). Nothing paraphrased.
- [ ] **1.2 — PDF/Word.** Drop a `.pdf` or `.docx`. → A **paste box** appears with a guidance toast
      (no silent failure, no garbage). Paste the resume text → **"Transcribe to builder"** →
      verbatim population, same as 1.1.
- [ ] **1.3 — Auto-Align still separate & optional.** Confirm **Auto-Align** is a distinct, explicit
      button — and that clicking it *does* tailor/rewrite to a job (the AI path is intact, just no
      longer the only path). Transcription must never trigger it automatically.
- [ ] **1.4 — Freeform / odd layout.** Paste a resume with unusual or missing section headers. →
      Doesn't throw; **no content is lost** (worst case the whole thing lands in summary).
- [ ] **1.5 — Edit-from-there.** After transcription, edit a field and confirm it saves like a
      normal builder doc.

## 2. Preferences — First/Last name, Phone, Answer Library editor

**Where:** Preferences screen.

- [✓] **2.1 — First + Last name (A1).** Confirm the old single "Full name" input is now **two**
      inputs: **First** + **Last**. Existing users: it should pre-split your saved full name. Edit →
      Save → reload → values persist.
- [✓] **2.2 — Phone label (A2).** The phone field label reads **"Phone"** (not "Phone number"). Save
      a value; it persists.
- [✓] **2.3 — Typed Answer Library editor (B4 inc3).** Answer Library tab → add/edit answers of each
      type: **text, textarea, select (with option set), boolean**. Save → persists to
      `application_answers`. Select shows its options; boolean is Yes/No.
- [✓] **2.4 — Sensitive flagging.** Salary / work-auth / sponsorship / EEO answers are marked
      sensitive (review-gated) in the editor — present but flagged, per BR-156.

## 3. Extension autofill on a live ATS

**Verified-live Greenhouse postings (B4 Answer Library + screeners):**
- Tech Holding — Salesforce Architect: `https://job-boards.greenhouse.io/techholding/jobs/4704029005`
- Monster Energy — SF Eng Manager: `https://job-boards.greenhouse.io/monsterenergy/jobs/4278377009`
- Monster Energy — Product Owner, SF TPM: `https://job-boards.greenhouse.io/monsterenergy/jobs/4260758009`

**Plus your original AshbyQ posting** (the one that exposed name/phone misses — for Part A).

- [✓] **3.1 — Contact fields.** Open a posting → **BKT: Autofill**. → first name, last name, email,
      phone, linkedin fill into the **correct** boxes. **(Ashby specifically: full name no longer
      dumps into the first-name box — this is the A1 fix.)**
- [x] **3.2 — Years-of-skill + screeners (Greenhouse).** Salesforce 8 / Architect 5 / Apex 2 / LWC 6
      / API 7 / Sales Cloud 8 / Service Cloud 4 / PM 8 / AI 6, implementations 7, relocation Yes,
      age-18 Yes, prior-employer/family No, pronouns, certifications fill from your seeded answers.
- [x] **3.3 — Notice period accept-list (NEW, `77ae094`).** On a posting with a notice-period
      picklist that lacks "Immediately": the matcher should pick the **best ≤30-day option**
      offered (e.g. "Within 30 days"), not skip it. *(Only exercised because you built from branch —
      it's not in the old zip.)*
- [✓] **3.4 — Sensitive held for review (BR-156).** Status line shows *"N sensitive answer(s) held
      for your review."* **Desired salary, work authorization, sponsorship, EEO are NOT auto-filled.**
- [✓] **3.5 — Ashby phone/linkedin/location/website (A3 runtime).** On the AshbyQ form, check whether
      these four fill. **If any miss → this is the known live-tune target:** capture the field's DOM
      (right-click → Inspect → copy the `<input>` + surrounding `<label>`) so the
      `configs/ashby.ts` selectors can be tuned.
- [✓] **3.6 — Native quick-apply detect (B7).** On a posting with the ATS's own one-click apply, the
      panel surfaces it as an accelerator.
- [✓] **3.7 — No mis-fills.** The matcher is unambiguous-or-skip: nothing should land in the **wrong**
      field. A blank (skipped) field is acceptable; a *wrong* value is a bug — flag it.

## 4. Match-Score panel rendering (A4)

- [x] **4.1 — Not squished.** With the panel open on a scored job, section headings have weight +
      spacing, the recommendation/list have breathing room, and the score line + control bar **don't
      wrap or collapse**. Compare against the old "squished block" — this should read cleanly.
      *(Screenshot helps.)*

## 5. Safety regression (must stay true)

- [✓] **5.1 — Never auto-submits (BR-151).** At no point does Autofill click Submit/Apply/Continue.
      It fills and stops; **you** click submit.
- [✓] **5.2 — Signed-out behavior.** Sign out of the web app → extension surfaces a signed-out state
      rather than filling stale/empty data.

---

## 📋 What to capture for me

1. **§1 (resume builder):** any field that came back **reworded** instead of verbatim, and the source
   file type. A Jam/screenshot of the populated builder is ideal.
2. **§3 (autofill):** per posting — **which screeners filled vs. which you did by hand.** First-run
   misses are expected tuning targets (e.g. Tech Holding's *combined* "Apex/LWC/SOQL/APIs" question vs.
   your individually-stored skills) → I'll adjust labels/aliases in `configs/answerSignals.ts` or your
   stored `application_answers` labels.
3. **§3.5 (Ashby):** the **raw DOM** of any phone/linkedin/location/website field that didn't fill.
4. **§4:** a screenshot of the Match-Score panel.
5. **Any wrong-field fill (§3.7)** — highest priority, that's a real bug.
