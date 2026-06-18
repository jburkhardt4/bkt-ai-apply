import { getSupabaseClient } from '../../../lib/supabase'

export interface ActionRequiredBreakdown {
  unreviewedMatches: number
  interviews: number
  offers: number
  inbox: number
  total: number
}

// Recruiter/ATS emails that typically need a user response — excludes
// rejections and unclassified noise. Mirrors the inbox classification set.
const ACTIONABLE_EMAIL_CLASSIFICATIONS = ['interview_invite', 'offer', 'follow_up', 'outreach']

/**
 * Unified "Action Required" count — the centralized bottleneck indicator summed
 * across the funnel so neither top-of-funnel matches nor bottom-of-funnel offers
 * get ignored:
 *   - unreviewedMatches = discovery-stage matches awaiting Apply/Skip/Decline
 *   - interviews        = active interviews to schedule/confirm (scheduled/rescheduled)
 *   - offers            = offers awaiting the user's decision (stage = 'offer')
 *   - inbox             = unread recruiter/ATS messages needing a reply
 *                         (processed_at IS NULL + actionable classification)
 *
 * All head-only count queries (no rows transferred). Returns zeros on any error
 * so the nav badge degrades gracefully rather than throwing in the shell.
 */
export async function fetchActionRequiredCount(userId: string): Promise<ActionRequiredBreakdown> {
  const zero: ActionRequiredBreakdown = {
    unreviewedMatches: 0,
    interviews: 0,
    offers: 0,
    inbox: 0,
    total: 0,
  }
  const supabase = getSupabaseClient()

  try {
    const [matchesRes, interviewsRes, offersRes, inboxRes] = await Promise.all([
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('stage', 'discovery'),
      supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['scheduled', 'rescheduled']),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('stage', 'offer'),
      supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('processed_at', null)
        .in('classification', ACTIONABLE_EMAIL_CLASSIFICATIONS),
    ])

    const unreviewedMatches = matchesRes.count ?? 0
    const interviews = interviewsRes.count ?? 0
    const offers = offersRes.count ?? 0
    const inbox = inboxRes.count ?? 0

    return {
      unreviewedMatches,
      interviews,
      offers,
      inbox,
      total: unreviewedMatches + interviews + offers + inbox,
    }
  } catch {
    return zero
  }
}
