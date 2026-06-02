# ADR-001: Migrate Backend from Google Sheets to Supabase

**Status:** Accepted  
**Date:** 2025-06

## Context
Google Sheets was used as a dual-state backend for job tracking. It lacks real-time subscriptions,
enforced schema, RLS, and scales poorly for event-sourced audit trails.

## Decision
Migrate to Supabase (PostgreSQL) as the single source of truth.

## Consequences
- All application state lives in Supabase tables
- Google Sheets integration removed after migration complete
- Realtime subscriptions replace manual polling/sync
- RLS enforces data isolation at DB layer
- Migration plan: seed historical data from Sheets → validate → cut over
