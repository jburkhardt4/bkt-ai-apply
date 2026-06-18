// BKT Apply-Macro — public extension configuration.
//
// ⚠️ ONLY public, client-safe values belong here — the Supabase project URL and
// the PUBLIC anon key (exactly what the SPA already ships in its own bundle).
// NEVER put an LLM/provider key or the Supabase service-role key here, or
// anywhere in the extension (BR-122). The extension authenticates AS the
// signed-in user (their own JWT, read from the SPA session) and every model
// call is brokered server-side by the JWT-gated `score-job-fit` Edge Function —
// so no provider secret is ever needed client-side.
//
// SUPABASE_URL / SUPABASE_ANON_KEY are substituted at BUILD time by
// scripts/build-extension.mjs (esbuild `define`, sourced from .env.local's
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). They are intentionally empty in
// source so nothing is committed; an empty value simply means "not configured"
// and the extension degrades to its signed-out state.

declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string

export const SUPABASE_URL: string =
  typeof __SUPABASE_URL__ === 'string' ? __SUPABASE_URL__ : ''
export const SUPABASE_ANON_KEY: string =
  typeof __SUPABASE_ANON_KEY__ === 'string' ? __SUPABASE_ANON_KEY__ : ''

// Mirrors src/lib/ai-router.ts ROUTING_MATRIX.match_scoring — the single source
// of truth for model routing. The score-job-fit Edge Function maps this display
// name → the provider's API model id server-side (supabase/functions/_shared/
// llm/anthropic.ts), so the extension passes the display name verbatim.
export const SCORING_PROVIDER = 'anthropic'
export const SCORING_MODEL = 'Claude Sonnet 4.6'
