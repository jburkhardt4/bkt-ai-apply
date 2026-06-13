// BKT AI-Apply — Interview Prep
// Intentionally minimal for now: a single hand-off to the dedicated
// "Interview Preparation Specialist" GPT. Consolidates the former
// "Interview Buddy" + "Mock Interviews" stubs into one surface.
import { Icon } from '@/components/bkt/Icon'

const INTERVIEW_PREP_GPT_URL =
  'https://chatgpt.com/g/g-69d45bf568a0819181b3b9a2467bf116-interview-preparation-specialist'

export function InterviewPrepScreen() {
  return (
    <div
      className="bkt-enter"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 10,
        color: 'var(--text-muted)',
      }}
    >
      <Icon name="graduation-cap" size={26} />
      <span style={{ font: '600 var(--text-md)/1.3 var(--font-display)', color: 'var(--text-strong)' }}>Interview Prep</span>
      <a
        href={INTERVIEW_PREP_GPT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ font: '500 var(--text-sm)/1.4 var(--font-body)', color: 'var(--primary)', textDecoration: 'underline' }}
      >
        Interview Preparation Specialist
      </a>
    </div>
  )
}
