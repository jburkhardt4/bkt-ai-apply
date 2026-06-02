# Auth & RLS — BKT AI-Apply

---

## Auth Strategy
- Provider: Supabase Auth (email/password + Google OAuth)
- Session: JWT stored in localStorage via Supabase client
- Auth context: `src/contexts/AuthContext.tsx` — single source of truth
- Protected routes: checked at router level, not in components

---

## RLS Policy Pattern

All user-scoped tables follow the same four-policy pattern:

```sql
-- Enable RLS (always)
alter table [table_name] enable row level security;

-- SELECT: own rows only
create policy "[table]_select_own"
  on [table_name] for select
  using (auth.uid() = user_id);

-- INSERT: own rows only, user_id must match auth context
create policy "[table]_insert_own"
  on [table_name] for insert
  with check (auth.uid() = user_id);

-- UPDATE: own rows only
create policy "[table]_update_own"
  on [table_name] for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: own rows only
create policy "[table]_delete_own"
  on [table_name] for delete
  using (auth.uid() = user_id);
```

Apply to: `companies`, `jobs`, `applications`, `application_events`,
`documents`, `email_events`, `interviews`, `user_profiles`

---

## Service Role Usage (Edge Functions Only)

Edge Functions that process inbound webhooks use the service role to bypass RLS.
These functions MUST:
1. Validate HMAC signature before any DB operation
2. Extract `user_id` from the validated payload (never trust client-supplied user_id in webhook body alone)
3. Use service role only for the minimum required operation

```typescript
// supabase/functions/_shared/auth.ts
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}
```

---

## Auth Flow
```
User visits app
  → Supabase checks existing session
  → Valid: load AuthContext with user
  → Invalid/expired: redirect to /login
  → Post-auth: redirect to /dashboard
  → First login: create user_profiles row (trigger or app logic)
```

---

## Google OAuth Scope Requirements
For Gmail + Calendar integration:
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.readonly
```
These scopes are for the background scraper service account, not the end user's
Supabase Auth session. Stored as refresh token in env vars.

---

## Common RLS Pitfalls to Avoid
- Never use `auth.uid()` in Edge Functions — use service role + explicit user_id
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client bundle (Vite will include anything prefixed without VITE_)
- application_events has no DELETE policy by design — rows are permanent audit trail
- Joining across tables in queries: RLS is enforced per-table; joins do not bypass it
