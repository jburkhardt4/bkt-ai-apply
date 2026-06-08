import { describe, it, expect } from 'vitest'
import { extractMemories, deriveTitle, buildSystemPrompt } from './chatCompletionService'
import type { PipelineContextSummary } from '@/features/applications/services/chatAssistantService'

describe('extractMemories', () => {
  it('separates MEMORY directives from the reply text', () => {
    const reply = 'Here is my advice.\nFocus on FSC roles.\nMEMORY: Prefers remote-first roles'
    const { cleaned, memories } = extractMemories(reply)
    expect(cleaned).toBe('Here is my advice.\nFocus on FSC roles.')
    expect(memories).toEqual(['Prefers remote-first roles'])
  })

  it('returns no memories when none are present', () => {
    const { cleaned, memories } = extractMemories('Just a normal answer.')
    expect(cleaned).toBe('Just a normal answer.')
    expect(memories).toEqual([])
  })

  it('captures multiple MEMORY lines (case-insensitive)', () => {
    const { memories } = extractMemories('ok\nMEMORY: A\nmemory: B')
    expect(memories).toEqual(['A', 'B'])
  })
})

describe('deriveTitle', () => {
  it('uses short messages verbatim (whitespace-collapsed)', () => {
    expect(deriveTitle('  Help me   target   FSC roles ')).toBe('Help me target FSC roles')
  })

  it('truncates long messages with an ellipsis', () => {
    const title = deriveTitle('a'.repeat(60))
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(46)
  })
})

describe('buildSystemPrompt', () => {
  const context: PipelineContextSummary = {
    applicationsTracked: 5,
    averageMatchScore: 72,
    highMatchCount: 2,
    stageCounts: { applied: 3, screening: 2 },
    recentAiScoreAverage: 70,
  }

  it('includes pipeline context and memory items', () => {
    const prompt = buildSystemPrompt(context, ['Prefers remote', 'LA-based'])
    expect(prompt).toContain('Applications tracked: 5')
    expect(prompt).toContain('applied: 3, screening: 2')
    expect(prompt).toContain('- Prefers remote')
    expect(prompt).toContain('MEMORY:')
  })

  it('handles empty memory gracefully', () => {
    const prompt = buildSystemPrompt(context, [])
    expect(prompt).toContain('(nothing remembered yet)')
  })
})
