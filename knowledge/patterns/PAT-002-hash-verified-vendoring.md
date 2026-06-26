---
id: PAT-002
title: Hash-verified flat-copy vendoring (hub → spoke)
portability: hub-only
status: confirmed
tags: [tooling, vendoring, ci, monorepo]
related: [PAT-001]
---

# PAT-002 — Hash-verified flat-copy vendoring

## Problem
Sharing assets (skills, agents, knowledge) across independently-deployed repos
can't rely on symlinks or a package registry: each repo is its own git root on
Vercel/Replit, and symlinks break in those checkouts. But blind copies silently
rot — a spoke's copy drifts from the hub and nobody notices.

## Pattern
Copy assets as **flat files**, and record a `sha256` per file in the spoke's
`skills-lock.json` (`sourceType: "local"`, hub SHA). A `--check` mode recomputes
hashes and fails on any mismatch (a hand-edited vendored file) or missing file.
Editing happens **only in the hub**; spokes re-sync. This is `hub-only` because
it documents this repo's own porting machinery (`scripts/sync-claude-kit.mjs`).

## Example
```bash
# vendor + record hashes
node scripts/sync-claude-kit.mjs --target ../bktAdvisory --profile full
# later, in CI or a spoke PR — fails (exit 1) if any vendored file drifted
node scripts/sync-claude-kit.mjs --target ../bktAdvisory --check
```

## When not to use
When both ends share one deploy/git root (a true monorepo), prefer a workspace
package or symlink — the hash dance is overhead you don't need.
