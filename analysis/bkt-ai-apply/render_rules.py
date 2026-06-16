#!/usr/bin/env python3
"""Render BUSINESS_RULES.md + DATA_OBJECTS.md from the extract-rules workflow JSON.
Dedups across the 3 lenses, assigns RULE-NNN ids, groups by category. Auditable + re-runnable.
Usage: python render_rules.py <workflow_output.json> <out_dir>
"""
import json, re, sys, html
from collections import Counter

SRC = sys.argv[1]
OUT = sys.argv[2]
d = json.load(open(SRC, encoding="utf-8"))
r = d.get("result", d)
raw = r.get("allRules") or (r.get("calculations", []) + r.get("validations", []) + r.get("lifecycle", []))
entities = r.get("entities", [])

def u(x):
    if isinstance(x, str): return html.unescape(x)
    if isinstance(x, list): return [u(i) for i in x]
    return x

def norm(s): return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

PRI = {"P0": 0, "P1": 1, "P2": 2}
CONF = {"High": 0, "Medium": 1, "Low": 2}
CAT_ORDER = ["Calculation", "Validation", "Lifecycle", "Policy"]

# ---- Dedup helpers -----------------------------------------------------------
def merge_into(a, rule):
    """Fold `rule` into existing `a` (a wins on identity, unions detail)."""
    if PRI.get(rule.get("priority"), 1) < PRI.get(a.get("priority"), 1):
        a["priority"] = rule["priority"]
    if CONF.get(rule.get("confidence"), 0) > CONF.get(a.get("confidence"), 0):
        a["confidence"] = rule["confidence"]; a["confidenceWhy"] = rule.get("confidenceWhy", a.get("confidenceWhy"))
        if rule.get("smeQuestion"): a["smeQuestion"] = rule["smeQuestion"]
    a["edgeCases"] = list(dict.fromkeys((a.get("edgeCases") or []) + (rule.get("edgeCases") or [])))
    a["andThen"] = list(dict.fromkeys((a.get("andThen") or []) + (rule.get("andThen") or [])))
    if rule.get("suspectedDefect") and not a.get("suspectedDefect"):
        a["suspectedDefect"] = rule["suspectedDefect"]
    brs = set()
    for x in (a.get("brRef"), rule.get("brRef")):
        if x: brs |= {b.strip() for b in re.split(r"[,/]", x) if b.strip()}
    if brs: a["brRef"] = ", ".join(sorted(brs, key=lambda s: (len(s), s)))
    if len(rule.get("then", "")) > len(a.get("then", "")):
        a["then"] = rule["then"]

def src_key(rule):
    """(file, first-line, category) of the primary source — catches cross-lens dupes."""
    s = (rule.get("source") or "").split(";")[0].split(",")[0].strip()
    m = re.match(r"(.+?):(\d+)", s)
    f, ln = (m.group(1), m.group(2)) if m else (s, "")
    return (f.replace("\\", "/"), ln, rule.get("category"))

# ---- Pass 1: merge identical normalized names --------------------------------
merged = {}
order = []
for rule in raw:
    rule = {k: u(v) for k, v in rule.items()}
    key = norm(rule.get("name"))
    if key in merged:
        merge_into(merged[key], rule)
    else:
        merged[key] = rule
        order.append(key)
pass1 = [merged[k] for k in order]

# ---- Pass 2: merge rules sharing the same primary source line + category -----
by_src = {}
order2 = []
for rule in pass1:
    k = src_key(rule)
    if k[1] and k in by_src:           # only merge when a real line number exists
        merge_into(by_src[k], rule)
    else:
        by_src[k] = rule
        order2.append(k)
rules = [by_src[k] for k in order2]
# sort by category order, then priority, then name
rules.sort(key=lambda x: (CAT_ORDER.index(x["category"]) if x["category"] in CAT_ORDER else 9,
                          PRI.get(x.get("priority"), 1), norm(x.get("name"))))
for i, rule in enumerate(rules, 1):
    rule["id"] = "RULE-%03d" % i

# ---- Render BUSINESS_RULES.md -----------------------------------------------
L = []
L.append("# Business Rules — BKT AI-Apply (extracted specification)\n")
L.append("| | |")
L.append("|---|---|")
L.append("| **System** | `bkt-ai-apply` |")
L.append("| **Generated** | 2026-06-15 |")
L.append("| **Method** | 3 parallel `business-rules-extractor` lenses (calculation / validation / lifecycle) + DTO catalog; %d raw rules deduped to %d distinct |" % (len(raw), len(rules)))
L.append("| **Linkage** | `brRef` ties each card to the canonical `docs/domain/business-rules.md` BR-NNN ids where one exists |")
cat_c = Counter(x["category"] for x in rules)
pri_c = Counter(x["priority"] for x in rules)
conf_c = Counter(x["confidence"] for x in rules)
L.append("| **Breakdown** | %s · %s · %s |" % (
    " / ".join("%d %s" % (cat_c[c], c) for c in CAT_ORDER if cat_c[c]),
    " / ".join("%d %s" % (pri_c[p], p) for p in ("P0", "P1", "P2") if pri_c[p]),
    " / ".join("%d %s-conf" % (conf_c[c], c) for c in ("High", "Medium", "Low") if conf_c[c])))
L.append("")
L.append("> **P0** rules (money / regulatory / data-integrity) feed the Modernization Brief's behavior contract — they MUST be proven equivalent before any phase ships. **Suspected defects** are flagged inline; the preserve-vs-fix decision is made during transform, not here.\n")

