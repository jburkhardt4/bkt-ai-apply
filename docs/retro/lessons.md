# Lessons Register — BKT AI-Apply

> **Append-only.** One entry per confirmed failure, HOLD, BLOCK, escalation, or
> notable retry. Newest at top. Confirmed by **Context-Keeper only** — agents
> emit `lesson_candidate` drafts; they are not lessons until confirmed here.
> Never delete, reorder, or rewrite a confirmed lesson.
>
> A RESOLVED failure is a confirmed outcome — record it. Only unresolved,
> in-flight, or speculative items are excluded.
>
> When the same `root_cause`/`tags` recurs ≥ 2×, Context-Keeper promotes the
> lesson to a Business Rule (BR) or ADR and links it in `promoted_to`.

## Entry template

```text
## LSN-NNN — <short title>
- timestamp:      # ISO 8601, e.g. 2026-06-03T00:00:00Z
- task_id:
- trigger:        # what failed (gate, check, command)
- root_cause:     # why, 1-2 sentences, no blame
- prevention:     # the rule/check/step that would have caught it earlier
- tags: []        # rls|auth|routing|stage-events|threshold|deploy|types|process|...
- status:         # confirmed | superseded
- promoted_to:    # BR-xxx or ADR-xxx, if recurring
```

> Entries confirmed in the same session share a timestamp; that is expected.

---

## LSN-002 — `pnpm validate` was unsatisfiable

- timestamp: 2026-06-03T00:00:00Z
- task_id: HARDENING-001
- trigger: Qa-Uat "Required Checks" (`pnpm validate`, `pnpm test:e2e`) — command not found.
- root_cause: `package.json` defined only `dev/build/lint/preview`; the validation scripts every agent depends on were never wired, so "validate before done" could not run.
- prevention: Qa-Uat now HOLDs (never passes) when a required script is undefined, citing exact remediation. Scripts `typecheck`/`test`/`test:e2e`/`validate` were added.
- tags: [process, types, ci]
- status: confirmed
- promoted_to:

## LSN-001 — Auto-apply threshold had three conflicting values

- timestamp: 2026-06-03T00:00:00Z
- task_id: HARDENING-001
- trigger: the submission gate was specified as 80 (PROJECT_INSTRUCTIONS), 75 (masterProfile.ts, critical-path, wave3), and 60 (prd.md) at the same time.
- root_cause: the threshold was hardcoded as a literal in multiple places with no single source of truth, so independent edits drifted apart.
- prevention: one rule (BR-008 = 80); every agent and file cites the BR ID, never a literal. Business-Analyst now flags contradictory invariants in `scope_conflicts`.
- tags: [threshold, process]
- status: confirmed
- promoted_to: BR-008, ADR-001
