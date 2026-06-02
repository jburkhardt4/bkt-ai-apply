# ADR-003: Supabase Realtime as State Management

**Status:** Accepted  
**Date:** 2025-06

## Context
Background scrapers (Gmail, Calendar) update Supabase rows autonomously.
The UI must reflect these changes without polling or manual refresh.

## Decision
Use Supabase Realtime postgres_changes subscriptions as the UI state layer.
No Zustand, no Redux, no local application state for server data.

## Consequences
- UI is always in sync with DB, zero manual refresh needed
- No client-side cache invalidation logic needed
- WebSocket connection required; handle reconnection gracefully
- State resets on page load (re-subscribes from current DB state)
