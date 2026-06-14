# submission-worker — Deploy + Schedule + Safety Model

The `submission-worker` Edge Function (ADR-006 / BR-130..136) drains `approved`
rows from `application_queue` and submits real job applications through the
resolved channel adapter. It is the only trusted decision point for submission
autonomy — all guardrails (pause, credits, daily cap, score threshold,
no-resubmit) are enforced server-side inside the RPCs it calls.

> **DRY-RUN BY DEFAULT — this is the load-bearing safety property.** With
> `SUBMISSION_LIVE` unset (or anything other than the exact string `true`), every
> invocation is a zero-side-effect dry run: it counts approved rows (read-only)
> and returns them. It makes **no** claim / charge / submit / finalize calls.
> Real applications are sent **only** when `SUBMISSION_LIVE=true`.

---

## Behavior reference

| Aspect | Behavior |
| --- | --- |
| Default (no `SUBMISSION_LIVE`) | `{ "mode": "dry_run", "approvedCount": N, "message": "Set SUBMISSION_LIVE=true to enable real submissions." }` — read-only, zero side effects |
| Live (`SUBMISSION_LIVE=true`) | `{ "mode": "live", "processed", "submitted", "failed", "skipped":[{id,reason}], "expiredStuck" }` |
| Self-heal | First step of every live run calls `expire_stuck_submitting` (resets rows stuck in `submitting` past 30 min, refunds the unconsumed credit) |
| Batch | Pulls up to `SUBMISSION_BATCH_SIZE` (default 10) `approved` rows, oldest first |
| Serialization | Rows are processed **sequentially** (never `Promise.all`): each claim charges a credit + counts toward the daily cap, so they must not race (BR-136) |
| DB mutations | **Only** via three service-role RPCs (`expire_stuck_submitting`, `claim_submission`, `finalize_submission`). The worker writes no `application_events` and touches no credits directly — the RPCs own all mutations + event sourcing (BR-002/133, LSN-004) |
| Channel routing | `application_method` `api`/`ats` on a known ATS host → ATS adapter; everything else → browser fallback; addressable-but-`manual` → immediate `manual_required` failure |
| Guardrails | Re-validated server-side inside `claim_submission` (per-user advisory-locked): ownership (BR-005), pause (BR-132), credits (BR-136), daily cap incl. in-flight `submitting` rows (BR-136), no-resubmit (BR-135). **Authorization is server-authoritative** (BR-130/131/148): a row submits only if an explicit `approval` event exists OR the server's `review_mode` is `assist`/`auto` and `match_score ≥ threshold` — the client `queued_by` is audit-only. A row lacking authorization stays `approved` (`awaiting_approval`), never cancelled |
| Failure visibility | Every failure is finalized as `failed` + a `submission_attempt` event with the reason; the charged credit is refunded. Never silent (ADR-006) |
| Stuck self-heal | A row stuck in `submitting` past 30 min is moved to **terminal `failed`** (`last_error = expired_unconfirmed_submitting`), the credit is refunded, and a `submission_attempt` event (`outcome = unconfirmed`) is written. It is **never** auto-returned to `approved` — a stuck row may have submitted externally, so it requires manual reconciliation rather than risking a double submission |
| Finalize resilience | On a **successful** submission the worker retries `finalize_submission` up to 3× with a short backoff if the RPC errors, so a transient DB blip cannot strand a real submission; if all retries fail it logs loudly and the stuck-row expiry above is the backstop. The RPC is idempotent (acts only on `submitting`), so retries are safe |
| Invocation | POST by the scheduler. Deployed `--no-verify-jwt` (pg_cron carries no user JWT) — the **service role is the trust anchor**, mirroring `prospector-cron` / `gmail-sync`. An optional `CRON_SECRET` gates the endpoint: when set, every request must carry it (`x-cron-secret` header or `Authorization: Bearer <CRON_SECRET>`) or it is rejected `401` |

---

## 1. Deploy

The worker is invoked by pg_cron, which carries **no user JWT**, so it must be
deployed with JWT verification disabled (matching `prospector-cron` /
`gmail-sync`). The endpoint is then protected in-code by `CRON_SECRET` (step 2).

```bash
supabase functions deploy submission-worker --no-verify-jwt
```

The function imports `@supabase/supabase-js` from the `supabase/functions/deno.json`
import map and the shared helpers from `supabase/functions/_shared/`
(`http.ts`, `submission/*`). No extra config files are needed.

Prerequisite: migration `20260613000004_submission_worker_rpcs.sql` must be
applied (it defines `claim_submission`, `finalize_submission`,
`expire_stuck_submitting`, granted to `service_role` only).

## 2. Secrets

Dashboard: **Project → Edge Functions → Secrets**, or CLI:

