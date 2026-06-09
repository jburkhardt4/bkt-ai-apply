# Component Patterns

**status:** LIVING DOCUMENT — append patterns; do not delete
**last_updated:** 2026-06-09

Conventions for building UI in BKT AI-Apply. These encode the source-directory
contract in CLAUDE.md (`components/` presentational only; data lives in
`features/` hooks + services).

---

## Layering

- `src/components/ui/` — design-system primitives (shadcn/ui over Radix). No data.
- `src/components/` — shared presentational shell pieces. No data fetching.
- `src/features/<feature>/components/` — feature UI. A feature **container**
  component may call a feature hook for data; its child **presentational**
  components receive everything via props.
- `src/pages/` — thin route entries that delegate to a feature surface.
- `src/features/<feature>/hooks/` — data hooks over the single Supabase client.
- `src/features/<feature>/services/` — Supabase queries / Edge Function calls.

---

## Data hook pattern

Custom hooks over the single `getSupabaseClient()` (no React Query). Effects set
state **only inside promise callbacks** (never synchronously in the effect body)
per `react-hooks/set-state-in-effect`, and guard against unmount with a
`cancelled` flag. Expose `{ data, loading, error, ...actions }`. See
`useProspectorProfile` and `useProviderStatus`.

---

## Container + presentational split

A feature container owns the hook and toasts; presentational children are pure.

- Container: `IntegrationsPanel` (calls `useProviderStatus`, fires `sonner` toasts).
- Presentational: `ProviderStatusCard` (configured/loading/empty via props only).

This mirrors `ProspectorDashboard` (container) + `ProspectorProfileForm` (pure).

---

## Status-only integration surface

When a capability is configured server-side (e.g. provider API keys held as
Supabase Edge Function secrets), the UI must **reflect** status, never accept or
display the secret. Pattern: a JWT-gated Edge Function returns booleans only; a
hook loads them; cards render `Configured` / `Not configured` badges with a
manual Refresh. Never round-trip secret material to the client.

---

## Capability-gated controls (model selector)

Controls that depend on a configured capability should disable — not hide —
unavailable options, with an inline reason. `ModelSelector` greys out models
whose provider key is not configured (from `useProviderStatus`) and shows a
"no key" hint, while loading state keeps options optimistically enabled to avoid
flicker. Model names come from `CHAT_MODEL_CATALOG` in `src/lib/ai-router.ts`
(the single source of truth), never hardcoded in the component.

---

## Styling

Tailwind v4 with the OKLCH semantic tokens in `src/index.css`
(`bg-background`, `text-muted-foreground`, `bg-primary`, …). No arbitrary color
values without an ADR. Use `cn()` for conditional classes and `lucide-react`
for icons. Toasts via `sonner` (`toast.loading` → replace by `id`).
