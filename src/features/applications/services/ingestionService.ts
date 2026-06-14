import { getSupabaseClient } from '../../../lib/supabase'
import { masterProfile } from '../data/masterProfile'
import { parseJobDescription, scoreJobFit } from './pipelineService'
import { scoreJobFitWithLlm } from './aiScoringService'
import {
  dedupeBySourceUrl,
  parseIngestionCsv,
  sourceUrlDedupKey,
  type IngestionDraftJob,
} from './ingestionCsv'

export interface IngestionResultRow {
  rowNumber: number
  sourceUrl: string
  title: string
  status: 'inserted' | 'duplicate' | 'failed'
  message: string
  jobId?: string
  applicationId?: string
}

export interface IngestionRunResult {
  results: IngestionResultRow[]
}

export interface ScoreRunResult {
  status: 'saved' | 'queued'
  label: 'reject' | 'consideration' | 'auto_submit_prep'
  recommendation: 'reject' | 'consider' | 'apply'
  overallScore: number
  message: string
}

function toLabelKey(label: 'Reject' | 'Consideration' | 'Auto-Submit Prep'): ScoreRunResult['label'] {
  if (label === 'Auto-Submit Prep') {
    return 'auto_submit_prep'
  }

  if (label === 'Consideration') {
    return 'consideration'
  }

  return 'reject'
}

function buildReasoningTrace(job: {
  id: string
  source_url: string
  title: string
  description: string | null
}) {
  return {
    rule_refs: ['BR-020', 'BR-021', 'BR-022'],
    scoring_input: {
      job_id: job.id,
      source_url: job.source_url,
      title: job.title,
      text_used: job.description?.trim() ? 'description' : 'title',
    },
  }
}

export function parseCsvIngestionText(csvText: string) {
  return parseIngestionCsv(csvText)
}

export async function runIngestion(params: {
  userId: string
  rows: IngestionDraftJob[]
  sourceFallback: string
}): Promise<IngestionRunResult> {
  const supabase = getSupabaseClient()
  const deduped = dedupeBySourceUrl(params.rows)

  const existingBySourceUrl = new Map<string, { jobId: string; title: string }>()
  const uniqueSourceUrls = deduped.uniqueRows.map((row) => row.sourceUrl)

  if (uniqueSourceUrls.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from('jobs')
      .select('id, source_url, title')
      .eq('user_id', params.userId)
      .in('source_url', uniqueSourceUrls)

    if (existingError) {
      throw new Error(`Failed to check existing jobs: ${existingError.message}`)
    }

    for (const row of existingRows ?? []) {
      existingBySourceUrl.set(sourceUrlDedupKey(row.source_url), {
        jobId: row.id,
        title: row.title,
      })
    }
  }

  const results: IngestionResultRow[] = []

  for (const duplicateRow of deduped.duplicateRows) {
    results.push({
      rowNumber: duplicateRow.rowNumber,
      sourceUrl: duplicateRow.sourceUrl,
      title: duplicateRow.title,
      status: 'duplicate',
      message: 'Duplicate source_url in this run; skipped.',
    })
  }

  for (const row of deduped.uniqueRows) {
    const dedupKey = sourceUrlDedupKey(row.sourceUrl)
    const existing = existingBySourceUrl.get(dedupKey)

    if (existing) {
      results.push({
        rowNumber: row.rowNumber,
        sourceUrl: row.sourceUrl,
        title: row.title,
        status: 'duplicate',
        message: 'Duplicate source_url already exists; skipped.',
        jobId: existing.jobId,
      })
      continue
    }

    const { data: insertedJob, error: jobInsertError } = await supabase
      .from('jobs')
      .insert({
        user_id: params.userId,
        source_url: row.sourceUrl,
        title: row.title,
        location: row.location ?? null,
        description: row.description ?? null,
        source: row.source ?? params.sourceFallback,
        remote_type: row.remoteType ?? null,
        application_method: row.applicationMethod ?? null,
      })
      .select('id, source_url, title')
      .single()

    if (jobInsertError) {
      const isDuplicate = jobInsertError.code === '23505'
      results.push({
        rowNumber: row.rowNumber,
        sourceUrl: row.sourceUrl,
        title: row.title,
        status: isDuplicate ? 'duplicate' : 'failed',
        message: isDuplicate
          ? 'Duplicate source_url already exists; skipped.'
          : `Insert failed: ${jobInsertError.message}`,
      })
      continue
    }

    const { data: applicationRow, error: appInsertError } = await supabase
      .from('applications')
      .insert({
        user_id: params.userId,
        job_id: insertedJob.id,
        stage: 'discovery',
      })
      .select('id')
      .single()

    if (appInsertError && appInsertError.code !== '23505') {
      results.push({
        rowNumber: row.rowNumber,
        sourceUrl: row.sourceUrl,
        title: row.title,
        status: 'failed',
        message: `Application creation failed: ${appInsertError.message}`,
        jobId: insertedJob.id,
      })
      continue
    }

    let applicationId = applicationRow?.id

    if (!applicationId) {
      const { data: existingApplication, error: applicationFetchError } = await supabase
        .from('applications')
        .select('id')
        .eq('user_id', params.userId)
        .eq('job_id', insertedJob.id)
        .maybeSingle()

      if (applicationFetchError) {
        results.push({
          rowNumber: row.rowNumber,
          sourceUrl: row.sourceUrl,
          title: row.title,
          status: 'failed',
          message: `Application lookup failed: ${applicationFetchError.message}`,
          jobId: insertedJob.id,
        })
        continue
      }

      applicationId = existingApplication?.id
    }

    results.push({
      rowNumber: row.rowNumber,
      sourceUrl: row.sourceUrl,
      title: row.title,
      status: 'inserted',
      message: 'Inserted and staged at discovery.',
      jobId: insertedJob.id,
      applicationId,
    })
  }

  return { results }
}

