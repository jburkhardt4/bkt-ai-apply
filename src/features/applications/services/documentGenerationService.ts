import type { Json } from '../../../types/db.types'
import type { AiTaskType } from '../../../types/pipeline'
import { getModelPricing, logAiUsage, routeAiTask } from '../../../lib/ai-router'
import { getSupabaseClient } from '../../../lib/supabase'
import { createDocumentVersion, type StoredDocumentVersion } from './documentStorageService'

interface GenerationUsage {
  tokensIn: number
  tokensOut: number
  estimatedCostUsd: number
}

interface GenerationInputBase {
  userId: string
  applicationId?: string
  jobTitle: string
  companyName: string
  jobDescription: string
  masterProfile: string
  highlights: string[]
  /** Existing draft to revise (forwarded to the Edge Function as currentContent). */
  currentContent?: string
  /**
   * When true, the generated document is persisted to the `documents` table
   * (Storage + row) via documentStorageService and surfaced in metadata. The
   * submission-packet flow leaves this off — it persists + links the documents
   * itself after generation, so enabling it here would double-write.
   */
  persist?: boolean
  nowIso?: string
  usageOverride?: GenerationUsage
}

export interface ResumeVariantInput extends GenerationInputBase {
  resumeTitlePrefix?: string
}

export interface CoverLetterInput extends GenerationInputBase {
  letterTitlePrefix?: string
}

export interface GeneratedDocumentPayload {
  title: string
  content: string
  metadata: {
    taskType: AiTaskType
    modelName: string
    modelProvider: string
    costPolicyStatus: string
    monthlySpendUsd: number
    usage: GenerationUsage
    reasoningTrace: Json
    contentHashCandidate: string
    generatedAt: string
    /** Whether `content` came from the LLM Edge Function or the template fallback. */
    source: 'llm' | 'template_fallback'
    /** Present only when `persist` was requested and the write succeeded. */
    storedDocument?: StoredDocumentVersion
  }
}

export type DocumentGenerationResult =
  | {
      status: 'queued'
      reason: string
      taskType: AiTaskType
      costPolicyStatus: string
      monthlySpendUsd: number
    }
  | {
      status: 'generated'
      document: GeneratedDocumentPayload
    }

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeLines(values: string[]): string[] {
  return values.map(normalizeLine).filter((value) => value.length > 0)
}

