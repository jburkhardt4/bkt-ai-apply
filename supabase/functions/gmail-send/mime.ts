/**
 * gmail-send — pure RFC 2822 message builder.
 *
 * No Deno / network imports so it is unit-tested by vitest (node) and executed
 * by the Edge runtime. Output feeds Gmail's users.messages.send `raw` field
 * (base64url, no padding).
 */

export interface MimeMessageInput {
  from: string
  to: string
  subject: string
  body: string
  /** Original Message-ID header — set on replies for correct threading. */
  inReplyTo?: string | null
}

/** RFC 2047 B-encode a header value when it contains non-ASCII characters. */
export function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${encodeBase64(value)}?=`
}

function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Base64url without padding, UTF-8 safe — Gmail's `raw` encoding. */
export function encodeBase64Url(input: string): string {
  return encodeBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Reject header field values containing CR/LF — prevents RFC 5322 header
 * injection (a crafted `to`/`subject` smuggling e.g. a `Bcc:` line into mail
 * sent from the connected account). Header values never span lines; the body
 * (everything after the blank line) is not a header and is unaffected.
 */
export function assertHeaderSafe(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`gmail-send: illegal CR/LF in "${field}" header value (possible header injection)`)
  }
}

/** Builds the full RFC 2822 message (CRLF line endings, UTF-8 plain text). */
export function buildMimeMessage(input: MimeMessageInput): string {
  assertHeaderSafe(input.from, 'From')
  assertHeaderSafe(input.to, 'To')
  assertHeaderSafe(input.subject, 'Subject')
  if (input.inReplyTo) assertHeaderSafe(input.inReplyTo, 'In-Reply-To')
  const headers: string[] = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ]
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`)
    headers.push(`References: ${input.inReplyTo}`)
  }
  return `${headers.join('\r\n')}\r\n\r\n${input.body}`
}

/** Convenience: MIME → Gmail `raw`. */
export function buildRawMessage(input: MimeMessageInput): string {
  return encodeBase64Url(buildMimeMessage(input))
}

/** "Re: subject" / "Fwd: subject" without stacking prefixes. */
export function replySubject(original: string | null): string {
  const base = (original ?? '').trim()
  if (/^re:/i.test(base)) return base
  return base.length > 0 ? `Re: ${base}` : 'Re:'
}

export function forwardSubject(original: string | null): string {
  const base = (original ?? '').trim()
  if (/^fwd?:/i.test(base)) return base
  return base.length > 0 ? `Fwd: ${base}` : 'Fwd:'
}
