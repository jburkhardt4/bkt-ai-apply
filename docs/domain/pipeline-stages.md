# Application Pipeline Stages

> Canonical reference for the application lifecycle. Referenced by `CLAUDE.md` → Key Reference Files.
> Stage logic lives in `src/features/applications/`; the transition writer is the single chokepoint
> that enforces event sourcing.

## Stages

```text
Discovery → Applied → Screening → Interview Scheduled → Interview Complete → Offer → Hired
                                                                                   ↘ Rejected
                                                                                   ↘ Ghosted
```

| Stage | Meaning | Typical entry trigger |
| --- | --- | --- |
| **Discovery** | Job found (crawler/corpus/prospector/SerpApi), not yet applied | Match scored, or user adds a job |
| **Applied** | Application submitted (auto or manual) | Auto-apply ≥ threshold, or manual submit |
| **Screening** | Recruiter/ATS screening in progress | Inbound email classified as screening |
| **Interview Scheduled** | Interview on the calendar | Calendar event detected/created |
| **Interview Complete** | Interview(s) finished | Calendar event passed / user marks done |
| **Offer** | Offer extended | Inbound email classified as offer |
| **Hired** | Offer accepted, role started | User confirmation |

### Terminal / off-ramp states

| State | Meaning |
| --- | --- |
| **Rejected** | Explicit rejection received |
| **Ghosted** | No response past the staleness window |

## Invariants

1. **Event sourcing (non-negotiable #4).** Every `applications.stage` change MUST write an
   `application_events` row. There is no code path that mutates stage without an event. Use the
   shared transition writer (e.g. `transition_stage`) — never an ad-hoc `update`.
2. **User scoping (non-negotiable #5).** Every stage query/transition filters by `user_id`.
3. **Forward + off-ramp only.** Stages advance through the chain or move to an off-ramp
   (Rejected/Ghosted). Reversals are exceptional and must themselves be event-logged.
4. **Autonomy.** Gmail/Calendar scrapers drive transitions via Edge Functions; the same event-sourced
   transition path is used whether the trigger is human or automated.

## Cross-references

- Business rules governing thresholds and entry gates: `docs/domain/business-rules.md` (e.g. BR-020 ≥60 pipeline entry).
- Auto-submission posture: `docs/adr/006-full-auto-submission.md`, `docs/adr/001-auto-apply-threshold.md`.
- Discovery sources (corpus/crawler/prospector): `docs/adr/014-shared-public-job-corpus.md`, `015-ats-crawler-and-indexing.md`, `016-consolidate-prospector-into-dashboard.md`.
- Schema: `docs/domain/data-model.md` and generated `src/types/db.types.ts`.
