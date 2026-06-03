# Security and Compliance

**task_id:** BKT-AIAPPLY-PHASE1-REQS-LOCK-002
**status:** LOCKED
**locked_date:** 2026-06-03

---

## Non-Negotiable Security Rules

These rules may never be violated without creating an ADR first.

| ID | Rule |
| --- | --- |
| SEC-001 | RLS must be enabled on every Supabase table; no exceptions |
| SEC-002 | All database access via `src/lib/supabase.ts` only; no raw REST calls to Supabase |
| SEC-003 | Auth state lives in `src/contexts/AuthContext.tsx` only; no auth state duplication |
| SEC-004 | `SUPABASE_SERVICE_ROLE_KEY` must never appear in the client bundle |
| SEC-005 | All API keys, OAuth tokens, and secrets stored in Supabase encrypted secrets or environment variables only |
| SEC-006 | Every query must filter by `user_id`; no cross-user data access permitted |
| SEC-007 | `application_events` rows are never deleted; no DELETE policy on this table |

---

## Authentication Requirements

| ID | Requirement |
| --- | --- |
| AUTH-001 | Google OAuth 2.0 used for user authentication via Supabase Auth |
| AUTH-002 | Gmail API scope: `gmail.readonly`; no write scope without explicit ADR |
| AUTH-003 | Google Calendar API scope: `calendar.readonly`; no write scope without explicit ADR |
| AUTH-004 | OAuth tokens stored server-side only; never exposed to client |
| AUTH-005 | Session tokens expire per Supabase default; refresh handled automatically |

---

## Row Level Security Policy Requirements

| Table | Policy |
| --- | --- |
| users | SELECT/UPDATE own row only |
| roles | SELECT own rows only |
| companies | SELECT for all authenticated users (shared lookup) |
| jobs | SELECT/INSERT/UPDATE/DELETE where user_id = auth.uid() |
| recruiters | SELECT/INSERT/UPDATE/DELETE where user_id = auth.uid() |
| applications | SELECT/INSERT/UPDATE where user_id = auth.uid() |
| application_materials | Access via application → user_id |
| documents | SELECT/INSERT where user_id = auth.uid(); no DELETE |
| ai_scores | SELECT/INSERT where user_id = auth.uid() |
| application_events | SELECT/INSERT where user_id = auth.uid(); no DELETE, no UPDATE |
| emails | SELECT/INSERT where user_id = auth.uid() |
| interviews | SELECT/INSERT/UPDATE where user_id = auth.uid() |
| notifications | SELECT/INSERT/UPDATE where user_id = auth.uid() |
| ai_model_usage | SELECT/INSERT where user_id = auth.uid() |

---

## Webhook Security

| ID | Requirement |
| --- | --- |
| WH-001 | All inbound webhooks (Gmail push, Calendar push) must include HMAC signature |
| WH-002 | Edge Functions must verify HMAC signature before processing any webhook payload |
| WH-003 | Webhook secret must be rotated on any suspected exposure |
| WH-004 | Replay attack protection: reject webhooks with timestamp older than 5 minutes |

---

## Data Privacy and Compliance Requirements

| ID | Requirement |
| --- | --- |
| PRIV-001 | User data deletion must purge: applications, application_events, emails, interviews, documents, ai_scores, ai_model_usage |
| PRIV-002 | GDPR-aligned: user can request full data export and deletion at any time |
| PRIV-003 | Data minimization: only collect fields required for pipeline function |
| PRIV-004 | No scraping of employer systems behind authenticated walls without API authorization |
| PRIV-005 | No misrepresentation in application content |
| PRIV-006 | No falsification of work history, credentials, or skills |
| PRIV-007 | All automated actions disclosed in audit log with actor field |

---

## Automation Ethics Boundaries

The system must NOT:

- Bypass CAPTCHA under any circumstances
- Circumvent anti-bot detection systems
- Evade rate limits (must implement backoff)
- Circumvent login security on any platform
- Submit applications with fabricated information
- Operate without a UITL gate on submission in MVP (SIGN-OFF-004)

---

## Secrets Exposure Policy

| Secret | Storage Location | Rotation Policy |
| --- | --- | --- |
| SUPABASE_SERVICE_ROLE_KEY | Server environment only | On exposure |
| SUPABASE_ANON_KEY | Client bundle (safe for anon key) | On exposure |
| GOOGLE_OAUTH_CLIENT_SECRET | Supabase secrets / server env | On exposure |
| OpenAI API Key | Supabase secrets / server env | Quarterly |
| Anthropic API Key | Supabase secrets / server env | Quarterly |
| Google AI API Key | Supabase secrets / server env | Quarterly |
| Gmail Push Webhook Secret | Supabase secrets | On exposure |

---

## Edge Function Security Requirements

| ID | Requirement |
| --- | --- |
| EF-SEC-001 | Rate limiting on all public-facing Edge Functions |
| EF-SEC-002 | Input validation on all webhook payloads before processing |
| EF-SEC-003 | Structured error responses; no stack traces exposed to external callers |
| EF-SEC-004 | All Edge Functions log structured audit entries on failure |
