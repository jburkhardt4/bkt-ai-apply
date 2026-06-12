# gmail-sync — One-Time Google Setup

**Status as deployed (2026-06-12):** the `gmail-sync` Edge Function is live and
scheduled (pg_cron `gmail-sync-15m`, every 15 minutes). Until the secrets below
are set, every run is a harmless no-op:
`{ "status": "noop", "reason": "GOOGLE_OAUTH_CLIENT_ID / … not set" }`.

Completing this page is the only manual step left to turn email ingestion on.
Everything is **read-only** (`gmail.readonly`) — the function can never send,
delete, or modify mail.

---

## 1. Create the OAuth client (Google Cloud Console, ~10 min)

1. [console.cloud.google.com](https://console.cloud.google.com) → create (or
   reuse) a project, e.g. `bkt-ai-apply`.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - User type **External**, app name `BKT AI-Apply`, your email everywhere.
   - Scopes: add `https://www.googleapis.com/auth/gmail.readonly`.
   - **Publishing status: click "Publish app" (In production).** This matters —
     refresh tokens minted while the app is in *Testing* expire after 7 days;
     published (even unverified) apps issue non-expiring refresh tokens. The
     consent screen will show an "unverified app" warning — expected and fine
     for a personal single-user tool.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**, name `gmail-sync`.
   - Authorized redirect URI: `https://developers.google.com/oauthplayground`
   - Save the **Client ID** and **Client Secret**.

## 2. Mint the refresh token (OAuth Playground, ~2 min)

1. Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. Gear icon (top right) → check **"Use your own OAuth credentials"** → paste
   the Client ID + Secret from step 1.
3. Step 1 panel: enter scope `https://www.googleapis.com/auth/gmail.readonly`
   → **Authorize APIs** → sign in as **john@bktadvisory.com** → accept the
   unverified-app warning.
4. Step 2 panel: **Exchange authorization code for tokens** → copy the
   **Refresh token**.

## 3. Set the Edge Function secrets

Dashboard: **Project → Edge Functions → Secrets**, or CLI:

```bash
supabase secrets set \
  GOOGLE_OAUTH_CLIENT_ID="<client id>" \
  GOOGLE_OAUTH_CLIENT_SECRET="<client secret>" \
  GMAIL_REFRESH_TOKEN="<refresh token>" \
  GMAIL_USER_EMAIL="john@bktadvisory.com"
```

`GMAIL_USER_EMAIL` is optional while the project has exactly one user; set it
anyway so the mapping survives a second account. `GEMINI_KEY` should already
exist (used by ai-chat); without it classification falls back to keywords.

## 4. Verify

```bash
curl -s -X POST "https://rmoyuwesfljuygvpdolf.supabase.co/functions/v1/gmail-sync" \
  -H "Content-Type: application/json" -d '{}'
```

Expected first run: `{ "status": "success", "mode": "bootstrap", ... }` (pulls
up to 25 messages from the last 7 days). Then check:

- `gmail_sync_state` — one row: `history_id` set, `last_status = 'success'`.
- `emails` — job-relevant messages with `classification` + `confidence`;
  the Inbox screen (`/inbox`) now shows live mail.
- `application_events` — `gmail_scraper` rows for any auto-transition
  (confidence ≥ 0.70, BR-031).
- Function logs: Dashboard → Edge Functions → gmail-sync → Logs.

## Behavior reference

| Aspect | Behavior |
| --- | --- |
| Cadence | pg_cron `gmail-sync-15m` (`*/15 * * * *`) → `net.http_post` |
| Incremental sync | `gmail_sync_state.history_id` cursor; expired cursor (Gmail 404) auto-re-bootstraps over 7 days |
| Per-run cap | 25 messages; a truncated run holds the cursor back and resumes next tick |
| Relevance gate (BR-035) | stores only classified-relevant mail, or any mail from a tracked application's company; other mail is never persisted |
| Classification | Gemini 2.5 Flash via `_shared/llm`; keyword fallback on any model failure; every call logged to `ai_model_usage` |
| Auto-transition | confidence ≥ 0.70 + matched application → `transition_stage` RPC (`actor = 'gmail_scraper'`), offer-stage protected |
| Dedupe | `emails UNIQUE (user_id, gmail_message_id)` + 60s re-invocation guard |

## Troubleshooting

- **`invalid_grant` on token refresh** — the refresh token was revoked or was
  minted while the consent screen was still in *Testing* (7-day expiry).
  Re-do step 2 and update `GMAIL_REFRESH_TOKEN`.
- **`status: error` with Gmail 403** — Gmail API not enabled on the Cloud
  project, or the scope wasn't granted during consent.
- **Everything classifies via keywords** — `GEMINI_KEY` missing/invalid; check
  provider-status or the function logs.
