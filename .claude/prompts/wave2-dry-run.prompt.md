---
name: wave2-dry-run
description: "Run a Wave 2 orchestration dry-run to validate BA spec-lock, Ui-Ux handoff, Supabase-Security sign-off, and normal Wave 1 release gating behavior."
agent: Orchestrator
---
Run a Wave 2 delegation dry-run. Do not implement real code and do not modify files.

## Scenario A — Full Wave 2 + Wave 1 Path (PASS)

Invoke Orchestrator with this simulated intake:

```
task_id: DRY-RUN-201
objective: Add interview stage timeline card with event history
constraints: Preserve event-sourcing and user scoping rules
deadline: 2 days
risk_tolerance: low
```

Expected dispatch chain:
1. Orchestrator -> Business-Analyst (produce locked spec)
2. Orchestrator -> Ui-Ux (produce design handoff from locked spec)
3. Orchestrator -> Feature-Dev (simulate implementation packet)
4. Orchestrator -> Supabase-Security (simulate security sign-off)
5. Orchestrator -> Qa-Uat (simulate PASS evidence)
6. Orchestrator -> Release-Gate (aggregate evidence, emit PASS)

Confirm at every step:
- [ ] Correct payload contract passed
- [ ] Phase gate checked before advancing
- [ ] Hidden agents remain engine-room only
- [ ] Release-Gate remains terminal

---

## Scenario B — Security Block Path

Replay Scenario A but inject this Supabase-Security result:

```
security_verdict: HOLD
security_findings:
  - Missing user_id filter on applications query
  - Proposed client-side usage of SUPABASE_SERVICE_ROLE_KEY detected
```

Expected behavior:
1. Orchestrator receives HOLD from Supabase-Security
2. Orchestrator dispatches Feature-Dev once for remediation
3. Supabase-Security re-check still returns HOLD
4. Orchestrator escalates to JB and stops
5. Qa-Uat and Release-Gate are not invoked

Confirm:
- [ ] Retry occurs exactly once
- [ ] Escalation packet emitted after second HOLD
- [ ] No downstream dispatch post-escalation

---

## Validation Checklist

- [ ] Business-Analyst produced locked_spec before Ui-Ux/Feature-Dev dispatch
- [ ] Ui-Ux produced full state matrix (empty/loading/error/success)
- [ ] Supabase-Security checked RLS, user scoping, auth boundary, and secrets exposure
- [ ] Orchestrator performed no edit/execute actions
- [ ] Non-negotiables in CLAUDE.md were upheld in all simulated outputs
