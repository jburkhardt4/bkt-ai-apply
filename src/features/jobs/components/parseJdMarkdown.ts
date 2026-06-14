/**
 * parseJdMarkdown — a tiny, safe parser for the constrained Markdown the
 * `format-jd` pipeline emits (### headings, `*`/`-` bullets, paragraphs, and
 * `**bold**` inline emphasis).
 *
 * Pure module (no JSX) so it stays unit-testable and so the .tsx renderer can
 * export only components (react-refresh/only-export-components). We deliberately
 * do NOT support raw HTML or auto-linking — output is rendered as React text
 * nodes by JobDescriptionMarkdown, which keeps the panel XSS-safe even when the
 * source description came from an untrusted scraped page.
 */

export type JdBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string }

export interface JdInlineSegment {
  text: string
  bold: boolean
}

const HEADING_RE = /^#{1,6}\s+(.+?)\s*#*$/
const BULLET_RE = /^\s*[*\-+]\s+(.+)$/
const BOLD_RE = /\*\*(.+?)\*\*/g

/** Splits a single line of text into bold / plain inline segments. */
export function parseInlineSegments(text: string): JdInlineSegment[] {
  const segments: JdInlineSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  BOLD_RE.lastIndex = 0
  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    segments.push({ text: match[1], bold: true })
    lastIndex = BOLD_RE.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false })
  }
  if (segments.length === 0) {
    segments.push({ text, bold: false })
  }
  return segments
}

/**
 * Parses constrained Markdown into an ordered list of blocks. Consecutive
 * bullet lines collapse into a single list; consecutive plain lines collapse
 * into a single paragraph; blank lines and headings flush the current block.
 */
export function parseJdMarkdown(markdown: string): JdBlock[] {
  const blocks: JdBlock[] = []
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() })
      paragraph = []
    }
  }
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const headingMatch = line.trim().match(HEADING_RE)
    const bulletMatch = line.match(BULLET_RE)

    if (headingMatch) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: headingMatch[1].trim() })
    } else if (bulletMatch) {
      flushParagraph()
      listItems.push(bulletMatch[1].trim())
    } else if (line.trim() === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }

  flushParagraph()
  flushList()
  return blocks
}
