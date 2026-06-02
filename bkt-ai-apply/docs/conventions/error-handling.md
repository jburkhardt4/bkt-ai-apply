# Error Handling — BKT AI-Apply

---

## Error Layers

| Layer | Strategy | Tool |
|-------|----------|------|
| UI / component | ErrorBoundary | React ErrorBoundary per feature page |
| Async / hooks | try/catch + state | `error` state in hooks, surfaced to UI |
| Background / Edge Functions | structured logging + retry | Supabase logs + dead letter |
| AI model calls | retry with fallback model | ai-router.ts retry logic |

---

## Supabase Error Handling Pattern

```typescript
const { data, error } = await supabase.from('applications').select();

if (error) {
  // Log with context
  console.error('[feature:hook] supabase error:', {
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
  // Surface to UI via state, not throw (in hooks)
  setError(new Error(error.message));
  return;
}
```

---

## AI Model Retry Pattern

```typescript
// ai-router.ts retry with fallback
async function callWithFallback(
  taskType: TaskType,
  prompt: string,
  retries = 1
): Promise<string> {
  const primary = MODEL_ROUTES[taskType];
  try {
    return await callModel(primary, prompt);
  } catch (err) {
    if (retries > 0) {
      const fallback = FALLBACK_ROUTES[taskType];
      console.warn(`[ai-router] ${primary.model} failed, falling back to ${fallback.model}`);
      return await callModel(fallback, prompt);
    }
    throw err;
  }
}
```

---

## Edge Function Error Response Shape

```typescript
// All Edge Functions return this shape on error
{
  error: {
    code: string,      // e.g. 'INVALID_SIGNATURE' | 'VALIDATION_FAILED'
    message: string,
    request_id: string
  }
}
```

---

## What Goes Where

- **User-visible errors**: Toast notifications for transient failures, inline error states for data failures
- **Auto-apply failures**: Logged to `application_events` with `event_type: 'auto_apply_failed'` + metadata
- **Email parse failures**: Logged to `email_events` with `classified_as: 'other'` + raw_snippet for debug
- **Critical security errors**: Return 401/403 with no body detail — never expose internal error messages to webhooks
