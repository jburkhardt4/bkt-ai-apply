// BKT AI-Apply — maps a flat generated document (LLM output or the template
// fallback) into the STRUCTURED DocBuilder content, so the live paper reflects
// the whole generated document instead of cramming it into a single field
// (resume summary / cover-letter first paragraph). The canonical full-text
// artifact is persisted separately to the `documents` table; this parser only
// shapes the editable builder view. Pure + unit-tested.
import type { ResumeContent } from '../types'
import { sanitizeDashes, sanitizeDashList } from './textSanitizer'

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

  const summary = sanitizeDashes(
    sectionBody(findSection(sections, ['summary', 'profile', 'objective', 'about'])) ||
      sectionBody(lead) ||
      toParagraphs(text)[0] ||
      normalizeText(text),
  )

  const parsedSkills = splitSkills(
    sectionBody(findSection(sections, ['skill', 'competenc', 'strength', 'expertise'])),
  )
  const skills = sanitizeDashList(dedupe([...opts.jobSkills, ...parsedSkills, ...opts.baseSkills])).slice(0, 12)

  const bullets = sanitizeDashList(
    sectionBullets(
      findSection(sections, ['experience', 'impact', 'highlight', 'achievement', 'alignment']),
    ),
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
  const paragraphs = sanitizeDashList(toParagraphs(text))
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

/* ─────────────────────── VERBATIM TRANSCRIPTION ─────────────────────── */
// Maps an UPLOADED / pasted resume's OWN text into the structured builder fields
// WITHOUT rewording it — the opposite of Auto-Align (which rewrites via the LLM).
// Heuristic + best-effort: resume layouts vary wildly, so section detection is
// imperfect, but the candidate's actual words are preserved and they edit from
// there. Pure + unit-tested.

const CONTACT_RE =
  /[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|linkedin\.com|github\.com|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/i
const DATE_RE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2}\b|\b(?:19|20)\d{2}\b|\b(?:present|current)\b/i

/** The resume section a line announces, or null. A heading is a short line (not a
 *  bullet) matching a known section word — handles ALL-CAPS / Title-case / colon. */
function headingOf(line: string): 'summary' | 'experience' | 'education' | 'skills' | null {
  if (BULLET_RE.test(line)) return null
  const t = line.trim().replace(/[:–—\-\s]+$/, '').toLowerCase()
  if (!t || t.length > 40) return null
  const map: [RegExp, 'summary' | 'experience' | 'education' | 'skills'][] = [
    [/^(?:professional\s+)?summary$|^profile$|^objective$|^about(?:\s+me)?$/, 'summary'],
    [/^(?:work|professional|employment)?\s*(?:experience|history)$/, 'experience'],
    [/^education$|^academics?$|^academic background$/, 'education'],
    [/^(?:technical |core )?skills$|^competenc|^expertise$|^technologies$/, 'skills'],
  ]
  for (const [re, key] of map) if (re.test(t)) return key
  return null
}

/** Splits a role / education header line into its name, org, and date token —
 *  best-effort across the common "Title — Org · 2019-Present" style layouts. */
function splitHeader(line: string): { left: string; org: string; when: string } {
  const dm = line.match(DATE_RE)
  const when = dm ? line.slice(line.indexOf(dm[0])).trim() : ''
  let rest = (when ? line.replace(when, '') : line).trim()
  rest = rest.replace(/^[\s|,·–—-]+|[\s|,·–—-]+$/g, '').trim()
  const parts = rest.split(/\s+(?:at|@)\s+|\s+[|·–—]\s+|\s+-\s+|,\s+/i)
  return { left: (parts[0] ?? rest).trim(), org: parts.slice(1).join(', ').trim(), when }
}

/** Parses an experience block into roles: a dated (or first) non-bullet line opens
 *  a role; bullets attach to it; other lines become context bullets. */
function parseExperienceBlock(lines: string[]): ResumeContent['experience'] {
  const roles: ResumeContent['experience'] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (BULLET_RE.test(line)) {
      if (!roles.length) roles.push({ role: '', org: '', when: '', bullets: [] })
      roles[roles.length - 1]!.bullets.push(line.replace(BULLET_RE, '').trim())
    } else if (DATE_RE.test(line) || roles.length === 0) {
      const h = splitHeader(line)
      roles.push({ role: h.left, org: h.org, when: h.when, bullets: [] })
    } else {
      roles[roles.length - 1]!.bullets.push(line)
    }
  }
  return roles.filter((r) => r.role || r.org || r.bullets.length)
}

/** Parses an education block: one entry per non-empty line (degree / org / dates). */
function parseEducationBlock(lines: string[]): ResumeContent['education'] {
  return lines
    .map((l) => l.trim().replace(BULLET_RE, '').trim())
    .filter(Boolean)
    .map((line) => {
      const { left, org, when } = splitHeader(line)
      return { degree: left, org, when }
    })
}

/**
 * Transcribes a resume's plain text into the structured builder content VERBATIM.
 * Splits on recognized section headings; the candidate's own wording is preserved
 * (summary, bullets, skills are not reworded). Header block → name / contact /
 * headline. Never throws — an unparseable doc still yields the raw text as summary.
 */
export function transcribeResume(text: string): ResumeContent {
  const lines = normalizeText(text).split('\n')
  const buckets = { header: [] as string[], summary: [] as string[], experience: [] as string[], education: [] as string[], skills: [] as string[] }
  let cur: keyof typeof buckets = 'header'
  for (const raw of lines) {
    const h = headingOf(raw)
    if (h) cur = h
    else buckets[cur].push(raw)
  }

  const header = buckets.header.map((l) => l.trim()).filter(Boolean)
  const name = header[0] ?? ''
  const contact = header.find((l) => CONTACT_RE.test(l)) ?? ''
  const headline = header.slice(1).find((l) => l !== contact && !CONTACT_RE.test(l)) ?? ''
  const headerRemainder = header
    .filter((l) => l !== name && l !== headline && !CONTACT_RE.test(l))
    .join(' ')
  const summary = sanitizeDashes(
    (buckets.summary.join('\n').trim() || headerRemainder).replace(/\s+/g, ' ').trim(),
  )

  return {
    name,
    contact,
    headline,
    summary,
    experience: parseExperienceBlock(buckets.experience).map((r) => ({
      ...r,
      bullets: sanitizeDashList(r.bullets),
    })),
    education: parseEducationBlock(buckets.education),
    skills: sanitizeDashList(splitSkills(buckets.skills.join('\n'))).slice(0, 40),
  }
}
