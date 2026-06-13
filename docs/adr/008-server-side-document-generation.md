# ADR-008: Server-Side AI Document Generation (`generate-document` Edge Function)

**Status:** Accepted
**Date:** 2026-06-13
**Extends:** ADR-005 (Multi-Model LLM Provider Abstraction)

---

## Context

`documentGenerationService.generateResumeVariant()` / `generateCoverLetter()`
built resume and cover-letter content from hard-coded string templates with
variable interpolation — no LLM was ever called. The `cover_letter_generation`
and `resume_rewriting` routing entries existed, and the `documents` table existed,
but the "AI writer" surfaces (DocBuilder Auto-Align, DocAssistant) were
design-review stubs returning pre-baked text. The tailored artifacts that the
submission flow (ADR-006) will eventually submit therefore weren't real.

We need genuine, profile-grounded generation without exposing provider keys to
the browser, reusing the established multi-model abstraction and cost machinery.

## Decision

1. **New `generate-document` Edge Function** (`supabase/functions/generate-document/`),
   built to the `ai-chat` pattern: JWT-gated, CORS/OPTIONS, routed through
   `_shared/llm/factory.ts`, normalized `{ error, code, provider }` errors.

2. **Thin: no DB writes, no service-role key.** Body
   `{ provider?, model?, documentType:'resume'|'cover_letter', job, masterProfile,
   currentContent?, system?, maxTokens? }`. It selects a per-type system prompt
   (cover-letter vs. ATS-oriented resume), grounds the message in `job` +
   `masterProfile` (+ optional `currentContent` to revise), and returns
   `{ content, usage }`. The prompts forbid fabricated experience and ask for the
   finished document text only.

3. **Routing-driven, never hardcoded:** `cover_letter` → `cover_letter_generation`
   (anthropic Opus), `resume` → `resume_rewriting` (openai GPT-5). The client
   supplies `provider`/`model` from `routeAiTask`.

4. **Cost-gating, persistence, and usage-logging stay client-side.**
   `generateDocument()` keeps its `routeAiTask` cost-gate (`{ status:'queued' }`
   when blocked); when not blocked it invokes the function, uses the real
   `content` + real `usage` (priced via `getModelPricing`) instead of the template
   builder + estimate, persists the result to the `documents` table (Storage-backed
   `storage_path`, versioned, `content_hash`, `user_id = auth.uid()`), and logs
   usage. The template builders are retained **only** as the fallback when the
   invoke errors.

5. **AI-writer surfaces wired to real generation.** `DocBuilder.runAlign()` calls
   real generation and maps the result into the editor patch; `DocAssistant.reply()`
   calls the assistant (`ai-chat` via `chatCompletionService`) grounded in the
   target job. Loading/aligned/typing/error states are preserved.

## Consequences

- **Positive:** resumes and cover letters are now genuinely tailored and persisted
  to `documents`, producing the artifacts ADR-006's submission flow needs. No
  provider key reaches the browser; the multi-model abstraction and cost cap are
  reused unchanged.
- **Trade-offs:** generation now incurs model cost (Opus for cover letters, GPT-5
  for resumes) under the existing monthly cap, and adds a model round-trip vs. the
  instant template. Provider model IDs remain pinned in `_shared/llm/*` (the server
  boundary), as in ADR-005.
- **Follow-ups:** live deployment to the Supabase project is gated; streaming
  generation and richer in-editor diff/patch granularity are future enhancements.
