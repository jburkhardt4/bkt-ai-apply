# Golden Principles — BKT AI-Apply

> These are non-negotiable engineering invariants.
> Deviation requires an ADR approved before implementation.

---

## Data & Security

**GP-01: Single DB client**
All database access through `src/lib/supabase.ts`. No direct Supabase REST calls,
no `fetch('https://[project].supabase.co/rest/...')` anywhere in client code.

**GP-02: RLS enforced on every table**
Every table has RLS enabled + four policies (select/insert/update/delete).
`alter table x disable row level security` is a critical bug.

**GP-03: User scoping on every query**
Every query against a user-scoped table must filter by `user_id`.
Missing user_id filter = data leak = critical bug.

**GP-04: Service role stays server-side**
`SUPABASE_SERVICE_ROLE_KEY` lives in Edge Functions only.
Any Vite import of this key is a critical security bug. Use `VITE_` prefix only for anon key.

**GP-05: Webhook HMAC validation is mandatory**
Every inbound Edge Function webhook validates signature before processing.
No exceptions for "internal" or "trusted" callers.

---

## Application State

**GP-06: Supabase is the only state**
UI state is derived from Supabase Realtime subscriptions.
No local cache, no localStorage for application data, no Zustand/Redux stores for server state.

**GP-07: Mutations write events**
Any function that changes `applications.stage` must write to `application_events`.
If you're writing a stage update without an event row, you're doing it wrong.

**GP-08: No terminal stage overwrites**
Code must check current stage before transitioning. Stages `hired`, `rejected`, `ghosted`
reject auto-transitions silently (do not throw, do not overwrite).

---

## Code Quality

**GP-09: TypeScript strict — no `any`**
`any` requires an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
comment with a written justification. No silent any casts.

**GP-10: Generated DB types only**
`src/types/db.types.ts` is generated via `pnpm db:gen-types`. Never handwrite Supabase table types.
If a type is wrong, fix the schema and regenerate.

**GP-11: Components are presentational**
Files in `src/components/` contain zero Supabase calls, zero business logic.
Data fetching and mutations live in `src/features/*/hooks/`.

**GP-12: AI model selection is centralized**
No hardcoded model strings outside `src/lib/ai-router.ts`.
To change a model, update `MODEL_ROUTES` in one place.

---

## AI Operations

**GP-13: Light tier for background tasks**
Automated background processes (email parsing, status classification, intent routing)
use Gemini Flash or Claude Haiku only. Never Opus or GPT-5 in high-frequency loops.

**GP-14: Document model provenance**
Every AI-generated document stores `ai_model_used`. Missing this field is a data quality bug.

**GP-15: Match score before auto-apply**
Auto-apply agent must abort and log if `match_score` is null or below threshold.
Never submit an application without a score.
