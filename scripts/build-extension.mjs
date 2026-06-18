// Builds the MV3 extension into extension/dist/ (content.js + background.js +
// spa-session.js as self-contained IIFE bundles, plus the manifest). Run:
// `node scripts/build-extension.mjs` (or `pnpm build:ext`). Used by the
// loaded-extension Playwright smoke.
//
// The PUBLIC Supabase URL + anon key are injected at BUILD time from .env.local
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) via esbuild `define` — nothing is
// committed to source (extension/src/config.ts ships empty fallbacks). NEVER
// inject an LLM/provider key or the service-role key (BR-122).
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, 'extension/dist')
mkdirSync(outdir, { recursive: true })

/** Minimal .env.local reader (KEY=VALUE lines) — avoids a dotenv dependency. */
function readEnvLocal() {
  const out = {}
  const envPath = resolve(root, '.env.local')
  if (!existsSync(envPath)) return out
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = readEnvLocal()
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[build-extension] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found — the extension will build but stay signed-out until configured.',
  )
}

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  platform: 'browser',
  logLevel: 'warning',
  define: {
    __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(SUPABASE_ANON_KEY),
    'process.env.NODE_ENV': '"production"',
  },
}

const entries = [
  ['extension/src/content/index.ts', 'content.js'],
  ['extension/src/background/index.ts', 'background.js'],
  ['extension/src/content/spa-session.ts', 'spa-session.js'],
]
for (const [entry, outfile] of entries) {
  await build({ ...common, entryPoints: [resolve(root, entry)], outfile: resolve(outdir, outfile) })
}
copyFileSync(resolve(root, 'extension/manifest.json'), resolve(outdir, 'manifest.json'))
console.info(
  '[build-extension] extension/dist ready (content.js, background.js, spa-session.js, manifest.json)',
)
