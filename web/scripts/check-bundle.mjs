// Asserts the bundle budgets from docs/UI_REDESIGN_PLAN.md §1 (criterion 7)
// against a finished `vite build`. Run from web/: node scripts/check-bundle.mjs [distDir]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const KB = 1000

// Initial JS per route: the static import graphs of the main entry and of the lazy
// route chunk main.tsx loads for that path at once (other dynamic imports load later and
// are not counted). P8 adds landing and demo with noSupabase: true.
const ENTRY = 'index.html'
const ROUTES = {
  // supabase-js lives in the AppRoot chunk, never in the entry (asserted below).
  app: { chunks: [ENTRY, 'src/features/auth/AppRoot.tsx'], maxJs: 160 * KB },
  // A public page, held to the landing's budget (§1 #7); its Sign out imports supabase-js lazily.
  privacy: { chunks: [ENTRY, 'src/pages/Privacy.tsx'], maxJs: 90 * KB, noSupabase: true },
}

const MAX_CSS = 20 * KB
// Measured in P1: inter-latin 48 256 B + inter-latin-ext 85 068 B = 133 324 B; +10%.
const FONT_BUDGET = 146_657
// The only font files we ship: Inter Variable, latin + latin-ext subsets.
const ALLOWED_FONT = /^inter-latin(?:-ext)?-wght-normal-[\w-]+\.woff2$/
const FONT_EXT = /\.(?:woff2?|ttf|otf|eot)$/i

const dist = resolve(process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url)))
const manifestPath = join(dist, '.vite/manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`check-bundle: ${relative(process.cwd(), manifestPath)} not found. Run npm run build first (build.manifest must be true).`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const failures = []
const rows = []
const read = (file) => readFileSync(join(dist, file))
const gzip = (file) => gzipSync(read(file)).length
const kb = (bytes) => `${(bytes / KB).toFixed(1)} kB`

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [relative(dist, path)]
  })
}

// Collects the JS and CSS files a route loads up front: each given chunk plus its
// `imports`, recursively; shared chunks count once. `dynamicImports` are lazy and skipped.
function staticGraph(chunks) {
  const keys = new Set()
  const js = new Set()
  const css = new Set()
  const visit = (key) => {
    if (keys.has(key)) return
    const chunk = manifest[key]
    if (!chunk) throw new Error(`manifest has no entry "${key}"`)
    keys.add(key)
    if (chunk.file.endsWith('.js')) js.add(chunk.file)
    for (const file of chunk.css ?? []) css.add(file)
    for (const next of chunk.imports ?? []) visit(next)
  }
  for (const key of chunks) visit(key)
  return { keys, js, css }
}

// supabase-js must stay out of public routes: look for it by chunk key/name
// and by strings that survive minification (its auth client's name and X-Client-Info
// header). Not "supabase-js": a chunk that lazily imports supabase-<hash>.js names the
// file, and a hash starting "js" would match.
function hasSupabase(graph) {
  for (const key of graph.keys) {
    if (key.includes('@supabase') || manifest[key].name?.includes('supabase')) return true
  }
  return [...graph.js].some((file) => /GoTrueClient|X-Client-Info/.test(read(file).toString('utf8')))
}

const check = (ok, message) => {
  if (!ok) failures.push(message)
  return ok ? 'ok' : 'FAIL'
}

for (const [route, { chunks, maxJs, noSupabase }] of Object.entries(ROUTES)) {
  const missing = chunks.filter((key) => !manifest[key])
  if (missing.length) {
    failures.push(`${route}: ${missing.map((key) => `"${key}"`).join(', ')} missing from the manifest`)
    continue
  }
  const graph = staticGraph(chunks)
  const jsSize = [...graph.js].reduce((sum, file) => sum + gzip(file), 0)
  const cssSize = [...graph.css].reduce((sum, file) => sum + gzip(file), 0)
  rows.push([`${route} JS (${graph.js.size} files, gzip)`, kb(jsSize), kb(maxJs),
    check(jsSize <= maxJs, `${route}: initial JS ${kb(jsSize)} gzip exceeds ${kb(maxJs)}`)])
  rows.push([`${route} CSS (${graph.css.size} files, gzip)`, kb(cssSize), '-', 'info'])
  if (noSupabase) {
    rows.push([`${route} without supabase-js`, '', '', check(!hasSupabase(graph), `${route}: supabase-js is in the static import graph`)])
  }
}

