/**
 * resolveChannel — pure channel + ATS-vendor resolution (ADR-006 §4, BR-134).
 *
 * Decides which submission channel a posting goes through and, for ATS/API
 * postings, which vendor adapter to use. ADR-006 is API-first: postings whose
 * jobs.application_method is 'api' or 'ats' submit via a direct ATS endpoint
 * adapter (Greenhouse / Lever / Ashby); everything else (manual / null /
 * unknown-host) falls back to the browser channel.
 *
 * This function is intentionally PURE and side-effect free so it is trivially
 * unit-testable without a Deno runtime, env, or network. It performs no I/O.
 *
 * Vendor host detection (documented public board hosts):
 *   greenhouse → boards.greenhouse.io / job-boards.greenhouse.io
 *   lever      → jobs.lever.co
 *   ashby      → jobs.ashbyhq.com / *.ashbyhq.com
 *
 * If application_method is 'api'/'ats' but the host is not a known ATS vendor,
 * the vendor is unknown and we fall back to the browser channel rather than
 * blind-firing an ATS adapter we cannot address (BR-134: unsubmittable → manual
 * fallback with a reason, never a fabricated attempt).
 */

import type { AtsVendor, SubmissionChannel } from './types.ts'

export interface ResolvedChannel {
  channel: SubmissionChannel
  vendor: AtsVendor | null
}

/**
 * Detects the ATS vendor from a source URL's host. Returns null for any host we
 * do not have a documented adapter contract for. Never throws — an unparseable
 * URL simply yields null (caller falls back to browser).
 */
export function detectAtsVendor(sourceUrl: string): AtsVendor | null {
  let host: string
  try {
    host = new URL(sourceUrl).host.toLowerCase()
  } catch {
    return null
  }

  // Greenhouse public job boards.
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    return 'greenhouse'
  }

  // Lever public postings.
  if (host === 'jobs.lever.co') {
    return 'lever'
  }

  // Ashby — canonical jobs.ashbyhq.com plus any *.ashbyhq.com subdomain.
  if (host === 'jobs.ashbyhq.com' || host.endsWith('.ashbyhq.com') || host === 'ashbyhq.com') {
    return 'ashby'
  }

  return null
}

/**
 * Resolves the channel + vendor for a posting.
 *
 *   application_method 'api' | 'ats' → ATS channel IF the host is a known vendor;
 *                                      unknown host → browser fallback (vendor null).
 *   application_method 'manual' | null | anything else → browser channel.
 *
 * For 'api' we preserve the channel label as 'api' (the queue/event audit keeps
 * the method distinction); 'ats' resolves to channel 'ats'. Both route to the
 * same vendor adapter — the adapter is selected by vendor, not by the label.
 */
export function resolveChannel(
  applicationMethod: string | null,
  sourceUrl: string,
): ResolvedChannel {
  const method = applicationMethod?.toLowerCase() ?? null

  if (method === 'api' || method === 'ats') {
    const vendor = detectAtsVendor(sourceUrl)
    if (vendor) {
      // Preserve 'api' vs 'ats' as the channel label for the audit trail.
      return { channel: method as SubmissionChannel, vendor }
    }
    // Known method but unknown host → cannot address an ATS adapter; browser.
    return { channel: 'browser', vendor: null }
  }

  // 'manual', null, or any other value → browser fallback (ADR-006 §4).
  return { channel: 'browser', vendor: null }
}
