# ADR-002: Multi-Model AI Routing by Task Type

**Status:** Accepted  
**Date:** 2025-06

## Context
No single AI model is best for all tasks in this pipeline.
GPT-5 leads on ATS resume writing, Claude leads on prose/reasoning,
Gemini leads on web-grounded research and Gmail integration.

## Decision
Implement a task-type router (`src/lib/ai-router.ts`) that assigns the optimal model per task.
Intent classification uses Gemini Flash (cheapest capable model) to route user prompts.

## Consequences
- Three API keys required (Anthropic, OpenAI, Google)
- Cost optimization: heavy models only for user-triggered generation
- Single `MODEL_ROUTES` config — model changes in one place only
- Fallback model per task type for resilience
