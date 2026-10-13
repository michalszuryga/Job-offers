// Renders the brand assets from brand/mark.svg (plan §2.1, P2): the PNGs and
// favicon in public/, and brand/logo.svg with its wordmark outlined.
// Run from web/ after changing the mark, the palette or the OG copy, then commit them:
//   npm run brand
// Uses the Playwright Chromium the e2e suite already installs, so no image deps.
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { outlineText } from './outline-text.mjs'

const web = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const MARK = readFileSync(web('brand/mark.svg'), 'utf8')
const FONT = readFileSync(web('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))
const SERIF = readFileSync(web('node_modules/@fontsource/newsreader/files/newsreader-latin-600-normal.woff2'))
const TOKENS = readFileSync(web('src/styles/tokens.css'), 'utf8')

// Colours straight from tokens.css, so the assets follow palette changes.
function token(name) {
  const pair = TOKENS.match(new RegExp(`--${name}:light-dark\\((#\\w+),(#\\w+)\\)`))
  if (!pair) throw new Error(`--${name} is not a light-dark() pair in tokens.css`)
  return { light: pair[1], dark: pair[2] }
}
// og.png is an ivory page in the light palette (visual refresh).
const light = (name) => token(name).light

const [, glyph] = MARK.match(/(<g[\s\S]*<\/g>)/)
// The mark is flat: one fill under the ring and J.
const [, markFill] = MARK.match(/<rect[^>]*fill="([^"]+)"/)
// Outer diameter of the match ring (r=10 plus half its 2.5 stroke), the widest part of the glyph.
const GLYPH = 22.5

// The glyph on a full-bleed square, scaled so the ring spans `ratio` of the side.
// The platform (iOS corners, maskable shapes) crops it, so nothing here is transparent.
function fullBleed(ratio) {
  const side = GLYPH / ratio
  const origin = 16 - side / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${origin} ${origin} ${side} ${side}">`
    + `<rect x="${origin}" y="${origin}" width="${side}" height="${side}" fill="${markFill}"/>${glyph}</svg>`
}

const FONT_FACE = `@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${FONT.toString('base64')}) format('woff2')}`
const SERIF_FACE = `@font-face{font-family:Newsreader;font-weight:600;src:url(data:font/woff2;base64,${SERIF.toString('base64')}) format('woff2')}`

const page = (body, css = '') => `<!doctype html><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:transparent}
body>svg{display:block;width:100%;height:100%}
${css}</style>${body}`

const og = page(`
<main>
  <div class="logo">${MARK}<span>JOffers</span></div>
  <div class="copy">
    <span class="kicker">Private beta</span>
    <h1>QA jobs, scored<br>for you.</h1>
    <p>Every evening around 18:00 — scored <span class="nb">0–100</span> against your&nbsp;profile.</p>
  </div>
</main>
<figure>
  <svg viewBox="0 0 100 100">
    <circle class="track" cx="50" cy="50" r="44"/>
    <circle class="arc" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="92 100" transform="rotate(-90 50 50)"/>
  </svg>
  <div class="score"><strong>92</strong><span>Top match</span></div>
</figure>`, `
${SERIF_FACE}
body{position:relative;overflow:hidden;background:${light('canvas')};color:${light('fg')};font-family:Inter,sans-serif;font-feature-settings:'tnum'}
/* An editorial page: a rule of ink across the top and one at the foot, no glow. */
body::before,body::after{content:'';position:absolute;left:80px;right:80px;border-top:2px solid ${light('fg')}}
body::before{top:40px}
body::after{bottom:40px;border-top-width:1px;border-color:${light('line')}}
main{position:absolute;inset:76px 0 76px 80px;display:flex;flex-direction:column;justify-content:space-between}
.logo{display:flex;align-items:center;gap:18px;font-size:44px;font-weight:700;letter-spacing:-0.03em}
.logo svg{width:56px;height:56px}
.copy{display:flex;flex-direction:column;align-items:flex-start;gap:22px;max-width:680px}
/* Sized for a ~300 px wide preview card, where everything shrinks to a quarter. */
.kicker{display:flex;align-items:center;gap:16px;font-size:24px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${light('brand-ink')}}
.kicker::before{content:'';width:44px;border-top:2px solid currentColor}
h1{font-family:Newsreader,serif;font-size:88px;line-height:90px;font-weight:600;letter-spacing:-0.015em}
.nb{white-space:nowrap}
p{font-size:30px;line-height:40px;font-weight:450;color:${light('fg-muted')};max-width:620px}
figure{position:absolute;right:104px;top:50%;width:300px;height:300px;transform:translateY(-50%)}
figure svg{width:100%;height:100%;overflow:visible}
figure circle{fill:none;stroke-width:3;stroke-linecap:round}
/* The real ScoreRing (plan §2.3): a 92 is the top band, so success on its tint. */
.track{stroke:${light('success-tint')}}
.arc{stroke:${light('success')}}
.score{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.score strong{font-family:Newsreader,serif;font-size:128px;line-height:1;font-weight:600}
.score span{font-size:28px;font-weight:600;color:${light('success')}}
`)

const ASSETS = [
  // Safari before 26 ignores SVG favicons (the plan §3 floor is 17.5).
  { file: 'favicon-32.png', size: 32, html: page(MARK), transparent: true },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, html: page(fullBleed(0.6)) },
  { file: 'icon-192.png', size: 192, html: page(MARK), transparent: true },
  { file: 'icon-512.png', size: 512, html: page(MARK), transparent: true },
  // Maskable: the ring stays well inside the 80% safe-zone circle (plan §2.1).
  { file: 'maskable-512.png', size: 512, html: page(fullBleed(0.52)) },
  { file: 'og.png', size: [1200, 630], html: og, maxBytes: 300_000 },
]

