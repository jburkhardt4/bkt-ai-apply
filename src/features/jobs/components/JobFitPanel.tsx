// BKT AI-Apply — JobFitPanel (Phase 2a)
//
// Presentational AI fit-match panel for the Prospector job sheet: the 0-100
// match score with a fit label, matched skills (from ai_scores.strengths) and
// missing keywords (from ai_scores.gaps), plus first-class empty/loading/queued/
// error states. Pure props in, no data fetching (component-patterns.md layering).
//
// Styling: Tailwind v4 semantic tokens only (bg-muted / text-muted-foreground /
// text-foreground / border-border …) to match ProspectorJobSheet. The score
// accent color reuses the app-wide --bkt-score-* CSS custom properties via an
// inline style — a custom-property reference, not an arbitrary Tailwind value.
import { CheckCircle2, MinusCircle, Sparkles, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFitLabel, type JobFitState } from './jobFitPanel.helpers'

export interface JobFitPanelProps {
  score: number | null
  recommendation: 'apply' | 'consider' | 'reject' | null
  matched: string[]
  missing: string[]
  state: JobFitState
}

const RECOMMENDATION_LABEL: Record<'apply' | 'consider' | 'reject', string> = {
  apply: 'Recommended',
  consider: 'Worth considering',
  reject: 'Likely a stretch',
}

// ── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>
}

// ── Empty / non-ready frame ──────────────────────────────────────────────────

function FitNotice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-5 py-7 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

// ── Loading skeleton (matches the ready layout's shape) ──────────────────────

function FitSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading match score">
      <div className="flex items-center gap-3">
        <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  )
}

// ── Chip list (matched / missing), staggered reveal ──────────────────────────

function ChipList({ items, tone }: { items: string[]; tone: 'matched' | 'missing' }) {
  const Icon = tone === 'matched' ? CheckCircle2 : MinusCircle
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li
          key={item}
          // Stagger via CSS animation-delay (off the main thread); GPU-only
          // transform + opacity, ease-out, well under 300ms. No scale(0) entry.
          className="bkt-fit-chip flex items-start gap-2 text-sm leading-snug text-foreground"
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <Icon
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0',
              tone === 'matched' ? 'text-emerald-600' : 'text-muted-foreground',
            )}
            strokeWidth={2}
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JobFitPanel({ score, recommendation, matched, missing, state }: JobFitPanelProps) {
  if (state === 'loading') {
    return <FitSkeleton />
  }

  if (state === 'unscored') {
    return (
      <FitNotice
        icon={<Sparkles className="h-5 w-5" aria-hidden />}
        title="Not scored yet"
        body="This role has not been matched against your profile. AI scoring runs when the prospector evaluates new listings."
      />
    )
  }

  if (state === 'queued') {
    return (
      <FitNotice
        icon={<Clock className="h-5 w-5" aria-hidden />}
        title="Full AI scoring queued"
        body="The monthly AI budget has been reached, so this shows an estimated score. Full AI scoring resumes next billing period."
      />
    )
  }

  if (state === 'error') {
    return (
      <FitNotice
        icon={<AlertCircle className="h-5 w-5" aria-hidden />}
        title="Score unavailable"
        body="We could not load the match score for this role. Try reopening it in a moment."
      />
    )
  }

  // state === 'ready'
  const safeScore = Math.max(0, Math.min(100, Math.round(score ?? 0)))
  const fit = getFitLabel(safeScore)

  return (
    <section className="space-y-5" aria-label="AI match score">
      {/* Score readout */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
          {safeScore}
          <span className="text-base font-medium text-muted-foreground">/100</span>
        </span>
        <span className="h-6 w-px bg-border" aria-hidden />
        <span className="text-sm font-semibold" style={{ color: fit.colorVar }}>
          {fit.text}
        </span>
        {recommendation && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {RECOMMENDATION_LABEL[recommendation]}
          </span>
        )}
      </div>

      {/* Matched skills */}
      <div className="space-y-2">
        <SectionTitle>Matched skills</SectionTitle>
        {matched.length > 0 ? (
          <ChipList items={matched} tone="matched" />
        ) : (
          <p className="text-sm text-muted-foreground">No specific skill matches were identified.</p>
        )}
      </div>

      {/* Missing keywords */}
      <div className="space-y-2">
        <SectionTitle>Missing keywords</SectionTitle>
        {missing.length > 0 ? (
          <ChipList items={missing} tone="missing" />
        ) : (
          <p className="text-sm text-muted-foreground">No notable gaps were flagged for this role.</p>
        )}
      </div>
    </section>
  )
}
