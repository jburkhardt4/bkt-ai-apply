// BKT AI-Apply — client glue for the document builder's "real" AI features.
//
// Bridges the redesigned DocBuilder / DocAssistant surface to the existing
// generation + chat services:
//   - alignDocumentToJob → documentGenerationService (generate-document Edge
//     Function, cost-gated + persisted) for the Auto-Align action.
//   - askDocWriter → chatCompletionService (ai-chat Edge Function) for the
//     in-builder assistant, grounded in the current document + target job.
//
// LLM calls happen ONLY inside the Edge Functions; this module never holds a
// provider key. All DB access stays inside the wrapped services (RLS-scoped).
import {
  generateCoverLetter,
  generateResumeVariant,
} from '@/features/applications/services/documentGenerationService'
import { sendChatMessage } from '@/features/ai-agent/services/chatCompletionService'
import type { DocContent, DocType } from '../screens/DocPaper'
import type { AiTargetJob } from '../screens/DocAssistant'
import type { LetterContent, ResumeContent } from '../types'

export type AlignDocResult =
  | { status: 'generated'; content: string; source: 'llm' | 'template_fallback' }
  | { status: 'queued'; reason: string }

/** Pulls a profile summary + highlight bullets out of the current builder doc. */
function deriveProfileFromContent(type: DocType, content: DocContent): { profile: string; highlights: string[] } {
  if (type === 'resume') {
    const rc = content as ResumeContent
    const bullets = rc.experience.flatMap((e) => e.bullets)
    return {
      profile: [rc.headline, rc.summary].filter(Boolean).join(' — '),
      highlights: bullets.length > 0 ? bullets.slice(0, 6) : rc.skills.slice(0, 6),
    }
  }
  const lc = content as LetterContent
  return {
    profile: lc.body[0] ?? '',
    highlights: lc.body.slice(1).filter(Boolean).slice(0, 4),
  }
}

/**
 * Generates fresh document copy aligned to `lastJob` via the routed Edge
 * Function. Returns the generated text (LLM or template fallback) so the
 * builder can drop it into the editable summary / first body paragraph.
 */
export async function alignDocumentToJob(params: {
  userId: string
  type: DocType
  lastJob: AiTargetJob
  content: DocContent
}): Promise<AlignDocResult> {
  const { profile, highlights } = deriveProfileFromContent(params.type, params.content)
  const jobDescription = [params.lastJob.title, (params.lastJob.skills ?? []).join(', ')]
    .filter(Boolean)
    .join(' — ')

  const currentContent = params.type === 'resume'
    ? (params.content as ResumeContent).summary
    : (params.content as LetterContent).body[0]

  const input = {
    userId: params.userId,
    jobTitle: params.lastJob.title,
    companyName: params.lastJob.company,
    jobDescription: jobDescription || params.lastJob.title,
    masterProfile: profile,
    highlights,
    currentContent,
    // Persist the aligned document to the `documents` table (Storage + row).
    persist: true,
  }

  const result =
    params.type === 'resume' ? await generateResumeVariant(input) : await generateCoverLetter(input)

  if (result.status === 'queued') {
    return { status: 'queued', reason: result.reason }
  }
  return {
    status: 'generated',
    content: result.document.content,
    source: result.document.metadata.source,
  }
}

/** Builds the doc-editing system prompt grounding the assistant in the job + doc. */
export function buildDocAssistantPrompt(type: DocType, lastJob: AiTargetJob): string {
  const noun = type === 'resume' ? 'resume' : 'cover letter'
  return [
    `You are an expert ${noun} writer helping the candidate tailor their ${noun}.`,
    `The target role is "${lastJob.title}" at ${lastJob.company}.`,
    lastJob.skills && lastJob.skills.length > 0
      ? `Relevant posting skills: ${lastJob.skills.join(', ')}.`
      : '',
    'Be concise and practical. When you propose new copy, return the rewritten',
    `${noun} text directly so it can be pasted in. Never fabricate experience.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export interface DocWriterReply {
  text: string
  status: 'answered' | 'deferred'
}

/**
 * One assistant turn for the in-builder writer. Reuses the ai-chat path
 * (chatCompletionService) which persists the turn, logs usage, and routes
 * through the Edge Function. The job-grounded system prompt is folded into the
 * user message since chatCompletionService owns its own system prompt builder.
 */
export async function askDocWriter(params: {
  userId: string
  type: DocType
  lastJob: AiTargetJob
  conversationId: string | null
  message: string
}): Promise<DocWriterReply & { conversationId: string }> {
  const grounding = buildDocAssistantPrompt(params.type, params.lastJob)
  const result = await sendChatMessage({
    userId: params.userId,
    conversationId: params.conversationId,
    message: `${grounding}\n\nRequest: ${params.message}`,
  })
  return {
    text: result.assistantMessage.content,
    status: result.status,
    conversationId: result.conversationId,
  }
}
