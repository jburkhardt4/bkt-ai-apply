# Business Rules — BKT AI-Apply

> These are invariants. Agent must not violate without explicit user override + ADR.

---

## Pipeline Rules

**BR-001: Stage transitions are one-directional (except ghosted → applied)**
An application may only advance forward through pipeline stages or terminate.
Backward transitions are blocked except: ghosted → applied (re-engagement scenario).

**BR-002: Every stage change requires an application_events row**
No direct `UPDATE applications SET stage = ?` without simultaneously inserting
a corresponding `application_events` row with `event_type: 'stage_change'`.

**BR-003: applied_at is set exactly once**
When stage transitions to 'applied', set `applied_at = now()` if null.
Never overwrite an existing `applied_at`.

**BR-004: terminal stages block further auto-transitions**
Applications in `hired`, `rejected`, or `ghosted` must not be auto-transitioned
by email or calendar events. Manual override only.

---

## Match Scoring Rules

**BR-010: Match score is required before auto-apply**
Auto-apply cannot submit an application without a calculated `match_score`.
Minimum threshold: 75.0 (configurable in user_profiles.match_weights, default).

**BR-011: Match score components**
Score = weighted average of:
- `skills`: % of job required skills present in user_profiles.skills
- `seniority`: alignment between job title level and user target_roles
- `location`: remote_type match against user remote_pref
- `salary`: job salary_min >= user salary_min (or unknown = neutral)
Weights defined per-user in `user_profiles.match_weights`.

**BR-012: match_breakdown must be stored with match_score**
Never store `match_score` without the `match_breakdown` JSONB. Both or neither.

---

## Email Processing Rules

**BR-020: Duplicate Gmail messages are silently ignored**
`email_events.gmail_message_id` has a UNIQUE constraint.
ON CONFLICT DO NOTHING — no error, no reprocessing.

**BR-021: Low-confidence classifications are not auto-actioned**
If `confidence_score < 0.70`, classify and store the email_event but do NOT
trigger a stage transition. Flag for manual review.

**BR-022: Rejection emails trigger ghosted only if no recent activity**
A rejection email maps to `rejected` stage.
Exception: if an offer is already in place (stage = 'offer'), require manual
confirmation before transitioning — possible spam/error scenario.

**BR-023: Email company matching uses fuzzy logic**
Match email_events to applications by normalizing company names
(lowercase, remove Inc/LLC/Corp suffixes). Confidence < 0.85 match = no auto-link.

---

## Document Rules

**BR-030: Resume versions are immutable after submission**
Once a resume document is linked to an application via `resume_document_id`,
do not overwrite. Create a new document version instead.

**BR-031: Every AI-generated document must record the model used**
`documents.ai_model_used` is required for all AI-generated documents.
Never null for generated content.

---

## Security Rules

**BR-040: user_id must be present on every insert**
No row may be inserted into any user-scoped table without a `user_id`.
Service role Edge Functions must pass `user_id` explicitly — never assume context.

**BR-041: Service role key never reaches the client**
`SUPABASE_SERVICE_ROLE_KEY` is Edge Function / server-side only.
Any code path that imports this in a Vite/client bundle is a critical bug.

**BR-042: Webhook calls must be HMAC-validated**
Inbound webhook calls to Edge Functions from background scrapers must
validate `X-Webhook-Signature` header against `EDGE_FUNCTION_WEBHOOK_SECRET`.
Reject without processing if invalid.
