---
name: project-serpapi-integration
description: SerpApi integrated as Google Jobs discovery engine for the Prospector cron. Architecture doc created; Edge Function drafted and validated.
metadata:
  type: project
---

SerpApi (Google Jobs engine) is the job discovery backend for the Automated Job Prospector (F-017). The `prospector-cron` Edge Function at `supabase/functions/prospector-cron/index.ts` is the implementation vehicle.

**Why:** Replaces planned custom scraping to avoid CAPTCHA bypass (BR-032), rate-limit issues (BR-033), and HTML parsing fragility.

**How to apply:** When touching the prospector feature, the architecture doc at `docs/architecture.md` §6.1 is authoritative for the SerpApi query parameter mapping. The schema actually uses array columns (`job_titles[]`, `locations[]`, `environments[]`, `keywords[]`, `job_types[]`) — NOT the single-value fields from the earlier schema proposal doc.

**Important schema note:** The task brief referenced single-value fields (`job_title`, `location`, `remote` boolean). These were the original proposal fields. The actual applied migration (`20260607000001_add_prospecting_tables.sql`) and generated types (`db.types.ts`) use array columns. Always trust `db.types.ts` over proposal docs.

**Status as of 2026-06-07:** `docs/architecture.md` created; Edge Function drafted and `pnpm validate` PASSED.

Related: [[project_missing_convention_docs]]
