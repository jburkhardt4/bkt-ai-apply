# ADR-021 — GDPR Purge vs. application_events Immutability

**status:** APPROVED — Option A (MVP anonymize-only)
**task_id:** BKT-AIAPPLY-PHASE2-SUPABASE-SEC-001
**date:** 2026-06-03
**author:** Supabase-Security Agent

---

## Decision

JB approved Option A on 2026-06-03. MVP will anonymize PII fields in application_events in place (no row deletes), preserving immutable audit history. Full GDPR row-erasure deferred to Post-MVP ADR.

---

## Context

Two signed-off requirements are in direct conflict:

| Rule | Requirement |
| --- | --- |
| BR-003 / SEC-007 | `application_events` rows are **never** deleted |
| PRIV-001 | User data deletion must purge `application_events` (GDPR right to erasure) |

The SQL migration (`20260603000010_create_application_events`) resolves this by:

1. Client-facing RLS has **no DELETE policy** — no authenticated user can delete rows.
2. A `BEFORE DELETE` trigger (`trg_app_events_deny_delete`) raises an exception, blocking
   deletion even from service-role clients that bypass RLS.
3. The FK `user_id → users.id` uses `ON DELETE CASCADE` so that Supabase Auth user deletion
   would cascade — **but** the trigger above blocks this cascade and will cause Auth deletion
   to fail unless the trigger is removed first.

This means: as written, it is **impossible** to delete a user and satisfy GDPR without
dropping or temporarily disabling the delete-guard trigger.

---

## Decision Required

JB must choose one of three options:

### Option A — Accept MVP limitation; defer GDPR purge

- Ship with current trigger in place.
- GDPR deletion in MVP is "best effort": application data except `application_events` is purged.
- `application_events` rows are anonymised (NULL-out PII fields) rather than deleted.
- Implement a `fn_gdpr_anonymise_user` service-role function.
- **Tradeoff:** Technically not full GDPR erasure; acceptable for single-user MVP with no
  third-party data subjects.

### Option B — Remove the BEFORE DELETE trigger; rely on RLS alone

- Normal operations: RLS blocks client deletes.
- GDPR purge: a privileged `fn_gdpr_purge_user` function (SECURITY DEFINER, callable only
  by service role) deletes events as part of a user purge sequence.
- **Tradeoff:** Weaker DB-level protection; depends on service-role function discipline.

### Option C — Separate audit schema

- Move `application_events` to a separate `audit` schema with its own RLS realm.
- The `public` schema tables cascade-delete normally.
- The `audit.application_events` table is purged only by `fn_gdpr_purge_user`.
- **Tradeoff:** Schema complexity; requires updated type generation and client queries.

---

## Recommendation

**Option A** for MVP. JB is a single user; there are no third-party data subjects.
Full GDPR erasure (Option B or C) should be addressed in the post-MVP phase via a dedicated
data-deletion ADR and Edge Function before any multi-user launch.

---

## Blocking Impact

Until JB decides, the `20260603000010_create_application_events` migration ships with
the delete-guard trigger in place (Option A posture). GDPR purge flow is deferred.

The FK is `ON DELETE CASCADE` so Auth-level user deletion will fail at the trigger;
it must be coordinated through the service-role purge function when implemented.
