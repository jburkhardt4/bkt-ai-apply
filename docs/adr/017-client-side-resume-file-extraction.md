# ADR-017: Client-Side Multi-Format Resume File Extraction

**Status:** Accepted
**Date:** 2026-06-25
**Relates to:** ADR-008 (Server-Side AI Document Generation), BR-074, BR-150

---

## Context

The Resume / Cover-Letter builder (`DocsScreen` → `DocBuilder`) let users upload a
file, but `UploadZone` only ever read it with `File.text()`. That works for plain
text, but a PDF reads back as its `%PDF…` source and a DOCX as ZIP (`PK…`) bytes,
so a heuristic (`looksLikeText`) detected the binary and **punted the user to a
manual paste box** — the two formats résumés are actually saved in (PDF, DOCX)
could not be parsed at all. The history row also recorded a `Math.random()`-based
fake file size, and the file picker's `accept` was `.pdf,.doc,.docx` (excluding
the `.txt`/`.md` that *did* work, and including the unsupportable legacy `.doc`).

`transcribeResume()` (`docContentParser.ts`) — the verbatim text → structured
builder mapper — was already solid and unit-tested; it only lacked real text for
binary formats. BR-150 had previously deferred "real client-side PDF extraction"
as a follow-up. We needed to ingest **PDF, DOCX, TXT, and MD** with real content
and **no per-use cost** (NFR), preferring lightweight, already-free tooling.

## Decision

1. **New `resumeFileExtractor.ts`** (`src/features/auto-apply/services/`) exposing
   `extractResumeText(file): Promise<{ text, kind }>`. It dispatches by extension,
   then MIME type (`detectFileKind`):
   - **PDF** → `pdfjs-dist` (Mozilla PDF.js, Apache-2.0) text-content extraction,
     reconstructing lines from `hasEOL` so headings survive for `transcribeResume`.
   - **DOCX** → `fflate` unzip of `word/document.xml` + a pure `docxXmlToText`
     (paragraph/break tags → newlines/tabs, keep `<w:t>` runs, decode entities).
   - **TXT / MD** → `File.text()`.

2. **Zero API cost, lazy-loaded.** All extraction runs in the browser — no network
   call, no provider key, nothing billable. Both heavy libraries are **dynamically
   imported** inside their branch, so Vite code-splits them out of the main bundle
   (`pdf-*.js` ≈ 125 kB gzip + a worker asset) and they only download when a
   matching file is uploaded. pdf.js' browser build references `DOMMatrix`, so it is
   **never** imported at module top level (would break the Node/vitest run); the
   pure helpers are exported and unit-tested without it.

3. **Real transcription replaces the punt.** `DocsScreen` calls `extractResumeText`,
   feeds the text to the existing `transcribeResume()`, records the **real**
   `file.size` (`formatBytes`), and sets `accept=".pdf,.docx,.txt,.md,.markdown"`.
   The paste box is **retained only as a graceful fallback** — shown when extraction
   genuinely fails (scanned/image-only PDF, legacy `.doc`, unreadable file), with
   the extractor's user-facing error surfaced in the toast.

4. **Verbatim, not rewritten.** Extraction + `transcribeResume` preserve the
   candidate's own words; this is distinct from Auto-Align, which rewrites via the
   LLM (ADR-008). No mock/placeholder data is produced on any path.

## Consequences

- **Positive:** PDF/DOCX/TXT/MD resumes now parse into the structured builder
  directly, with real file sizes and accurate format affordances. No new running
  cost; the main bundle is unaffected (libraries are on-demand chunks). The pure
  DOCX/entity helpers are fully unit-tested (including a real `.docx` round-trip
  built with `fflate.zipSync`).
- **Trade-offs:** two new dependencies (`pdfjs-dist`, `fflate`); the pdf.js worker
  is a ~1.2 MB on-demand asset. Image-only/scanned PDFs have no selectable text and
  still route to the paste fallback (OCR is out of scope).
- **Follow-ups:** `resumeFileExtractor` is now the natural place to populate the
  pre-extracted `master_resume_text` that BR-150 deferred for the match-scoring
  input path (currently `.txt`-only via `fetchCandidateResumeText`); wiring it there
  is a future step and does not change BR-150 today.
