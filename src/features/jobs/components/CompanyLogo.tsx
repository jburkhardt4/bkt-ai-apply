/**
 * CompanyLogo — the JD sidebar's primary brand anchor. Renders the company's
 * favicon (derived from its domain) when available, falling back to a branded
 * BKT-blue monogram of the company initials. Used at the top of the Prospector
 * JD sheet so every job — regardless of source board — gets a consistent,
 * on-brand company identity.
 */
import { useEffect, useState } from 'react'
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
  domain?: string | null
  className?: string
}

export function CompanyLogo({ companyName, domain, className }: CompanyLogoProps) {
  const host = normalizeDomain(domain)
  const [imgFailed, setImgFailed] = useState(false)

  // Reset the failure flag when the host changes (sidebar reused for a new job).
  useEffect(() => {
    setImgFailed(false)
  }, [host])

  const initials = getInitials(companyName)
  const showImg = host != null && !imgFailed

  return (
    <div
      className={cn(
        'flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-primary text-primary-foreground shadow-sm',
        className,
      )}
    >
      {showImg ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
          alt={companyName ? `${companyName} logo` : 'Company logo'}
          className="h-full w-full bg-white object-contain p-1"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : initials ? (
        <span className="text-base font-semibold tracking-wide">{initials}</span>
      ) : (
        <Building2 className="h-1/2 w-1/2" aria-hidden="true" />
      )}
    </div>
  )
}
