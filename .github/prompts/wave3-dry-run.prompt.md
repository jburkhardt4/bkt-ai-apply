---
name: wave3-dry-run
description: "Run a Wave 3 orchestration dry-run to validate AI-INTEGRATIONS routing, CRITICAL-PATH sign-off, VERCEL smoke-test gating, and CONTEXT-KEEPER terminal behavior."
agent: agent
---

Run a Wave 3 delegation dry-run. Do not implement real code and do not modify files.

## Scenario A — AI Feature Path (PASS)

Invoke ORCHESTRATOR with this simulated intake:

```
task_id: DRY-RUN-301
objective: Add Gemini-powered company research endpoint to the AI agent feature
constraints: Must route through src/lib/ai-router.ts; no API keys in client bundle
deadline: 1 day
risk_tolerance: medium
```

Expected dispatch chain:

1. ORCHESTRATOR -> AI-INTEGRATIONS (implement AI feature)
2. AI-INTEGRATIONS -> ORCHESTRATOR (implementation packet)
3. ORCHESTRATOR -> QA-UAT (validate)
4. QA-UAT -> ORCHESTRATOR (PASS evidence)
5. ORCHESTRATOR -> RELEASE-GATE (aggregate + emit verdict)

Confirm:

- [ ] AI-INTEGRATIONS routed to Gemini 2.5 Pro (matches model-routing.md: Research = Gemini 2.5 Pro)
- [ ] No API key or credential appeared in any changed file
- [ ] All model calls pass through `src/lib/ai-router.ts`
- [ ] RELEASE-GATE emitted PASS and stopped — no further dispatch

---

## Scenario B — Critical Path Sign-Off Block (HOLD → Retry → Escalate)

Invoke ORCHESTRATOR with this simulated intake:

```
task_id: DRY-RUN-302
objective: Wire match scoring into the auto-apply submission flow
constraints: match_score >= 75 gate must be enforced before any submission
risk_tolerance: low
```

Expected dispatch chain:

1. ORCHESTRATOR -> CRITICAL-PATH (coordinate critical flow task)
2. CRITICAL-PATH -> FEATURE-DEV + AI-INTEGRATIONS (parallel implementation)
3. CRITICAL-PATH -> SUPABASE-SECURITY (security check)
4. CRITICAL-PATH -> QA-UAT (verify gate enforcement)

Inject this CRITICAL-PATH result after step 4:

```
sign_off_verdict: HOLD
blocking_issues:
  - match_score threshold gate missing from auto-apply submission handler
  - Submissions proceed regardless of score in current implementation
```

Expected behavior:

1. ORCHESTRATOR receives HOLD from CRITICAL-PATH
2. ORCHESTRATOR dispatches FEATURE-DEV once for remediation (retry #1)
3. CRITICAL-PATH re-evaluates — still returns HOLD (second attempt)
4. ORCHESTRATOR escalates to JB and stops
5. QA-UAT and RELEASE-GATE are not invoked

Confirm:

- [ ] Nothing shipped without CRITICAL-PATH explicit PASS
- [ ] Retry occurred exactly once
- [ ] Escalation packet emitted after second HOLD
- [ ] QA-UAT and RELEASE-GATE not invoked at any point

---

## Scenario C — Deploy Smoke Test Failure (HOLD)

Invoke ORCHESTRATOR with this simulated intake:

```
task_id: DRY-RUN-303
objective: Deploy release candidate RC-2026-06-03 to preview
qa_uat_pass_evidence: PASS (from prior QA-UAT run)
security_pass_evidence: PASS (from SUPABASE-SECURITY)
deploy_target: preview
```

Expected dispatch chain:

1. ORCHESTRATOR -> VERCEL (deploy + smoke test)

Inject this VERCEL result:

```
deploy_verdict: HOLD
smoke_test_results:
  - GET /dashboard -> 500 Internal Server Error
  - GET /applications -> 200 OK
preview_url: https://bkt-ai-apply-rc-abc123.vercel.app
```

Expected behavior:

1. VERCEL emits HOLD with smoke test failure detail
2. ORCHESTRATOR receives HOLD — does NOT forward to RELEASE-GATE
3. ORCHESTRATOR retries once (dispatches VERCEL again)
4. VERCEL second attempt still returns HOLD
5. ORCHESTRATOR escalates to JB with full deploy evidence

Confirm:

- [ ] RELEASE-GATE was NOT invoked
- [ ] Retry occurred exactly once
- [ ] Escalation packet includes preview_url and smoke_test_results
- [ ] Production was not touched at any point

---

## Scenario D — Session Close / CONTEXT-KEEPER Terminal

Invoke CONTEXT-KEEPER directly (JB-triggered) with this simulated input:

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

1. CONTEXT-KEEPER reads confirmed outcomes
2. Appends ADR entry to `docs/adr/` with ISO 8601 timestamp
3. Updates `docs/conventions/model-routing.md` with confirmed routing rule
4. Updates feature register
5. Returns summary of updated paths and stops — no further dispatch

Confirm:

- [ ] ADR entry is append-only (no existing entries overwritten)
- [ ] ISO 8601 timestamp present on ADR entry
- [ ] No source code files were edited
- [ ] No DB mutations performed
- [ ] CONTEXT-KEEPER stopped after returning summary — no downstream dispatch

---

## Final Validation Checklist

- [ ] AI-INTEGRATIONS used no agent tool (agents: [])
- [ ] CRITICAL-PATH only delegated to FEATURE-DEV, AI-INTEGRATIONS, SUPABASE-SECURITY, QA-UAT
- [ ] VERCEL used no edit tool and did not invoke RELEASE-GATE directly
- [ ] CONTEXT-KEEPER used no execute tool and issued no downstream dispatch
- [ ] ORCHESTRATOR used no edit or execute tools throughout all scenarios
- [ ] No CLAUDE.md non-negotiable was violated in any simulated output
