-- ============================================================
-- Migration: 20260622000005_corpus_projector
-- Feature:   Phase 5 — project the shared corpus into per-user jobs (ADR-019 #5)
-- RPCs (service-role only):
--   * project_corpus_for_profile(profile_id, limit) -> int
--   * project_corpus_all(limit_per_profile)          -> jsonb
--
-- Reads the SHARED job_postings corpus (ADR-019) and inserts the best FTS matches
-- for a prospecting_profile into that profile owner's USER-SCOPED jobs table with
-- source='corpus'. The user-scoped jobs table and its RLS are UNTOUCHED; these run
-- as service role and set user_id = profile.user_id, satisfying the jobs RLS
-- WITH CHECK. Dedup via ON CONFLICT (source_url) DO NOTHING (the existing global
-- unique) — a posting already in jobs (SerpApi or a prior projection) is skipped.
--
-- Matching: an OR'd tsquery over the profile's job_titles (primary signal),
-- filtered by environment→remote_type and min_salary (null salary kept, mirroring
-- the prospector). Ordered by ts_rank. Location matching + keyword boosting are
-- v1 follow-ups.
--
-- Additive only. Applied via MCP apply_migration; repo record (no `db push`).
-- ============================================================

CREATE OR REPLACE FUNCTION public.project_corpus_for_profile(
  p_profile_id uuid,
  p_limit      integer DEFAULT 25
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      uuid;
  v_titles       text[];
  v_environments text[];
  v_min_salary   integer;
  v_query_text   text;
  v_query        tsquery;
  v_remote_set   text[];
  v_inserted     integer;
BEGIN
  SELECT user_id, job_titles, environments, min_salary
    INTO v_user_id, v_titles, v_environments, v_min_salary
    FROM public.prospecting_profiles
   WHERE id = p_profile_id AND is_active = true;
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- OR-join each title's websearch tsquery: ('salesforc' & 'consult') || (...).
  SELECT string_agg('(' || websearch_to_tsquery('english', t)::text || ')', ' | ')
    INTO v_query_text
    FROM unnest(coalesce(v_titles, '{}'::text[])) AS t
   WHERE websearch_to_tsquery('english', t)::text <> '';
  IF v_query_text IS NULL OR v_query_text = '' THEN
    RETURN 0;  -- no usable titles → nothing to project
  END IF;
  v_query := v_query_text::tsquery;

  -- environment → remote_type vocabulary (profiles use 'in-office'/'in_office').
  v_remote_set := ARRAY(
    SELECT CASE lower(e)
             WHEN 'in-office' THEN 'onsite'
             WHEN 'in_office' THEN 'onsite'
             WHEN 'onsite'    THEN 'onsite'
             WHEN 'remote'    THEN 'remote'
             WHEN 'hybrid'    THEN 'hybrid'
             ELSE lower(e)
           END
    FROM unnest(coalesce(v_environments, '{}'::text[])) AS e
  );

  WITH matched AS (
    SELECT jp.company_id, jp.title, jp.location_raw, jp.remote_type,
           jp.salary_min, jp.salary_max, jp.description_text, jp.application_url,
           jp.posted_at, jp.employment_type,
           ts_rank(jp.search_tsv, v_query) AS rank
      FROM public.job_postings jp
     WHERE jp.closed_at IS NULL
       AND jp.search_tsv @@ v_query
       AND (cardinality(v_remote_set) = 0 OR jp.remote_type IS NULL OR jp.remote_type = ANY (v_remote_set))
       AND (v_min_salary IS NULL OR jp.salary_max IS NULL OR jp.salary_max >= v_min_salary)
     ORDER BY rank DESC, jp.posted_at DESC NULLS LAST
     LIMIT GREATEST(p_limit, 0)
  ),
  ins AS (
    INSERT INTO public.jobs (
      user_id, company_id, title, location, remote_type,
      compensation_min, compensation_max, description, skills,
      source, source_url, application_method, posted_at, job_type
    )
    SELECT
      v_user_id, m.company_id, m.title, m.location_raw, m.remote_type,
      m.salary_min, m.salary_max, m.description_text, '{}'::text[],
      'corpus', m.application_url, 'ats', m.posted_at, m.employment_type
    FROM matched m
    ON CONFLICT (source_url) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.project_corpus_for_profile(uuid, integer) IS
  'ADR-019 #5: service-role-only. Projects the best FTS matches from the shared job_postings corpus into the profile owner''s user-scoped jobs (source=corpus, dedup on source_url). Returns count inserted.';

REVOKE EXECUTE ON FUNCTION public.project_corpus_for_profile(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.project_corpus_for_profile(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.project_corpus_all(
  p_limit_per_profile integer DEFAULT 25
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  r         record;
  v_n       integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR r IN SELECT id FROM public.prospecting_profiles WHERE is_active = true LOOP
    v_n := public.project_corpus_for_profile(r.id, p_limit_per_profile);
    v_results := v_results || jsonb_build_object('profile_id', r.id, 'inserted', v_n);
  END LOOP;
  RETURN jsonb_build_object('projected', v_results);
END;
$$;

COMMENT ON FUNCTION public.project_corpus_all(integer) IS
  'ADR-019 #5: service-role-only. Runs project_corpus_for_profile for every active prospecting_profile. Returns per-profile insert counts.';

REVOKE EXECUTE ON FUNCTION public.project_corpus_all(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.project_corpus_all(integer) TO service_role;
