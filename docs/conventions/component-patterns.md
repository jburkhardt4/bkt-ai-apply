# Component Patterns — BKT AI-Apply

---

## Pattern 1: Feature Slice Structure

Every feature in `src/features/[feature]/` follows:
```
features/applications/
  index.ts                  # public exports only
  ApplicationsPage.tsx      # thin page shell (no logic)
  components/
    KanbanBoard.tsx          # presentational
    ApplicationCard.tsx      # presentational
    StageTransitionModal.tsx # presentational
  hooks/
    useApplications.ts       # Supabase query + Realtime subscription
    useStageTransition.ts    # mutation + event write
  types.ts                   # feature-local types
```

## Pattern 2: Data Fetching Hook

```typescript
// features/applications/hooks/useApplications.ts
export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 1. Initial fetch
    supabase
      .from('applications')
      .select('*, jobs(*), companies(*)')
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error);
        else setApplications(data ?? []);
        setLoading(false);
      });

    // 2. Realtime subscription
    const channel = supabase
      .channel('applications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'applications',
      }, (payload) => {
        // Handle insert/update/delete
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { applications, loading, error };
}
```

## Pattern 3: Stage Transition Mutation

```typescript
// features/applications/hooks/useStageTransition.ts
export function useStageTransition() {
  const transition = async (
    applicationId: string,
    toStage: ApplicationStage,
    triggerType: TriggerType = 'manual'
  ) => {
    const { data: current } = await supabase
      .from('applications')
      .select('stage, user_id')
      .eq('id', applicationId)
      .single();

    if (!isValidTransition(current.stage, toStage)) {
      throw new Error(`Invalid transition: ${current.stage} → ${toStage}`);
    }

    // Atomic: update stage + insert event
    const { error } = await supabase.rpc('transition_application_stage', {
      p_application_id: applicationId,
      p_to_stage: toStage,
      p_trigger_type: triggerType,
      p_from_stage: current.stage,
    });

    if (error) throw error;
  };

  return { transition };
}
```

## Pattern 4: Presentational Component Contract

```typescript
// CORRECT — presentational, no data fetching
interface ApplicationCardProps {
  application: Application;
  onStageChange: (id: string, stage: ApplicationStage) => void;
}

export function ApplicationCard({ application, onStageChange }: ApplicationCardProps) {
  return <div>...</div>;
}

// WRONG — data fetching in component
export function ApplicationCard({ id }: { id: string }) {
  const { data } = useSupabaseQuery(...); // ❌ belongs in a hook
  return <div>...</div>;
}
```

## Pattern 5: Error Boundary Usage

```typescript
// Wrap feature pages, not individual components
<ErrorBoundary fallback={<FeatureError />}>
  <ApplicationsPage />
</ErrorBoundary>

// Background/async errors use structured logging
catch (error) {
  console.error('[useStageTransition] failed:', {
    applicationId,
    toStage,
    error: error instanceof Error ? error.message : error,
  });
  // Re-throw for UI to handle
  throw error;
}
```

---

## Anti-Patterns (do not replicate)

```typescript
// ❌ Direct Supabase call in component
function MyComponent() {
  const { data } = await supabase.from('jobs').select();
}

// ❌ Hardcoded model string
const response = await anthropic.messages.create({ model: 'claude-opus-4-6' });
// ✅ Use MODEL_ROUTES from ai-router.ts

// ❌ Stage update without event
await supabase.from('applications').update({ stage: 'rejected' });
// ✅ Use useStageTransition hook or transition_application_stage RPC

// ❌ No user_id filter
await supabase.from('jobs').select();
// ✅ RLS handles it, but explicit is safer in service role contexts:
await supabase.from('jobs').select().eq('user_id', userId);
```
