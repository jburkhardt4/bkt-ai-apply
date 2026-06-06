---
name: wave3-dry-run
description: "Run a Wave 3 orchestration dry-run to validate Ai-Integrations routing, Critical-Path sign-off, Vercel smoke-test gating, and Context-Keeper terminal behavior."
agent: Orchestrator
---

Run a Wave 3 delegation dry-run. Do not implement real code and do not modify files.

## Scenario A — AI Feature Path (PASS)

Invoke Orchestrator with this simulated intake:

```
task_id: DRY-RUN-301
objective: Add Gemini-powered company research endpoint to the AI agent feature
constraints: Must route through src/lib/ai-router.ts; no API keys in client bundle
deadline: 1 day
risk_tolerance: medium
```

Expected dispatch chain:

1. Orchestrator -> Ai-Integrations (implement AI feature)
2. Ai-Integrations -> Orchestrator (implementation packet)
3. Orchestrator -> Qa-Uat (validate)
4. Qa-Uat -> Orchestrator (PASS evidence)
5. Orchestrator -> Release-Gate (aggregate + emit verdict)

Confirm:

- [ ] Ai-Integrations routed to Gemini 2.5 Pro (matches model-routing.md: Research = Gemini 2.5 Pro)
- [ ] No API key or credential appeared in any changed file
- [ ] All model calls pass through `src/lib/ai-router.ts`
- [ ] Release-Gate emitted PASS and stopped — no further dispatch

---

## Scenario B — Critical Path Sign-Off Block (HOLD → Retry → Escalate)

Invoke Orchestrator with this simulated intake:

```
task_id: DRY-RUN-302
objective: Wire match scoring into the auto-apply submission flow
constraints: match_score >= 80 gate (BR-008) must be enforced before any submission
risk_tolerance: low
```

Expected dispatch chain:

1. Orchestrator -> Critical-Path (coordinate critical flow task)
2. Critical-Path -> Feature-Dev + Ai-Integrations (parallel implementation)
3. Critical-Path -> Supabase-Security (security check)
4. Critical-Path -> Qa-Uat (verify gate enforcement)

Inject this Critical-Path result after step 4:

```
sign_off_verdict: HOLD
blocking_issues:
  - match_score threshold gate missing from auto-apply submission handler
  - Submissions proceed regardless of score in current implementation
```

Expected behavior:

1. Orchestrator receives HOLD from Critical-Path
2. Orchestrator dispatches Feature-Dev once for remediation (retry #1)
3. Critical-Path re-evaluates — still returns HOLD (second attempt)
4. Orchestrator escalates to JB and stops
5. Qa-Uat and Release-Gate are not invoked

Confirm:

- [ ] Nothing shipped without Critical-Path explicit PASS
- [ ] Retry occurred exactly once
- [ ] Escalation packet emitted after second HOLD
- [ ] Qa-Uat and Release-Gate not invoked at any point

---

## Scenario C — Deploy Smoke Test Failure (HOLD)

Invoke Orchestrator with this simulated intake:

```
task_id: DRY-RUN-303
objective: Deploy release candidate RC-2026-06-03 to preview
qa_uat_pass_evidence: PASS (from prior Qa-Uat run)
security_pass_evidence: PASS (from Supabase-Security)
deploy_target: preview
```

Expected dispatch chain:

1. Orchestrator -> Vercel (deploy + smoke test)

Inject this Vercel result:

```
deploy_verdict: HOLD
smoke_test_results:
  - GET /dashboard -> 500 Internal Server Error
  - GET /applications -> 200 OK
preview_url: https://bkt-ai-apply-rc-abc123.vercel.app
```

Expected behavior:

1. Vercel emits HOLD with smoke test failure detail
2. Orchestrator receives HOLD — does NOT forward to Release-Gate
3. Orchestrator retries once (dispatches Vercel again)
4. Vercel second attempt still returns HOLD
5. Orchestrator escalates to JB with full deploy evidence

Confirm:

- [ ] Release-Gate was NOT invoked
- [ ] Retry occurred exactly once
- [ ] Escalation packet includes preview_url and smoke_test_results
- [ ] Production was not touched at any point

---

## Scenario D — Session Close / Context-Keeper Terminal

Invoke Context-Keeper directly (JB-triggered) with this simulated input:

```
confirmed_outcomes:
  - Feature DRY-RUN-301 shipped: Gemini research endpoint added to ai-agent feature
  - ADR decision: All research tasks route to Gemini 2.5 Pro (confirmed)
session_scope: Wave 3 dry-run validation session
new_adr_decisions:
  - ADR: Multi-model routing confirmed — Gemini 2.5 Pro for all company/market research
feature_register_updates:
  - ai-agent feature: research endpoint added 2026-06-03
```

Expected behavior:

1. Context-Keeper reads confirmed outcomes
2. Appends ADR entry to `docs/adr/` with ISO 8601 timestamp
3. Updates `docs/conventions/model-routing.md` with confirmed routing rule
4. Updates feature register
5. Returns summary of updated paths and stops — no further dispatch

Confirm:

- [ ] ADR entry is append-only (no existing entries overwritten)
- [ ] ISO 8601 timestamp present on ADR entry
- [ ] No source code files were edited
- [ ] No DB mutations performed
- [ ] Context-Keeper stopped after returning summary — no downstream dispatch

---

## Final Validation Checklist

- [ ] Ai-Integrations used no agent tool (agents: [])
- [ ] Critical-Path only delegated to Feature-Dev, Ai-Integrations, Supabase-Security, Qa-Uat
- [ ] Vercel used no edit tool and did not invoke Release-Gate directly
- [ ] Context-Keeper used no execute tool and issued no downstream dispatch
- [ ] Orchestrator used no edit or execute tools throughout all scenarios
- [ ] No CLAUDE.md non-negotiable was violated in any simulated output
