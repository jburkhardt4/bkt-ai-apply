# BKT AI-Apply — Master Application-Field Schema
### Common-denominator schema for Greenhouse · Ashby · Lever | v1.0.0

---

## 1. Executive Summary

This schema is the **single source of truth** for the Chrome extension's Answer Library. You populate it once on your Preferences page; the extension then maps each canonical key to live form inputs on Greenhouse, Ashby, and Lever applications and fills them inside your own logged-in session.

It is built for a **macro-enabled, human-in-the-loop** extension, not a headless bot:

- **Deterministic-first.** Every field carries `autoFill` and `reviewGate` flags. Deterministic facts (name, email, URLs, resume) fill silently; sensitive fields (EEO, work authorization, salary, legal attestations) are stored but **never auto-submitted** — the extension surfaces them for a one-click human confirm.
- **Schema-aligned with the backend.** Each `canonicalKey` here is the same `field_key` used in the `prepared_application_fields` table. `pii` maps to `redaction_safe`; `reviewGate` enforces the existing `is_sensitive ⇒ review_gate` invariant. The extension reads the prepared map, hydrates the DOM, and writes back an `application_events` audit row on submit.
- **Resilient by design.** The `atsMappings` clues below are *observed patterns to verify against live DOM*, not constants. The extension targets fields with a **multi-signal scorer** (autocomplete token → name → id → aria-label → associated `<label>` text → placeholder → proximity), so a single attribute change never breaks a fill.

**Coverage:** 35 fields across 6 categories. Importable as `application_profile_schema.json`.

---

## 2. Schema Reference Table

> **Legend** — `AF` = AutoFill (fills silently) · `RG` = ReviewGate (human confirm before submit, never auto-submitted) · `PII` = redact from logs.
> Field types use the project enum: `text, tel, email, url, file, select, multiselect, radio, boolean, textarea`.

### Core Contact Info
| Field Label | Canonical Key | Type | Flags | Option Values | ATS Mapping Clues |
| --- | --- | --- | --- | --- | --- |
| First name | `firstName` | text | AF · PII | — | `autocomplete="given-name"`; GH `name="first_name"` / `#first_name`; Lever (parses from `name="name"`); Ashby `_systemfield_name` (first token); label "First Name" |
| Last name | `lastName` | text | AF · PII | — | `autocomplete="family-name"`; GH `name="last_name"`; Ashby `_systemfield_name` (last token); label "Last Name" |
| Full name | `fullName` | text | AF · PII | — | **Lever primary** `name="name"` / `#name`; used when no split fields exist |
| Email | `email` | email | AF · PII | — | `autocomplete="email"`; GH `name="email"`; Lever `name="email"`; Ashby `_systemfield_email`; `type="email"` |
| Phone | `phone` | tel | AF · PII | — | `autocomplete="tel"`; GH `name="phone"`; Lever `name="phone"`; `type="tel"`; label "Phone" |
| City | `locationCity` | text | AF · PII | — | `autocomplete="address-level2"`; GH `name="location"` (autocomplete combo); Ashby `_systemfield_location`; label "City"/"Location" |
| State / Region | `locationState` | text | AF · PII | — | `autocomplete="address-level1"`; often folded into GH `location` |
| Country | `locationCountry` | select | AF · PII | ISO country list | `autocomplete="country-name"`; label "Country" |

### Professional Presence
| Field Label | Canonical Key | Type | Flags | Option Values | ATS Mapping Clues |
| --- | --- | --- | --- | --- | --- |
| Resume / CV | `resumeFile` | file | AF* · PII | — | GH `name="job_application[resume]"` / `#resume`; Lever `name="resume"`; Ashby resume dropzone. **See §4 — file inputs cannot be set by `.value`; assisted inject via DataTransfer or prompt** |
| Cover letter (file) | `coverLetterFile` | file | AF* | — | GH `name="job_application[cover_letter]"`; Lever `name="coverLetter"` |
| Cover letter (text) | `coverLetterText` | textarea | RG | — | GH "Enter manually" textarea; label "Cover Letter" |
| LinkedIn URL | `linkedinUrl` | url | AF | — | `autocomplete="url"`; **Lever `name="urls[LinkedIn]"`**; GH custom Q "LinkedIn"; label/aria "LinkedIn" |
| GitHub URL | `githubUrl` | url | AF | — | **Lever `name="urls[GitHub]"`**; label/aria "GitHub" |
| Portfolio URL | `portfolioUrl` | url | AF | — | **Lever `name="urls[Portfolio]"`**; label "Portfolio"/"Website" |
| Upwork URL | `upworkUrl` | url | AF | — | `autocomplete="url"`; no standard Lever `urls[]` key → maps to `urls[Other]` or a custom Q; label/aria "Upwork" |
| Other website | `otherWebsiteUrl` | url | AF | — | **Lever `name="urls[Other]"`**; label "Website"/"Other URL" |

