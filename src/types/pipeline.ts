export type PipelineStage =
  | 'discovery'
  | 'applied'
  | 'screening'
  | 'interview_scheduled'
  | 'interview_complete'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'ghosted'

export type RequirementBucket = 'must_have' | 'nice_to_have'

export interface ParsedRequirement {
  text: string
  bucket: RequirementBucket
  matchedKeywords: string[]
}

export interface ParsedJobDescription {
  title: string
  company: string
  location: string
  requirements: ParsedRequirement[]
  authorizationNotes: string[]
}

export interface ScoreBreakdown {
  skills: number
  domain: number
  seniority: number
  tools: number
  locationAuth: number
}

export interface MatchResult {
  overall: number
  thresholdPassed: boolean
  threshold: number
  breakdown: ScoreBreakdown
  strengths: string[]
  gaps: string[]
}

export interface TailoredArtifact {
  bulletSuggestions: string[]
  coverLetter: string
}

export interface ApplicationEvent {
  atIso: string
  fromStage: PipelineStage
  toStage: PipelineStage
  reason: string
}

export interface CandidateProfile {
  fullName: string
  targetLocation: string
  seniorityKeywords: string[]
  skillKeywords: string[]
  domainKeywords: string[]
  toolingKeywords: string[]
  quantifiedOutcomes: string[]
  constraints: {
    requireHumanApprovalForSubmit: boolean
    autoApplyThreshold: number
  }
}
