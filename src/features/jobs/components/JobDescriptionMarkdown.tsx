/**
 * JobDescriptionMarkdown — renders the constrained Markdown produced by the
 * `format-jd` pipeline using the BKT design system's typography. Headings
 * become branded section labels; bullets get brand-tinted markers; inline
 * `**bold**` is honored. Everything renders as React text nodes (never
 * dangerouslySetInnerHTML) so untrusted scraped content can't inject markup.
 */
import { cn } from '@/lib/utils'
import { parseInlineSegments, parseJdMarkdown } from './parseJdMarkdown'

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

  return (
    <div className={cn('space-y-4', className)}>
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h3
              key={i}
              className="mt-6 text-xs font-semibold uppercase tracking-wide text-primary first:mt-0"
            >
              <InlineText text={block.text} />
            </h3>
          )
        }

        if (block.type === 'list') {
          return (
            <ul
              key={i}
              className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/80 marker:text-primary/60"
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
          <p key={i} className="text-sm leading-relaxed text-foreground/80">
            <InlineText text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
