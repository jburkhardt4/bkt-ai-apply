---
name: match-scoring-callsite-map
description: The real keyword-scoring chokepoint is ingestionService.runScoreForJob (calls scoreJobFit → persistAiScore), used by ProspectorDashboard AND IngestionPage — not the two call sites the Phase 2c intake named
metadata:
  type: project
---

Where job-fit scoring actually happens (verified 2026-06-13, for Phase 2c LLM-scoring rewire):

- **`src/features/applications/services/ingestionService.ts` → `runScoreForJob({ userId, jobId, applicationId? })`** is the single chokepoint: it loads the job, calls `parseJobDescription` + `scoreJobFit(parsed, masterProfile)` (keyword heuristic in `pipelineService.ts`), then `persistAiScore`, then updates `applications.match_score`.
- Callers of `runScoreForJob`: `src/features/jobs/ProspectorDashboard.tsx` (~line 185, prospector unscored-jobs button) and `src/pages/IngestionPage.tsx` (~line 143). `useProspectorSearchResults.ts` does NOT call scoreJobFit directly.

**Why it matters:** The intake said to rewire `useProspectorSearchResults.ts` + `ProspectorDashboard.tsx`; the cleaner/correct seam is `runScoreForJob` itself — rewire once there (LLM primary via `score-job` Edge Function, keyword `scoreJobFit` fallback) and both UIs inherit it. `persistAiScore` input contract: `{ userId, jobId, match: MatchResult, reasoningTrace: Json, tokensIn, tokensOut, estimatedCostUsd, applicationId? }`.

**How to apply:** For Phase 2c client wiring, target `ingestionService.runScoreForJob` as the rewire point. `masterProfile` (in `src/features/applications/.../masterProfile.ts`) is the `CandidateProfile` source. See [[match-scoring-routing-conflict]].
