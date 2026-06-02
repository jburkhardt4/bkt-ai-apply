# ADR-004: Stagehand for Browser Automation

**Status:** Accepted  
**Date:** 2025-06

## Context
Auto-apply requires filling and submitting forms on job portals (LinkedIn, Greenhouse, Lever, etc.)
Portals change DOM structure frequently; CSS-selector-based scrapers break constantly.

## Decision
Use Stagehand (TypeScript-native browser automation with LLM reasoning).
LLM interprets page structure visually — survives DOM changes.
Primary reasoning model: GPT-5. Infrastructure: Browserbase (managed Chromium).

## Consequences
- TypeScript-native — fits existing Vite/TS stack
- LLM call cost per form submission (~$0.05–$0.15 per application)
- GPT-5 handles form-filling; Stagehand handles browser control
- Requires Browserbase account for production (anti-detection proxies)
