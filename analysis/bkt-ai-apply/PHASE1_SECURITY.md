# Phase 1 — Security Hardening (implementation notes)

**Branch:** `claude/phase1-security-hardening` · **Date:** 2026-06-15 · **Status:** code complete, awaiting `pnpm validate` in Codespaces/CI + ops provisioning
**Closes:** ASSESSMENT.md Security findings — `prospector-cron` no-auth (CWE-306, High), `gmail-sync` no-auth (CWE-306, High), `gmail-send` CRLF/header injection (CWE-93, Medium), wildcard CORS (CWE-942, Low). Maps to BUSINESS_RULES RULE-025, RULE-031, RULE-026/066.

## What changed (8 files)

| File | Change |
|---|---|
| `_shared/cron-auth.ts` **(new)** | Shared scheduler gate generalized from submission-worker: `timingSafeEqual`, `cronSecretConfigured`, `hasValidCronSecret` (x-cron-secret header or `Authorization: Bearer <CRON_SECRET>`). |
| `_shared/cron-auth.test.ts` **(new)** | vitest tests for the constant-time compare (pure; no Deno/esm imports). |
| `_shared/http.ts` | Env-gated CORS allow-list: `corsHeaders(req)`, `preflight(req)`, `json(body,status,req?)`. **Defaults to `*` when `ALLOWED_ORIGINS` unset** (zero regression). `Deno` top-level read guarded with `typeof Deno`. |
| `submission-worker/index.ts` | Removed its local `timingSafeEqual`; `isCronAuthorized` now uses the shared helpers. **Behavior identical** (set+valid→ok; set+invalid→deny; unset→dry-run only). |
| `gmail-sync/index.ts` | Auth gate: **CRON_SECRET (scheduler) OR Supabase JWT (client Refresh button)**; anonymous → 401 once `CRON_SECRET` is set. CORS threaded via `preflight(req)`/`json(...,req)`. |
| `prospector-cron/index.ts` | Auth gate: **CRON_SECRET only** (not client-invoked); replaced its duplicated inline CORS with shared `corsHeaders(req)`. |
| `gmail-send/mime.ts` + `mime.test.ts` | `assertHeaderSafe` rejects CR/LF in From/To/Subject/In-Reply-To (blocks Bcc/header injection); body is unaffected. 6 new tests. |

## Design choices

- **Back-compat / fail-safe rollout:** while `CRON_SECRET` is **unset**, `prospector-cron`/`gmail-sync` still allow anonymous calls but log `SECURITY — unauthenticated invocation allowed; set CRON_SECRET to require auth`. This avoids breaking the running cron on deploy. The endpoints are *fully closed only after* the ops step below. (`submission-worker` is stricter: it already fails **closed** (503) in live mode without a secret.)
- **One mechanism, not three copies** — the gate lives in `_shared`; the three functions compose it.
- **CORS is env-gated** so it cannot regress production until you opt in with `ALLOWED_ORIGINS`.

## REQUIRED ops to fully close the High findings (not a code change)

1. Generate a long random secret and set it on **each** scheduled function's Edge env:
   `supabase secrets set CRON_SECRET=<long-random>` (applies project-wide to Edge Functions).
2. Wire **pg_cron** (or the Supabase schedule) to send it on every invocation — add to the `net.http_post` headers:
   `{"x-cron-secret": "<long-random>"}` (or `Authorization: Bearer <long-random>`).
3. (Optional, recommended for multi-tenant prod) lock CORS:
   `supabase secrets set ALLOWED_ORIGINS="https://<your-prod-domain>,https://<preview-domain>"`.
   Until set, CORS stays `*` (unchanged).
4. Confirm `SUPABASE_URL` / `SUPABASE_ANON_KEY` exist in the `gmail-sync` function env — these are **platform-auto-injected** (per `.env.example`), so normally automatic; the JWT path (client Refresh) depends on them.

## How to validate (in Codespaces / CI — no Node toolchain on the local Windows box)

```bash
pnpm install
pnpm validate           # tsc -b (src only) + eslint **/*.ts + vitest
# Edge functions are Deno; optionally:
deno check supabase/functions/**/*.ts
deno test supabase/functions   # if Deno tests are added later
```
New tests: `gmail-send/mime.test.ts` (header-injection), `_shared/cron-auth.test.ts` (timing-safe compare).

## Verification verdict (adversarial, 3 lenses, static — could not execute the gate)

- **Build gate:** no blockers — would pass `pnpm validate` (no unused imports, no stray refs, tests avoid Deno/esm imports).
- **Regression:** `submission-worker` behavior exactly preserved; CRLF guard rejects no legitimate send (display-name addresses, Re:/Fwd:, multi-line bodies all pass); CORS unset = identical to before. Two Medium items found and **both fixed** (gmail-sync multi-origin CORS parity; http.ts Deno landmine) — the remaining one (gmail-sync JWT needs SUPABASE_URL/ANON_KEY) is covered by platform auto-injection (ops note #4).
- **Security completeness:** with `CRON_SECRET` set, both crons reject anonymous callers; CRLF vector fully closed across all built header fields; timing-safe compare intact.

## NOT in Phase 1 (tracked elsewhere)

- Multi-tenant safety (tenant_id, **server-side** cost-cap enforcement, per-tenant + global ceilings, optional BYOK) — see `LLM_ROUTING_REVIEW.md §4` and the Brief's later phases. This is now the largest workstream (Q1 decision).
- Self-writable autonomy guardrails behind SECURITY DEFINER (CWE-602, Low) — deferred; becomes a real cross-tenant concern under multi-tenant.
- The other 6 Edge Functions' response bodies use the static `CORS_HEADERS` (correct for a single prod origin; multi-origin echo is a fast-follow if you run >1 allow-listed origin).
