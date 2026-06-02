# AI Model Routing — BKT AI-Apply

---

## Routing Matrix

| Task Type | Primary Model | Fallback | Rationale |
|-----------|--------------|----------|-----------|
| Resume rewriting | `gpt-5` | `claude-opus-4` | GPT: fastest ATS keyword matching, aggressive action verbs |
| Cover letter writing | `claude-opus-4` | `gpt-5` | Claude: best prose quality, nuanced tone |
| Job market research | `gemini-2.5-pro` | `gpt-5` | Gemini: live web grounding, real-time salary data |
| Company/interviewer research | `gemini-2.5-pro` | `gpt-5` | Same — web-native |
| Interview prep (Q&A dialogue) | `claude-opus-4` | `gemini-2.5-pro` | Claude: best multi-turn reasoning |
| Match scoring | `claude-opus-4` | `gpt-5` | Claude: multi-factor weighted reasoning |
| Email classification | `gemini-2.5-flash` | `claude-haiku` | Flash: high throughput, low cost, Google API proximity |
| Browser form automation | `gpt-5` | `claude-sonnet-4` | GPT: precise rule-following, structured form output |
| General Q&A / navigation | `claude-sonnet-4` | `gpt-5` | Claude: best instruction-following, OSWorld benchmark |
| Intent classification (router) | `gemini-2.5-flash` | `claude-haiku` | Cheapest capable model for routing overhead |

---

## Cost Tiers

| Tier | Models | When to use |
|------|--------|-------------|
| Heavy | `claude-opus-4`, `gpt-5` | User-initiated generation (resume, cover letter, match score) |
| Mid | `claude-sonnet-4`, `gemini-2.5-pro` | Research, browser orchestration, general chat |
| Light | `gemini-2.5-flash`, `claude-haiku` | Background classification, routing, email parsing |

**Rule:** Background automation (email parsing, ghosted detection, status updates) always hits Light tier.

---

## Auto-Router Implementation

```typescript
// src/lib/ai-router.ts

export type TaskType =
  | 'resume_rewrite'
  | 'cover_letter'
  | 'research'
  | 'interview_prep'
  | 'email_classify'
  | 'match_score'
  | 'browser_action'
  | 'general_qa'
  | 'intent_classify';

export type ModelConfig = {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
};

export const MODEL_ROUTES: Record<TaskType, ModelConfig> = {
  resume_rewrite:   { provider: 'openai',     model: 'gpt-5'               },
  cover_letter:     { provider: 'anthropic',  model: 'claude-opus-4-6'     },
  research:         { provider: 'google',     model: 'gemini-2.5-pro'      },
  interview_prep:   { provider: 'anthropic',  model: 'claude-opus-4-6'     },
  email_classify:   { provider: 'google',     model: 'gemini-2.5-flash'    },
  match_score:      { provider: 'anthropic',  model: 'claude-opus-4-6'     },
  browser_action:   { provider: 'openai',     model: 'gpt-5'               },
  general_qa:       { provider: 'anthropic',  model: 'claude-sonnet-4-6'   },
  intent_classify:  { provider: 'google',     model: 'gemini-2.5-flash'    },
};

export async function classifyIntent(prompt: string): Promise<TaskType> {
  // Call gemini-2.5-flash with a system prompt that returns one TaskType enum value
  // ~50ms, ~$0.0001 per call
  // System prompt: "Classify this prompt into exactly one of: [TaskType values]. Return only the enum value."
}

export async function routeToModel(taskType: TaskType, prompt: string): Promise<string> {
  const config = MODEL_ROUTES[taskType];
  // Dispatch to correct provider SDK
}
```

---

## Model String Reference

```typescript
// Anthropic
'claude-opus-4-6'       // Heavy — writing, reasoning, scoring
'claude-sonnet-4-6'     // Mid — general assistant, navigation
'claude-haiku-4-5'      // Light — classification, routing

// OpenAI
'gpt-5'                 // Heavy — resume, ATS, browser forms

// Google
'gemini-2.5-pro'        // Mid — research, web-grounded tasks
'gemini-2.5-flash'      // Light — email parsing, intent classification
```

---

## Routing Decision Heuristic (for auto-router system prompt)

```
resume_rewrite    → keywords: resume, CV, rewrite, tailor, ATS, job description match
cover_letter      → keywords: cover letter, application letter, writing for [company]
research          → keywords: research, company, interviewer, market, salary, what is, who is
interview_prep    → keywords: interview, question, practice, prep, STAR, behavioral
email_classify    → triggered programmatically only (not user-facing)
match_score       → triggered programmatically only
browser_action    → triggered programmatically only
general_qa        → fallback for anything not matching above
intent_classify   → triggered programmatically only (the router itself)
```
