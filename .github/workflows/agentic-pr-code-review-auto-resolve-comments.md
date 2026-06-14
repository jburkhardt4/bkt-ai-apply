---
name: Agentic - PR Code Review - Auto-Resolve Comments
description: Automatically resolves open PR code review comments by generating and pushing the necessary code fixes, then marking each resolved thread.
on:
  workflow_run:
    workflows: ["Agentic - PR Code Review - Auto-Resolve Comments"]
    types: [completed]
    branches: [main]
tools:
  github:
    toolsets: [default]
permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read
strict: true
safe-outputs:
  push-to-pull-request-branch:
    target: "triggering"
    if-no-changes: "warn"
    allowed-files:
      - "src/**"
      - "supabase/**"
      - "e2e/**"
      - "docs/**"
    excluded-files:
      - "**/*.lock"
      - "pnpm-lock.yaml"
  resolve-pull-request-review-thread:
    max: 25
  add-comment:
    max: 1
    target: "triggering"
# model: claude-sonnet-4.6
# require_actor_write_permission: true
---

# Agentic - PR Code Review - Auto-Resolve Comments

Analyze this pull request for any open code review comments, actionable suggestions, or feedback provided by any bots (like Copilot or Codex) or human reviewers.

  1. Fetch the context of the code diff for each open comment thread.
  2. Generate the necessary code changes to implement the requested improvements.
  3. Push the fixes directly to the head branch of this pull request.
  4. Once successfully pushed, mark the associated comment conversation threads as resolved for each comment.
  5. Then, make a final post confirming all review comments have been resolved from all code reviews, outline a succinctly articulated list of the comments that were resolved.

Do not attempt to merge the PR. Only apply fixes for comments that request clear, actionable code changes.