### Work Authorization & Preferences
| Field Label | Canonical Key | Type | Flags | Option Values | ATS Mapping Clues |
| --- | --- | --- | --- | --- | --- |
| Authorized to work in [country] | `authorizedToWork` | boolean | **RG** | `Yes` / `No` | Rendered as GH/Ashby `select` or Lever radio card; match label "authorized to work" / "right to work" |
| Requires sponsorship now | `requiresSponsorshipNow` | boolean | **RG** | `Yes` / `No` | label "require sponsorship" / "visa sponsorship" |
| Requires sponsorship in future | `requiresSponsorshipFuture` | boolean | **RG** | `Yes` / `No` | label "now or in the future" / "future sponsorship" |
| Notice period | `noticePeriod` | select | AF | `Immediately`, `2 weeks`, `1 month`, `2 months`, `3 months`, `Other` | custom Q; label "notice period" / "availability" |
| Desired compensation | `desiredSalary` | text | **RG** | — | custom Q; label "salary"/"compensation expectations". **Never auto-submit (§4)** |
| Salary currency | `salaryCurrency` | select | AF | `USD`, `EUR`, `GBP`, `CAD`, … | paired with `desiredSalary` |

### Demographics & Voluntary Self-Identification / EEO
> **All fields below: `reviewGate = true`, `autoSubmit = false`.** Store your standing answer (including "Decline / Prefer not to answer"); the extension fills it but requires a human click to submit. These are legal self-identification fields.

| Field Label | Canonical Key | Type | Flags | Option Values | ATS Mapping Clues |
| --- | --- | --- | --- | --- | --- |
| Gender | `gender` | select | **RG** · PII | `Male`, `Female`, `Decline to self-identify` *(some forms add `Non-binary`/`Other`)* | GH demographic section; Lever `eeoResponses[gender]`; label "Gender" |
| Hispanic / Latino | `hispanicLatino` | select | **RG** · PII | `Yes`, `No`, `Decline to self-identify` | EEOC two-part question; label "Hispanic or Latino" |
| Race / Ethnicity | `raceEthnicity` | select | **RG** · PII | `Hispanic or Latino`, `White`, `Black or African American`, `Asian`, `Native Hawaiian or Other Pacific Islander`, `American Indian or Alaska Native`, `Two or More Races`, `Decline to self-identify` | GH demographic; Lever `eeoResponses[race]`; label "Race"/"Ethnicity" |
| Veteran status | `veteranStatus` | select | **RG** · PII | `I am not a protected veteran`, `I identify as one or more classifications of protected veteran`, `I prefer not to answer` | VEVRAA; label "veteran" |
| Disability status | `disabilityStatus` | select | **RG** · PII | `Yes, I have a disability (or previously had one)`, `No, I do not have a disability`, `I do not want to answer` | OFCCP Form CC-305 (OMB 1250-0005); label "disability" |

### Common Application Screeners
| Field Label | Canonical Key | Type | Flags | Option Values | ATS Mapping Clues |
| --- | --- | --- | --- | --- | --- |
| Years of experience with [X] | `yearsExperience` | select | AF | `0-1`, `1-2`, `2-3`, `3-5`, `5-7`, `7-10`, `10+` *(often a free numeric input)* | **Dynamic per role** — match by question text containing "years of experience"; store a default + allow per-app override |
| Highest education completed | `highestEducation` | select | AF | `High School / GED`, `Associate's`, `Bachelor's`, `Master's`, `Doctorate / PhD`, `Professional (JD/MD)`, `Other` | label "education"/"degree" |
| English proficiency | `englishProficiency` | select | AF | `Native / Bilingual`, `Full Professional`, `Professional Working`, `Limited Working`, `Elementary` | label "English proficiency" |
| How did you hear about us? | `howDidYouHear` | select | AF | `Company website`, `LinkedIn`, `Referral`, `Job board`, `Other` | **GH/Lever common** `name="source"` / label "how did you hear" |
| Referral name | `referralName` | text | AF | — | paired with `howDidYouHear = Referral` |

### Role-Specific / Free-Text (AI-drafted, review-gated)
| Field Label | Canonical Key | Type | Flags | Option Values | ATS Mapping Clues |
| --- | --- | --- | --- | --- | --- |
| Why this company? | `whyCompany` | textarea | **RG** | — | custom textarea; AI-drafted per-company, never auto-submitted |
| Why this role? | `whyRole` | textarea | **RG** | — | custom textarea; AI-drafted per-role |
| Additional information | `additionalInformation` | textarea | RG | — | **Lever `name="comments"`**; GH "Additional info"; label "anything else" |

\* **AF\*** (resume/cover-letter files): assisted, not silent — see §4 file-upload constraint.

---

## 3. JSON Schema Representation

The full importable schema is provided as a separate file: **`application_profile_schema.json`**. Drop it into the extension's background/service-worker storage init. `value` fields are empty, ready for you to populate on the Preferences page. Metadata (`type`, `pii`, `autoFill`, `reviewGate`, `options`, `atsMappings`) drives the content-script matcher and the backend `prepared_application_fields` mapping.