export async function runScoreForJob(params: {
  userId: string
  jobId: string
  applicationId?: string
}): Promise<ScoreRunResult> {
  const supabase = getSupabaseClient()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, title, source_url, description')
    .eq('id', params.jobId)
    .eq('user_id', params.userId)
    .single()

  if (jobError) {
    throw new Error(`Failed to load job for scoring: ${jobError.message}`)
  }

  const textToScore = job.description?.trim() ? job.description : job.title
  const parsed = parseJobDescription(textToScore, masterProfile)
  // Deterministic heuristic — kept as the explicit cost-cap / Edge-error
  // fallback for the LLM scoring path (never removed).
  const heuristicMatch = scoreJobFit(parsed, masterProfile)

  // Prefer the routed LLM scorer (BR-103: match_scoring → score-job-fit Edge
  // Function); it persists ai_scores via the same persistAiScore path and falls
  // back to the heuristic above on cost cap or Edge error.
  const persisted = await scoreJobFitWithLlm({
    userId: params.userId,
    jobId: params.jobId,
    job: { id: job.id, title: job.title, source_url: job.source_url, description: job.description, text: textToScore },
    profile: masterProfile,
    heuristicMatch,
    heuristicReasoningTrace: buildReasoningTrace(job),
    applicationId: params.applicationId,
  })

  // Update match_score on any existing application for this job. The `.select('id')`
  // lets us detect whether a row existed (empty array = no application yet).
  const { data: updatedRows, error: applicationUpdateError } = await supabase
    .from('applications')
    .update({ match_score: persisted.overallScore })
    .eq('user_id', params.userId)
    .eq('job_id', params.jobId)
    .select('id')

  if (applicationUpdateError) {
    throw new Error(`Failed to update application score: ${applicationUpdateError.message}`)
  }

  // If no application row existed and the score meets the pipeline entry threshold
  // (BR-020, >= 60), create a discovery entry. Prospector-discovered jobs are inserted
  // into `jobs` by the Edge Function but never get an `applications` row until here.
  // Sub-threshold jobs intentionally stay as untracked listings — they don't enter
  // the apply pipeline.
  if ((updatedRows ?? []).length === 0 && persisted.overallScore >= 60) {
    const { error: insertError } = await supabase
      .from('applications')
      .insert({
        user_id: params.userId,
        job_id: params.jobId,
        match_score: persisted.overallScore,
        stage: 'discovery',
      })
    // 23505 = unique_violation: a concurrent scoring request created the row between
    // our UPDATE (no-op) and this INSERT — the next call will update the score.
    if (insertError && insertError.code !== '23505') {
      throw new Error(`Failed to create application from score: ${insertError.message}`)
    }
  }

  return {
    status: persisted.status,
    label: toLabelKey(persisted.decision.label),
    recommendation: persisted.decision.recommendation,
    overallScore: persisted.overallScore,
    message:
      persisted.status === 'queued'
        ? persisted.reason
        : 'Score saved with recommendation for manual review flow.',
  }
}
