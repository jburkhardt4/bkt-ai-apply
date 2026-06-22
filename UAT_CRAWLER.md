# ✅ UAT — ATS Crawler & Indexing

Run SQL in **Supabase → SQL Editor**, curl
in a terminal, UI in the app. Baselines
are from the overnight run; live numbers
drift as boards add/close roles.

**Base URL:**
`https://rmoyuwesfljuygvpdolf.supabase.co/functions/v1`
**Your profile id:**
`0a041161-7567-40d7-9d9e-53747233a91f`

---

## A · Deploy & schedule

- [ ] **A1** Both functions show **ACTIVE**
  in Dashboard → Edge Functions
  (`crawler-worker`, `crawler-discover`).
- [ ] **A2** Both crons active:

```sql
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname LIKE 'crawler-%';
```

  → `crawler-discover-6h` (`0 */6 * * *`)
  + `crawler-worker-10m` (`*/10 * * * *`),
  `active = true`.

---

## B · Crawl is running

- [ ] **B1** All boards healthy:

```sql
SELECT board_token, ats_family,
       last_status, consecutive_failures,
       last_synced_at
  FROM ats_boards
 ORDER BY board_token;
```

  → 4 rows; every `last_status='ok'`,
  `consecutive_failures=0`,
  `last_synced_at` within ~10 min.

- [ ] **B2** Queue draining, nothing stuck:

```sql
SELECT status, count(*)
  FROM crawl_jobs GROUP BY status;
```

  → mostly `done`; no `running` older than
  a few min; no `failed`/`blocked`.

- [ ] **B3** *(optional)* Manual run:

```bash
curl -s -X POST \
  "$BASE/crawler-discover" \
  -H 'Content-Type: application/json' \
  -d '{}'
curl -s -X POST \
  "$BASE/crawler-worker" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

  → discover `{seeded:4,…,enqueued:N}`;
  worker `{claimed:N, results:[… "ok"]}`.

---

## C · Corpus data quality

- [ ] **C1** Postings present (~287 active):

```sql
SELECT count(*) total,
       count(*) FILTER
         (WHERE closed_at IS NULL) active
  FROM job_postings;
```

- [ ] **C2** Every posting has a company:

```sql
SELECT count(*) FROM job_postings
 WHERE company_name IS NULL;   -- → 0
```

- [ ] **C3** Core fields populated:

```sql
SELECT title, company_name,
       application_url, remote_type,
       (description_text IS NOT NULL)
         AS has_desc, posted_at
  FROM job_postings
 WHERE closed_at IS NULL
 ORDER BY first_seen_at DESC LIMIT 5;
```

  → title / company / `application_url`
  non-null; descriptions present.

- [ ] **C4** 4 companies:

```sql
SELECT company_name, count(*)
  FROM job_postings
 WHERE closed_at IS NULL
 GROUP BY company_name;
```

  → Tech Holding, Monster Energy,
  Directive, Swans.

---

## D · Search (FTS + filters)

- [ ] **D1** Full-text returns relevant:

```sql
SELECT company_name, title
  FROM job_postings
 WHERE search_tsv @@ websearch_to_tsquery(
         'english','salesforce consultant')
   AND closed_at IS NULL
 LIMIT 10;
```

  → Salesforce roles (Directive / Swans).

- [ ] **D2** Remote filter works:

```sql
SELECT count(*) FROM job_postings
 WHERE remote_type='remote'
   AND closed_at IS NULL;   -- → > 0
```

- [ ] **D3** Fuzzy / typo (pg_trgm):

```sql
SELECT DISTINCT company_name
  FROM job_postings
 WHERE company_name % 'directiv'
 LIMIT 5;                   -- → Directive
```

---

## E · Dedup & incremental sync

- [ ] **E1** No-churn: run the worker twice
  (B3). Second run reports `unchanged > 0`
  and `inserted ≈ 0`; total posting count
  stays stable (no duplicates).
- [ ] **E2** Close detection: `total ≥ active`
  (C1). Roles that vanish from a board get
  `closed_at` set — 3 were already
  auto-closed overnight.

---

## F · Circuit breaker *(optional)*

- [ ] **F1** Healthy boards
  `consecutive_failures = 0` (B1).
- [ ] **F2** *(destructive)* Block a board,
  confirm it is NOT re-enqueued, then reset:

```sql
UPDATE ats_boards SET last_status='blocked'
 WHERE board_token='swans';
-- trigger discover (B3), then:
SELECT count(*) FROM crawl_jobs q
  JOIN ats_boards b ON b.id=q.board_id
 WHERE b.board_token='swans'
   AND q.status IN ('pending','running');
-- → 0 (skipped). Reset:
UPDATE ats_boards
   SET last_status='ok',
       consecutive_failures=0
 WHERE board_token='swans';
```

---

## G · Projector (corpus → your jobs)

- [ ] **G1** 15 corpus jobs present:

```sql
SELECT count(*) FROM jobs
 WHERE source='corpus';        -- → 15
```

- [ ] **G2** Relevant + mapped right:

```sql
SELECT title, remote_type,
       application_method, source
  FROM jobs
 WHERE source='corpus' LIMIT 10;
```

  → remote Salesforce / Sales-Ops roles;
  `application_method='ats'`.

- [ ] **G3** Idempotent (re-run inserts 0):

```sql
SELECT project_corpus_for_profile(
  '0a041161-7567-40d7-9d9e-53747233a91f',
  15);                         -- → 0
```

- [ ] **G4** **UI:** open the app →
  Prospector / Jobs → the 15 corpus roles
  appear and are relevant.

---

## H · Security / RLS

- [ ] **H1** Advisors clean: Dashboard →
  Advisors → no NEW findings on
  `job_postings` / `ats_boards` /
  `crawl_jobs`; RLS enabled on all.
- [ ] **H2** Corpus is read-all but
  **service-role-write only** — a signed-in
  user can read `job_postings` but an
  INSERT is denied by RLS (no write policy).

---

## I · Regression (nothing else broke)

- [ ] **I1** Your existing jobs intact:

```sql
SELECT source, count(*)
  FROM jobs GROUP BY source;
```

  → `corpus = 15` plus your prior
  prospector / manual jobs, unchanged.

- [ ] **I2** Existing crons unaffected:

```sql
SELECT jobname, active FROM cron.job
 ORDER BY jobname;
```

  → `gmail-sync-15m`,
  `prospector-cron-8am` / `-6pm` still
  active.

- [ ] **I3** PR #29 `CI` (typecheck · lint ·
  test) is green and the PR is MERGEABLE.

---

## J · Documented gates (verify — don't change)

- [ ] **J1** `CRON_SECRET` is unset →
  crawler runs fail-open by design
  (Dashboard → Edge Functions → Secrets).
- [ ] **J2** No `corpus-projector` cron
  exists → the projector is NOT
  auto-writing to `jobs`:

```sql
SELECT count(*) FROM cron.job
 WHERE jobname LIKE 'corpus-projector%';
-- → 0
```

---

## K · Cleanup *(optional, after UAT)*

```sql
-- remove the 15 test corpus jobs, or keep
-- them (they're real + relevant):
DELETE FROM public.jobs WHERE source='corpus';
```

---
**Overnight baselines:** 4 boards `ok` ·
287 active postings (3 auto-closed) · all
company-labeled · 15 corpus jobs · both
crons active.
