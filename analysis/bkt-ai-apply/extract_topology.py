#!/usr/bin/env python3
"""
Topology extractor for bkt-ai-apply (React 19 + Vite + TS SPA over Supabase Edge Functions).

Edges live in three places for this stack:
  1. ES-module imports  -> direct call graph (kind: call)
  2. supabase.functions.invoke('fn') -> frontend->EdgeFunction dispatch (kind: dispatch)
  3. .from('table') / .rpc('fn')      -> code<->storage join (kind: read|write|dispatch)
Entry points live in deployment config, not source: the SPA bootstrap (main.tsx),
each Edge Function's Deno.serve handler (index.ts), and the pg_cron-scheduled functions.

Re-runnable + auditable. Usage:  python extract_topology.py <repo_root> <out_dir>
"""
import json, os, re, sys

REPO = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
REPO = REPO.replace("\\", "/").rstrip("/")

# ---- Domains (from /modernize-assess) + curated key-file overrides ----------
DOMAINS = [
    "App Shell & Auth", "Job Discovery & Prospector", "Applications Pipeline & Events",
    "AI Routing & Scoring", "Conversational AI Assistant", "Documents (Resume/Cover Letter)",
    "Auto-Apply Workspace & Settings", "Auto-Submission Engine", "Gmail Integration",
    "Settings & Provider Status", "Data Schema & RLS Migrations",
]
KEYFILES = {
    "App Shell & Auth": ["src/main.tsx","src/App.tsx","src/components/AppShell.tsx","src/contexts/AuthContext.tsx","src/contexts/auth-context.ts","src/contexts/selected-application-context.tsx","src/pages/LoginPage.tsx","src/lib/supabase.ts","src/lib/utils.ts"],
    "Job Discovery & Prospector": ["supabase/functions/prospector-cron/index.ts","supabase/functions/format-jd/index.ts","supabase/functions/_shared/jd-format.ts","src/features/jobs/ProspectorDashboard.tsx","src/features/jobs/components/ProspectorSearchResults.tsx","src/features/jobs/services/prospectorGraduationService.ts","src/features/jobs/services/jdFormattingService.ts","src/features/jobs/hooks/useProspectorProfile.ts","src/features/applications/services/ingestionService.ts","src/pages/ProspectorPage.tsx","src/pages/IngestionPage.tsx"],
    "Applications Pipeline & Events": ["src/features/applications/services/applicationService.ts","src/features/applications/domain/stageRules.ts","src/features/applications/services/pipelineService.ts","src/features/applications/services/dashboardAnalyticsService.ts","src/features/applications/services/analyticsReportService.ts","src/features/applications/services/submittedCount.ts","src/features/applications/components/PipelineBoard.tsx","src/features/applications/components/AuditLogViewer.tsx","src/pages/PipelinePage.tsx","src/types/pipeline.ts"],
    "AI Routing & Scoring": ["src/lib/ai-router.ts","src/lib/edgeFunctionError.ts","supabase/functions/score-job-fit/index.ts","supabase/functions/generate-document/index.ts","supabase/functions/_shared/llm/factory.ts","supabase/functions/_shared/llm/anthropic.ts","supabase/functions/_shared/llm/openai.ts","supabase/functions/_shared/llm/google.ts","supabase/functions/_shared/llm/errors.ts","supabase/functions/_shared/llm/types.ts","src/features/applications/services/aiScoringService.ts","src/features/applications/services/aiCostMonitorService.ts"],
    "Conversational AI Assistant": ["src/features/ai-agent/components/AiAssistantPanel.tsx","src/features/ai-agent/components/ModelSelector.tsx","src/features/ai-agent/services/chatCompletionService.ts","src/features/ai-agent/services/chatConversationsService.ts","src/features/ai-agent/services/chatMemoryService.ts","src/features/ai-agent/hooks/useChatConversations.ts","supabase/functions/ai-chat/index.ts"],
    "Documents (Resume/Cover Letter)": ["src/features/applications/services/documentGenerationService.ts","src/features/applications/services/documentStorageService.ts","src/features/applications/data/masterProfile.ts","src/features/auto-apply/services/docWriterService.ts","src/features/auto-apply/services/docContentParser.ts","src/features/auto-apply/services/textSanitizer.ts","src/features/auto-apply/screens/DocBuilder.tsx","src/features/auto-apply/screens/DocsScreen.tsx"],
    "Auto-Apply Workspace & Settings": ["src/features/auto-apply/AutoApplyDashboard.tsx","src/features/auto-apply/services/autoApplyService.ts","src/features/auto-apply/services/settingsService.ts","src/features/auto-apply/components/AutoApplySettingsProvider.tsx","src/features/auto-apply/settings-context.ts","src/features/auto-apply/router.ts","src/features/auto-apply/routes.tsx","src/features/auto-apply/screens/PreferencesScreen.tsx","src/features/auto-apply/hooks/useAutoApplyData.ts"],
    "Auto-Submission Engine": ["supabase/functions/submission-worker/index.ts","supabase/functions/_shared/submission/resolveChannel.ts","supabase/functions/_shared/submission/atsAdapters.ts","supabase/functions/_shared/submission/browserAdapter.ts","supabase/functions/_shared/submission/candidate.ts","supabase/functions/_shared/submission/types.ts","supabase/functions/_shared/notify.ts","src/features/applications/services/submissionQueueService.ts","src/features/applications/services/submissionApprovalService.ts","src/features/applications/components/SubmissionGatePanel.tsx"],
    "Gmail Integration": ["supabase/functions/gmail-sync/index.ts","supabase/functions/gmail-sync/logic.ts","supabase/functions/gmail-sync/gmail.ts","supabase/functions/gmail-send/index.ts","supabase/functions/gmail-send/mime.ts","supabase/functions/_shared/gmail-auth.ts","src/features/auto-apply/services/emailSendService.ts","src/features/auto-apply/screens/InboxScreen.tsx"],
    "Settings & Provider Status": ["src/features/settings/components/IntegrationsPanel.tsx","src/features/settings/components/ProviderStatusCard.tsx","src/features/settings/services/providerStatusService.ts","src/features/settings/hooks/useProviderStatus.ts","supabase/functions/provider-status/index.ts","src/pages/SettingsPage.tsx"],
}
OVERRIDE = {f: d for d, fs in KEYFILES.items() for f in fs}

