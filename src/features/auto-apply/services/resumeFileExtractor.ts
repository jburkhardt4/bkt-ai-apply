// BKT AI-Apply — multi-format resume text extraction (client-side, zero API cost).
//
// Turns an uploaded resume File (.pdf / .docx / .txt / .md) into plain text that
// transcribeResume() (docContentParser.ts) then shapes into the structured
// builder. Everything runs in the browser:
//   - PDF  → pdfjs-dist (Mozilla PDF.js, Apache-2.0) text-content extraction
//   - DOCX → fflate unzip of word/document.xml + a small XML → text pass
//   - TXT / MD → File.text()
// The two heavy libraries are DYNAMICALLY imported so they are code-split out of
// the main bundle and only download when a matching file is actually uploaded.
// No network calls, no provider keys, no per-use cost (NFR: "no additional cost").
//
// The pure helpers (kind detection, DOCX XML → text, entity decode) are exported
// so they can be unit-tested in Node WITHOUT loading pdfjs (whose browser build
// references DOMMatrix and must never be imported at module top level).

export type ResumeFileKind = 'pdf' | 'docx' | 'text'

export interface ExtractedResume {
  text: string
  kind: ResumeFileKind
}

/** A user-facing extraction failure — `message` is safe to show in a toast and
 *  steers the user to the paste-text fallback. */
export class ResumeExtractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResumeExtractError'
  }
}

/** Extensions we can read as plain text directly. */
const TEXT_EXTS = ['.txt', '.md', '.markdown', '.text']
/** Below this many characters we treat extraction as failed (e.g. a scanned,
 *  image-only PDF yields almost nothing) and fall back to paste. */
const MIN_USEFUL_CHARS = 20

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

/**
 * Classifies an upload by file extension first, then MIME type. Returns null for
 * formats we cannot extract in the browser (e.g. the legacy binary `.doc`).
 */
export function detectFileKind(file: { name: string; type?: string }): ResumeFileKind | null {
  const ext = extOf(file.name)
  const type = (file.type ?? '').toLowerCase()
  if (ext === '.pdf' || type === 'application/pdf') return 'pdf'
  if (ext === '.docx' || type.includes('officedocument.wordprocessingml')) return 'docx'
  if (TEXT_EXTS.includes(ext) || type.startsWith('text/')) return 'text'
  return null
}

/** Decodes the XML entities that appear in DOCX run text. `&amp;` is decoded
 *  last so an already-escaped sequence like `&amp;lt;` is not double-decoded. */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Converts the body of `word/document.xml` into readable plain text: paragraph
 * (`</w:p>`) and break (`<w:br/>`, `<w:cr/>`, `<w:tab/>`) tags become
 * newlines/tabs, the run-text (`<w:t>`) nodes are preserved, every other tag is
 * dropped, and XML entities are decoded. Text in DOCX only ever lives inside
 * `<w:t>` nodes, so stripping the remaining markup is safe. Pure + unit-tested.
 */
export function docxXmlToText(xml: string): string {
  const withBreaks = xml
    // Drop field-instruction codes (e.g. HYPERLINK/PAGE) — they are not display text.
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, '')
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<w:cr\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
  const stripped = withBreaks.replace(/<[^>]+>/g, '')
  return decodeXmlEntities(stripped)
    .replace(/\r\n?/g, '\n')
    // Strip a leading run of decorative digits glued before the first real word
    // (some headers emit numbered <w:t> runs from icons/anchors ahead of the name).
    .replace(/^\s*\d{6,}(?=\D)/, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extracts selectable text from a PDF via pdfjs-dist (dynamically imported). */
async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // The worker is bundled by Vite and served as a hashed asset URL — no CDN
  // dependency and no version skew (it ships with the same package).
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    const lines: string[] = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      let line = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        line += item.str
        // pdf.js flags the end of a visual line with hasEOL; preserve it so
        // section headings land on their own line for transcribeResume().
        if (item.hasEOL) {
          lines.push(line)
          line = ''
        } else {
          line += ' '
        }
      }
      if (line.trim()) lines.push(line)
      lines.push('') // blank line between pages
    }
    return lines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    // Destroying the loading task aborts the worker and frees the document.
    await loadingTask.destroy()
  }
}

/** Extracts text from a DOCX by unzipping word/document.xml (fflate). */
async function extractDocx(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
  } catch {
    throw new ResumeExtractError(
      'This Word file could not be opened. Try re-saving it as .docx, or paste your resume text below.',
    )
  }
  const document = entries['word/document.xml']
  if (!document) {
    throw new ResumeExtractError(
      'No document text was found in this Word file. Paste your resume text below to continue.',
    )
  }
  return docxXmlToText(strFromU8(document))
}

/**
 * Extracts plain text from an uploaded resume File. Dispatches on the detected
 * file kind (PDF / DOCX / TXT / MD). Throws a ResumeExtractError with a
 * user-facing message for unsupported types or when no usable text is found
 * (e.g. a scanned PDF) so the caller can offer the paste-text fallback.
 */
export async function extractResumeText(file: File): Promise<ExtractedResume> {
  const kind = detectFileKind(file)
  if (!kind) {
    throw new ResumeExtractError(
      `Unsupported file "${file.name}". Upload a PDF, DOCX, TXT, or MD file, or paste your resume text below.`,
    )
  }

  let text: string
  if (kind === 'pdf') text = await extractPdf(file)
  else if (kind === 'docx') text = await extractDocx(file)
  else text = (await file.text()).replace(/\r\n?/g, '\n')

  text = text.trim()
  if (text.length < MIN_USEFUL_CHARS) {
    throw new ResumeExtractError(
      kind === 'pdf'
        ? 'No selectable text found (this PDF may be a scan or image). Paste your resume text below to continue.'
        : 'No readable text found in this file. Paste your resume text below to continue.',
    )
  }
  return { text, kind }
}
