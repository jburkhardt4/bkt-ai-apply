/**
 * AI Chat: AI-driven interaction @ai-chat
 *
 * Authenticated agent that opens the AI assistant chat panel, sends a message,
 * and evaluates whether the assistant responds coherently without errors.
 *
 * Requires: TEST_USER_EMAIL, TEST_USER_PASSWORD, ANTHROPIC_KEY
 */
import { test, expect } from '@playwright/test'
import { z } from 'zod'
import { makeStagehand, loginWithTestUser, hasTestCredentials } from './_helpers/setup'

test.describe('AI Chat: assistant interaction @ai-chat', () => {
  test.skip(!hasTestCredentials(), 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping')

  test('AI agent opens chat panel and sends a test message', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)

      // Open the AI chat panel (may already be visible in app shell)
      await stagehand.page.act({
        action: 'open the AI assistant or chat panel if it is not already visible',
      })
      await stagehand.page.waitForLoadState('networkidle')

      const panelState = await stagehand.page.extract({
        instruction: 'Is there a chat panel, text input area, or AI assistant visible on the page?',
        schema: z.object({
          chatVisible: z.boolean(),
          inputVisible: z.boolean(),
        }),
      })

      await testInfo.attach('chat-state', {
        body: JSON.stringify(panelState, null, 2),
        contentType: 'application/json',
      })

      expect(panelState.chatVisible, 'Chat panel is not visible after navigation').toBe(true)
      expect(panelState.inputVisible, 'Chat input is not visible after navigation').toBe(true)

      // Send a test message
      await stagehand.page.act({
        action: 'type "Hello! Can you briefly tell me what you can help me with?" in the chat input',
      })
      await stagehand.page.act({
        action: 'send the chat message by pressing Enter or clicking the send button',
      })

      // Wait for a response (AI response may take a few seconds)
      await stagehand.page.waitForTimeout(8_000)

      const response = await stagehand.page.extract({
        instruction:
          'Did the AI assistant respond to the message? What did it say? Are there any error messages or loading indicators?',
        schema: z.object({
          assistantResponded: z.boolean(),
          responseText: z.string().optional(),
          isLoading: z.boolean(),
          hasErrors: z.boolean(),
          errorText: z.string().optional(),
          responseQuality: z.enum(['coherent', 'generic', 'error', 'empty']).optional(),
        }),
      })

      await testInfo.attach('chat-response', {
        body: JSON.stringify(response, null, 2),
        contentType: 'application/json',
      })

      expect(response.hasErrors, `Chat error: ${response.errorText}`).toBe(false)
      expect(
        response.assistantResponded,
        'AI assistant did not respond within 8 seconds',
      ).toBe(true)
    } finally {
      await stagehand.close()
    }
  })

  test('AI agent checks chat input handles Ctrl+Enter without newline', async ({}, testInfo) => {
    const stagehand = makeStagehand()
    await stagehand.init()

    try {
      await loginWithTestUser(stagehand.page)
      await stagehand.page.act({ action: 'open the AI chat panel if not already visible' })

      // Type a test message, then press Ctrl+Enter
      await stagehand.page.act({ action: 'click the chat text input area' })
      await stagehand.page.keyboard.type('test ctrl+enter')
      await stagehand.page.keyboard.press('Control+Enter')

      // Small pause to observe result
      await stagehand.page.waitForTimeout(1_000)

      const inputState = await stagehand.page.extract({
        instruction:
          'After pressing Ctrl+Enter in the chat input, did the message send (input cleared) or did a newline get inserted?',
        schema: z.object({
          messageSent: z.boolean(),
          newlineInserted: z.boolean(),
        }),
      })

      await testInfo.attach('ctrl-enter-behavior', {
        body: JSON.stringify(inputState, null, 2),
        contentType: 'application/json',
      })

      // Ctrl+Enter should send (not insert newline) — per existing chat spec
      expect(inputState.newlineInserted).toBe(false)
    } finally {
      await stagehand.close()
    }
  })
})
