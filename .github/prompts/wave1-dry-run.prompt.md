---
name: wave1-dry-run
description: "Run a Wave 1 delegation dry-run to confirm Orchestrator dispatches correctly, gates block advancement on failure, and Release-Gate is terminal."
agent: agent
---
Run a Wave 1 delegation dry-run. Do not implement any real code or modify any files. Use simulated inputs only.

## Scenario A — Happy Path (PASS)

Invoke the Orchestrator with this simulated intake:

```
task_id: DRY-RUN-001
objective: Add a loading skeleton to the ApplicationCard component
locked_scope: src/components/ApplicationCard.tsx only
acceptance_criteria:
  - Loading state renders a grey skeleton placeholder
  - pnpm validate exits clean
  - No any types introduced
constraints: No new dependencies
done_definition: Qa-Uat PASS + Release-Gate PASS
```

Expected delegation chain:
1. Orchestrator → Feature-Dev (receives intake packet above)
2. Feature-Dev → Orchestrator (returns simulated completion packet)
3. Orchestrator → Qa-Uat (forwards packet + acceptance checklist)
4. Qa-Uat → Orchestrator (returns simulated PASS evidence)
5. Orchestrator → Release-Gate (forwards qa_packet)
6. Release-Gate → JB (emits PASS verdict)

Confirm after each step:
- [ ] Correct agent was dispatched
- [ ] Correct handoff payload was passed
- [ ] Gate was evaluated before advancing
- [ ] Release-Gate issued PASS and stopped — no further dispatch

---

## Scenario B — Failure Path (HOLD → Retry → Escalate)

Replay Scenario A but inject a simulated Qa-Uat HOLD at step 4:

```
qa_verdict: HOLD
defect_log: pnpm test exits with 2 failures in ApplicationCard.test.tsx
```

Expected behaviour:
1. Orchestrator receives HOLD from Qa-Uat
2. Orchestrator retries — dispatches Feature-Dev a second time with defect_log as context
3. Simulated second Qa-Uat run still returns HOLD
4. Orchestrator escalates to JB — emits escalation packet and stops

Confirm:
- [ ] Orchestrator did NOT advance to Release-Gate after first HOLD
- [ ] Orchestrator retried exactly once
- [ ] After second HOLD, Orchestrator emitted escalation packet — did not retry again
- [ ] Release-Gate was NOT invoked at any point

---

## Validation Checklist

After both scenarios complete, confirm all of the following:

- [ ] Orchestrator used no edit or execute tools
- [ ] Feature-Dev used no agent tool (agents: [])
- [ ] Qa-Uat used no edit tool and issued no release verdict
- [ ] Release-Gate issued no downstream dispatch
- [ ] No agent violated a CLAUDE.md non-negotiable in its output
