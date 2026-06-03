# BKT AI-Apply Agent Roster

## Wave Status

| Wave | Agents | Status |
| --- | --- | --- |
| Wave 1 | ORCHESTRATOR, FEATURE-DEV, QA-UAT, RELEASE-GATE | Active |
| Wave 2 | BUSINESS-ANALYST, UI-UX, SUPABASE-SECURITY | Active |
| Wave 3 | AI-INTEGRATIONS, CRITICAL-PATH, VERCEL, CONTEXT-KEEPER | Planned |

## Entry Points (Picker Visible)

- ORCHESTRATOR (active)
- BUSINESS-ANALYST (active)
- CONTEXT-KEEPER (planned)

## Engine Room (Hidden, Orchestrator-Callable)

- FEATURE-DEV (active)
- QA-UAT (active)
- RELEASE-GATE (active)
- UI-UX (active)
- AI-INTEGRATIONS (planned)
- SUPABASE-SECURITY (active)
- CRITICAL-PATH (planned)
- VERCEL (planned)

## Wave 1 Dispatch Graph

`ORCHESTRATOR -> FEATURE-DEV -> QA-UAT -> RELEASE-GATE`

## Wave 2 Dispatch Graph

`ORCHESTRATOR -> BUSINESS-ANALYST -> UI-UX -> FEATURE-DEV -> SUPABASE-SECURITY -> QA-UAT -> RELEASE-GATE`

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

1. FEATURE-DEV -> ORCHESTRATOR

- implementation_summary
- changed_files
- tests_run
- known_risks
- rollback_notes
- qa_focus_areas

1. ORCHESTRATOR -> QA-UAT

- feature_dev_packet
- acceptance_checklist

1. QA-UAT -> ORCHESTRATOR

- criteria_results
- command_results
- viewport_results
- defect_log
- qa_verdict

1. ORCHESTRATOR -> RELEASE-GATE

- qa_packet
- non_negotiables_checklist_status

1. RELEASE-GATE -> ORCHESTRATOR/JB

- release_verdict
- failed_gate_ids
- required_actions
- override_required_flag

## Wave 2 Handoff Contracts

1. ORCHESTRATOR -> BUSINESS-ANALYST

- task_id
- objective
- constraints
- success_criteria
- out_of_scope

1. BUSINESS-ANALYST -> ORCHESTRATOR

- requirements_summary
- user_stories
- acceptance_criteria
- assumptions
- locked_spec

1. ORCHESTRATOR -> UI-UX

- locked_spec
- ui_surfaces
- interaction_constraints

1. UI-UX -> ORCHESTRATOR

- design_summary
- state_coverage_matrix
- responsive_notes
- handoff_packet

1. ORCHESTRATOR -> SUPABASE-SECURITY

- implementation_packet
- schema_or_auth_change_summary
- secrets_impact

1. SUPABASE-SECURITY -> ORCHESTRATOR

- security_findings
- rls_checklist
- auth_boundary_status
- types_generation_status
- secrets_exposure_status
- security_verdict
