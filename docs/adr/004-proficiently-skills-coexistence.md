# ADR-004: Vendoring the Proficiently job-search skills (local-only subset, coexistence boundary)

- Status: Accepted
- Date: 2026-06-09
- Deciders: JB

## Context

JB asked to review and integrate the external Claude Code plugin
`github.com/proficientlyjobs/proficiently-claude-skills` (MIT, ~227★, v1.2.0) — a seven-skill
job-search suite (`setup`, `job-search`, `tailor-resume`, `cover-letter`, `network-scan`,
`apply`, `jobsearch-telegram`).

Review findings:

- Every "script" in the repo is a Markdown *instruction* file; there are no executables. The plugin
  manifests (`.claude-plugin/plugin.json`, `marketplace.json`) register no hooks, no MCP servers, and
  no auto-run commands, so installation executes nothing — skills act only when invoked.
- The suite is a self-contained, single-user, **local-filesystem** system: all state lives in
  `~/.proficiently/` (resume, preferences, profile, LinkedIn contacts, per-job folders). It has no
  knowledge of Supabase, RLS, `application_events`, `user_id` scoping, or the `ai-router` cost cap.
- `apply` performs browser form submission (Claude-in-Chrome, human-confirmed before every submit);
  `jobsearch-telegram` runs a long-lived `/loop` background process with a Telegram bot token that sends
  job/resume-excerpt data over Telegram's API.

This overlaps the app's own domain (`features/jobs`, `applications`, `documents`, `ai-agent`) but is
**architecturally incompatible at the data layer**: the skills will never write the app's audit trail,
respect RLS, or pass through the cost cap. Treating them as part of the application pipeline would violate
non-negotiables #1–#6 (CLAUDE.md). They are therefore adopted as **separate personal tooling**, not
application code — which is why this ADR exists.

## Decision

1. **Vendor a local-only subset via the existing `npx skills` mechanism.** Installed `setup`,
   `job-search`, `tailor-resume`, `cover-letter`, `network-scan` into `skills-lock.json` +
   `.agents/skills/<name>/` + `.claude/skills/<name>` symlinks — the same lockfile/symlink pattern as
   `supabase`/`emil-design-eng`. Repo-local and git-reviewable; the global plugin marketplace was not used.
2. **Exclude the elevated-risk skills.** `apply` (browser auto-submit) and `jobsearch-telegram`
   (background bot + third-party egress) were **not** installed. Each remains a future opt-in with its own
   review.
3. **Vendor `shared/` per skill.** The suite's `shared/references/*` and `shared/templates/profile.md` are
   referenced by relative path but live at the plugin root, which `npx skills add -s` does not pull. A copy
   of `shared/` was placed inside each vendored skill dir so references resolve with zero edits to the
   tracked `SKILL.md` files (lockfile `computedHash` values stay valid).
4. **Coexistence boundary (the core rule).** These skills are personal/dev tooling that operate only on
   `~/.proficiently/` (= `/home/codespace/.proficiently`, outside this repo). **They must never read or
   write application data** (Supabase tables, `application_events`, documents) directly. Any future flow
   that moves data between `~/.proficiently/` and the app must go through the normal pipeline (single
   client, RLS, event sourcing, `ai-router`) under its own ADR.
5. **Setup not auto-run.** `/proficiently:setup` ingests real PII (resume, LinkedIn contacts, work
   history). It was not executed; JB runs it himself when ready (see Consequences).

## Consequences

- **Prerequisite — Claude-in-Chrome.** `setup` is fully local, but `job-search`, `tailor-resume`,
  `cover-letter`, and `network-scan` use Claude-in-Chrome MCP tools to *read* public postings
  (hiring.cafe, employer careers pages) — read-only browsing, no submission. They are inert until the
  Claude-in-Chrome browser extension/MCP is configured; no such MCP is installed in this environment today.
- **Cosmetic `/proficiently:` references remain.** ~70 in-skill references use the `/proficiently:<skill>`
  slash form (a plugin-marketplace namespace we did not adopt). In the vendored model the skills are invoked
  by bare name (`setup`, `job-search`, …); the prefix is informational and was left as-is to avoid editing
  tracked files / breaking hashes. One reference (`job-search` → `/proficiently:apply`) points at the
  deliberately-excluded `apply` skill and is an intentional dead-end (apply manually or via the app).
- **No application impact.** No `src/`, schema, RLS, Edge Function, or `ai-router` changes; non-negotiables
  #1–#6 are untouched. The vendored skills add no token spend against the $75/mo cap (they are not wired to
  `ai-router`).
- **Maintenance.** `npx skills update` on these skills re-fetches the per-skill subtree and may drop the
  manually-vendored `shared/` copy; re-run the shared/ copy step after any update. Provenance: pinned to the
  `main` branch (v1.2.0) of `proficientlyjobs/proficiently-claude-skills`.
- **Onboarding path for JB.** Invoke the `setup` skill (writes only to `~/.proficiently/`), provide resume +
  preferences, optionally import LinkedIn contacts, and complete the work-history interview. Data stays
  local; nothing is uploaded.
