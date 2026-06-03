---
name: wave1-dry-run
description: "Run a Wave 1 delegation dry-run to confirm ORCHESTRATOR dispatches correctly, gates block advancement on failure, and RELEASE-GATE is terminal."
agent: agent
---
Run a Wave 1 delegation dry-run. Do not implement any real code or modify any files. Use simulated inputs only.

## Scenario A — Happy Path (PASS)

Invoke the ORCHESTRATOR with this simulated intake:

```
task_id: DRY-RUN-001
objective: Add a loading skeleton to the ApplicationCard component
locked_scope: src/components/ApplicationCard.tsx only
acceptance_criteria:
  - Loading state renders a grey skeleton placeholder
  - pnpm validate exits clean
  - No any types introduced
constraints: No new dependencies
done_definition: QA-UAT PASS + RELEASE-GATE PASS
```

Expected delegation chain:
1. ORCHESTRATOR → FEATURE-DEV (receives intake packet above)
2. FEATURE-DEV → ORCHESTRATOR (returns simulated completion packet)
3. ORCHESTRATOR → QA-UAT (forwards packet + acceptance checklist)
4. QA-UAT → ORCHESTRATOR (returns simulated PASS evidence)
5. ORCHESTRATOR → RELEASE-GATE (forwards qa_packet)
6. RELEASE-GATE → JB (emits PASS verdict)

Confirm after each step:
- [ ] Correct agent was dispatched
- [ ] Correct handoff payload was passed
- [ ] Gate was evaluated before advancing
- [ ] RELEASE-GATE issued PASS and stopped — no further dispatch

---

## Scenario B — Failure Path (HOLD → Retry → Escalate)

Replay Scenario A but inject a simulated QA-UAT HOLD at step 4:

```
qa_verdict: HOLD
defect_log: pnpm test exits with 2 failures in ApplicationCard.test.tsx
```

Expected behaviour:
1. ORCHESTRATOR receives HOLD from QA-UAT
2. ORCHESTRATOR retries — dispatches FEATURE-DEV a second time with defect_log as context
3. Simulated second QA-UAT run still returns HOLD
4. ORCHESTRATOR escalates to JB — emits escalation packet and stops

Confirm:
- [ ] ORCHESTRATOR did NOT advance to RELEASE-GATE after first HOLD
- [ ] ORCHESTRATOR retried exactly once
- [ ] After second HOLD, ORCHESTRATOR emitted escalation packet — did not retry again
- [ ] RELEASE-GATE was NOT invoked at any point

---

## Validation Checklist

After both scenarios complete, confirm all of the following:

- [ ] ORCHESTRATOR used no edit or execute tools
- [ ] FEATURE-DEV used no agent tool (agents: [])
- [ ] QA-UAT used no edit tool and issued no release verdict
- [ ] RELEASE-GATE issued no downstream dispatch
- [ ] No agent violated a CLAUDE.md non-negotiable in its output
