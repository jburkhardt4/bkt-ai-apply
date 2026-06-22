# Orchestrator Memory Index

- [Missing referenced docs](project_missing_docs.md) — CLAUDE.md points at docs that don't all exist on disk; authoritative fallbacks so you don't needlessly HOLD.
- [Missing convention docs (superseded)](project_missing_convention_docs.md) — 2026-06-07 record, corrected: component-patterns.md now exists.
- [Doc path aliases](reference_doc_paths.md) — ADRs use numeric filenames not "ADR-NNN"; where canonical specs actually live.
- [Edge Function conventions](project_edge_function_conventions.md) — the Deno edge-function pattern (import map, cron-auth, service client, `deno check`) all new functions mirror; they escape `tsc`/validate.
- [Validate gate setup](reference_validate_gate.md) — what `pnpm validate` runs + the e2e/playwright pitfalls (LSN-002/003).
- [SerpApi Integration](project_serpapi_integration.md) — SerpApi is the per-user Prospector discovery engine; prospector-cron drafted/validated 2026-06-07.
- [ProspectorSearchResults Table UI](project_prospector_table_ui.md) — dual-subtree responsive table pattern; sticky thead; 2026-06-08.
- [Match-Scoring Routing Conflict](project_match_scoring_routing_conflict.md) — match_scoring model pins differ between ai-router/docs and the running phase; AI-RULE-001 cost-logging conflict needing JB sign-off.
- [Match-Scoring Call-Site Map](project_match_scoring_callsite_map.md) — ingestionService.runScoreForJob is the scoreJobFit→persistAiScore chokepoint (ProspectorDashboard + IngestionPage).
- [Job corpus & ATS crawler](project_job_corpus_indexing.md) — shared `job_postings` corpus + GH/Lever/Ashby crawler (ADR-014/015); approved RLS exception; 3 migrations + crawl layer + 2 edge fns shipped & validated 2026-06-22 (PR #29), deploy JB-gated.
- [Crawl layer paths & RPCs](reference_crawl_layer.md) — where `_shared/crawl` + `crawler-*` edge fns live and the service-role ingest RPC contracts.
