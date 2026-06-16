# Gap Log

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** ACTIVE — update as gaps are resolved
**locked_date:** 2026-06-03

---

## Open Gaps

| ID | Gap Description | Impact | Owner | Resolution Path | Status |
| --- | --- | --- | --- | --- | --- |
| GAP-001 | LinkedIn Jobs API access tier and rate limits not confirmed | May limit job ingestion volume from LinkedIn | JB | Confirm API tier before INT-003 implementation | OPEN |
| GAP-002 | Workday integration method not fully specified (OAuth vs. partner program) | Blocks INT-007 implementation | JB + Engineering | Review Workday developer docs; confirm eligibility | OPEN |
| GAP-003 | Indeed partner feed eligibility criteria not confirmed | May block INT-006 | JB | Apply for Indeed Publisher program if not already enrolled | OPEN |
| GAP-004 | `pnpm db:gen-types` target (local Supabase vs. hosted project) not specified | Blocks type generation workflow | Engineering | Confirm Supabase project URL and service role key availability in Codespaces | RESOLVED — Supabase project is configured; `pnpm db:gen-types` runs against `--linked` project |
| GAP-005 | RAG vector store implementation (F-POST-005) not designed | Post-MVP but no design exists to reference | Engineering | Defer to Post-MVP ADR | DEFERRED |
| GAP-006 | Stagehand integration design not documented | Post-MVP; no design exists | Engineering | Defer to Post-MVP ADR; no action in MVP | DEFERRED |
| GAP-007 | AI cost estimation accuracy for match scoring at 800 jobs/month | If estimates are off, cap may be hit early | Engineering | Instrument first 100 calls and recalibrate estimates in `05-ai-routing.md` | OPEN |
| GAP-008 | Google Calendar event-to-application matching strategy not specified | Risk of false matches or missed detections | Engineering | Define matching algorithm (company name + email domain heuristics) in architecture doc | OPEN |
| GAP-009 | PDF export library not selected for resume/cover letter | Blocks F-005 and F-006 implementation | Engineering | Evaluate: Puppeteer vs. react-pdf vs. server-side rendering | OPEN |
| GAP-010 | Greenhouse and Ashby API application submission paths not validated | May affect packet submission flow | JB + Engineering | Test against sandbox before MVP launch | OPEN |

---

## Resolved Gaps

| ID | Gap Description | Resolution | Resolved Date |
| --- | --- | --- | --- |
| GAP-RES-001 | ZipRecruiter integration scope unclear | Removed from MVP (SIGN-OFF-002) | 2026-06-03 |
| GAP-RES-002 | Browser automation MVP readiness | Stagehand deferred to Post-MVP; UITL gate adopted (SIGN-OFF-004) | 2026-06-03 |
| GAP-RES-003 | Match score threshold ambiguity | Thresholds locked: >=60 Consideration, >=80 Auto-Submit prep (SIGN-OFF-005) | 2026-06-03 |
| GAP-RES-004 | AI cost ceiling undefined | Hard cap set at $75/month (SIGN-OFF-001) | 2026-06-03 |
| GAP-RES-005 | External account setup policy undefined | Policy locked: query JB first; email [john@bktadvisory.com](mailto:john@bktadvisory.com) (SIGN-OFF-003) | 2026-06-03 |

---

## Scope Conflicts

| ID | Conflict | Resolution |
| --- | --- | --- |
| SC-001 | PRD Section 17 lists ZipRecruiter as integration; SIGN-OFF-002 removes it from MVP | SIGN-OFF-002 supersedes PRD Section 17 for MVP scope |
| SC-002 | PRD Section 6.3 references auto-apply workflow; SIGN-OFF-004 defers full automation | SIGN-OFF-004 supersedes for MVP; UITL gate is the approved MVP path |
| SC-003 | PRD Section 2.1 states >=60% threshold for submission; SIGN-OFF-005 creates two-tier threshold | SIGN-OFF-005 replaces single-threshold language; PRD §22 updated to reflect both tiers (>=60 Consideration, >=80 Auto-Submit prep) — resolved 2026-06-15 |