const browser = await chromium.launch()
try {
  for (const { file, size, html, transparent = false, maxBytes } of ASSETS) {
    const [width, height] = Array.isArray(size) ? size : [size, size]
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const tab = await context.newPage()
    await tab.setContent(html)
    await tab.evaluate(() => document.fonts.ready)
    const path = web(`public/${file}`)
    await tab.screenshot({ path, omitBackground: transparent })
    await context.close()
    const bytes = statSync(path).size
    if (maxBytes && bytes > maxBytes) throw new Error(`${file} is ${bytes} B, over its ${maxBytes} B budget`)
    console.log(`${file.padEnd(22)} ${width}×${height}  ${(bytes / 1000).toFixed(1)} kB`)
  }

  // A standalone SVG can't use web fonts, so the wordmark ships as outlines:
  // Inter 700, −0.03em, caps (0.727 em) centred on the mark, 10 px after it.
  const fg = token('fg')
  const wordmark = await outlineText(browser, {
    text: 'JOffers',
    fontFace: FONT_FACE,
    style: 'font-family:Inter;font-weight:700;letter-spacing:-0.03em',
    size: 22,
  })
  const width = Math.ceil(42 + wordmark.right)
  const inner = MARK.replace(/^<svg[^>]*>\n/, '').replace(/<\/svg>\s*$/, '')
  writeFileSync(web('brand/logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="32" viewBox="0 0 ${width} 32">
  <title>JOffers</title>
  <style>@media (prefers-color-scheme: dark) { .wordmark { fill: ${fg.dark} } }</style>
${inner}  <path class="wordmark" fill="${fg.light}" transform="translate(42 24)" d="${wordmark.d}"/>
</svg>
`)
  console.log(`logo.svg               ${width}×32  wordmark outlined`)
} finally {
  await browser.close()
}

// The favicon is the mark itself; brand.spec checks the two stay identical.
copyFileSync(web('brand/mark.svg'), web('public/favicon.svg'))
console.log('favicon.svg            copied from brand/mark.svg')
