---
name: missing-convention-docs
description: Two CLAUDE.md-referenced convention files do not exist — component-patterns.md and golden-principles.md — causing pre-flight read gaps
metadata:
  type: project
---

`docs/conventions/component-patterns.md`, `docs/conventions/golden-principles.md`, and `docs/conventions/error-handling.md` are listed in CLAUDE.md Key Reference Files but none of these files exist on disk (confirmed 2026-06-07).

**Why:** Files were added to the reference table before they were written. Any agent doing pre-flight reads for a component, design, or error-handling task will HOLD on these missing paths.

**How to apply:** On any task touching UI components, design patterns, or error handling conventions, note these files are absent. Do not HOLD the overall work order if the task does not require their specific content — but capture as a lesson_candidate and recommend Context-Keeper create stubs. Do not assume content from the filenames.

[[lsn-003-e2e-required]]