def domain_for(rel):
    if rel in OVERRIDE:
        return OVERRIDE[rel]
    if rel.startswith("supabase/migrations/") or rel == "src/types/db.types.ts":
        return "Data Schema & RLS Migrations"
    if rel.startswith("src/features/jobs/"): return "Job Discovery & Prospector"
    if rel.startswith("src/features/applications/"): return "Applications Pipeline & Events"
    if rel.startswith("src/features/auto-apply/"): return "Auto-Apply Workspace & Settings"
    if rel.startswith("src/features/ai-agent/"): return "Conversational AI Assistant"
    if rel.startswith("src/features/settings/"): return "Settings & Provider Status"
    if rel.startswith("src/types/"): return "Data Schema & RLS Migrations"
    if rel.startswith("supabase/functions/prospector-cron/") or rel.startswith("supabase/functions/format-jd/") or "/_shared/jd-format" in rel:
        return "Job Discovery & Prospector"
    if rel.startswith("supabase/functions/gmail-sync/") or rel.startswith("supabase/functions/gmail-send/") or "/_shared/gmail-auth" in rel:
        return "Gmail Integration"
    if rel.startswith("supabase/functions/submission-worker/") or "/_shared/submission/" in rel or "/_shared/notify" in rel:
        return "Auto-Submission Engine"
    if rel.startswith("supabase/functions/ai-chat/"): return "Conversational AI Assistant"
    if rel.startswith("supabase/functions/score-job-fit/") or rel.startswith("supabase/functions/generate-document/") or "/_shared/llm/" in rel:
        return "AI Routing & Scoring"
    if rel.startswith("supabase/functions/provider-status/"): return "Settings & Provider Status"
    return "App Shell & Auth"  # _shared/http, _shared/auth, components, lib, pages, contexts

# ---- Collect source modules (exclude tests, e2e, generated noise) -----------
SRC_ROOTS = ["src", "supabase/functions"]
TEST_RE = re.compile(r"\.(test|spec)\.(ts|tsx)$")
modules = {}   # rel -> {loc, language}
for root in SRC_ROOTS:
    base = os.path.join(REPO, root)
    for dp, _, fns in os.walk(base):
        for fn in fns:
            if not fn.endswith((".ts", ".tsx")): continue
            if TEST_RE.search(fn): continue
            full = os.path.join(dp, fn).replace("\\", "/")
            rel = full[len(REPO) + 1:]
            try:
                loc = sum(1 for _ in open(full, encoding="utf-8", errors="ignore"))
            except OSError:
                loc = 0
            modules[rel] = {"loc": loc, "language": "tsx" if fn.endswith(".tsx") else "ts"}

