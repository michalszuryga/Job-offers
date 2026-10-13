// Runs after `vite build` (npm run build). GitHub Pages has no SPA fallback, so every route the
// app owns needs a real file, and the public pages ship as static HTML (plan §4.1, §5):
// - index.html: the Landing, prerendered in English, plus the CSS-only boot skeleton members
//   see instead of it (html[data-boot=app]); the client hydrates it.
// - privacy/index.html: the Privacy page, prerendered (Pages redirects /privacy to /privacy/).
// - demo/index.html: the plain app shell, so /demo answers 200 (the demo needs JS anyway).
// - 404.html: the plain app shell. Pages serves it, with status 404, for any path it has no
//   file for; the app then routes on the URL (NotFound for an unknown path).
// The prerender is src/prerender.tsx, built here for Node into a scratch directory with the
// same Vite config and environment as the client build.
// Usage, from web/: node scripts/postbuild.mjs [distDir]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const WEB = fileURLToPath(new URL('..', import.meta.url))
const dist = resolve(process.argv[2] ?? join(WEB, 'dist'))
const shellPath = join(dist, 'index.html')
const manifestPath = join(dist, '.vite/manifest.json')
for (const file of [shellPath, manifestPath]) {
  if (!existsSync(file)) {
    console.error(`postbuild: ${relative(process.cwd(), file)} not found. Run vite build first.`)
    process.exit(1)
  }
}
// The app shell as vite build wrote it (a second run needs a fresh vite build).
const shell = readFileSync(shellPath, 'utf8')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const ROOT = '<div id="root"></div>'
if (!shell.includes(ROOT)) {
  console.error(`postbuild: ${relative(process.cwd(), shellPath)} has no ${ROOT}; already prerendered? Run vite build first.`)
  process.exit(1)
}
// The same base as vite.config.ts, for the links added below.
const BASE = process.env.BASE_PATH ?? '/'

const write = (target, html) => {
  const file = join(dist, target)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, html)
  console.log(`postbuild: ${relative(process.cwd(), file)}`)
}

// Asset URLs in the shell are absolute (/Job-offers/assets/…), so a copy works at any depth.
write('404.html', shell)
write('demo/index.html', shell)

// The SSR build: React and the other dependencies stay external (node_modules).
const ssrDir = join(WEB, 'node_modules/.joffers-prerender')
await build({
  root: WEB,
  configFile: join(WEB, 'vite.config.ts'),
  logLevel: 'warn',
  build: { ssr: 'src/prerender.tsx', outDir: ssrDir, emptyOutDir: true, manifest: false, copyPublicDir: false },
})
// React's production build, as in the browser bundle.
process.env.NODE_ENV = 'production'
const { renderPage, renderBootSkeleton } = await import(pathToFileURL(join(ssrDir, 'prerender.js')).href)

// The CSS and JS a page's chunks load up front (their static imports), from the client build's
// manifest. `lazy` chunks the prerender rendered (the phone preview) need their CSS up front too.
function graph(keys) {
  const css = new Set()
  const js = new Set()
  const visit = (key, seen = new Set()) => {
    if (seen.has(key)) return
    seen.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error(`postbuild: manifest has no entry "${key}"`)
    if (chunk.file.endsWith('.js') && !chunk.isEntry) js.add(chunk.file)
    for (const file of chunk.css ?? []) css.add(file)
    for (const next of chunk.imports ?? []) visit(next, seen)
  }
  for (const key of keys) visit(key)
  return { css: [...css], js: [...js] }
}

const href = (file) => `${BASE}${file}`

function page(html, { keys, title, root, before = '' }) {
  const { css, js } = graph(keys)
  const links = [
    ...css.filter((file) => !html.includes(href(file))).map((file) => `<link rel="stylesheet" crossorigin href="${href(file)}">`),
    ...js.filter((file) => !html.includes(href(file))).map((file) => `<link rel="modulepreload" crossorigin href="${href(file)}">`),
  ]
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('</head>', `${links.map((link) => `  ${link}\n`).join('')}  </head>`)
    .replace(ROOT, `${before}${root}`)
}

const ENGLISH = 'data-lang="en"'
const [landing, privacy] = [await renderPage('landing'), await renderPage('privacy')]

write(
  'index.html',
  page(shell, {
    // The page plus the lazy parts the prerender rendered in place: their CSS must be there
    // before first paint, and their JS is needed to hydrate them.
    keys: [
      'src/features/landing/Landing.tsx',
      'src/features/auth/SignInCard.tsx',
      'src/features/landing/PhoneMock.tsx',
      'src/features/landing/ScoreModel.tsx',
    ],
    title: 'JOffers — QA jobs, scored for you.',
    before: `<div class="boot-static" aria-hidden="true">${renderBootSkeleton()}</div>`,
    root: `<div id="root" data-prerendered="landing" ${ENGLISH}>${landing}</div>`,
  }),
)
write(
  'privacy/index.html',
  page(shell, {
    keys: ['src/pages/Privacy.tsx'],
    title: 'Privacy policy · JOffers',
    root: `<div id="root" data-prerendered="privacy" ${ENGLISH}>${privacy}</div>`,
  }),
)

rmSync(ssrDir, { recursive: true, force: true })
