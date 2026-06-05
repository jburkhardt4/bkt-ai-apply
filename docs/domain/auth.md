# Auth — Boundaries, RLS Patterns & Security Checklist

**Owner:** Context-Keeper
**Status:** LIVING DOCUMENT — append only; never delete; supersede with explicit note
**last_updated:** 2026-06-03T00:00:00Z

---

## 1. Auth Boundary

Auth state is owned exclusively by `src/contexts/AuthContext.tsx`.

- No component, hook, feature module, or service may call
  `supabase.auth.*` directly.
- Components read auth state via the `useAuth()` hook exposed by `AuthContext`.
- Session tokens are managed by the Supabase Auth client internally;
  never extract, clone, or persist the session object outside `AuthContext`.

**Business rule:** BR-008 — `src/contexts/AuthContext.tsx` is the sole auth state owner.

---

## 2. Supabase Client Boundary

All database and storage access goes through the single client instance in
`src/lib/supabase.ts`.

- Import `getSupabaseClient()` (or `getSupabaseClientSafe()` for unconfigured
  environments) — never call `createClient()` elsewhere.
- The client is initialised with the public `VITE_SUPABASE_ANON_KEY`; RLS
  enforces all access control at the database layer.
- Creating a second client instance (e.g., inside a feature module) is a
  Non-Negotiable violation.

**Business rules:** BR-004 (single client), BR-006 (no service role in client bundle).

---

## 3. OAuth Scope Policy — Gmail and Google Calendar

| API | Minimum Required Scope | Notes |
| --- | --- | --- |
| Gmail | `https://www.googleapis.com/auth/gmail.readonly` | Read-only; no send/modify |
| Google Calendar | `https://www.googleapis.com/auth/calendar.readonly` | Read-only; no event creation |

Rules:

- Request the **minimum** scope necessary. Never request write or send scopes
  unless a signed-off ADR exists permitting it.
- Scope requests are presented to the user at the OAuth consent screen; do not
  pre-approve or suppress the consent dialog.
- If a scope is added or changed, create an ADR entry before deploying.

---

## 4. Token Handling

### Provider tokens (Gmail / Google OAuth)

- Access tokens and refresh tokens received from Google are stored
  **server-side only** (Supabase `provider_token` / `provider_refresh_token`
  from the session, accessed in Edge Functions via the service-role client).
- Never write provider tokens to `localStorage`, `sessionStorage`, or any
  client-side store.
- Edge Functions that need provider tokens retrieve them via the
  `SUPABASE_SERVICE_ROLE_KEY` environment variable, which is **only** available
  in the Edge Function runtime — never in the Vite/React bundle.

### Service role key

- `SUPABASE_SERVICE_ROLE_KEY` must never appear in the client bundle.
- It is allowed only in Supabase Edge Functions and server-side scripts
  (e.g., migration helpers run locally).
- Vite bundles are scanned: any `SUPABASE_SERVICE_ROLE_KEY` reference in
  `src/` is a build-time error.

**Business rule:** BR-006 — service role key must never appear in the client bundle.

---

## 5. RLS Scoping Patterns

Every table that holds user data must have RLS enabled and at least one policy
that scopes rows to `auth.uid()`.

### Standard row policy

```sql
-- SELECT
CREATE POLICY "users_own_rows" ON public.<table>
  FOR SELECT USING (user_id = auth.uid());

-- INSERT
CREATE POLICY "users_insert_own_rows" ON public.<table>
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE
CREATE POLICY "users_update_own_rows" ON public.<table>
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### Immutable / event tables (INSERT only)

```sql
-- application_events is append-only; no UPDATE or DELETE policies.
CREATE POLICY "users_insert_events" ON public.application_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_select_events" ON public.application_events
  FOR SELECT USING (user_id = auth.uid());
```

### Service-role bypass (Edge Functions only)

Edge Functions may use the service-role client to bypass RLS when performing
trusted server-side writes (e.g., email ingestion). The bypass is acceptable
only inside Edge Function runtime scope — never in client code.

**Business rules:** BR-001 (RLS always on), BR-005 (every query filters by `user_id`).

---

## 6. Session Lifecycle — React Provider

```text
App bootstrap
  └─ AuthContext mounts
       └─ supabase.auth.getSession() → initialises state
       └─ supabase.auth.onAuthStateChange() → subscribes to session updates
              │
              ├─ SIGNED_IN   → set user + session in context state
              ├─ TOKEN_REFRESHED → update session in context state
              └─ SIGNED_OUT  → clear user + session; redirect to /login
```

Implementation notes:

- Call `subscription.unsubscribe()` in the `useEffect` cleanup to prevent
  memory leaks on unmount.
- Do not cache `session.access_token` in component state; always read from
  `AuthContext` so token refreshes propagate automatically.
- Protected routes check `AuthContext.user`; a `null` user redirects to login
  before any data fetch is attempted.

---

## 7. Security Checklist — Auth-Related Changes

Run this checklist whenever auth, RLS, or OAuth scope is modified.

- [ ] **BR-001** — RLS is enabled on every affected table (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`).
- [ ] **BR-004** — All DB access uses `getSupabaseClient()` from `src/lib/supabase.ts`.
- [ ] **BR-005** — Every new query includes a `user_id = auth.uid()` filter or equivalent RLS policy.
- [ ] **BR-006** — `SUPABASE_SERVICE_ROLE_KEY` does not appear in any `src/` file.
- [ ] **BR-008** — No direct `supabase.auth.*` calls outside `src/contexts/AuthContext.tsx`.
- [ ] OAuth scopes are read-only unless an ADR explicitly permits write access.
- [ ] Provider tokens are stored server-side only; never in `localStorage`.
- [ ] `pnpm db:gen-types` has been run if schema changed; `src/types/db.types.ts` committed.
- [ ] `pnpm validate` passes clean (zero type errors, zero lint warnings, all tests green).

---

## 8. Cross-References

| Rule ID | Statement | This doc section |
| --- | --- | --- |
| BR-001 | RLS must be enabled on every Supabase table | §5, §7 |
| BR-004 | All DB access via `src/lib/supabase.ts` only | §2, §7 |
| BR-005 | Every query filters by `user_id`; no cross-user leakage | §5, §7 |
| BR-006 | `SUPABASE_SERVICE_ROLE_KEY` never in client bundle | §4, §7 |
| BR-008 | Auth state lives in `src/contexts/AuthContext.tsx` only | §1, §7 |

Full rule definitions: [`docs/domain/business-rules.md`](business-rules.md)
