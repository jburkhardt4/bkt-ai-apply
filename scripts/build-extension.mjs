// Builds the MV3 extension into extension/dist/ (content.js + background.js as
// self-contained IIFE bundles, plus the manifest). Run: `node scripts/build-extension.mjs`
// (or `pnpm build:ext`). Used by the loaded-extension Playwright smoke.
import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, 'extension/dist')
mkdirSync(outdir, { recursive: true })

const common = { bundle: true, format: 'iife', target: 'chrome120', logLevel: 'warning' }
await build({
  ...common,
  entryPoints: [resolve(root, 'extension/src/content/index.ts')],
  outfile: resolve(outdir, 'content.js'),
})
await build({
  ...common,
  entryPoints: [resolve(root, 'extension/src/background/index.ts')],
  outfile: resolve(outdir, 'background.js'),
})
copyFileSync(resolve(root, 'extension/manifest.json'), resolve(outdir, 'manifest.json'))
console.info('[build-extension] extension/dist ready (content.js, background.js, manifest.json)')
