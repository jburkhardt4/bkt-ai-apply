# BKT AI-Apply Agent Roster

## Wave Status
| Wave | Agents | Status |
|---|---|---|
| Wave 1 | ORCHESTRATOR, FEATURE-DEV, QA-UAT, RELEASE-GATE | Active |
| Wave 2 | BUSINESS-ANALYST, UI-UX, SUPABASE-SECURITY | Planned |
| Wave 3 | AI-INTEGRATIONS, CRITICAL-PATH, VERCEL, CONTEXT-KEEPER | Planned |

## Entry Points (Picker Visible)
- ORCHESTRATOR (active)
- BUSINESS-ANALYST (planned)
- CONTEXT-KEEPER (planned)

## Engine Room (Hidden, Orchestrator-Callable)
- FEATURE-DEV (active)
- QA-UAT (active)
- RELEASE-GATE (active)
- UI-UX (planned)
- AI-INTEGRATIONS (planned)
- SUPABASE-SECURITY (planned)
- CRITICAL-PATH (planned)
- VERCEL (planned)

## Wave 1 Dispatch Graph
`ORCHESTRATOR -> FEATURE-DEV -> QA-UAT -> RELEASE-GATE`

## Gate Policy
- Phase PASS is required before advancing.
- ORCHESTRATOR retries exactly once on failure.
- On second failure, ORCHESTRATOR escalates to JB.
- RELEASE-GATE is the terminal decision node.

## Wave 1 Handoff Contracts
1. ORCHESTRATOR -> FEATURE-DEV
- task_id
- objective
- locked_scope
- acceptance_criteria
- constraints
- done_definition

2. FEATURE-DEV -> ORCHESTRATOR
- implementation_summary
- changed_files
- tests_run
- known_risks
- rollback_notes
- qa_focus_areas

3. ORCHESTRATOR -> QA-UAT
- feature_dev_packet
- acceptance_checklist

4. QA-UAT -> ORCHESTRATOR
- criteria_results
- command_results
- viewport_results
- defect_log
- qa_verdict

5. ORCHESTRATOR -> RELEASE-GATE
- qa_packet
- non_negotiables_checklist_status

6. RELEASE-GATE -> ORCHESTRATOR/JB
- release_verdict
- failed_gate_ids
- required_actions
- override_required_flag