```bash
supabase secrets set \
  SUBMISSION_LIVE="false" \
  SUBMISSION_BATCH_SIZE="10" \
  CRON_SECRET="<long random string>" \
  BROWSERBASE_API_KEY="<browserbase api key>" \
  BROWSERBASE_PROJECT_ID="<browserbase project id>"
```

| Secret | Required | Effect |
| --- | --- | --- |
| `SUBMISSION_LIVE` | to go live | Must be the exact string `true` to send real applications. Anything else (including unset) = dry run. **Leave unset/`false` until you intend to submit for real.** |
| `SUBMISSION_BATCH_SIZE` | no | Max `approved` rows processed per run (default 10) |
| `CRON_SECRET` | **required to go live** | Locks the `--no-verify-jwt` endpoint. When set, every invocation must carry it (`x-cron-secret` header or `Authorization: Bearer <CRON_SECRET>`) or it gets `401`. When **unset** the endpoint is open **only in dry-run** — if `SUBMISSION_LIVE=true` and `CRON_SECRET` is unset the worker **fails closed** (`503`, refuses to run) so a live endpoint is never left unauthenticated. Set it (and add the matching header to the pg_cron call, step 3) before going live. |
| `BROWSERBASE_API_KEY` | for browser channel | Absent → browser adapter returns `browser_not_configured` (graceful) |
| `BROWSERBASE_PROJECT_ID` | for browser channel | Required alongside the API key to bootstrap a session |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them by hand. The service-role key never leaves the function runtime
(BR-006).

## 3. Schedule (pg_cron → net.http_post)

Same mechanism as `gmail-sync`. Roughly every 5 minutes. Because the function
is deployed `--no-verify-jwt`, the request carries the `x-cron-secret` header so
it passes the in-code `CRON_SECRET` gate (use the **same** value you set in
step 2). Keep the deploy command (step 1) and this schedule consistent.

```sql
select cron.schedule(
  'submission-worker-5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/submission-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<same value as the CRON_SECRET edge secret>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

> If you set `CRON_SECRET` **after** scheduling, re-run `cron.schedule` with the
> header (or `cron.unschedule('submission-worker-5m')` first) so the scheduled
> call carries the secret — otherwise every tick will get `401`.

Scheduling the job is safe **before** going live — every tick is a harmless
dry-run count until `SUBMISSION_LIVE=true` is set.

## 4. Verify

```bash
# Dry run (default): returns the approved count, sends nothing.
# Include -H "x-cron-secret: <CRON_SECRET>" if you set CRON_SECRET (else 401).
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/submission-worker" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <CRON_SECRET>" -d '{}'
# → { "mode":"dry_run", "approvedCount": <N>, "message":"Set SUBMISSION_LIVE=true ..." }
```

To exercise the live path, set `SUBMISSION_LIVE=true`, then re-invoke and check:

- `application_queue` — approved rows move to `submitted` or `failed`
  (or stay `approved` if a transient guard fired: `no_credits` / `paused` /
  `daily_cap` / `awaiting_approval`; `cancelled` for the terminal
  `already_submitted` guard; a stuck `submitting` row self-heals to terminal
  `failed` with `last_error = expired_unconfirmed_submitting`).
- `user_settings.credits` — decremented on a confirmed submit, refunded on failure.
- `applications.submitted_at` + stage `discovery → applied` on confirmed submits.
- `application_events` — one `submission_attempt` per attempt; one
  `stage_transition` on a confirmed discovery→applied submit.
- Function logs: Dashboard → Edge Functions → submission-worker → Logs.

---

## GAP-010 follow-ups (this build does NOT submit for real yet)

This Phase 4 build lands the worker, routing, and adapter scaffolding. Two
pieces remain before a live run actually completes a submission — by design,
nothing fabricates data or blind-fires:

1. **ATS payload + board config.** The Greenhouse / Lever / Ashby adapters are
   built to their documented public application-endpoint contracts, but the
   real per-board identifiers and the candidate application payload
   (name/email/resume file/answers) are not wired. Until both are present, each
   ATS adapter returns `channel_not_configured`
   (`metadata.reason = 'GAP-010 ATS payload/board config not wired'`) and the
   row finalizes as `failed` (credit refunded). Wiring point:
   `resolveCandidatePayload` + the per-vendor board resolvers in
   `supabase/functions/_shared/submission/atsAdapters.ts`.

2. **Stagehand form-driving.** The browser adapter bootstraps a Browserbase
   session and hands off (`manual_required`), capturing the session id in audit
   metadata. Full unattended form-filling via Stagehand is the follow-up spike.
   BR-032/033/034 remain binding — no CAPTCHA bypass, no rate-limit
   circumvention, no driving behind an auth wall.

Until both land, a live run is safe: it claims, attempts, fails gracefully with
a recorded reason, and refunds the credit. No application is sent.
