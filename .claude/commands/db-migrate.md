# /db-migrate

Use when making schema changes.

## Steps
```bash
# 1. Generate migration diff from current schema changes
supabase db diff --schema public > supabase/migrations/$(date +%Y%m%d%H%M%S)_[describe_change].sql

# 2. Review the generated SQL — check for unintended drops
cat supabase/migrations/[new_file].sql

# 3. Validate locally
supabase db reset --local

# 4. Regenerate TypeScript types
pnpm db:gen-types

# 5. Run test suite
pnpm validate

# 6. Commit migration + updated types together (never separately)
git add supabase/migrations/ src/types/db.types.ts
git commit -m "db: [describe change]"
```

## Rules
- Migration files are committed before any app code that depends on them
- Never edit an existing migration file — create a new one
- Never run `supabase db push` to production without local validation passing