# Summary table
L.append("## Summary\n")
L.append("| ID | Rule | Cat | Pri | Source | Conf | BR |")
L.append("|---|---|---|---|---|---|---|")
for x in rules:
    src = (x.get("source") or "").split(",")[0]
    flag = " ⚠️" if x.get("suspectedDefect") else ""
    L.append("| %s | %s%s | %s | %s | `%s` | %s | %s |" % (
        x["id"], x["name"].replace("|", "\\|"), flag, x["category"][:4], x["priority"],
        src.replace("|", "\\|"), x["confidence"][0], (x.get("brRef") or "").replace("|", "\\|")))
L.append("")

def card(x):
    c = []
    c.append("### %s: %s" % (x["id"], x["name"]))
    c.append("**Category:** %s" % x["category"])
    c.append("**Priority:** %s%s" % (x["priority"], "  ⚠️ *suspected defect — see below*" if x.get("suspectedDefect") else ""))
    src = "**Source:** `%s`" % x.get("source", "")
    if x.get("brRef"): src += "  ·  **BR:** %s" % x["brRef"]
    c.append(src)
    c.append("**Plain English:** %s" % x.get("plainEnglish", ""))
    c.append("**Specification:**")
    c.append("```gherkin")
    c.append("Given %s" % x.get("given", ""))
    c.append("When  %s" % x.get("when", ""))
    c.append("Then  %s" % x.get("then", ""))
    for a in (x.get("andThen") or []):
        c.append("And   %s" % a)
    c.append("```")
    c.append("**Parameters:** %s" % (x.get("parameters") or "—"))
    if x.get("edgeCases"):
        c.append("**Edge cases handled:**")
        for e in x["edgeCases"]:
            c.append("- %s" % e)
    if x.get("suspectedDefect"):
        c.append("**⚠️ Suspected defect:** %s" % x["suspectedDefect"])
    conf = "**Confidence:** %s — %s" % (x["confidence"], x.get("confidenceWhy", ""))
    c.append(conf)
    if x.get("smeQuestion"):
        c.append("**SME question:** %s" % x["smeQuestion"])
    return "\n".join(c)

for cat in CAT_ORDER:
    grp = [x for x in rules if x["category"] == cat]
    if not grp: continue
    L.append("\n---\n\n## %s rules (%d)\n" % (cat, len(grp)))
    for x in grp:
        L.append(card(x))
        L.append("")

# SME section
sme = [x for x in rules if x["confidence"] in ("Medium", "Low")]
defects = [x for x in rules if x.get("suspectedDefect")]
L.append("\n---\n\n## Rules requiring SME confirmation\n")
if sme:
    for x in sme:
        q = x.get("smeQuestion") or "Confirm the rule as stated is correct and current."
        L.append("- **%s (%s, %s)** — %s" % (x["id"], x["confidence"], x["name"], q))
else:
    L.append("_No Medium/Low-confidence rules: every extracted rule was High-confidence (constants and branch logic explicit in code)._")
L.append("")
L.append("### P0 rules carrying a suspected defect (preserve-vs-fix decision required in the Brief)\n")
p0def = [x for x in defects if x["priority"] == "P0"]
if p0def:
    for x in p0def:
        L.append("- **%s — %s**: %s" % (x["id"], x["name"], x["suspectedDefect"]))
else:
    L.append("_None._")
L.append("")

open(OUT + "/BUSINESS_RULES.md", "w", encoding="utf-8").write("\n".join(L))

# ---- Render DATA_OBJECTS.md -------------------------------------------------
E = []
E.append("# Data Objects — BKT AI-Apply\n")
E.append("Core entities / DTOs / enums the business rules operate on. Source-cited; field lists are the business-relevant subset, not every column.\n")
E.append("| Entity | Kind | Source | Fields | Consumed by |")
E.append("|---|---|---|---|---|")
for e in sorted(entities, key=lambda z: (z.get("kind", ""), z.get("name", ""))):
    e = {k: u(v) for k, v in e.items()}
    E.append("| `%s` | %s | `%s` | %d | %s |" % (
        e.get("name", ""), e.get("kind", ""), (e.get("source", "") or "").split(",")[0],
        len(e.get("fields", [])), (e.get("consumedByRules", "") or "").replace("|", "\\|")))
E.append("")
for e in sorted(entities, key=lambda z: (CAT_ORDER.index("Calculation") if False else 0, z.get("name", ""))):
    e = {k: u(v) for k, v in e.items()}
    E.append("\n### `%s`  *(%s)*" % (e.get("name", ""), e.get("kind", "")))
    E.append("**Source:** `%s`" % e.get("source", ""))
    if e.get("consumedByRules"): E.append("**Consumed/produced by:** %s" % e["consumedByRules"])
    if e.get("fields"):
        E.append("")
        E.append("| Field | Type | Note |")
        E.append("|---|---|---|")
        for fl in e["fields"]:
            E.append("| `%s` | `%s` | %s |" % (
                fl.get("name", ""), (fl.get("type", "") or "").replace("|", "\\|"),
                (fl.get("note", "") or "").replace("|", "\\|")))
    E.append("")
open(OUT + "/DATA_OBJECTS.md", "w", encoding="utf-8").write("\n".join(E))

# ---- Console summary --------------------------------------------------------
print("BUSINESS_RULES.md: %d distinct rules (from %d raw)" % (len(rules), len(raw)))
print("  by category:", dict(cat_c))
print("  by priority:", dict(pri_c))
print("  by confidence:", dict(conf_c))
print("  suspected defects:", len(defects), "| P0 defects:", len(p0def), "| SME-review:", len(sme))
print("DATA_OBJECTS.md: %d entities" % len(entities))
