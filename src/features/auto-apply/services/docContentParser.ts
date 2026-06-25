// BKT AI-Apply — maps a flat generated document (LLM output or the template
// fallback) into the STRUCTURED DocBuilder content, so the live paper reflects
// the whole generated document instead of cramming it into a single field
// (resume summary / cover-letter first paragraph). The canonical full-text
// artifact is persisted separately to the `documents` table; this parser only
// shapes the editable builder view. Pure + unit-tested.
import type { LetterContent, ResumeContent } from '../types'
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
// Handles two input regimes produced by resumeFileExtractor:
//   • Markdown  (TXT / MD): `## Heading`, `**Role**`, `- bullet`, `[label](url)`
//   • Extracted prose (PDF / DOCX): ALL-CAPS or tab-indented lines, `Company —
//     Location` headers, `Role⇥Dates`, bullets without a glyph.
// Heuristic + best-effort, but section boundaries and the candidate's own words /
// bullet structure are preserved (not flattened into one blob). Never throws — an
// unparseable doc still yields its raw text as the summary. Pure + unit-tested.

const CONTACT_RE =
  /[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|linkedin\.com|github\.com|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/i
const DATE_RE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)?\d{2}\b|\b(?:19|20)\d{2}\b|\b(?:present|current)\b/i

type ResumeSection = 'summary' | 'experience' | 'education' | 'skills' | 'certifications'

/** Removes inline Markdown so the candidate's words survive but the markup does
 *  not: links → label, images dropped, bold/italic/code markers removed, ATX
 *  heading + blockquote prefixes stripped, internal whitespace (incl. tabs)
 *  collapsed. */
