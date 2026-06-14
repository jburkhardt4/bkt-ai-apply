/**
 * JobDescriptionMarkdown — renders the constrained Markdown produced by the
 * `format-jd` pipeline using the BKT design system's typography, tuned to match
 * the premium JD-panel reference: clean dark section headers (Description,
 * Responsibilities, Qualifications, Skills, Certifications…), comfortable gray
 * body copy, and short "tag" sections (Skills / Certifications) rendered as pill
 * chips instead of bullets.
 *
 * Everything renders as React text nodes (never dangerouslySetInnerHTML) so
 * untrusted scraped content can't inject markup.
 */
import { cn } from '@/lib/utils'
import { parseInlineSegments, parseJdMarkdown } from './parseJdMarkdown'

/** Sections whose short list items read as tags and render as chips, not bullets. */
const CHIP_SECTION_RE = /\b(skills?|competenc|technolog(y|ies)|tools?|certificat|licens|credential|stack|proficienc)\b/i
/** Max characters for a list item to still read as a chip (vs. a real bullet). */
const CHIP_ITEM_MAX_LEN = 48

function isChipList(heading: string | null, items: string[]): boolean {
  if (!heading || !CHIP_SECTION_RE.test(heading)) return false
  return items.length > 0 && items.every((it) => it.length <= CHIP_ITEM_MAX_LEN)
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInlineSegments(text).map((segment, i) =>
        segment.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {segment.text}
          </strong>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}

interface JobDescriptionMarkdownProps {
  markdown: string
  className?: string
}

export function JobDescriptionMarkdown({ markdown, className }: JobDescriptionMarkdownProps) {
  const blocks = parseJdMarkdown(markdown)
  if (blocks.length === 0) return null

  // Precompute the section heading governing each block so list blocks can decide
  // chip vs. bullet rendering from their section (Skills/Certifications → chips).
  const headingForBlock: (string | null)[] = []
  let currentHeading: string | null = null
  for (const block of blocks) {
    if (block.type === 'heading') currentHeading = block.text
    headingForBlock.push(currentHeading)
  }

  return (
    <div className={cn('space-y-5 text-foreground', className)}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h3
              key={i}
              className="mt-6 text-sm font-semibold tracking-tight text-foreground first:mt-0"
            >
              <InlineText text={block.text} />
            </h3>
          )
        }

        if (block.type === 'list') {
          // Short items under a Skills/Certifications-style heading → pill chips.
          if (isChipList(headingForBlock[i], block.items)) {
            return (
              <ul key={i} className="flex flex-wrap gap-2">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    <InlineText text={item} />
                  </li>
                ))}
              </ul>
            )
          }

          return (
            <ul
              key={i}
              className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-primary/50"
            >
              {block.items.map((item, j) => (
                <li key={j} className="pl-1">
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            <InlineText text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