# ---- Datastores from migrations + referenced tables -------------------------
tables = set()
mig_dir = os.path.join(REPO, "supabase/migrations")
ddl_re = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", re.I)
if os.path.isdir(mig_dir):
    for fn in os.listdir(mig_dir):
        if fn.endswith(".sql"):
            txt = open(os.path.join(mig_dir, fn), encoding="utf-8", errors="ignore").read()
            for m in ddl_re.finditer(txt):
                tables.add(m.group(1))

# ---- Parse each module: imports, invoke, from, rpc --------------------------
IMP_RE = re.compile(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""")
INVOKE_RE = re.compile(r"functions\.invoke\(\s*['\"]([A-Za-z0-9_-]+)['\"]")
FROM_RE = re.compile(r"\.from\(\s*['\"]([A-Za-z0-9_]+)['\"]\s*\)")
RPC_RE = re.compile(r"\.rpc\(\s*['\"]([A-Za-z0-9_]+)['\"]")
WRITE_RE = re.compile(r"\.(insert|update|upsert|delete)\b")

def resolve(importer, spec):
    if spec.startswith("@/"):
        cand = "src/" + spec[2:]
    elif spec.startswith("."):
        cand = os.path.normpath(os.path.join(os.path.dirname(importer), spec)).replace("\\", "/")
    else:
        return None  # external (react, npm:, https:, @supabase/...)
    for ext in ("", ".ts", ".tsx", "/index.ts", "/index.tsx"):
        if cand + ext in modules:
            return cand + ext
    return None

edges = set()          # (source, target, kind)
rpc_targets = set()
ref_tables = set()
file_text = {}
for rel in modules:
    txt = open(os.path.join(REPO, rel), encoding="utf-8", errors="ignore").read()
    file_text[rel] = txt
    for m in IMP_RE.finditer(txt):
        tgt = resolve(rel, m.group(1))
        if tgt and tgt != rel:
            edges.add((rel, tgt, "call"))
    for m in INVOKE_RE.finditer(txt):
        tgt = "supabase/functions/%s/index.ts" % m.group(1)
        if tgt in modules:
            edges.add((rel, tgt, "dispatch"))
    for m in FROM_RE.finditer(txt):
        tbl = m.group(1)
        ref_tables.add(tbl)
        window = txt[m.end():m.end() + 200]
        kind = "write" if WRITE_RE.search(window) else "read"
        edges.add((rel, "ds:" + tbl, kind))
    for m in RPC_RE.finditer(txt):
        rpc_targets.add(m.group(1))
        edges.add((rel, "ds:rpc:" + m.group(1), "dispatch"))

tables |= ref_tables

# ---- Entry points -----------------------------------------------------------
entry = []
if "src/main.tsx" in modules: entry.append("src/main.tsx")
for rel in modules:
    if rel.startswith("src/pages/") and rel.endswith(".tsx"):
        entry.append(rel)
    if re.match(r"supabase/functions/[a-z0-9-]+/index\.ts$", rel):
        entry.append(rel)
entry = sorted(set(entry))
scheduled = [e for e in entry if "/prospector-cron/" in e or "/gmail-sync/" in e]

# ---- Dead-end candidates (no inbound call/dispatch edge, not entry) ---------
inbound = {}
for s, t, k in edges:
    if k in ("call", "dispatch"):
        inbound[t] = inbound.get(t, 0) + 1
dispatch_targets = {t for s, t, k in edges if k == "dispatch"}
dead = []
for rel in modules:
    if rel in entry: continue
    if inbound.get(rel, 0) > 0: continue
    if rel in dispatch_targets: continue
    # suppress: edge-fn index.ts are pg_cron/HTTP targets even if no source invoke found
    if re.match(r"supabase/functions/[a-z0-9-]+/index\.ts$", rel): continue
    dead.append(rel)
dead = sorted(dead)

# ---- Build tree -------------------------------------------------------------
def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
dom_children = {d: [] for d in DOMAINS}
for rel, meta in modules.items():
    d = domain_for(rel)
    dom_children[d].append({"id": rel, "name": rel.split("/")[-1], "kind": "module",
                            "language": meta["language"], "loc": meta["loc"], "file": rel})
for d in dom_children:
    dom_children[d].sort(key=lambda n: -n["loc"])

data_children = [{"id": "ds:" + t, "name": t, "kind": "datastore"} for t in sorted(tables)]
data_children += [{"id": "ds:rpc:" + r, "name": r + "()", "kind": "datastore"} for r in sorted(rpc_targets)]

children = []
for d in DOMAINS:
    if d == "Data Schema & RLS Migrations":
        kids = dom_children[d] + data_children
    else:
        kids = dom_children[d]
    if kids:
        children.append({"id": "dom:" + slug(d), "name": d, "kind": "domain", "children": kids})

# valid leaf ids for edge/flow validation
leaf_ids = set(modules) | {c["id"] for c in data_children}
edge_list = [{"source": s, "target": t, "kind": k} for (s, t, k) in sorted(edges)
             if s in leaf_ids and t in leaf_ids]

# ---- Observations -----------------------------------------------------------
writers = {}
for s, t, k in edges:
    if k == "write" and t.startswith("ds:"):
        writers.setdefault(t, set()).add(s)
top_written = sorted(writers.items(), key=lambda kv: -len(kv[1]))[:3]
fanin = {}
for s, t, k in edges:
    if k == "call":
        fanin[t] = fanin.get(t, 0) + 1
top_fanin = sorted(fanin.items(), key=lambda kv: -kv[1])[:3]

observations = [
    "Entry points are deployment-defined, not in source: the SPA bootstrap (src/main.tsx) plus each Edge Function's Deno.serve handler. prospector-cron and gmail-sync are additionally invoked by pg_cron / Supabase schedules — an edge the static parser cannot see, so they are NOT marked dead.",
    "Highest call-graph fan-in (shared single points of failure): " + ", ".join("%s (%d importers)" % (t.split('/')[-1], c) for t, c in top_fanin) + ". src/lib/supabase.ts is the mandated single DB client (BR-004), so a change there touches the whole frontend.",
    "Most-written data stores (many-writer hotspots): " + ", ".join("%s (%d writer modules)" % (t[3:], len(w)) for t, w in top_written) + ".",
    "application_events is append-only by design (event sourcing, BR-002/BR-003); writes funnel through the transition_stage RPC rather than direct table writes, which is why it shows as a dispatch target, not a multi-writer table.",
    "Confirmed dead code (no runtime inbound edge; imported only by their own tests): calendarIntelligenceService.ts and gmailIntelligenceService.ts (client-side intelligence superseded by server-side gmail-sync) and a second, unwired chat stack (ChatAssistantPanel.tsx + chatAssistantService.ts). Safe-delete candidates.",
    "The Auto-Submission Engine and Gmail Integration are the only domains with real-world side effects (sending applications / sending mail); both depend on Applications Pipeline & Events and are the right blast-radius boundary for the security-hardening phase.",
    "createServiceClient() is copy-pasted across 4 Edge Functions and _shared/http.ts CORS is duplicated in prospector-cron — extraction candidates that would also remove drift risk.",
]

# ---- Persona flows ----------------------------------------------------------
raw_flows = [
 {"name": "A job seeker's roles are discovered automatically",
  "persona": "Job seeker (operator)",
  "description": "Twice a day the system searches for new jobs matching the seeker's profile and files them for review.",
  "steps": [
    {"label": "Scheduler wakes the prospector (pg_cron, twice daily)", "nodes": ["supabase/functions/prospector-cron/index.ts"]},
    {"label": "Read active search profiles, query SerpAPI, de-duplicate and store new postings", "nodes": ["supabase/functions/prospector-cron/index.ts", "ds:prospecting_profiles", "ds:jobs", "ds:prospecting_runs"]},
    {"label": "Format each job description for readability", "nodes": ["supabase/functions/format-jd/index.ts", "ds:jobs"]},
    {"label": "Score job fit and graduate strong matches into the pipeline", "nodes": ["src/features/jobs/services/prospectorGraduationService.ts", "ds:ai_scores", "ds:applications"]},
    {"label": "Seeker sees new matches on the Prospector dashboard", "nodes": ["src/features/jobs/ProspectorDashboard.tsx", "src/features/jobs/components/ProspectorSearchResults.tsx"]},
  ]},
 {"name": "A job seeker approves an application and it is auto-submitted",
  "persona": "Job seeker (operator)",
  "description": "The seeker approves a prepared application; a guarded worker submits it to the employer's ATS.",
  "steps": [
    {"label": "Seeker reviews the prepared packet at the submission gate", "nodes": ["src/features/applications/components/SubmissionGatePanel.tsx"]},
    {"label": "Approval is recorded as an immutable event and queued", "nodes": ["src/features/applications/services/submissionApprovalService.ts", "ds:rpc:transition_stage", "ds:application_events", "ds:application_queue"]},
    {"label": "The kill-default worker drains approved rows (dry-run unless SUBMISSION_LIVE)", "nodes": ["supabase/functions/submission-worker/index.ts", "ds:application_queue"]},
    {"label": "Resolve channel and submit via ATS API (or browser fallback)", "nodes": ["supabase/functions/_shared/submission/resolveChannel.ts", "supabase/functions/_shared/submission/atsAdapters.ts"]},
    {"label": "Notify the seeker of the outcome", "nodes": ["supabase/functions/_shared/notify.ts", "ds:notifications"]},
  ]},
 {"name": "An incoming email moves an application forward on its own",
  "persona": "Job seeker (passive) / System",
  "description": "A recruiter email is ingested, classified, and (if confident) advances the application's stage automatically.",
  "steps": [
    {"label": "Scheduled sync pulls new Gmail messages", "nodes": ["supabase/functions/gmail-sync/index.ts", "ds:gmail_sync_state", "ds:emails"]},
    {"label": "Classify the email with Gemini (keyword fallback)", "nodes": ["supabase/functions/gmail-sync/logic.ts"]},
    {"label": "If confidence >= 0.70 and the transition is legal, advance the stage", "nodes": ["supabase/functions/gmail-sync/logic.ts", "ds:rpc:transition_stage", "ds:applications", "ds:application_events"]},
    {"label": "Seeker sees the updated pipeline (Realtime)", "nodes": ["src/features/applications/components/PipelineBoard.tsx"]},
  ]},
 {"name": "A job seeker generates a tailored resume and cover letter",
  "persona": "Job seeker (operator)",
  "description": "From a target job, the seeker generates application documents drafted by the routed LLM.",
  "steps": [
    {"label": "Seeker opens the document builder for a job", "nodes": ["src/features/auto-apply/screens/DocBuilder.tsx"]},
    {"label": "Build the request from the master profile + job", "nodes": ["src/features/applications/services/documentGenerationService.ts", "src/features/applications/data/masterProfile.ts"]},
    {"label": "Route to the chosen model and draft the document", "nodes": ["supabase/functions/generate-document/index.ts", "supabase/functions/_shared/llm/factory.ts"]},
    {"label": "Sanitize and store the generated document", "nodes": ["src/features/auto-apply/services/textSanitizer.ts", "src/features/applications/services/documentStorageService.ts", "ds:documents", "ds:application_materials"]},
  ]},
]
# keep only steps whose nodes exist; warn on drops
flows = []
for f in raw_flows:
    steps = []
    for st in f["steps"]:
        present = [n for n in st["nodes"] if n in leaf_ids]
        missing = [n for n in st["nodes"] if n not in leaf_ids]
        if missing:
            print("  [flow warn] %s -> dropped missing nodes: %s" % (f["name"], missing), file=sys.stderr)
        if present:
            steps.append({"label": st["label"], "nodes": present})
    flows.append({**f, "steps": steps})

topology = {
    "system": "BKT AI-Apply",
    "root": {"id": "sys", "name": "BKT AI-Apply", "kind": "system", "children": children},
    "edges": edge_list,
    "entryPoints": entry,
    "deadEnds": dead,
    "observations": observations,
    "flows": flows,
}

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "topology.json"), "w", encoding="utf-8") as fh:
    json.dump(topology, fh, indent=2)

# ---- Human summary ----------------------------------------------------------
print("=== BKT AI-Apply topology ===")
print("modules: %d   datastores: %d (%d tables + %d rpcs)   edges: %d"
      % (len(modules), len(data_children), len(tables), len(rpc_targets), len(edge_list)))
kc = {}
for e in edge_list: kc[e["kind"]] = kc.get(e["kind"], 0) + 1
print("edge kinds:", kc)
print("entry points: %d  (scheduled: %s)" % (len(entry), ", ".join(s.split('/')[-2] for s in scheduled)))
print("dead-end candidates: %d -> %s" % (len(dead), [d.split('/')[-1] for d in dead]))
print("\nmodules per domain:")
for c in children:
    mods = [k for k in c["children"] if k["kind"] == "module"]
    print("  %-34s %3d modules  %6d LOC" % (c["name"], len(mods), sum(m["loc"] for m in mods)))
print("\nflows: %d" % len(flows))
for f in flows:
    print("  - [%s] %s (%d steps)" % (f["persona"], f["name"], len(f["steps"])))
print("\nobservations:")
for o in observations:
    print("  * " + o[:140] + ("..." if len(o) > 140 else ""))
print("\nwrote %s/topology.json" % OUT)
