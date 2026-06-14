import { getSupabaseClient } from '../../../lib/supabase'
import type { Database, Json } from '../../../types/db.types'
import { masterProfile } from '../data/masterProfile'
import {
  type DocumentGenerationResult,
  generateCoverLetter,
  generateResumeVariant,
  type GeneratedDocumentPayload,
} from './documentGenerationService'
import {
  createDocumentVersion,
  linkDocumentsToApplication,
  type StoredDocumentVersion,
} from './documentStorageService'

type ApplicationForPacket = Pick<
  Database['public']['Tables']['applications']['Row'],
  'id' | 'user_id' | 'match_score'
> & {
  jobs:
    | {
        title: string
        description: string | null
        companies: { name: string } | null
      }
    | null
}

interface PreparedPacketBase {
  applicationId: string
  userId: string
  matchScore: number | null
  threshold: number
  autoSubmitEligible: boolean
}

export interface PreparedSubmissionPacket extends PreparedPacketBase {
  resume: StoredDocumentVersion
  coverLetter: StoredDocumentVersion
}

export type PrepareSubmissionPacketResult =
  | {
      status: 'queued'
      reason: string
    }
  | {
      status: 'ready'
      packet: PreparedSubmissionPacket
    }

export interface ApprovalInput {
  userId: string
  applicationId: string
  matchScore: number | null
  resumeDocumentId: string
  coverLetterDocumentId: string
  approvedAtIso?: string
}

function buildMasterProfileSummary(): string {
  return [
    `${masterProfile.fullName} targeting ${masterProfile.targetLocation}.`,
    `Primary skills: ${masterProfile.skillKeywords.slice(0, 8).join(', ')}.`,
    `Domain focus: ${masterProfile.domainKeywords.slice(0, 5).join(', ')}.`,
    `Tooling: ${masterProfile.toolingKeywords.slice(0, 6).join(', ')}.`,
  ].join(' ')
}

function buildHighlights(): string[] {
  return masterProfile.quantifiedOutcomes.slice(0, 4)
}

function resolveGeneratedDocument(
  result: DocumentGenerationResult,
): GeneratedDocumentPayload {
  if (result.status === 'queued') {
    throw new Error(result.reason)
  }

  return result.document
}

async function fetchApplicationForPacket(userId: string, applicationId: string): Promise<ApplicationForPacket> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('applications')
    .select('id, user_id, match_score, jobs(title, description, companies(name))')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .single()

  if (error) {
    throw new Error(`Failed to load application for packet preparation: ${error.message}`)
  }

  const normalizedJobs = Array.isArray(data.jobs) ? (data.jobs[0] ?? null) : data.jobs
  const normalizedCompany = normalizedJobs
    ? Array.isArray(normalizedJobs.companies)
      ? (normalizedJobs.companies[0] ?? null)
      : normalizedJobs.companies
    : null

  return {
    id: data.id,
    user_id: data.user_id,
    match_score: data.match_score,
    jobs: normalizedJobs
      ? {
          title: normalizedJobs.title,
          description: normalizedJobs.description,
          companies: normalizedCompany,
        }
      : null,
  }
}

function buildApprovalMetadata(input: ApprovalInput, approvedAtIso: string): Json {
  return {
    approved_at: approvedAtIso,
    match_score: input.matchScore,
    auto_submit_threshold: masterProfile.constraints.autoApplyThreshold,
    auto_submit_eligible:
      input.matchScore !== null && input.matchScore >= masterProfile.constraints.autoApplyThreshold,
    resume_document_id: input.resumeDocumentId,
    cover_letter_document_id: input.coverLetterDocumentId,
    rule_refs: ['BR-021', 'BR-040', 'BR-041', 'AC-006-04'],
  }
}

function packetBase(application: ApplicationForPacket): PreparedPacketBase {
  const threshold = masterProfile.constraints.autoApplyThreshold
  const matchScore = application.match_score
  return {
    applicationId: application.id,
    userId: application.user_id,
    matchScore,
    threshold,
    autoSubmitEligible: matchScore !== null && matchScore >= threshold,
  }
}

export async function prepareSubmissionPacket(params: {
  userId: string
  applicationId: string
}): Promise<PrepareSubmissionPacketResult> {
  const application = await fetchApplicationForPacket(params.userId, params.applicationId)

  if (!application.jobs) {
    throw new Error('Application is missing associated job data.')
  }

  const roleTitle = application.jobs.title
  const companyName = application.jobs.companies?.name ?? 'Unknown company'
  const jobDescription = application.jobs.description?.trim() || roleTitle
  const generationInput = {
    userId: params.userId,
    applicationId: application.id,
    jobTitle: roleTitle,
    companyName,
    jobDescription,
    masterProfile: buildMasterProfileSummary(),
    highlights: buildHighlights(),
  }

  const resumeResult = await generateResumeVariant(generationInput)
  if (resumeResult.status === 'queued') {
    return {
      status: 'queued',
      reason: resumeResult.reason,
    }
  }

  const coverLetterResult = await generateCoverLetter(generationInput)
  if (coverLetterResult.status === 'queued') {
    return {
      status: 'queued',
      reason: coverLetterResult.reason,
    }
  }

  const resumeDocument = resolveGeneratedDocument(resumeResult)
  const coverLetterDocument = resolveGeneratedDocument(coverLetterResult)

  const storedResume = await createDocumentVersion({
    userId: params.userId,
    documentType: 'resume',
    content: resumeDocument.content,
  })

  const storedCoverLetter = await createDocumentVersion({
    userId: params.userId,
    documentType: 'cover_letter',
    content: coverLetterDocument.content,
  })

  return {
    status: 'ready',
    packet: {
      ...packetBase(application),
      resume: storedResume,
      coverLetter: storedCoverLetter,
    },
  }
}

export async function writeApprovalEvent(input: ApprovalInput): Promise<void> {
  const supabase = getSupabaseClient()
  const approvedAtIso = input.approvedAtIso ?? new Date().toISOString()
  const metadata = buildApprovalMetadata(input, approvedAtIso)

  // Approval events must be written via the server-side RPC (BR-130/131).
  // Direct client inserts of event_type='approval' are blocked by RLS
  // (migration 20260613000004, section 5). The RPC re-checks ownership
  // via auth.uid() before inserting.
  const { error } = await supabase.rpc('write_approval_event', {
    p_application_id: input.applicationId,
    p_metadata: metadata as unknown as Record<string, unknown>,
  })

  if (error) {
    throw new Error(`Failed to write approval event: ${error.message}`)
  }
}

export async function approvePreparedPacket(input: ApprovalInput): Promise<void> {
  await linkDocumentsToApplication({
    userId: input.userId,
    applicationId: input.applicationId,
    resumeDocumentId: input.resumeDocumentId,
    coverLetterDocumentId: input.coverLetterDocumentId,
  })

  await writeApprovalEvent(input)
}