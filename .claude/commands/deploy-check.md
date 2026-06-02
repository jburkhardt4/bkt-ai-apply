# /deploy-check

Run before any production deployment.

## Checklist
```bash
# 1. All tests pass
pnpm validate

# 2. No secrets in staged changes
git diff --staged | grep -iE "(api_key|secret|password|service_role)" && echo "BLOCKED: secret detected" || echo "Clean"

# 3. Migration files committed if schema changed
git status supabase/migrations/

# 4. Types are up to date
git diff src/types/db.types.ts

# 5. Edge Functions deployed if changed
supabase functions deploy [function-name]

# 6. Environment variables present in target environment
# Verify in Supabase dashboard → Settings → Edge Functions → Secrets
```

## Block deployment if:
- `pnpm validate` fails
- Any migration file not committed
- `db.types.ts` out of sync with schema
- Service role key visible anywhere in client bundle
