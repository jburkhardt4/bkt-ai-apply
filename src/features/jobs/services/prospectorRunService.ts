// BKT AI-Apply — prospector run trigger
// Invokes the prospector-cron Edge Function on demand (the same immediate path
// as the Prospector "Run Now" button), so the dashboard Play/Resume can kick an
// immediate search before the twice-daily pg_cron (8am/18pm UTC) picks it up.
// The recurring 12-hour cadence is owned server-side; this is only the manual
// "trigger now" leg.
import { getSupabaseClientSafe } from '@/lib/supabase'
import { summarizeRunResults, type ProspectorRunResponse, type RunOutcomeKind } from '../summarizeRunResults'

// Transport/UX ceiling on the invoke — a hung Edge Function must not strand the
// "searching…" state. A full prospector run fans out several SerpApi queries, so
// 30s aborted legitimate runs mid-flight; 90s gives a real run room to finish
// while still capping a genuinely hung function (the Dashboard Play/Resume is now
// the only on-demand run path after the /prospector page was removed, ADR-016).
const RUN_TIMEOUT_MS = 90_000

export interface ProspectorRunOutcome {
  ok: boolean
  kind: RunOutcomeKind
  message: string
}

export async function triggerProspectorRun(): Promise<ProspectorRunOutcome> {
  const supabase = getSupabaseClientSafe()
  if (!supabase) {
    return { ok: false, kind: 'error', message: 'Supabase is not configured — search requires a live backend.' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS)
  try {
    const { data, error } = await supabase.functions.invoke<ProspectorRunResponse>(
      'prospector-cron',
      { signal: controller.signal },
    )
    if (error) return { ok: false, kind: 'error', message: 'Search failed. Please try again.' }
    const outcome = summarizeRunResults(data ?? null)
    return { ok: outcome.kind !== 'error', kind: outcome.kind, message: outcome.message }
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')
    return {
      ok: false,
      kind: 'error',
      message: aborted ? 'Search timed out — please try again' : 'Search failed. Please try again.',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
