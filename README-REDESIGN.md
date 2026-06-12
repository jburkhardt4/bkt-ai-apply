# BKT AI-Apply — UI/UX Redesign Implementation

Full implementation of the BKT AI-Apply redesign (the `ui_kits/ai-apply` design-system
prototype) into this React 19 / Vite / TypeScript / Supabase codebase.

## How to apply

Unzip this package over the repo root (it only adds/overwrites the files listed below),
then in your Codespace:

```bash
pnpm install        # no new dependencies — uses existing react, lucide-react, supabase
pnpm dev            # redesigned app at /
pnpm validate       # typecheck + lint + tests
pnpm test:e2e       # UI changed → run Playwright per CLAUDE.md
```

No env changes. With `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set, the dashboard and
inbox run against live data; without them (or with empty tables) every screen falls back
to seeded demo data so the UI is always reviewable.

## What changed

### Modified
| File | Change |
| --- | --- |
| `index.html` | BKT favicon, title, Geist webfonts |
| `src/index.css` | Tokens now come from `src/styles/bkt.css` (BKT navy + zinc, Geist, radii/shadows/motion); Tailwind v4 `@theme` maps them, so legacy pages pick up the rebrand too |
| `src/App.tsx` | Routes for the redesigned surface: `/` (Auto Apply dashboard), `/inbox`, `/search`, `/saved`, `/preferences`, `/resumes`, `/cover-letters`, `/buddy`, `/mock` + legacy `/pipeline`, `/ingestion`, `/prospector`, `/settings` |
| `src/components/AppShell.tsx` | Redesigned shell: BKT sidebar (Auto Apply / Documents / Interview / Platform groups, user footer, live nav badges), auth gate preserved, AI chat agent preserved as a right slide-over launched from the sidebar |

`src/components/AppSidebar.tsx` (the old left nav) is now unused — safe to delete.

### New — design-system primitives (presentational only)
`src/components/bkt/` — Icon (lucide kebab-name wrapper), BktButton, BktBadge, BktAvatar,
BktInput, BktCard + BktStatCard, BktCheckbox + BktSkeleton, MatchScore, JobRow,
bits (ChipPill/QualLine/SkillTag/companyLogo/formatStamp), toast (BktToastProvider/useBktToast).

### New — feature surface
`src/features/auto-apply/`
- `AutoApplyDashboard.tsx` — Your Jobs (stats, filter tabs, table) + Quick Review
  (drag-to-swipe / ← → ↓ keys) + JD sidebar + credits capsule + review-mode menu +
  validated budget modal
- `screens/` — JobsScreen, QuickReview, JDSidebar, InboxScreen (master–detail mail
  client with folder/unread/label filters), SearchScreen (job board with filter menus),
  SavedScreen, DocsScreen/DocBuilder/DocPaper/DocAssistant (resume & cover-letter home,
  builder with template gallery + live paper + AI writer rail), PreferencesScreen
- `services/autoApplyService.ts` — maps live rows → view models; demo-seed fallback
- `data/` — seeds ported from the design system (demo fallback dataset)
- `router.ts`, `state.ts`, `hooks/`, `components/` (chrome + sidebar), `types.ts`

### New — assets & styles
`public/brand/` (shield logo, favicon, profile photo) ·
`src/styles/bkt.css` (token port) · `src/styles/auto-apply.css` (keyframes)

## Data wiring (and its boundaries)

- **Dashboard**: `applications` ⨝ `jobs` ⨝ `companies` ⨝ `ai_scores` → job matches.
  Apply → `transition_stage` RPC (`discovery → applied`), Decline → `→ rejected` —
  both event-sourced through `application_events` via the existing
  `applicationService.transitionStage` (non-negotiable #4 respected). Demo rows update
  client-side only.
- **Inbox**: `emails` table (classification → label taxonomy, `processed_at` → unread).
  Reply/Forward/Not-this-time are toasts only (no Gmail send pipeline exists yet).
- **Search**: seeded job-board data. Follow-up: feed it from prospector search results.
- **Saved / credits / budget / review-mode / preferences form**: localStorage
  (`bkt-auto-apply:*`) — no backing tables exist yet. Suggested follow-up migrations:
  `saved_jobs`, `user_settings` (credits/budget/mode), then swap the hooks in
  `src/features/auto-apply/state.ts` (single touch point).
- **Documents**: seeded history + simulated upload/align. Follow-up: wire to
  `documents` + `documentStorageService`.
- JD sidebar “Application” tab is intentionally a placeholder (not designed in the kit);
  wiring it to `fetchAuditLog` is a natural follow-up.

## Verification done here

The full UI was executed and interaction-tested in a browser harness running this exact
`src/` tree (Supabase unconfigured → demo path): all 9 routes render; apply/decline
update stats/credits/queue + fire toasts; JD sidebar tabs; budget validation
($20–$5,000); Quick Review keyboard swipe; Search auto-apply/save → Saved list →
document auto-align target; Inbox unread filter, read-marking, delete. Run
`pnpm validate` + `pnpm test:e2e` in the Codespace to confirm typecheck/lint/e2e in CI
conditions, and update Playwright selectors that referenced the old shell if any fail.
