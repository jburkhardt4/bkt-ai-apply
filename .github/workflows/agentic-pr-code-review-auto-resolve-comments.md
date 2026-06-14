---
tools:
  github:
    toolsets: [default]
permissions:
  actions: read
  contents: write
  issues: write
  pull-requests: write
# Unsupported fields preserved from source JSON:
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
