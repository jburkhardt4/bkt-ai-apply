# Error Handling Conventions

> How errors are produced, surfaced, and logged across the app, Edge Functions, and the extension.
> Referenced by `CLAUDE.md` → Key Reference Files.

## Principles

1. **Never swallow errors.** No empty `catch {}`. Either handle (recover + log) or rethrow with context.
2. **Validate at the boundary.** Parse external/untrusted input with **Zod** at the edge (API
   responses, form input, Edge Function payloads). Trust types only after a successful parse.
3. **Fail closed on security.** Auth/RLS/scope failures deny access; they never degrade to an
   unscoped query or a shared client.
4. **One user-facing channel.** Surface recoverable, user-relevant failures via **Sonner** toasts —
   short, actionable, no stack traces or internal IDs.
5. **Log the cause, show the effect.** Console/structured logs carry the technical cause; the UI shows
   a plain-language effect + next step.

## Frontend (React)

- Wrap async UI actions; on failure show a toast and keep the UI in a coherent state (no half-applied mutations).
- Cover all four states in components: **loading, empty, error, success** (enforced by the design skills).
- Prefer typed results for expected/recoverable failures; reserve `throw` for programmer errors and
  truly exceptional cases. An error boundary catches the unexpected so the app never white-screens.

## Supabase / data layer

- Check the `{ data, error }` envelope on every call through `src/lib/supabase.ts`; on `error`, log
  with operation context and return a typed failure — do not pretend success.
- Stage transitions go through the event-sourced transition path; a failed transition writes no
  partial state (no `applications.stage` change without its `application_events` row).

## Edge Functions

- Validate the payload (Zod) before work; return a consistent JSON error envelope with an appropriate
  status code. Never leak secrets, tokens, or raw provider errors to the client.
- Make handlers idempotent where retried by `pg_cron`/queues; log enough to trace a failed run.

## AI / multi-model routing

- Treat provider/model calls as fallible: enforce the latency budget, handle timeouts, and degrade or
  fail explicitly (see `docs/conventions/model-routing.md`). Record routing/fallback evidence.
