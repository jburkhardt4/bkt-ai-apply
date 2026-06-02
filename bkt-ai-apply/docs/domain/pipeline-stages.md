# Pipeline Stages — BKT AI-Apply

---

## Stage Definitions

| Stage | Code | Description | Entry Trigger |
|-------|------|-------------|---------------|
| Discovery | `discovery` | Job found, not yet applied | Manual add, auto-scrape |
| Applied | `applied` | Application submitted | Manual, auto-apply agent |
| Screening | `screening` | Initial HR/recruiter contact | Email detected, manual |
| Interview Scheduled | `interview_scheduled` | Interview confirmed with date | Email/calendar detected |
| Interview Complete | `interview_complete` | Interview occurred | Calendar event end, manual |
| Offer | `offer` | Offer letter received | Email detected, manual |
| Hired | `hired` | Offer accepted, position confirmed | Manual only |
| Rejected | `rejected` | Application declined | Email detected, manual |
| Ghosted | `ghosted` | No response >30 days after applied | Auto-aged, manual |

---

## Transition Map

```
                    ┌─────────────┐
                    │  DISCOVERY  │
                    └──────┬──────┘
                           │ apply
                    ┌──────▼──────┐
                    │   APPLIED   │◄─────────────────┐ re-engage
                    └──────┬──────┘                  │
              ┌────────────┤                         │
              │            │ contact                 │
              ▼            ▼                         │
          REJECTED     SCREENING                  GHOSTED
              ▲            │                         ▲
              │            │ schedule                │ >30 days
              │     ┌──────▼──────────┐              │
              │     │ INTERVIEW       │              │
              └─────│ SCHEDULED       ├──────────────┘
                    └──────┬──────────┘
                           │ interview occurs
                    ┌──────▼──────────┐
                    │ INTERVIEW       │
                    │ COMPLETE        │──── next round ──►INTERVIEW SCHEDULED
                    └──────┬──────────┘
                           │ offer
                    ┌──────▼──────┐
                    │    OFFER    │
                    └──────┬──────┘
                           │ accept
                    ┌──────▼──────┐
                    │   HIRED     │  (terminal)
                    └─────────────┘
```

---

## Auto-Transition Triggers

| Email Classification | Target Stage | Conditions |
|---------------------|--------------|------------|
| `screening` | `screening` | Current stage is `applied` |
| `interview_request` | `interview_scheduled` | Any active stage |
| `rejection` | `rejected` | Not `offer` or `hired` |
| `offer` | `offer` | Current stage is `interview_complete` |

| Calendar Event | Target Stage | Conditions |
|----------------|--------------|------------|
| Interview event (future) | `interview_scheduled` | If not already |
| Interview event (past) | `interview_complete` | Auto-age after event end |

| Time-based | Target Stage | Conditions |
|------------|--------------|------------|
| 30+ days since `applied`, no activity | `ghosted` | Nightly cron |

---

## UI Kanban Column Mapping
```
Column 1: Active Search    → discovery
Column 2: Applied          → applied + screening
Column 3: Interviewing     → interview_scheduled + interview_complete
Column 4: Decisions        → offer
Column 5: Closed           → hired + rejected + ghosted
```
