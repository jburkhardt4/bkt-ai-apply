import { useMemo, useState } from 'react'
import './App.css'
import { masterProfile } from './features/applications/data/masterProfile'
import { canTransitionStage } from './features/applications/domain/stageRules'
import {
  createStageEvent,
  draftTailoredArtifacts,
  parseJobDescription,
  scoreJobFit,
} from './features/applications/services/pipelineService'
import type { ApplicationEvent, PipelineStage } from './types/pipeline'

function App() {
  const [jobDescription, setJobDescription] = useState('')
  const [currentStage, setCurrentStage] = useState<PipelineStage>('discovery')
  const [events, setEvents] = useState<ApplicationEvent[]>([])

  const parsed = useMemo(() => {
    if (!jobDescription.trim()) {
      return null
    }

    return parseJobDescription(jobDescription, masterProfile)
  }, [jobDescription])

  const match = useMemo(() => {
    if (!parsed) {
      return null
    }

    return scoreJobFit(parsed, masterProfile)
  }, [parsed])

  const artifacts = useMemo(() => {
    if (!parsed || !match) {
      return null
    }

    return draftTailoredArtifacts(parsed, match, masterProfile)
  }, [match, parsed])

  function moveStage(toStage: PipelineStage): void {
    if (!canTransitionStage(currentStage, toStage)) {
      return
    }

    const newEvent = createStageEvent(
      currentStage,
      toStage,
      `Manual stage update from dashboard: ${currentStage} -> ${toStage}`,
    )
    setCurrentStage(toStage)
    setEvents((previous) => [newEvent, ...previous])
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="kicker">BKT AI-Apply</p>
        <h1>Precision Job Application Pipeline</h1>
        <p className="summary">
          Ingest a JD, generate an explainable match score, draft tailored artifacts,
          and track stage events with an auditable timeline.
        </p>
      </header>

      <section className="grid two-up">
        <article className="panel">
          <h2>1) Job Description Intake</h2>
          <textarea
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="Paste a job description here to run parsing and scoring..."
            rows={14}
          />
        </article>

        <article className="panel">
          <h2>2) Candidate Baseline</h2>
          <ul className="chips">
            {masterProfile.skillKeywords.slice(0, 8).map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
          <p className="meta">
            Auto-apply gate: {masterProfile.constraints.autoApplyThreshold}% | Human submit
            approval: {masterProfile.constraints.requireHumanApprovalForSubmit ? 'required' : 'optional'}
          </p>
        </article>
      </section>

      <section className="grid three-up">
        <article className="panel">
          <h2>3) Parsed Role Snapshot</h2>
          {parsed ? (
            <div className="stack">
              <p>
                <strong>Title:</strong> {parsed.title}
              </p>
              <p>
                <strong>Company:</strong> {parsed.company}
              </p>
              <p>
                <strong>Location:</strong> {parsed.location}
              </p>
              <p>
                <strong>Requirements:</strong> {parsed.requirements.length}
              </p>
              <ul className="compact-list">
                {parsed.requirements.slice(0, 5).map((item) => (
                  <li key={item.text}>
                    <span className={`pill ${item.bucket}`}>{item.bucket.replace('_', ' ')}</span>{' '}
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">Add a JD to see parsed structure.</p>
          )}
        </article>

        <article className="panel">
          <h2>4) Semantic Match Score</h2>
          {match ? (
            <div className="stack">
              <p className="score">{match.overall}%</p>
              <p className={match.thresholdPassed ? 'pass' : 'hold'}>
                {match.thresholdPassed
                  ? `Eligible for auto-apply (>= ${match.threshold}%)`
                  : `Below threshold (${match.threshold}%)`}
              </p>
              <ul className="compact-list">
                <li>Skills: {match.breakdown.skills}</li>
                <li>Domain: {match.breakdown.domain}</li>
                <li>Seniority: {match.breakdown.seniority}</li>
                <li>Tools: {match.breakdown.tools}</li>
                <li>Location/Auth: {match.breakdown.locationAuth}</li>
              </ul>
            </div>
          ) : (
            <p className="muted">Score appears after parsing.</p>
          )}
        </article>

        <article className="panel">
          <h2>5) Stage Tracker</h2>
          <p className="meta">
            Current stage: <strong>{currentStage}</strong>
          </p>
          <div className="actions">
            {(['applied', 'screening', 'interview_scheduled', 'interview_complete', 'offer', 'hired', 'rejected', 'ghosted'] as PipelineStage[]).map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => moveStage(stage)}
                disabled={!canTransitionStage(currentStage, stage)}
              >
                Move to {stage}
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="grid two-up">
        <article className="panel">
          <h2>6) Resume Bullet Suggestions</h2>
          {artifacts ? (
            <ul className="compact-list">
              {artifacts.bulletSuggestions.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Suggestions appear after score calculation.</p>
          )}
        </article>

        <article className="panel">
          <h2>7) Cover Letter Draft</h2>
          {artifacts ? (
            <pre className="letter">{artifacts.coverLetter}</pre>
          ) : (
            <p className="muted">Draft appears after score calculation.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <h2>8) Application Event Log</h2>
        {events.length > 0 ? (
          <ul className="timeline">
            {events.map((event) => (
              <li key={`${event.atIso}-${event.toStage}`}>
                <span>{event.atIso}</span>
                <strong>
                  {event.fromStage}
                  {' -> '}
                  {event.toStage}
                </strong>
                <p>{event.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No stage transitions yet.</p>
        )}
      </section>
    </div>
  )
}

export default App
