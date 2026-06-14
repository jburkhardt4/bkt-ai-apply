<<<<<<< HEAD
- [Missing Convention Docs](project_missing_convention_docs.md) — component-patterns.md and golden-principles.md are listed in CLAUDE.md but do not exist on disk
- [SerpApi Integration](project_serpapi_integration.md) — SerpApi is the Prospector job discovery engine; prospector-cron Edge Function drafted and validated 2026-06-07
- [ProspectorSearchResults Table UI](project_prospector_table_ui.md) — dual-subtree responsive table pattern; sticky thead technique; NullCell; backend gap analysis; 2026-06-08
- [Match-Scoring Routing Conflict](project_match_scoring_routing_conflict.md) — match_scoring pins Opus 4.6 in ai-router/docs but Phase 2c runs Gemini Flash; cost-logging/AI-RULE-001 conflict needing JB sign-off
- [Match-Scoring Call-Site Map](project_match_scoring_callsite_map.md) — ingestionService.runScoreForJob is the real scoreJobFit→persistAiScore chokepoint (ProspectorDashboard + IngestionPage)
=======
# Orchestrator Memory Index

- [Missing referenced docs](project_missing_docs.md) — CLAUDE.md points at 4 docs that don't exist on disk; authoritative fallbacks so you don't needlessly HOLD.
- [Missing convention docs (superseded)](project_missing_convention_docs.md) — 2026-06-07 record, corrected: component-patterns.md now exists.
- [Doc path aliases](reference_doc_paths.md) — ADRs use numeric filenames not "ADR-NNN"; where canonical specs actually live.
- [Edge Function conventions](project_edge_function_conventions.md) — the LLM Edge Function pattern (ai-chat/factory) all new functions must mirror.
- [Validate gate setup](reference_validate_gate.md) — what `pnpm validate` runs + the e2e/playwright pitfalls (LSN-002/003).
- [SerpApi Integration](project_serpapi_integration.md) — SerpApi is the Prospector job discovery engine; prospector-cron drafted/validated 2026-06-07.
- [ProspectorSearchResults Table UI](project_prospector_table_ui.md) — dual-subtree responsive table pattern; sticky thead; 2026-06-08.
>>>>>>> 97bff41ca09250f8f86830d306fee1a56023eb08
