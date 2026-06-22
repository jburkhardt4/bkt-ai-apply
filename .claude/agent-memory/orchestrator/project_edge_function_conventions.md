---
name: project-edge-function-conventions
description: The Deno Edge Function pattern in bkt-ai-apply that every new supabase/functions/<name>/index.ts mirrors (import map, cron-auth, service client, deno check).
metadata:
  type: project
---

Conventions every new `supabase/functions/<name>/index.ts` must mirror. Reference implementations: `prospector-cron`, `submission-worker`, `gmail-sync`, and the newer `crawler-worker` / `crawler-discover` ([[reference-crawl-layer]]).

**Why:** Edge functions run on Deno, not Node, and ESCAPE `pnpm validate` — `tsc -b` skips `supabase/functions`, so a broken function ships green. They require their own verification path.

**How to apply:**
- **Imports:** via the import map at `supabase/functions/deno.json` (`@supabase/supabase-js` → `jsr:@supabase/supabase-js@2`); use the bare specifier. Pure, reusable logic goes in `_shared/` with explicit `./x.ts` extensions so it stays vitest-testable from the Node side — NEVER import `Deno.*` or an esm/jsr client into a file that a `*.test.ts` imports.
- **Scheduler auth:** compose `_shared/cron-auth.ts` (`cronSecretConfigured` + `hasValidCronSecret`). When `CRON_SECRET` is set it is required (`x-cron-secret` header or `Authorization: Bearer`); unset → warn + allow (so deploy doesn't break a running cron before the secret is provisioned).
- **Client:** service-role client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`auth: { persistSession:false, … }`); the key never reaches a client bundle (BR-006). Service role bypasses RLS by design for server ops.
- **HTTP:** CORS + responses via `_shared/http.ts` (`CORS_HEADERS`, `json`); handle `OPTIONS` preflight. `Deno.serve(async (req) => …)`.
- **Heavy/atomic DB logic** belongs in service-role-only SECURITY DEFINER RPCs (`SET search_path = public, pg_temp`; `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role`), not the function body — see `claim_submission` (20260613000004) and the crawl RPCs (20260622000003).
- **Verify with `deno check supabase/functions/<name>/index.ts`** — the import map resolves the bare specifiers; `tsc`/lint alone will NOT catch Deno errors. Colocated `_shared/**/*.test.ts` run under `pnpm test`.
- **Deploy is JB-gated** via MCP `deploy_edge_function` (not the Supabase CLI). pg_cron invokes the endpoint via `net.http_post` — wiring pattern in `docs/deploy/submission-worker-setup.md`.

Related: [[reference-crawl-layer]], [[reference-validate-gate]], [[reference-doc-paths]].
