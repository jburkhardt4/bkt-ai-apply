// BKT AI-Apply — maps a flat generated document (LLM output or the template
// fallback) into the STRUCTURED DocBuilder content, so the live paper reflects
// the whole generated document instead of cramming it into a single field
// (resume summary / cover-letter first paragraph). The canonical full-text
// artifact is persisted separately to the `documents` table; this parser only
// shapes the editable builder view. Pure + unit-tested.
import type { ResumeContent } from '../types'

export interface ResumeAlignPatch {
  headline: string
  summary: string
  skills: string[]
  experience?: ResumeContent['experience']
}

export interface LetterAlignPatch {
  recipient: string
  greeting: string
  company: string
  role: string
  body: string[]
}

const BULLET_RE = /^[-*•–—]\s+/

/** Strips code fences and normalizes newlines. */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .trim()
}

/** Splits text into trimmed, non-empty blank-line-separated paragraphs. */
export function toParagraphs(text: string): string[] {
  return normalizeText(text)
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

interface DocSection {
  /** Lowercased heading text; '' for the lead block before any heading. */
  heading: string
  lines: string[]
}

/** Parses a markdown-ish document into heading-delimited sections. */
function parseSections(text: string): DocSection[] {
  const sections: DocSection[] = []
  let current: DocSection = { heading: '', lines: [] }
  for (const raw of normalizeText(text).split('\n')) {
    const heading = raw.trim().match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      if (current.heading !== '' || current.lines.length > 0) sections.push(current)
      current = { heading: heading[1].trim().toLowerCase(), lines: [] }
    } else {
      current.lines.push(raw)
    }
  }
  if (current.heading !== '' || current.lines.length > 0) sections.push(current)
  return sections
}

function findSection(sections: DocSection[], keywords: string[]): DocSection | undefined {
  return sections.find((s) => s.heading !== '' && keywords.some((k) => s.heading.includes(k)))
}

function sectionBody(section: DocSection | undefined): string {
  return section ? section.lines.join('\n').trim() : ''
}

function sectionBullets(section: DocSection | undefined): string[] {
  if (!section) return []
  return section.lines
    .map((line) => line.trim().replace(BULLET_RE, '').trim())
    .filter(Boolean)
}

function splitSkills(text: string): string[] {
  return text
    .split(/[,\n•]/)
    .map((s) => s.trim().replace(BULLET_RE, '').trim())
    .filter(Boolean)
}

/**
 * Maps a generated resume into the structured builder fields. `summary` gets the
 * generated summary section only (not the whole document); `skills` merge the
 * posting skills + parsed skills + existing skills; parsed impact/experience
 * bullets are folded into the first existing role (or a single targeted entry).
 */
export function parseGeneratedResume(
  text: string,
  opts: {
    headline: string
    jobSkills: string[]
    baseSkills: string[]
    baseExperience: ResumeContent['experience']
  },
): ResumeAlignPatch {
  const sections = parseSections(text)
  const lead = sections.find((s) => s.heading === '')

  const summary =
    sectionBody(findSection(sections, ['summary', 'profile', 'objective', 'about'])) ||
    sectionBody(lead) ||
    toParagraphs(text)[0] ||
    normalizeText(text)

  const parsedSkills = splitSkills(
    sectionBody(findSection(sections, ['skill', 'competenc', 'strength', 'expertise'])),
  )
  const skills = dedupe([...opts.jobSkills, ...parsedSkills, ...opts.baseSkills]).slice(0, 12)

  const bullets = sectionBullets(
    findSection(sections, ['experience', 'impact', 'highlight', 'achievement', 'alignment']),
  )

  const patch: ResumeAlignPatch = { headline: opts.headline, summary, skills }
  if (bullets.length > 0) {
    if (opts.baseExperience.length > 0) {
      const [first, ...rest] = opts.baseExperience
      patch.experience = [
        { ...first, bullets: dedupe([...bullets, ...first.bullets]).slice(0, 8) },
        ...rest,
      ]
    } else {
      patch.experience = [{ role: opts.headline, org: '', when: '', bullets: bullets.slice(0, 8) }]
    }
  }
  return patch
}

/**
 * Maps a generated cover letter into the structured builder fields. The full
 * letter becomes the `body` paragraph array (not just the first paragraph); a
 * leading salutation is captured as `greeting` and a trailing sign-off is
 * dropped (the builder renders the closing separately).
 */
export function parseGeneratedLetter(
  text: string,
  opts: { company: string; role: string },
): LetterAlignPatch {
  const paragraphs = toParagraphs(text)
  const recipient = `${opts.company} Hiring Team`
  let greeting = `Dear ${recipient},`
  const body: string[] = []

  for (const paragraph of paragraphs) {
    if (body.length === 0 && /^(dear|to whom|hello|hi)\b/i.test(paragraph)) {
      greeting = paragraph
      continue
    }
    body.push(paragraph)
  }

  if (body.length > 0 && /^(sincerely|regards|best|thank you|yours|warm regards)\b/i.test(body[body.length - 1]!)) {
    body.pop()
  }

  return {
    recipient,
    greeting,
    company: opts.company,
    role: opts.role,
    body: body.length > 0 ? body : paragraphs,
  }
}