// Every route starts from the entry, so supabase-js there would reach all of them.
if (manifest[ENTRY]) {
  rows.push(['entry without supabase-js', '', '', check(!hasSupabase(staticGraph([ENTRY])),
    'supabase-js is in the main entry graph: lib/supabase (directly or through lib/offers) may only be reached from the src/features/auth/AppRoot.tsx chunk')])
}

const files = walk(dist)

// GitHub Pages has no SPA fallback: postbuild copies the shell to 404.html (unknown paths)
// and privacy/index.html (so /privacy/ is a real directory).
const copies = ['404.html', 'privacy/index.html']
const missingCopies = copies.filter((file) => !files.includes(file))
rows.push(['Pages copies (404.html, privacy/)', '', '', check(missingCopies.length === 0,
  `missing ${missingCopies.join(', ')}: run node scripts/postbuild.mjs after vite build (npm run build does)`)])

const cssFiles = files.filter((file) => file.endsWith('.css'))
const cssTotal = cssFiles.reduce((sum, file) => sum + gzip(file), 0)
rows.push([`CSS total (${cssFiles.length} files, gzip)`, kb(cssTotal), kb(MAX_CSS),
  check(cssTotal <= MAX_CSS, `CSS ${kb(cssTotal)} gzip exceeds ${kb(MAX_CSS)}`)])

// The theme relies on native light-dark(); Lightning CSS lowers it to
// --lightningcss-* vars when build.cssTarget is too old (see vite.config.ts).
const cssText = cssFiles.map((file) => read(file).toString('utf8'))
rows.push(['CSS keeps light-dark()', '', '', check(cssText.some((text) => text.includes('light-dark(')),
  'no CSS file contains light-dark(; check build.cssTarget')])
rows.push(['CSS has no --lightningcss-* fallbacks', '', '', check(!cssText.some((text) => text.includes('--lightningcss-')),
  'CSS contains --lightningcss- vars: light-dark() was lowered; check build.cssTarget')])

const fonts = files.filter((file) => FONT_EXT.test(file))
const woff2 = fonts.filter((file) => file.endsWith('.woff2'))
const fontBytes = woff2.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0)
rows.push([`Fonts (${woff2.length} woff2, raw)`, `${fontBytes} B`, `${FONT_BUDGET} B`,
  check(fontBytes <= FONT_BUDGET, `fonts ${fontBytes} B exceed ${FONT_BUDGET} B`)])
const unexpected = fonts.filter((file) => !ALLOWED_FONT.test(file.split('/').pop()))
rows.push(['Only Inter latin + latin-ext fonts', '', '', check(unexpected.length === 0,
  `unexpected font files (only Inter latin/latin-ext woff2 allowed): ${unexpected.join(', ')}`)])

const latin = woff2.find((file) => /inter-latin-wght-normal/.test(file))
const html = existsSync(join(dist, 'index.html')) ? read('index.html').toString('utf8') : ''
rows.push(['index.html preloads Inter latin', '', '', check(!!latin && html.includes(`rel="preload"`) && html.includes(latin),
  'index.html has no <link rel="preload"> for the Inter latin woff2')])

// The UI kit (src/dev) is reached only behind import.meta.env.DEV in main.tsx, so a build
// must drop it: no chunk from src/dev and none of its markup in any JS file.
const devChunks = Object.keys(manifest).filter((key) => key.startsWith('src/dev/'))
const kitInJs = files.filter((file) => file.endsWith('.js')).filter((file) => read(file).toString('utf8').includes('kit-specimen'))
rows.push(['Dev-only UI kit not shipped', '', '', check(devChunks.length === 0 && kitInJs.length === 0,
  `the dev-only UI kit is in the build: ${[...devChunks, ...kitInJs].join(', ')}`)])

rows.unshift(['Check', 'Size', 'Budget', 'Result'])
const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i].length)))
for (const [name, size, budget, result] of rows) {
  console.log([name.padEnd(widths[0]), size.padStart(widths[1]), budget.padStart(widths[2]), result].join('  '))
}

if (failures.length) {
  console.error(`\ncheck-bundle failed:\n${failures.map((message) => `  - ${message}`).join('\n')}`)
  process.exit(1)
}
console.log('\ncheck-bundle: all budgets met')
