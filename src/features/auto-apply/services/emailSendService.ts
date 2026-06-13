// BKT AI-Apply — client bridge to the gmail-send Edge Function (BR-038).
// Sending is always an explicit user action from the Inbox UI; AI drafts are
// returned for review and never sent automatically. functions.invoke attaches
// the caller's Supabase JWT, which gmail-send verifies server-side.
import { getSupabaseClient } from '@/lib/supabase'

export interface SendEmailParams {
  mode: 'reply' | 'forward' | 'compose'
  emailId?: string
  to?: string
  subject?: string
  body: string
}

interface SendResponse {
  sent?: boolean
  threadId?: string | null
  error?: string
}

interface DraftResponse {
  draft?: string
  error?: string
}

export async function sendEmail(params: SendEmailParams): Promise<{ threadId: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<SendResponse>('gmail-send', {
    body: params,
  })
  if (error) throw new Error(error.message)
  if (!data?.sent) throw new Error(data?.error ?? 'Send failed')
  return { threadId: data.threadId ?? null }
}

/** AI-drafted reply body for an ingested email — always human-reviewed. */
export async function draftReply(emailId: string): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<DraftResponse>('gmail-send', {
    body: { mode: 'draft', emailId },
  })
  if (error) throw new Error(error.message)
  if (!data?.draft) throw new Error(data?.error ?? 'Draft failed')
  return data.draft
}
