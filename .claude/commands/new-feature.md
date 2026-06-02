# /new-feature [feature-name]

Scaffold a new feature slice.

## Steps
1. Create directory: `src/features/[feature-name]/`
2. Create files:
   - `index.ts` — public exports
   - `[FeatureName]Page.tsx` — thin route shell
   - `components/` — presentational components
   - `hooks/use[FeatureName].ts` — Supabase query + Realtime
   - `types.ts` — feature-local types
3. Add route to router
4. Wrap page in `<ErrorBoundary>`
5. Write at least one hook test before marking complete

## Constraints
- components/ → zero Supabase calls
- hooks/ → all data fetching + mutations
- No business logic in page components
- See `docs/conventions/component-patterns.md` for hook templates
