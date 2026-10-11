// GitHub Pages, locally: serves the built dist/ under the base path with Pages' semantics,
// not a dev server's SPA fallback, for the `pages` Playwright project (plan §6):
// - a file → 200 with its content type;
// - a directory without the trailing slash → 301 to 'dir/' (query kept);
// - 'dir/' → dir/index.html;
// - anything else → status 404 with the body of 404.html (what postbuild.mjs writes);
// - outside the base path → a plain 404.
// No dependencies. Usage, from web/: node scripts/static-server.mjs [--port 4174] [--base /Job-offers/] [--dir dist]
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '4174' },
    base: { type: 'string', default: process.env.BASE_PATH ?? '/Job-offers/' },
    dir: { type: 'string', default: fileURLToPath(new URL('../dist', import.meta.url)) },
  },
})
const PORT = Number(values.port)
const BASE = `/${values.base.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
const DIST = resolve(values.dir)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const statOf = (path) => stat(path).catch(() => null)

function reply(req, res, status, headers, body = '') {
  // Read fresh per request, so a rebuild needs no restart; never cached for the same reason.
  res.writeHead(status, { 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(body), ...headers })
  res.end(req.method === 'HEAD' ? undefined : body)
}

async function serveFile(req, res, file, status = 200) {
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  reply(req, res, status, { 'Content-Type': type }, await readFile(file))
}

async function notFound(req, res) {
  const page = join(DIST, '404.html')
  if ((await statOf(page))?.isFile()) return serveFile(req, res, page, 404)
  reply(req, res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found')
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(req, res, 405, { Allow: 'GET, HEAD' })
    const url = new URL(req.url ?? '/', 'http://localhost')
    let path
    try {
      path = decodeURIComponent(url.pathname)
    } catch {
      return reply(req, res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad request')
    }
    // The site root is a directory like any other: /Job-offers → /Job-offers/.
    if (`${path}/` === BASE) return reply(req, res, 301, { Location: `${url.pathname}/${url.search}` })
    if (!path.startsWith(BASE)) {
      return reply(req, res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found')
    }

    const target = resolve(DIST, `.${sep}${path.slice(BASE.length)}`)
    // No ../ out of dist.
    if (target !== DIST && !target.startsWith(DIST + sep)) return notFound(req, res)
    const info = await statOf(target)
    if (info?.isDirectory()) {
      if (!path.endsWith('/')) return reply(req, res, 301, { Location: `${url.pathname}/${url.search}` })
      const index = join(target, 'index.html')
      if ((await statOf(index))?.isFile()) return serveFile(req, res, index)
    } else if (info?.isFile() && !path.endsWith('/')) {
      return serveFile(req, res, target)
    }
    return notFound(req, res)
  } catch (error) {
    console.error(error)
    if (!res.headersSent) reply(req, res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Server error')
  }
})

server.listen(PORT, () => {
  console.log(`static-server: http://localhost:${PORT}${BASE} → ${relative(process.cwd(), DIST) || '.'}`)
})
