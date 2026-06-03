# BKT AI-Apply Agent Roster

## Wave Status

| Wave | Agents | Status |
| --- | --- | --- |
| Wave 1 | ORCHESTRATOR, FEATURE-DEV, QA-UAT, RELEASE-GATE | Active |
| Wave 2 | BUSINESS-ANALYST, UI-UX, SUPABASE-SECURITY | Active |
| Wave 3 | AI-INTEGRATIONS, CRITICAL-PATH, VERCEL, CONTEXT-KEEPER | Active |

## Entry Points (Picker Visible)

- ORCHESTRATOR (active)
- BUSINESS-ANALYST (active)
- CONTEXT-KEEPER (active)

## Engine Room (Hidden, Orchestrator-Callable)

- FEATURE-DEV (active)
- QA-UAT (active)
- RELEASE-GATE (active)
- UI-UX (active)
- AI-INTEGRATIONS (active)
- SUPABASE-SECURITY (active)
- CRITICAL-PATH (active)
- VERCEL (active)

## Wave 1 Dispatch Graph

`ORCHESTRATOR -> FEATURE-DEV -> QA-UAT -> RELEASE-GATE`

## Wave 2 Dispatch Graph

`ORCHESTRATOR -> BUSINESS-ANALYST -> UI-UX -> FEATURE-DEV -> SUPABASE-SECURITY -> QA-UAT -> RELEASE-GATE`

## Wave 3 Dispatch Graphs

- AI feature path: `ORCHESTRATOR -> AI-INTEGRATIONS -> QA-UAT -> RELEASE-GATE`
- Critical path: `ORCHESTRATOR -> CRITICAL-PATH -> [FEATURE-DEV | AI-INTEGRATIONS | SUPABASE-SECURITY] -> QA-UAT -> RELEASE-GATE`
- Deploy path: `ORCHESTRATOR -> VERCEL -> RELEASE-GATE`
- Session close: `ORCHESTRATOR -> CONTEXT-KEEPER` (terminal)

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

## Wave 3 Handoff Contracts

1. ORCHESTRATOR -> AI-INTEGRATIONS

- task_id
- objective
- task_type
- latency_budget
- model_preference
- acceptance_criteria

1. AI-INTEGRATIONS -> ORCHESTRATOR

- implementation_summary
- changed_files
- model_routing_evidence
- latency_measurements
- known_risks
- qa_focus_areas

1. ORCHESTRATOR -> CRITICAL-PATH

- task_id
- critical_flow_scope
- acceptance_criteria
- risk_level

1. CRITICAL-PATH -> ORCHESTRATOR

- coordination_summary
- sub_agent_results
- sign_off_verdict
- blocking_issues

1. ORCHESTRATOR -> VERCEL

- deploy_target
- release_candidate_ref
- env_var_scope
- smoke_test_requirements
- qa_uat_pass_evidence
- security_pass_evidence

1. VERCEL -> ORCHESTRATOR

- deploy_summary
- preview_url
- smoke_test_results
- env_var_status
- deploy_verdict

1. ORCHESTRATOR -> CONTEXT-KEEPER

- confirmed_outcomes
- session_scope
- new_adr_decisions
- feature_register_updates

1. CONTEXT-KEEPER -> ORCHESTRATOR/JB

- updated_doc_paths
- appended_content_summaries
- session_close_timestamp
