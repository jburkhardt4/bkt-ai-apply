import type { Json } from '../../../types/db.types'
import type { AiTaskType } from '../../../types/pipeline'
import { logAiUsage, routeAiTask } from '../../../lib/ai-router'

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
}): Json {
  return {
    rule_refs: ['BR-050', 'BR-052', 'BR-054', 'AI-RULE-001', 'AI-RULE-002', 'AI-RULE-003'],
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

  const content = params.contentBuilder(params.input)
  const generatedAt = params.input.nowIso ?? new Date().toISOString()
  const title = `${params.titlePrefix} - ${normalizeLine(params.input.companyName)} - ${normalizeLine(params.input.jobTitle)}`
  const usage =
    params.input.usageOverride ??
    estimateUsage(
      params.taskType,
      [params.input.masterProfile, params.input.jobDescription, ...params.input.highlights].join(' '),
      content,
    )

  const reasoningTrace = buildReasoningTrace({
    taskType: params.taskType,
    input: params.input,
    routeModelName: route.modelName,
    routeModelProvider: route.modelProvider,
    costPolicyStatus: route.costDecision.status,
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