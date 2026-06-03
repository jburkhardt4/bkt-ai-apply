---
name: wave2-dry-run
description: "Run a Wave 2 orchestration dry-run to validate BA spec-lock, UI-UX handoff, SUPABASE-SECURITY sign-off, and normal Wave 1 release gating behavior."
agent: agent
---
Run a Wave 2 delegation dry-run. Do not implement real code and do not modify files.

## Scenario A — Full Wave 2 + Wave 1 Path (PASS)

Invoke ORCHESTRATOR with this simulated intake:

```
task_id: DRY-RUN-201
objective: Add interview stage timeline card with event history
constraints: Preserve event-sourcing and user scoping rules
deadline: 2 days
risk_tolerance: low
```

Expected dispatch chain:
1. ORCHESTRATOR -> BUSINESS-ANALYST (produce locked spec)
2. ORCHESTRATOR -> UI-UX (produce design handoff from locked spec)
3. ORCHESTRATOR -> FEATURE-DEV (simulate implementation packet)
4. ORCHESTRATOR -> SUPABASE-SECURITY (simulate security sign-off)
5. ORCHESTRATOR -> QA-UAT (simulate PASS evidence)
6. ORCHESTRATOR -> RELEASE-GATE (aggregate evidence, emit PASS)

Confirm at every step:
- [ ] Correct payload contract passed
- [ ] Phase gate checked before advancing
- [ ] Hidden agents remain engine-room only
- [ ] RELEASE-GATE remains terminal

---

## Scenario B — Security Block Path

Replay Scenario A but inject this SUPABASE-SECURITY result:

```
security_verdict: HOLD
security_findings:
  - Missing user_id filter on applications query
  - Proposed client-side usage of SUPABASE_SERVICE_ROLE_KEY detected
```

Expected behavior:
1. ORCHESTRATOR receives HOLD from SUPABASE-SECURITY
2. ORCHESTRATOR dispatches FEATURE-DEV once for remediation
3. SUPABASE-SECURITY re-check still returns HOLD
4. ORCHESTRATOR escalates to JB and stops
5. QA-UAT and RELEASE-GATE are not invoked

Confirm:
- [ ] Retry occurs exactly once
- [ ] Escalation packet emitted after second HOLD
- [ ] No downstream dispatch post-escalation

---

## Validation Checklist

- [ ] BUSINESS-ANALYST produced locked_spec before UI-UX/FEATURE-DEV dispatch
- [ ] UI-UX produced full state matrix (empty/loading/error/success)
- [ ] SUPABASE-SECURITY checked RLS, user scoping, auth boundary, and secrets exposure
- [ ] ORCHESTRATOR performed no edit/execute actions
- [ ] Non-negotiables in CLAUDE.md were upheld in all simulated outputs
