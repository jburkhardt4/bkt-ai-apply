/**
 * notify — auto-apply outcome notifications (ADR-006 decision #7, 2026-06-14).
 *
 * On a successful (or failed) auto-submission the worker calls this to (1) insert
 * an in-app `notifications` row and (2) send an email via Resend. BR-038 stays
 * intact: this is Resend, NOT an autonomous Gmail send. Both paths are
 * best-effort — a notification failure never affects the submission outcome
 * (the submission is already finalized + event-sourced before we notify).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface NotifyInput {
  userId: string
  applicationId: string
  jobId: string
  channel: string
}

/** Look up job title + company for a human-readable message (best-effort). */
async function lookupRole(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ title: string; company: string }> {
  let title = 'a role'
  let company = 'the company'
  try {
    const { data } = await supabase
      .from('jobs')
      .select('title, companies(name)')
      .eq('id', jobId)
      .maybeSingle()
    if (data) {
      title = (data.title as string | null) ?? title
      const companies = (data as { companies: unknown }).companies
      const c = Array.isArray(companies) ? companies[0] : companies
      company = (c as { name?: string } | null)?.name ?? company
    }
  } catch {
    /* best-effort */
  }
  return { title, company }
}

async function sendResendEmail(subject: string, text: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('SUBMISSION_NOTIFY_EMAIL') ?? Deno.env.get('GMAIL_USER_EMAIL')
  if (!resendKey || !to) return // not configured → skip silently
  const from = Deno.env.get('RESEND_FROM') ?? 'BKT AI-Apply <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    })
    if (!res.ok) {
      console.error(`notify: resend send failed (HTTP ${res.status})`)
    }
  } catch (err) {
    console.error(`notify: resend send error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function notifyAutoApplyOutcome(
  supabase: SupabaseClient,
  input: NotifyInput,
  success: boolean,
): Promise<void> {
  const { title, company } = await lookupRole(supabase, input.jobId)
  const subject = success
    ? `Auto-applied: ${title} at ${company}`
    : `Auto-apply failed: ${title} at ${company}`
  const body = success
    ? `BKT AI-Apply submitted your application to ${title} at ${company} via ${input.channel}.`
    : `BKT AI-Apply could not submit your application to ${title} at ${company} (${input.channel}). It needs manual attention.`

  // In-app notification (always attempted).
  try {
    await supabase.from('notifications').insert({
      user_id: input.userId,
      application_id: input.applicationId,
      notification_type: success ? 'auto_submitted' : 'submission_failed',
      title: subject,
      body,
    })
  } catch (err) {
    console.error(`notify: notifications insert failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Email via Resend (best-effort; skipped when unconfigured).
  await sendResendEmail(subject, body)
}
