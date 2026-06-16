# Apply-Macro Deploy Checklist (Phase 1 + 2a → Vercel; Phase 2b → Web Store)

**Feature:** [ADR-009](../adr/009-apply-macro-chrome-extension.md) ·
**Spec:** [simplifyai-apply-macro-extension.md](../features/simplifyai-apply-macro-extension.md) ·
**Branch:** `simplifyAI-apply-macro`

> Golden rule: **no LLM provider key ever reaches the client bundle or the extension.**
> All model calls go through JWT-gated Supabase Edge Functions; keys are Edge secrets
> (BR-122). The SPA and extension carry only the public Supabase URL + anon key.

---

## A. Pre-merge gate (this branch)

- [ ] `pnpm validate` green (`typecheck && lint && test`) — currently passing (262 tests).
- [ ] `pnpm test:e2e` (`ai-uat`) run in a credentialed env (needs `TEST_USER_EMAIL`,
      `TEST_USER_PASSWORD`, `ANTHROPIC_KEY`, Browserbase) — these `test.skip` without
      creds, so they must run in CI, not headless-local.
- [ ] Manual Tailwind arbitrary-value grep on changed UI files (lint does **not** catch
      these): `JobFitPanel.tsx`, `jobFitPanel.helpers.ts`, `ProspectorJobSheet.tsx`,
      `PreferencesScreen.tsx` — confirmed clean.
- [ ] Manual smoke: in `review`/`assist` mode the Apply button opens `source_url` + moves
      the card to "In progress"; "Mark as applied" → `applied` (+ `application_events`
      row); `auto` mode unchanged; Preferences ↔ Dashboard mode toggles stay in sync.
- [ ] No migration in this branch (Phase 1 needs none; Phase 2a intentionally avoids the
      schema change). Confirm `git diff` touches no `supabase/migrations/**` and no
      `src/types/db.types.ts`.

## B. SPA → Vercel (Phase 1 + 2a)

- [ ] `vercel.json` unchanged (`framework: vite`, SPA rewrite already configured).
- [ ] Vercel **Environment Variables** (Production + Preview) — client-side, public:
      - [ ] `VITE_SUPABASE_URL`
      - [ ] `VITE_SUPABASE_ANON_KEY`
      - [ ] **Do NOT** set any `ANTHROPIC_*`/`OPENAI_*`/`GEMINI_*` here — they would be
            bundled into the SPA. Client only ever holds the anon key (RLS-protected).
- [ ] Build: `pnpm install --frozen-lockfile && pnpm build` (per `vercel.json`).
- [ ] Post-deploy smoke on the preview URL before promoting: load `/your-jobs`,
      `/prospector`; open a JD sidebar → Fit panel renders; Apply opens source link.

## C. Supabase Edge Functions / secrets (scoring backend the Fit panel + extension use)

- [ ] Edge secrets set on the hosted project (read only in `_shared/llm/factory.ts`):
      - [ ] `ANTHROPIC_KEY` (fallback `ANTHROPIC_API_KEY`)
      - [ ] `OPENAI_KEY` (fallback `OPENAI_API_KEY`)
      - [ ] `GEMINI_KEY` (fallback `GOOGLE_API_KEY` / `GEMINI_API_KEY`)
      - Auto-injected by Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
        `SUPABASE_SERVICE_ROLE_KEY` (service role used only by server-side workers, never
        by `score-job-fit` which is keyless/DB-write-free per ADR-007).
- [ ] `score-job-fit` deployed and live (Phase 2a + the extension's panel depend on it).
- [ ] Deploy via MCP `deploy_edge_function` to the hosted project (per repo workflow);
      **do not** `supabase db push` (version-drift replays MCP-applied migrations).
- [ ] Verify `provider-status` reports the configured providers (booleans only — never
      key material, BR-123).
- [ ] Confirm the $75/user/month cap config is intact (BR-052/104); cost-capped scoring
      degrades to the heuristic/"estimated" state, never an error.

## D. Extension → Chrome Web Store (Phase 2b — when built)

- [ ] MV3 `manifest.json`: `host_permissions` limited to the **defined board hosts**
      (spec §7); minimal `permissions` (`storage`, `scripting`/`activeTab`).
- [ ] Bundle audit: **zero** LLM keys, zero service-role key. Only the public Supabase
      URL + anon key; scoring via `score-job-fit` with the user's JWT.
- [ ] Field-mapping configs fetched from the remote (versioned) channel, not hardcoded,
      so DOM drift is fixable without a store re-review.
- [ ] CAPTCHA/auth/rate-limit: the macro never bypasses them — the human handles them
      (BR-032/033/034, BR-151). `submit.autoClick` is hard-coded `false`.
- [ ] Privacy disclosure: discloses reading ATS page content + the user's stored profile;
      no third-party data sale; data flows only to the user's own Supabase project.
- [ ] Release channel: unlisted/dev → internal UAT (spec §5) → public listing; signed
      auto-update enabled.

## E. Rollback

- SPA: redeploy the previous Vercel build; Phase 1/2a are additive and isolated (no
  schema change), so revert is low-risk.
- Edge: re-deploy the prior `score-job-fit` version via MCP.
- Extension: roll back to the prior Web Store version; field configs can be reverted
  independently via the remote config channel.
