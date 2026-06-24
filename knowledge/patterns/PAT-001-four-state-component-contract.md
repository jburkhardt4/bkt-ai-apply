---
id: PAT-001
title: Four-state component contract
portability: portable
status: confirmed
tags: [ui, react, state-coverage, ux]
related: [ADR-017]
---

# PAT-001 — Four-state component contract

## Problem
Components that fetch or depend on async data routinely ship only the happy
("success") path. Loading flicker, blank screens on empty data, and silent
failures are the most common UX defects across all BKT surfaces.

## Pattern
Every data-bound component must explicitly handle **all four** states —
`loading`, `empty`, `error`, `success` — before it is considered done. This is a
review gate (the `emil-design-eng` / `ui-ux` agents enforce it) and applies in
every BKT repo, so it is `portable`.

## Example
```tsx
function JobList({ query }: { query: UseQueryResult<Job[]> }) {
  if (query.isLoading) return <ListSkeleton rows={5} />        // loading
  if (query.isError)   return <ErrorState onRetry={query.refetch} /> // error
  if (!query.data?.length) return <EmptyState label="No jobs yet" /> // empty
  return <ul>{query.data.map((j) => <JobRow key={j.id} job={j} />)}</ul> // success
}
```

## When not to use
Purely presentational components with no async/empty dimension (e.g. a static
`Badge`) only need `success`. Don't manufacture states that can't occur.