function stripInlineMarkdown(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when a raw line is a bullet: a leading bullet glyph, OR (in extracted
 *  PDF/DOCX text) a tab / multi-space indent. */
function isIndentedOrBullet(raw: string): boolean {
  return BULLET_RE.test(raw.trim()) || /^\t/.test(raw) || /^ {2,}\S/.test(raw)
}

/**
 * The resume section a line announces, or null. Recognizes Markdown headings
 * (`## Skills`) and plain / ALL-CAPS headings, with a broadened vocabulary so
 * real-world labels map correctly: "Executive Summary", "Professional Work
 * Experience", "Core Competencies" / "Areas of Expertise", "Education &
 * Certifications", standalone "Certifications", etc.
 */
function headingOf(line: string): ResumeSection | null {
  const raw = line.trim()
  if (!raw || BULLET_RE.test(raw)) return null
  const isMdHeading = /^\s{0,3}#{1,6}\s+/.test(raw)
  const t = stripInlineMarkdown(raw).replace(/[:–—\-\s]+$/, '').trim().toLowerCase()
  if (!t) return null
  // A non-Markdown heading must still look like a heading: short, no sentence
  // punctuation (so a prose line is never mistaken for a section break).
  if (!isMdHeading && (t.length > 42 || /[.;]/.test(t))) return null
  if (/\b(summary|profile|objective|about)\b/.test(t) && !/\b(work|experience)\b/.test(t)) return 'summary'
  if (/\beducation\b|\bacademic/.test(t)) return 'education'
  if (/certificat|^licenses?\b|\blicenses?\s*&|credential/.test(t)) return 'certifications'
  if (/\b(experience|employment)\b|work history|\bwork\b/.test(t)) return 'experience'
  if (/\bskills?\b|competenc|expertise|technolog|proficienc/.test(t)) return 'skills'
  return null
}

/** Splits a role / education / company header into its name, org, and date token
 *  — best-effort across "Title — Org · 2019-Present" and "Title | Org | (2018)". */
function splitHeader(line: string): { left: string; org: string; when: string } {
  const dm = line.match(DATE_RE)
  let when = ''
  let rest = line
  if (dm) {
    const at = line.indexOf(dm[0])
    when = line.slice(at).replace(/[()]/g, '').trim()
    rest = line.slice(0, at)
  }
  rest = rest.replace(/^[\s|,·•–—()-]+|[\s|,·•–—()-]+$/g, '').trim()
  const parts = rest.split(/\s+(?:at|@)\s+|\s+[|·–—]\s+|\s+-\s+|,\s+/i)
  return { left: (parts[0] ?? rest).trim(), org: parts.slice(1).join(', ').trim(), when }
}

/** True when a flush-left, date-less line is a company/employer header rather than
 *  a prose sentence: short, no terminal period, with a "Name — Location" separator. */
function isCompanyLine(text: string): boolean {
  if (!text || text.length > 70 || /[.]$/.test(text)) return false
  return /\s[–—|]\s|\s-\s/.test(text)
}

/**
 * Parses an experience block into roles, preserving each role's own bullets.
 * Recognizes, in both Markdown and extracted-prose form:
 *   • company headers  (`### Company` / flush-left `Company — Location`)
 *   • role headers      (`**Role** | Dates` / `Role⇥Dates` / any dated line)
 *   • bullets           (glyph-led, or tab/space-indented in PDF/DOCX text)
 *   • a role-summary line → folded in as the role's first bullet
 * A company header sets the org for the roles that follow until the next company,
 * so multiple roles at one employer are attributed correctly.
 */
function parseExperienceBlock(lines: string[]): ResumeContent['experience'] {
  const roles: ResumeContent['experience'] = []
  let pendingOrg = ''
  const ensure = () => {
    if (!roles.length) roles.push({ role: '', org: pendingOrg, when: '', bullets: [] })
    return roles[roles.length - 1]!
  }
  for (const raw of lines) {
    if (!raw.trim()) continue
    const line = raw.trim()
    const indented = isIndentedOrBullet(raw)
    const hasDate = DATE_RE.test(line)
    const isMdCompany = /^#{2,6}\s+/.test(line)
    const isMdRole = /^\*\*[^*]+\*\*/.test(line)
    const text = stripInlineMarkdown(line.replace(BULLET_RE, '').trim())

    // 1) Bullet: a glyph, or an indented non-date line (PDF/DOCX wrap a role's
    //    achievements as tab-led lines with no glyph).
    if (BULLET_RE.test(line) || (indented && !hasDate && !isMdRole)) {
      if (text) ensure().bullets.push(text)
      continue
    }
    // 2) Company header (sets org for following roles).
    if (isMdCompany || (!hasDate && !isMdRole && isCompanyLine(text))) {
      pendingOrg = splitHeader(stripInlineMarkdown(line.replace(/^#{2,6}\s+/, ''))).left
      continue
    }
    // 3) Role header (dated line, or a Markdown **Role**).
    if (hasDate || isMdRole) {
      const h = splitHeader(text)
      roles.push({
        role: (isMdRole ? text.replace(/\s*[|·].*$/, '').trim() : h.left) || text,
        org: pendingOrg || h.org,
        when: h.when,
        bullets: [],
      })
      continue
    }
    // 4) Flush-left prose (e.g. a role summary) → first bullet of the current role.
    if (text) ensure().bullets.push(text)
  }
  return roles.filter((r) => r.role || r.org || r.bullets.length)
}

/**
 * Maps a SKILLS block to chips while preserving structure. When the block is a
 * list (Markdown bullets or tab/space-indented category lines), each line becomes
 * one entry so grouped categories like "CRM & Platforms: Dynamics 365, HubSpot…"
 * stay intact (the prior parser over-split on every comma → "sloppy"). A flat
 * comma/newline list is split into individual skills (legacy behavior).
 */
function parseSkillsBlock(lines: string[]): string[] {
  const nonEmpty = lines.filter((l) => l.trim())
  const grouped = nonEmpty.some((l) => isIndentedOrBullet(l))
  if (grouped) {
    const entries = nonEmpty
      .map((l) => stripInlineMarkdown(l.replace(BULLET_RE, '').trim()))
      .filter(Boolean)
    return sanitizeDashList(dedupe(entries)).slice(0, 24)
  }
  return sanitizeDashList(dedupe(splitSkills(nonEmpty.join('\n')))).slice(0, 40)
}

const DEGREE_RE = /\b(b\.?s|b\.?a|m\.?s|m\.?b\.?a|ph\.?d|bachelor|master|associate|diploma|licensed?)\b/i
// No trailing \b after the prefixes — "universit" must still match "University".
const INSTITUTION_RE = /universit|college|\bschool\b|institute|\bacademy|trailhead/i
/** A certification / credential line, e.g. "Salesforce Certified …". */
const CERT_RE = /\bcertif/i

/** Whether a line names a certification (vs. a degree/license). */
function isCertLine(line: string): boolean {
  return CERT_RE.test(stripInlineMarkdown(line))
}

/** Extracts standalone certifications — one cleaned, deduped entry per line. */
function parseCertifications(lines: string[]): string[] {
  return dedupe(
    lines.map((l) => stripInlineMarkdown(l.replace(BULLET_RE, '').trim())).filter(Boolean),
  ).slice(0, 30)
}

/**
 * Parses an education block into entries. A self-contained "Degree — Institution
 * · Year" line becomes one entry; a degree line followed by its institution on
 * the next line is merged. Certification lines are handled separately by
 * parseCertifications (the caller filters them out first).
 */
function parseEducationBlock(lines: string[]): ResumeContent['education'] {
  const out: ResumeContent['education'] = []
  let pendingOrg: { org: string; when: string } | null = null

  for (const raw of lines) {
    const line = stripInlineMarkdown(raw.replace(BULLET_RE, '').trim())
    if (!line) continue
    const isDegree = DEGREE_RE.test(line)
    const isInstitution = INSTITUTION_RE.test(line)

    if (isInstitution && !isDegree) {
      // An institution-only line: attach to the most recent degree that lacks an
      // org, otherwise hold it for the next degree.
      const h = splitHeader(line)
      const inst = { org: h.left || line, when: h.when }
      const last = out[out.length - 1]
      if (last && !last.org) {
        last.org = inst.org
        if (inst.when && !last.when) last.when = inst.when
      } else {
        pendingOrg = inst
      }
      continue
    }
    if (isDegree && isInstitution) {
      const h = splitHeader(line) // self-contained degree — institution · year
      out.push({ degree: h.left || line, org: h.org, when: h.when })
      pendingOrg = null
      continue
    }
    // Degree-only (or any other entry line): keep the full text as the degree,
    // pulling a trailing (year) if present; org comes from a held institution.
    const dm = line.match(DATE_RE)
    const when = dm ? line.slice(line.indexOf(dm[0])).replace(/[()]/g, '').trim() : ''
    const degree = (dm ? line.slice(0, line.indexOf(dm[0])) : line).replace(/[\s|,()·–—-]+$/, '').trim()
    out.push({ degree: degree || line, org: pendingOrg?.org ?? '', when: when || pendingOrg?.when || '' })
    pendingOrg = null
  }

  return out
}

/**
 * Transcribes a resume's plain text into the structured builder content VERBATIM.
 * Splits on recognized section headings; the candidate's own wording is preserved
 * (summary, bullets, skills are not reworded). Header block → name / contact /
 * headline. Never throws — an unparseable doc still yields the raw text as summary.
 */
export function transcribeResume(text: string): ResumeContent {
  const lines = normalizeText(text).split('\n')
  const buckets = {
    header: [] as string[],
    summary: [] as string[],
    experience: [] as string[],
    education: [] as string[],
    skills: [] as string[],
    certifications: [] as string[],
  }
  let cur: keyof typeof buckets = 'header'
  for (const raw of lines) {
    const h = headingOf(raw)
    if (h) cur = h
    else buckets[cur].push(raw)
  }

  // Header lines are Markdown-cleaned so `# Name` / `[label](url)` resolve to text.
  const header = buckets.header.map((l) => stripInlineMarkdown(l)).filter(Boolean)
  const name = (header[0] ?? '').replace(/^[\d\s|·.,;:–—-]+/, '').trim() || header[0] || ''
  const contact = header.find((l) => CONTACT_RE.test(l)) ?? ''
  const headline = header.slice(1).find((l) => l !== contact && !CONTACT_RE.test(l)) ?? ''
  const headerRemainder = header
    .filter((l) => l !== name && l !== headline && l !== contact && !CONTACT_RE.test(l))
    .join(' ')
  const summary = sanitizeDashes(
    (buckets.summary.map((l) => stripInlineMarkdown(l)).join('\n').trim() || headerRemainder)
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  )

  // A combined "Education & Certifications" section dumps both into the education
  // bucket; split the cert lines out so each lands in its own field/section.
  const eduLines = buckets.education.filter((l) => !isCertLine(l))
  const certLines = [...buckets.certifications, ...buckets.education.filter(isCertLine)]

  return {
    name,
    contact,
    headline,
    summary,
    experience: parseExperienceBlock(buckets.experience).map((r) => ({
      ...r,
      bullets: sanitizeDashList(r.bullets),
    })),
    education: parseEducationBlock(eduLines),
    skills: parseSkillsBlock(buckets.skills),
    certifications: parseCertifications(certLines),
  }
}

/* ─────────────────────── SERIALIZATION (builder → text) ─────────────────────── */
// The inverse of transcribeResume: render the structured builder content back to
// clean Markdown so it can be PERSISTED to the `documents` table as plain text
// (the same store job-scoring reads). The format is exactly what transcribeResume
// round-trips, so save → reload → re-parse preserves the standard sections.

/** Serializes resume builder content to round-trippable Markdown. */
export function serializeResume(c: ResumeContent): string {
  const out: string[] = []
  if (c.name.trim()) out.push(`# ${c.name.trim()}`)
  if (c.headline.trim()) out.push('', c.headline.trim())
  if (c.contact.trim()) out.push('', c.contact.trim())

  if (c.summary.trim()) out.push('', '## Summary', '', c.summary.trim())

  const roles = c.experience.filter((e) => e.role || e.org || e.bullets.some(Boolean))
  if (roles.length) {
    out.push('', '## Experience')
    for (const e of roles) {
      out.push('')
      if (e.org.trim()) out.push(`### ${e.org.trim()}`)
      const head = [e.role.trim() && `**${e.role.trim()}**`, e.when.trim()].filter(Boolean).join(' | ')
      if (head) out.push(head)
      for (const b of e.bullets.map((x) => x.trim()).filter(Boolean)) out.push(`- ${b}`)
    }
  }

  const edu = c.education.filter((e) => e.degree || e.org || e.when)
  if (edu.length) {
    out.push('', '## Education', '')
    for (const e of edu) {
      const deg = e.degree.trim()
      const org = e.org.trim()
      const when = e.when.trim()
      // Degree on its own bullet (kept verbatim, incl. any internal "|"), with the
      // institution on the next line so transcribeResume re-attaches it as the org.
      if (org) {
        out.push(`- ${deg}`)
        out.push(`${org}${when ? ` · (${when})` : ''}`)
      } else {
        out.push(`- ${deg}${when ? ` · (${when})` : ''}`)
      }
    }
  }

  const certs = c.certifications.map((x) => x.trim()).filter(Boolean)
  if (certs.length) {
    out.push('', '## Certifications', '')
    for (const cert of certs) out.push(`- ${cert}`)
  }

  const skills = c.skills.map((x) => x.trim()).filter(Boolean)
  if (skills.length) {
    out.push('', '## Skills', '')
    for (const s of skills) out.push(`- ${s}`)
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/** Serializes cover-letter builder content to plain text. */
export function serializeLetter(c: LetterContent): string {
  const out = [c.name, c.contact, '', c.date, '', c.recipient, `${c.company} · ${c.role}`, '', c.greeting, '']
  for (const p of c.body.map((x) => x.trim()).filter(Boolean)) out.push(p, '')
  out.push(c.closing, c.name)
  return `${out.map((l) => (l ?? '').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/**
 * Best-effort transcription of a saved cover letter's text back into the
 * structured builder fields (the letter counterpart of transcribeResume). Header
 * lines yield name/contact; a leading salutation becomes the greeting; the
 * remaining paragraphs become the body. Never throws.
 */
export function transcribeLetter(text: string): LetterContent {
  const header = normalizeText(text)
    .split('\n')
    .map((l) => stripInlineMarkdown(l))
    .filter(Boolean)
  const name = header[0] ?? ''
  const contact = header.find((l) => CONTACT_RE.test(l)) ?? ''
  const patch = parseGeneratedLetter(text, { company: '', role: '' })
  return {
    name,
    contact,
    date: '',
    recipient: patch.recipient,
    company: patch.company,
    role: patch.role,
    greeting: patch.greeting,
    body: patch.body,
    closing: 'Sincerely,',
  }
}
