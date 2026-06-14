/**
 * CompanyLogo — the JD sidebar's primary brand anchor. Resolves a logo through a
 * three-step visual hierarchy so every job — regardless of source board — gets a
 * consistent, on-brand identity:
 *
 *   1. Company domain favicon  — the employer's own logo (from companies.domain).
 *   2. Source-board favicon    — a recognizable LinkedIn / Dice / Greenhouse icon
 *                                (from `fallbackDomain`, derived from source_url)
 *                                when the company has no resolvable favicon.
 *   3. Branded monogram        — BKT-blue initials, then a generic glyph, when no
 *                                favicon resolves at all.
 *
 * Favicons are fetched via Google's s2 service; each candidate is attempted in
 * order and an onError advances to the next, falling through to the monogram.
 */
import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Up-to-two-letter initials from a company name ("Acme Corp" → "AC"). */
function getInitials(name: string | null): string | null {
  if (!name) return null
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Normalizes a bare hostname or full URL into a clean hostname, or null. */
function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null
  const trimmed = domain.trim()
  if (!trimmed) return null
  try {
    const host = trimmed.includes('://')
      ? new URL(trimmed).hostname
      : new URL(`https://${trimmed}`).hostname
    return host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

interface CompanyLogoProps {
  companyName: string | null
  /** The employer's own web domain (companies.domain) — tried first. */
  domain?: string | null
  /** Secondary host (e.g. the source board from source_url), tried when the
   *  company domain has no resolvable favicon. */
  fallbackDomain?: string | null
  className?: string
}

export function CompanyLogo({ companyName, domain, fallbackDomain, className }: CompanyLogoProps) {
  // Ordered, de-duplicated favicon candidates: company domain first (its true
  // logo), then the source-board host as a recognizable secondary.
  const hosts = [normalizeDomain(domain), normalizeDomain(fallbackDomain)].filter(
    (h): h is string => h != null,
  )
  const candidates = [...new Set(hosts)]
  const signature = candidates.join('|')

  // Index of the favicon candidate currently being attempted; advancing past the
  // end falls through to the monogram. Reset at render time (NOT in an effect, to
  // respect react-hooks/set-state-in-effect) whenever the candidate set changes —
  // i.e. when the sidebar is reused for a different job.
  const [attempt, setAttempt] = useState(0)
  const [attemptSig, setAttemptSig] = useState(signature)
  if (attemptSig !== signature) {
    setAttemptSig(signature)
    setAttempt(0)
  }

  const initials = getInitials(companyName)
  const activeHost = attempt < candidates.length ? candidates[attempt] : null

  return (
    <div
      className={cn(
        'flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-primary text-primary-foreground shadow-sm',
        className,
      )}
    >
      {activeHost ? (
        <img
          key={activeHost}
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(activeHost)}&sz=128`}
          alt={companyName ? `${companyName} logo` : 'Company logo'}
          className="h-full w-full bg-white object-contain p-1"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setAttempt((n) => n + 1)}
        />
      ) : initials ? (
        <span className="text-base font-semibold tracking-wide">{initials}</span>
      ) : (
        <Building2 className="h-1/2 w-1/2" aria-hidden="true" />
      )}
    </div>
  )
}
