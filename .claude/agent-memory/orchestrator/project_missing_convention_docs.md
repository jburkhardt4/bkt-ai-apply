---
name: missing-convention-docs
description: Two CLAUDE.md-referenced convention files do not exist — component-patterns.md and golden-principles.md — causing pre-flight read gaps
metadata:
  type: project
---

`docs/conventions/component-patterns.md` and `docs/conventions/golden-principles.md` are listed in CLAUDE.md Key Reference Files but neither file exists on disk (confirmed 2026-06-07).

**Why:** Files were added to the reference table before they were written. Any agent doing pre-flight reads for a component or design task will HOLD on these missing paths.

**How to apply:** On any task touching UI components or design patterns, note these files are absent. Do not HOLD the overall work order if the task does not require their content — but capture as a lesson_candidate and recommend Context-Keeper create stubs. Do not assume content from the filenames.

[[lsn-003-e2e-required]]
