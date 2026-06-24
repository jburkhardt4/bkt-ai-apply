#!/usr/bin/env node
// sync-claude-kit.mjs — vendor a curated set of BKT AI-Apply skills + agents into
// a target repo's .claude/, tracked in that repo's skills-lock.json (hash-verified).
//
// The hub (bkt-ai-apply) is the canonical source. Targets receive FLAT COPIES
// (not symlinks) so they stay deploy-safe on independent Vercel/Replit git roots
// (Decision 5). A target's skills-lock.json records sourceType:"local", the hub
// SHA, and a sha256 per vendored file; `--check` recomputes those hashes and
// fails on drift — i.e. someone hand-edited a vendored file. Never do that: edit
// in the hub and re-sync. Knowledge flows one way, hub → spoke.
//
// Usage:
//   node scripts/sync-claude-kit.mjs --target ../bktAdvisory --profile full
//   node scripts/sync-claude-kit.mjs --target ../bktAdvisory --check
//   node scripts/sync-claude-kit.mjs --target ../estimator   --profile minimal --dry-run
//
// Source layout (hub):  .agents/skills/<name>/**   ·  .claude/agents/<name>.md
// Target layout:        .claude/skills/<name>/**   ·  .claude/agents/<name>.md  ·  skills-lock.json

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HUB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---- Profiles -------------------------------------------------------------
// The Ui-Ux agent's mandatory dual-skill binding (design-taste-frontend +
// emil-design-eng) is the floor; direction skills + delivery agents layer on top.
const PROFILES = {
  // bktAdvisory — full design + delivery kit (TS + tests + Vercel).
  full: {
    skills: [
      'design-taste-frontend', 'emil-design-eng',             // mandatory pair
      'high-end-visual-design', 'redesign-existing-projects',  // directions
      'gpt-taste', 'minimalist-ui',                            // optional directions
    ],
    agents: [
      'orchestrator', 'business-analyst', 'ui-ux', 'feature-dev',
      'qa-uat', 'release-gate', 'context-keeper', 'emil-design-eng',
      'supabase-security', 'vercel',
    ],
  },
  // estimator — minimal design kit (no orchestrator; no TS/tests there yet).
  minimal: {
    skills: [
      'design-taste-frontend', 'emil-design-eng',
      'high-end-visual-design', 'redesign-existing-projects',
    ],
    agents: ['ui-ux', 'emil-design-eng', 'feature-dev'],
  },
}

// ---- helpers --------------------------------------------------------------
const log = (m) => console.log(m)
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(1) }
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// recursive list of file paths relative to `dir` (skips symlinks/dirs themselves)
function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...listFiles(join(dir, entry.name)).map((f) => join(entry.name, f)))
    } else if (entry.isFile()) {
      out.push(entry.name)
    }
  }
  return out
}

function hubSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: HUB_ROOT }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// copy every file under srcDir into destDir; returns { [relPath]: sha256 }
function copyTree(srcDir, destDir, { write }) {
  const hashes = {}
  for (const rel of listFiles(srcDir)) {
    const buf = readFileSync(join(srcDir, rel))
    if (write) {
      const dest = join(destDir, rel)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
    }
    hashes[rel] = sha256(buf)
  }
  return hashes
}

// ---- sync -----------------------------------------------------------------
function doSync(target, profileName, { dryRun }) {
  const profile = PROFILES[profileName]
  if (!profile) fail(`Unknown profile "${profileName}". Known: ${Object.keys(PROFILES).join(', ')}`)
  const sha = hubSha()
  const lock = {
    version: 1,
    vendoredFrom: 'bkt-ai-apply',
    hubSha: sha,
    profile: profileName,
    generatedBy: 'scripts/sync-claude-kit.mjs',
    note: 'Flat copies vendored from the hub. Do NOT hand-edit — edit in the hub and re-run sync. `--check` fails on drift.',
    skills: {},
    agents: {},
  }

  for (const name of profile.skills) {
    const src = join(HUB_ROOT, '.agents', 'skills', name)
    if (!existsSync(src)) fail(`Source skill missing: ${src}`)
    const destDir = join(target, '.claude', 'skills', name)
    if (!dryRun) rmSync(destDir, { recursive: true, force: true })
    lock.skills[name] = {
      source: 'bkt-ai-apply', sourceType: 'local', hubSha: sha,
      files: copyTree(src, destDir, { write: !dryRun }),
    }
  }

  for (const name of profile.agents) {
    const src = join(HUB_ROOT, '.claude', 'agents', `${name}.md`)
    if (!existsSync(src)) fail(`Source agent missing: ${src}`)
    const buf = readFileSync(src)
    if (!dryRun) {
      const dest = join(target, '.claude', 'agents', `${name}.md`)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
    }
    lock.agents[name] = {
      source: 'bkt-ai-apply', sourceType: 'local', hubSha: sha, computedHash: sha256(buf),
    }
  }

  if (!dryRun) writeFileSync(join(target, 'skills-lock.json'), JSON.stringify(lock, null, 2) + '\n')
  const nFiles = Object.values(lock.skills).reduce((n, s) => n + Object.keys(s.files).length, 0)
  log(`${dryRun ? '[dry-run] ' : ''}✓ Synced profile "${profileName}" → ${target}`)
  log(`  ${profile.skills.length} skills (${nFiles} files), ${profile.agents.length} agents, hub @ ${sha.slice(0, 7)}`)
}

// ---- check ----------------------------------------------------------------
function doCheck(target) {
  const lockPath = join(target, 'skills-lock.json')
  if (!existsSync(lockPath)) fail(`No skills-lock.json in ${target} — run a sync first.`)
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const problems = []

  for (const [name, entry] of Object.entries(lock.skills || {})) {
    for (const [rel, want] of Object.entries(entry.files || {})) {
      const p = join(target, '.claude', 'skills', name, rel)
      if (!existsSync(p)) problems.push(`MISSING skill file: ${name}/${rel}`)
      else if (sha256(readFileSync(p)) !== want) problems.push(`DRIFT skill file: ${name}/${rel}`)
    }
  }
  for (const [name, entry] of Object.entries(lock.agents || {})) {
    const p = join(target, '.claude', 'agents', `${name}.md`)
    if (!existsSync(p)) problems.push(`MISSING agent: ${name}.md`)
    else if (sha256(readFileSync(p)) !== entry.computedHash) problems.push(`DRIFT agent: ${name}.md`)
  }

  if (problems.length) {
    log(`✗ kit check FAILED for ${target}`)
    for (const p of problems) log(`  - ${p}`)
    process.exit(1)
  }
  log(`✓ kit check OK for ${target} (vendored from bkt-ai-apply@${(lock.hubSha || '?').slice(0, 7)}, profile "${lock.profile}")`)
}

// ---- CLI ------------------------------------------------------------------
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check') args.check = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--target') args.target = argv[++i]
    else if (a === '--profile') args.profile = argv[++i]
    else fail(`Unknown argument: ${a}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (!args.target) fail('Missing --target <path>')
const target = resolve(process.cwd(), args.target)
if (args.check) doCheck(target)
else if (args.profile) doSync(target, args.profile, { dryRun: !!args.dryRun })
else fail('Specify --profile <name> to sync, or --check to verify.')
