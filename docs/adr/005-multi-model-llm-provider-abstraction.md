# ADR-005: Multi-Model LLM Provider Abstraction (Anthropic / OpenAI / Gemini)

**Status:** Accepted
**Date:** 2026-06-09
**Supersedes:** extends ADR-003 (Conversational AI Assistant) for multi-provider support

---

## Context

The AI Assistant previously called Anthropic only, through the `ai-chat` Edge
Function with a single `ANTHROPIC_API_KEY`. We need production-grade support for
three providers — Anthropic (Claude), OpenAI (GPT), and Google (Gemini) — with:

1. A secure key story (keys never exposed to the browser).
2. A unified backend abstraction that routes a prompt to the correct provider
   and maps provider-specific errors to one consistent shape.
3. An Integrations/Settings surface showing which providers are configured.
4. A model selector in the assistant that disables models whose key is missing.

### Key-ownership decision

Two options were considered: **per-user BYOK** (keys encrypted at rest in our DB,
decrypted server-side) versus **shared project-level keys** (Supabase Edge
Function secrets). JB chose **shared project keys**: the three keys
(`ANTHROPIC_KEY`, `OPENAI_KEY`, `GEMINI_KEY`) are configured as Edge Function
secrets and serve all users. This removes the need for an encrypted key table,
app-layer crypto, and an in-app key-entry UI. Key management lives in the
Supabase dashboard; the app reflects status only.

## Decision

1. **Custom REST abstraction (not the Vercel AI SDK).** The Edge runtime is Deno
   and the existing function used raw `fetch`. A lightweight per-provider client
   gives full control over error mapping with zero SDK weight. Lives under
   `supabase/functions/_shared/llm/` (`types`, `errors`, `anthropic`, `openai`,
   `google`, `factory`).

2. **Keys are project-level Edge Function secrets**, read only via `Deno.env`
   inside `_shared/llm/factory.ts` (precedence with legacy fallback, e.g.
   `ANTHROPIC_KEY` → `ANTHROPIC_API_KEY`). Keys never enter the client bundle.

3. **`ai-chat` becomes provider-agnostic.** Request body adds `provider`;
   defaults to `anthropic` for backward compatibility. Errors are normalized to
   `{ error, code, provider }` with a safe, user-facing message that never leaks
   key material.

4. **New `provider-status` Edge Function** returns booleans only
   (`{ anthropic, openai, google }`) so the browser can learn which providers are
   configured without reading secrets. JWT-gated.

5. **Model names stay in `src/lib/ai-router.ts`.** A `CHAT_MODEL_CATALOG`,
   `resolveChatModel`, and `getModelPricing` were added there to honor the
   "no model names outside ai-router" routing contract. Selecting a non-default
   model is a JB manual override (AI-RULE-001), confirmed by the UI selection.

6. **New `settings` feature** (`src/features/settings/`) with a status-only
   Integrations panel; the model selector greys out providers with no key.

## Consequences

- **Positive:** one consistent provider interface and error shape; no secret ever
  reaches the client; adding a provider = one client module + a catalog entry;
  cost logging now prices per chosen model.
- **Trade-offs:** shared keys mean the project owner funds all usage (the existing
  `$75/user/month` cap in `ai-router.ts` guards spend); no per-user billing
  isolation. Provider model IDs in the `_shared/llm/*` clients are a second place
  model identifiers appear (the server boundary), unavoidable on Deno.
- **Follow-ups:** live key validation (a cheap provider ping) in `provider-status`
  is deferred; status reflects presence, not validity. Streaming responses remain
  a future enhancement.