Structure overview:

```
{
  meta:        { version, targetPlatforms, alignsWith }
  reviewRules: { neverAutoSubmit[], stopConditions[], redactFromLogs[] }
  profile: {
    coreContact:           { firstName, lastName, fullName, email, phone, locationCity, locationState, locationCountry }
    professionalPresence:  { resumeFile, coverLetterFile, coverLetterText, linkedinUrl, githubUrl, portfolioUrl, upworkUrl, otherWebsiteUrl }
    workAuthorization:     { authorizedToWork, requiresSponsorshipNow, requiresSponsorshipFuture, noticePeriod, desiredSalary, salaryCurrency }
    demographicsEEO:       { gender, hispanicLatino, raceEthnicity, veteranStatus, disabilityStatus }
    screeners:             { yearsExperience, highestEducation, englishProficiency, howDidYouHear, referralName }
    roleSpecificFreeText:  { whyCompany, whyRole, additionalInformation }
  }
}
```

Each field node:

```json
{
  "label": "First name",
  "type": "text",
  "value": "",
  "pii": true,
  "autoFill": true,
  "reviewGate": false,
  "atsMappings": { "autocomplete": "given-name", "greenhouse": "first_name", "lever": "name", "ashby": "_systemfield_name" }
}
```

---

## 4. Implementation Risks & Mitigations

**1. Ashby is a React-controlled SPA — `input.value = x` will not work.** Setting `.value` directly bypasses React's synthetic event system; the field looks filled but state is empty and submit fails validation. **Mitigation:** use the native setter + dispatched event pattern —
```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
setter.call(input, value);
input.dispatchEvent(new Event("input",  { bubbles: true }));
input.dispatchEvent(new Event("change", { bubbles: true }));
input.dispatchEvent(new Event("blur",   { bubbles: true }));
```
Apply this for all three platforms — harmless on static forms, required on Ashby.

**2. Greenhouse has two generations.** Classic embeds inject the form inside an **iframe** (`#grnhse_app`) on the company's own careers domain; the newer hosted boards (`job-boards.greenhouse.io`) render inline. **Mitigation:** set `"all_frames": true` in the content-script manifest match and detect the Greenhouse iframe; resolve which generation you're on before matching.

**3. File inputs (resume/cover letter) cannot be populated by script for security.** `<input type="file">.value` is read-only by browser policy. **Mitigation:** attempt programmatic injection via the `DataTransfer` API (works on many forms) —
```js
const dt = new DataTransfer();
dt.items.add(new File([blob], "resume.pdf", { type: "application/pdf" }));
fileInput.files = dt.files;
fileInput.dispatchEvent(new Event("change", { bubbles: true }));
```
— but hardened forms still block it. Treat resume as **assisted**: if injection fails, highlight the upload control and prompt you to drop the file. Never claim a silent resume fill.

**4. Shadow DOM hides inputs from `document.querySelector`.** Some embeds wrap fields in a shadow root. **Mitigation:** the matcher must walk `element.shadowRoot` recursively (`open` roots only — `closed` roots are unreachable, so fall back to the human step).

**5. Custom questions are unpredictable.** Lever renders them as `cards[uuid][fieldN]`; Greenhouse as `question_xxxxx`; Ashby by dynamic `path`. Hard-coded selectors will not survive. **Mitigation:** this is the core reason for the **multi-signal matcher** — score candidates by (autocomplete token, then `name`/`id` regex, then `aria-label`, then nearest `<label>` text, then `placeholder`). Only fill above a confidence threshold; below it, mark `unknown_required_field` and stop for human input.

**6. Multi-step forms.** GH/Ashby/Lever are mostly single-page (low risk), but Ashby occasionally paginates and external Workday redirects are multi-step. **Mitigation:** fill per-rendered-step, never assume all fields exist at load; re-run the matcher on DOM mutation (`MutationObserver`) and on route change.

**7. Client validation rejects "untouched" fields.** Many forms validate only on blur/change. **Mitigation:** always dispatch `input → change → blur` (covered in #1) so the form registers the value as user-entered.

**8. Review-gated fields must hard-stop, not silently fill.** EEO, work authorization, sponsorship, salary, and legal attestations are `reviewGate=true`. **Mitigation:** the extension renders these with your stored standing answer pre-selected but **disabled from auto-submit** — it highlights them, waits for your explicit confirmation, and only then includes them in the submit. This is the single most important safety behavior and what keeps the extension defensible on the platforms (LinkedIn/Indeed/Workday) you can only touch in-session.

---

### Alignment notes (ties into existing architecture)
- `canonicalKey` → `prepared_application_fields.field_key`
- `pii` → `prepared_application_fields.redaction_safe`
- `reviewGate` → `prepared_application_fields.review_gate` (and enforces `is_sensitive ⇒ review_gate`)
- `reviewRules.stopConditions` → the Phase 4 extension hard-stop set
- `aiDrafted` fields → populated in Phase 5 (free-text drafting), always review-gated
