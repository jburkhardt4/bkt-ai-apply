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

export type AiTaskType =
  | 'cover_letter_generation'
  | 'interview_prep'
  | 'match_scoring'
  | 'resume_rewriting'
  | 'browser_form_automation'
  | 'company_market_research'
  | 'email_classification'
  | 'intent_routing'
  | 'general_qa'

export type AiModelProvider = 'anthropic' | 'openai' | 'google'

export type MatchRecommendationLabel = 'Reject' | 'Consideration' | 'Auto-Submit Prep'

export type MatchRecommendation = 'reject' | 'consider' | 'apply'

export type AiCostPolicyStatus =
  | 'ok'
  | 'warn_80'
  | 'warn_90'
  | 'capped_non_critical'
  | 'capped_critical_override'
