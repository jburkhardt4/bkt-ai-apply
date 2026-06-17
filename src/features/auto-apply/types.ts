// BKT AI-Apply — Auto-Apply UI view models
// These are UI-facing types for the redesigned Auto-Apply surface.
// Live Supabase rows (applications/jobs/emails/documents) are mapped
// into these shapes in services/autoApplyService.ts; the same shapes
// are used by the demo seed data in ./data.

// 'In progress' is a view-model-only overlay status: the application row stays
// at stage 'discovery' while JB completes a manual apply (opened via the
// posting's source URL in review/assist modes). It is derived from a
// `submission_attempt` marker event, never stored on `applications.stage`.
export type JobStatus = 'Review' | 'In progress' | 'Applied' | 'Declined'

/** One row of the Your Jobs table / Quick Review deck. */
export interface JobMatch {
  id: number | string
  /** Company web domain — drives the logo resolver. */
  domain?: string
  company: string
  title: string
  /** Match score 0–100 (80+ green · 65–79 royal blue · below amber). */
  score: number
  status: JobStatus
  /** Human-readable recency ("2 hours ago", "Just now"). */
  updated: string
  comp?: string
  level?: string
  location?: string
  overview?: string
  skills?: string[]
  preferred?: string[]
  why?: string
  keyMatches?: string[]
  keyGaps?: string[]
  /** Persisted AI recommendation (BR-142: derived from overall_score). */
  recommendation?: 'apply' | 'consider' | 'reject'
  /** reasoning_trace.source — distinguishes a real LLM score ('llm') from an
   *  estimated one ('heuristic_fallback', e.g. cost-capped). Undefined = unknown. */
  scoreSource?: string
  about?: string
  /** Direct URL to the original job posting. */
  sourceUrl?: string
  /** Board URL where the application was submitted (applications.application_url,
   *  falls back to the posting's source_url). Drives the Applied-tab
   *  "View Application" button (Phase B). */
  applicationUrl?: string
  /** Live rows carry the pipeline ids needed for stage transitions. */
  applicationId?: string
  stage?: string
}

/* ---- Inbox ---- */

export interface InboxLabel {
  id: string
  name: string
  icon: string
  color: string
}

export interface EmailMessage {
  id: number | string
  domain?: string
  from: string
  sender: string
  subject: string
  label: string
  priority: 'Low' | 'High'
  unread: boolean
  /** Absolute timestamp string — rendered via formatStamp. */
  time: string
  body: string[]
}

export interface InboxData {
  account: string
  invitations: number
  labels: InboxLabel[]
  emails: EmailMessage[]
  total: number
}

/* ---- Job Search ---- */

export interface SearchJob {
  id: string
  domain?: string
  company: string
  industry: string
  posted: string
  title: string
  chips: string[]
  score: number
  level?: string
  location?: string
  comp?: string
  updated?: string
  overview?: string
  skills?: string[]
  preferred?: string[]
  why?: string
  keyMatches?: string[]
  keyGaps?: string[]
  /** Persisted AI recommendation (BR-142: derived from overall_score). */
  recommendation?: 'apply' | 'consider' | 'reject'
  /** reasoning_trace.source — distinguishes a real LLM score ('llm') from an
   *  estimated one ('heuristic_fallback', e.g. cost-capped). Undefined = unknown. */
  scoreSource?: string
  about?: string
  /** Direct URL to the original job posting. */
  sourceUrl?: string
}

export interface SearchData {
  query: string
  location: string
  skills: string[]
  seniorities: string[]
  jobs: SearchJob[]
}

/* ---- Saved Jobs ---- */

export interface SavedJob {
  id: string
  title: string
  saved: string
  chips: string[]
  allChips: string[]
  desc: string
  /** Saved-from-search items carry the full posting too. */
  domain?: string
  company?: string
  score?: number
  industry?: string
  posted?: string
  overview?: string
  skills?: string[]
  level?: string
  location?: string
}

/* ---- Documents ---- */

export interface PaperTemplate {
  id: string
  name: string
  sub: string
  font: string
  headFont: string
  headCase: 'uppercase' | 'none'
  rule: boolean
  centerName: boolean
  accent: string
}

export interface ResumeExperience {
  role: string
  org: string
  when: string
  bullets: string[]
}

export interface ResumeContent {
  name: string
  contact: string
  headline: string
  summary: string
  experience: ResumeExperience[]
  education: { degree: string; org: string; when: string }[]
  skills: string[]
}

export interface LetterContent {
  name: string
  contact: string
  date: string
  recipient: string
  company: string
  role: string
  greeting: string
  body: string[]
  closing: string
}

export interface DocItem {
  id: string
  name: string
  kind: 'Base' | 'Customized' | 'Archived'
  isDefault?: boolean
  target?: string
  updated: string
  size: string
  template: string
  note?: string
  summary?: string
  /** Cover-letter variants override pieces of the letter seed. */
  company?: string
  role?: string
  recipient?: string
  body0?: string
}

export interface AiReply {
  text: string
  patch?: string
  patchTarget?: string
  patchLabel?: string
}

export interface DocsData {
  templates: PaperTemplate[]
  resumeContent: ResumeContent
  letterContent: LetterContent
  resumes: DocItem[]
  letters: DocItem[]
  ai: {
    suggestions: { resume: string[]; letter: string[] }
    replies: {
      resume: Record<string, AiReply>
      letter: Record<string, AiReply>
    }
  }
}

/* ---- Chrome ---- */

export type ReviewModeId = 'review' | 'assist' | 'auto'

export interface ToastItem {
  id: number
  msg: string
  icon: string
  color: string
}

export type NavKey =
  | 'dashboard'
  | 'inbox'
  | 'search'
  | 'saved'
  | 'prefs'
  | 'resumes'
  | 'letters'
  | 'interview-prep'
  | 'notifications'
  | 'pipeline'
  | 'ingestion'
  | 'prospector'
  | 'integrations'
