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

## Knowledge Artifacts

Institutional memory lives in three append-only layers. Owned by Context-Keeper;
proposed by Business-Analyst and Supabase-Security. Agents cite IDs, never literals.

| Layer | File | Owner | Holds |
| --- | --- | --- | --- |
| Decisions | `docs/adr/NNN-*.md` | Context-Keeper | Architectural choices, ISO 8601 |
| Invariants | `docs/domain/business-rules.md` | Context-Keeper (BA/Security propose) | `BR-001`.. confirmed rules |
| Lessons | `docs/retro/lessons.md` | Context-Keeper | Every HOLD/BLOCK/escalation + root cause + prevention |

Shared protocol (Pre-Flight Reads, Lesson Capture, packet fields):
`docs/conventions/agent-protocol.md`.

## Learning Loop

Knowledge must flow back, not only forward:

```text
Pre-flight READ  ──►  any agent reads lessons + relevant ADRs/rules before
                      producing its plan; lists lessons_consulted
        │
        ▼
Work  ──►  on any HOLD/BLOCK/escalation, the failing agent emits a
           structured lesson_candidate in its packet
        │
        ▼
Capture ──►  Orchestrator collects lesson_candidates into the work ledger
        │
        ▼
Confirm ──►  on session close OR escalation-resolution, Context-Keeper
             appends confirmed lessons + promotes recurring ones to BR/ADR
```

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
- Every implementing/validating agent performs Pre-Flight Reads and reports `lessons_consulted`.
- Every HOLD/BLOCK/escalation emits a `lesson_candidate`.
- Release-Gate will not PASS a retried task whose lesson was not captured.
- Context-Keeper confirms lessons at session close or escalation resolution.

## Handoff Packet Convention

- Dispatch packets (`Orchestrator -> X`) carry a persistent `work_order` object so
  context is threaded, not re-derived at each handoff.
- Return packets (`X -> Orchestrator/JB`) append `lessons_consulted` and
  `lesson_candidates`. Context-Keeper instead returns `lessons_confirmed` and
  `promotions` (it confirms drafts; it does not draft).

## Wave 1 Handoff Contracts

### Orchestrator -> Feature-Dev

- work_order
- task_id
- objective
- locked_scope
- acceptance_criteria
- constraints
- done_definition

### Feature-Dev -> Orchestrator

- implementation_summary
- changed_files
- tests_run
- known_risks
- rollback_notes
- qa_focus_areas
- lessons_consulted
- lesson_candidates

### Orchestrator -> Qa-Uat

- work_order
- feature_dev_packet
- acceptance_checklist

### Qa-Uat -> Orchestrator

- criteria_results
- command_results
- viewport_results
- defect_log
- qa_verdict
- lessons_consulted
- lesson_candidates

### Orchestrator -> Release-Gate

- work_order
- qa_packet
- non_negotiables_checklist_status
- retry_occurred_flag

### Release-Gate -> Orchestrator/JB

- release_verdict
- failed_gate_ids
- required_actions
- override_required_flag
- lessons_consulted
- lesson_candidates

## Wave 2 Handoff Contracts

### Orchestrator -> Business-Analyst

- work_order
- task_id
- objective
- constraints
- success_criteria
- out_of_scope

### Business-Analyst -> Orchestrator

- requirements_summary
- user_stories
- acceptance_criteria
- scope_conflicts
- assumptions
- locked_spec
- lessons_consulted
- lesson_candidates

### Orchestrator -> Ui-Ux

- work_order
- locked_spec
- ui_surfaces
- interaction_constraints

### Ui-Ux -> Orchestrator

- design_summary
- state_coverage_matrix
- responsive_notes
- handoff_packet
- lessons_consulted
- lesson_candidates

### Orchestrator -> Supabase-Security

- work_order
- implementation_packet
- schema_or_auth_change_summary
- secrets_impact

### Supabase-Security -> Orchestrator

- security_findings
- rls_checklist
- auth_boundary_status
- types_generation_status
- secrets_exposure_status
- security_verdict
- lessons_consulted
- lesson_candidates

## Wave 3 Handoff Contracts

### Orchestrator -> Ai-Integrations

- work_order
- task_id
- objective
- task_type
- latency_budget
- model_preference
- acceptance_criteria

### Ai-Integrations -> Orchestrator

- implementation_summary
- changed_files
- model_routing_evidence
- latency_measurements
- known_risks
- qa_focus_areas
- lessons_consulted
- lesson_candidates

### Orchestrator -> Critical-Path

- work_order
- task_id
- critical_flow_scope
- acceptance_criteria
- risk_level

### Critical-Path -> Orchestrator

- coordination_summary
- sub_agent_results
- sign_off_verdict
- blocking_issues
- lessons_consulted
- lesson_candidates

### Orchestrator -> Vercel

- work_order
- deploy_target
- release_candidate_ref
- env_var_scope
- smoke_test_requirements
- qa_uat_pass_evidence
- security_pass_evidence

### Vercel -> Orchestrator

- deploy_summary
- preview_url
- smoke_test_results
- env_var_status
- deploy_verdict
- lessons_consulted
- lesson_candidates

### Orchestrator -> Context-Keeper

- work_order
- confirmed_outcomes
- session_scope
- new_adr_decisions
- feature_register_updates
- lesson_candidates

### Context-Keeper -> Orchestrator/JB

- updated_doc_paths
- appended_content_summaries
- lessons_confirmed
- promotions
- session_close_timestamp
