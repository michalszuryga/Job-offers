// Runs after `vite build` (npm run build). GitHub Pages has no SPA fallback, so every route
// the app owns needs a real file:
// - 404.html: Pages serves it, with status 404, for any path it has no file for; the app then
//   routes on the URL (NotFound for an unknown path).
// - privacy/index.html: /privacy answers 200 (Pages redirects /privacy to /privacy/).
// P5 copies the app shell; P8 replaces this with the prerendered Landing and Privacy.
// Usage, from web/: node scripts/postbuild.mjs [distDir]
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = resolve(process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url)))
const shell = join(dist, 'index.html')
if (!existsSync(shell)) {
  console.error(`postbuild: ${relative(process.cwd(), shell)} not found. Run vite build first.`)
  process.exit(1)
}

// Asset URLs in index.html are absolute (/Job-offers/assets/…), so a copy works at any depth.
for (const target of ['404.html', 'privacy/index.html']) {
  const file = join(dist, target)
  mkdirSync(dirname(file), { recursive: true })
  copyFileSync(shell, file)
  console.log(`postbuild: ${relative(process.cwd(), file)}`)
}
