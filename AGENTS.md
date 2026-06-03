# BKT AI-Apply Agent Roster

## Wave Status

| Wave | Agents | Status |
| --- | --- | --- |
| Wave 1 | Orchestrator, Feature-Dev, Qa-Uat, Release-Gate | Active |
| Wave 2 | Business-Analyst, Ui-Ux, Supabase-Security | Active |
| Wave 3 | Ai-Integrations, Critical-Path, Vercel, Context-Keeper | Active |

## Entry Points (Picker Visible)

- Orchestrator (active)
- Business-Analyst (active)
- Context-Keeper (active)

## Engine Room (Hidden, Orchestrator-Callable)

- Feature-Dev (active)
- Qa-Uat (active)
- Release-Gate (active)
- Ui-Ux (active)
- Ai-Integrations (active)
- Supabase-Security (active)
- Critical-Path (active)
- Vercel (active)

## Wave 1 Dispatch Graph

`Orchestrator -> Feature-Dev -> Qa-Uat -> Release-Gate`

## Wave 2 Dispatch Graph

`Orchestrator -> Business-Analyst -> Ui-Ux -> Feature-Dev -> Supabase-Security -> Qa-Uat -> Release-Gate`

## Wave 3 Dispatch Graphs

- AI feature path: `Orchestrator -> Ai-Integrations -> Qa-Uat -> Release-Gate`
- Critical path: `Orchestrator -> Critical-Path -> [Feature-Dev | Ai-Integrations | Supabase-Security] -> Qa-Uat -> Release-Gate`
- Deploy path: `Orchestrator -> Vercel -> Release-Gate`
- Session close: `Orchestrator -> Context-Keeper` (terminal)

## Gate Policy

- Phase PASS is required before advancing.
- Orchestrator retries exactly once on failure.
- On second failure, Orchestrator escalates to JB.
- Release-Gate is the terminal decision node.

## Wave 1 Handoff Contracts

1. Orchestrator -> Feature-Dev

- task_id
- objective
- locked_scope
- acceptance_criteria
- constraints
- done_definition

1. Feature-Dev -> Orchestrator

- implementation_summary
- changed_files
- tests_run
- known_risks
- rollback_notes
- qa_focus_areas

1. Orchestrator -> Qa-Uat

- feature_dev_packet
- acceptance_checklist

1. Qa-Uat -> Orchestrator

- criteria_results
- command_results
- viewport_results
- defect_log
- qa_verdict

1. Orchestrator -> Release-Gate

- qa_packet
- non_negotiables_checklist_status

1. Release-Gate -> Orchestrator/JB

- release_verdict
- failed_gate_ids
- required_actions
- override_required_flag

## Wave 2 Handoff Contracts

1. Orchestrator -> Business-Analyst

- task_id
- objective
- constraints
- success_criteria
- out_of_scope

1. Business-Analyst -> Orchestrator

- requirements_summary
- user_stories
- acceptance_criteria
- assumptions
- locked_spec

1. Orchestrator -> Ui-Ux

- locked_spec
- ui_surfaces
- interaction_constraints

1. Ui-Ux -> Orchestrator

- design_summary
- state_coverage_matrix
- responsive_notes
- handoff_packet

1. Orchestrator -> Supabase-Security

- implementation_packet
- schema_or_auth_change_summary
- secrets_impact

1. Supabase-Security -> Orchestrator

- security_findings
- rls_checklist
- auth_boundary_status
- types_generation_status
- secrets_exposure_status
- security_verdict

## Wave 3 Handoff Contracts

1. Orchestrator -> Ai-Integrations

- task_id
- objective
- task_type
- latency_budget
- model_preference
- acceptance_criteria

1. Ai-Integrations -> Orchestrator

- implementation_summary
- changed_files
- model_routing_evidence
- latency_measurements
- known_risks
- qa_focus_areas

1. Orchestrator -> Critical-Path

- task_id
- critical_flow_scope
- acceptance_criteria
- risk_level

1. Critical-Path -> Orchestrator

- coordination_summary
- sub_agent_results
- sign_off_verdict
- blocking_issues

1. Orchestrator -> Vercel

- deploy_target
- release_candidate_ref
- env_var_scope
- smoke_test_requirements
- qa_uat_pass_evidence
- security_pass_evidence

1. Vercel -> Orchestrator

- deploy_summary
- preview_url
- smoke_test_results
- env_var_status
- deploy_verdict

1. Orchestrator -> Context-Keeper

- confirmed_outcomes
- session_scope
- new_adr_decisions
- feature_register_updates

1. Context-Keeper -> Orchestrator/JB

- updated_doc_paths
- appended_content_summaries
- session_close_timestamp