function toHeadingCase(value: string): string {
  return normalizeLine(value)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function toStableHash(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function estimateUsage(taskType: AiTaskType, promptText: string, outputText: string): GenerationUsage {
  const tokensIn = Math.max(1, Math.ceil(promptText.length / 4))
  const tokensOut = Math.max(1, Math.ceil(outputText.length / 4))

  if (taskType === 'resume_rewriting') {
    return {
      tokensIn,
      tokensOut,
      estimatedCostUsd: Number((tokensIn * 0.00002 + tokensOut * 0.00004).toFixed(6)),
    }
  }

  return {
    tokensIn,
    tokensOut,
    estimatedCostUsd: Number((tokensIn * 0.00003 + tokensOut * 0.00005).toFixed(6)),
  }
}

function buildResumeContent(input: ResumeVariantInput): string {
  const highlights = normalizeLines(input.highlights)
  const sections = [
    '# Targeted Resume Variant',
    `Role Focus: ${normalizeLine(input.jobTitle)} at ${normalizeLine(input.companyName)}`,
    '',
    '## Professional Summary',
    normalizeLine(input.masterProfile),
    '',
    '## Role Alignment',
    `- Target role: ${normalizeLine(input.jobTitle)}`,
    `- Company: ${normalizeLine(input.companyName)}`,
    `- Requirement focus: ${normalizeLine(input.jobDescription)}`,
    '',
    '## Impact Highlights',
    ...highlights.map((highlight) => `- ${highlight}`),
  ]

  return sections.join('\n').trim()
}

function buildCoverLetterContent(input: CoverLetterInput): string {
  const highlights = normalizeLines(input.highlights)
  const intro = `Dear ${toHeadingCase(input.companyName)} Hiring Team,`
  const body = [
    `I am applying for the ${normalizeLine(input.jobTitle)} role and am excited by your emphasis on ${normalizeLine(input.jobDescription)}.`,
    `My background aligns directly with this work: ${normalizeLine(input.masterProfile)}.`,
    ...highlights.map((highlight) => `- ${highlight}`),
    'I would welcome the opportunity to discuss how I can contribute quickly and measurably in this role.',
  ]

  return [intro, '', ...body, '', 'Sincerely,', 'John Burkhardt'].join('\n').trim()
}

function buildReasoningTrace(params: {
  taskType: AiTaskType
  input: GenerationInputBase
  routeModelName: string
  routeModelProvider: string
  costPolicyStatus: string
  source: 'llm' | 'template_fallback'
}): Json {
  return {
    rule_refs: ['BR-050', 'BR-052', 'BR-054', 'AI-RULE-001', 'AI-RULE-002', 'AI-RULE-003'],
    source: params.source,
    routing: {
      task_type: params.taskType,
      model_name: params.routeModelName,
      model_provider: params.routeModelProvider,
      cost_policy_status: params.costPolicyStatus,
    },
    document_input: {
      job_title: normalizeLine(params.input.jobTitle),
      company_name: normalizeLine(params.input.companyName),
      highlights_count: normalizeLines(params.input.highlights).length,
    },
  }
}

type DocumentTypeName = 'resume' | 'cover_letter'

interface EdgeDocumentResponse {
  content: string
  usage: { input_tokens: number; output_tokens: number }
}

/** Maps the routing task type to the Edge Function's documentType. */
function toDocumentType(taskType: 'resume_rewriting' | 'cover_letter_generation'): DocumentTypeName {
  return taskType === 'resume_rewriting' ? 'resume' : 'cover_letter'
}

/** Builds the JD/posting object handed to the generate-document Edge Function. */
function buildJobContext(input: GenerationInputBase): Record<string, unknown> {
  return {
    title: normalizeLine(input.jobTitle),
    company: normalizeLine(input.companyName),
    description: normalizeLine(input.jobDescription),
    highlights: normalizeLines(input.highlights),
  }
}

async function generateDocument(params: {
  input: GenerationInputBase
  taskType: 'resume_rewriting' | 'cover_letter_generation'
  titlePrefix: string
  contentBuilder: (input: GenerationInputBase) => string
}): Promise<DocumentGenerationResult> {
  const route = await routeAiTask({
    userId: params.input.userId,
    taskType: params.taskType,
  })

  if (route.costDecision.shouldBlock) {
    return {
      status: 'queued',
      reason: 'Monthly AI cost cap reached for non-critical task.',
      taskType: params.taskType,
      costPolicyStatus: route.costDecision.status,
      monthlySpendUsd: route.costDecision.monthlySpendUsd,
    }
  }

  const documentType = toDocumentType(params.taskType)

  // Real generation: call the routed `generate-document` Edge Function (which
  // holds the provider key). On any error, fall back to the deterministic
  // template builder so the builder/packet flow still gets a document.
  let content: string
  let usage: GenerationUsage
  let source: 'llm' | 'template_fallback'

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<EdgeDocumentResponse>('generate-document', {
    body: {
      provider: route.modelProvider,
      model: route.modelName,
      documentType,
      job: buildJobContext(params.input),
      masterProfile: params.input.masterProfile,
      currentContent: params.input.currentContent,
    },
  })

  if (!error && data && typeof data.content === 'string' && data.content.trim().length > 0) {
    content = data.content
    const pricing = getModelPricing(route.modelName)
    const tokensIn = data.usage.input_tokens
    const tokensOut = data.usage.output_tokens
    usage = {
      tokensIn,
      tokensOut,
      estimatedCostUsd: Number(
        (tokensIn * pricing.inputUsdPerToken + tokensOut * pricing.outputUsdPerToken).toFixed(6),
      ),
    }
    source = 'llm'
  } else {
    content = params.contentBuilder(params.input)
    usage =
      params.input.usageOverride ??
      estimateUsage(
        params.taskType,
        [params.input.masterProfile, params.input.jobDescription, ...params.input.highlights].join(' '),
        content,
      )
    source = 'template_fallback'
  }

  const generatedAt = params.input.nowIso ?? new Date().toISOString()
  const title = `${params.titlePrefix} - ${normalizeLine(params.input.companyName)} - ${normalizeLine(params.input.jobTitle)}`

  const reasoningTrace = buildReasoningTrace({
    taskType: params.taskType,
    input: params.input,
    routeModelName: route.modelName,
    routeModelProvider: route.modelProvider,
    costPolicyStatus: route.costDecision.status,
    source,
  })

  await logAiUsage({
    user_id: params.input.userId,
    model_provider: route.modelProvider,
    model_name: route.modelName,
    task_type: route.taskType,
    tokens_in: usage.tokensIn,
    tokens_out: usage.tokensOut,
    estimated_cost_usd: usage.estimatedCostUsd,
    application_id: params.input.applicationId ?? null,
  })

  // Optional persistence to the `documents` table (Storage + row), reusing the
  // canonical documentStorageService path (content_hash, version, RLS-scoped).
  // The submission-packet flow leaves persist off and persists/links itself.
  let storedDocument: StoredDocumentVersion | undefined
  if (params.input.persist) {
    storedDocument = await createDocumentVersion({
      userId: params.input.userId,
      documentType,
      content,
    })
  }

  return {
    status: 'generated',
    document: {
      title,
      content,
      metadata: {
        taskType: params.taskType,
        modelName: route.modelName,
        modelProvider: route.modelProvider,
        costPolicyStatus: route.costDecision.status,
        monthlySpendUsd: route.costDecision.monthlySpendUsd,
        usage,
        reasoningTrace,
        contentHashCandidate: toStableHash(content),
        generatedAt,
        source,
        storedDocument,
      },
    },
  }
}

export async function generateResumeVariant(input: ResumeVariantInput): Promise<DocumentGenerationResult> {
  return generateDocument({
    input,
    taskType: 'resume_rewriting',
    titlePrefix: normalizeLine(input.resumeTitlePrefix ?? 'Resume Variant'),
    contentBuilder: (baseInput) => buildResumeContent(baseInput as ResumeVariantInput),
  })
}

export async function generateCoverLetter(input: CoverLetterInput): Promise<DocumentGenerationResult> {
  return generateDocument({
    input,
    taskType: 'cover_letter_generation',
    titlePrefix: normalizeLine(input.letterTitlePrefix ?? 'Cover Letter'),
    contentBuilder: (baseInput) => buildCoverLetterContent(baseInput as CoverLetterInput),
  })
}