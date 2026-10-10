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
const TOKENS = readFileSync(web('src/styles/tokens.css'), 'utf8')

// Colours straight from tokens.css, so the assets follow palette changes.
function token(name) {
  const pair = TOKENS.match(new RegExp(`--${name}:light-dark\\((#\\w+),(#\\w+)\\)`))
  if (!pair) throw new Error(`--${name} is not a light-dark() pair in tokens.css`)
  return { light: pair[1], dark: pair[2] }
}
// og.png is a dark card.
const dark = (name) => token(name).dark

const [, defs] = MARK.match(/(<defs>[\s\S]*<\/defs>)/)
const [, glyph] = MARK.match(/(<g[\s\S]*<\/g>)/)
const [, gradientId] = defs.match(/id="([^"]+)"/)
const [from, to] = [...defs.matchAll(/stop-color="([^"]+)"/g)].map((match) => match[1])
// Outer diameter of the match ring (r=10 plus half its 2.5 stroke), the widest part of the glyph.
const GLYPH = 22.5

// The glyph on a full-bleed gradient square, scaled so the ring spans `ratio` of the side.
// The platform (iOS corners, maskable shapes) crops it, so nothing here is transparent.
function fullBleed(ratio) {
  const side = GLYPH / ratio
  const origin = 16 - side / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${origin} ${origin} ${side} ${side}">${defs}`
    + `<rect x="${origin}" y="${origin}" width="${side}" height="${side}" fill="url(#${gradientId})"/>${glyph}</svg>`
}

const FONT_FACE = `@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${FONT.toString('base64')}) format('woff2')}`

const page = (body, css = '') => `<!doctype html><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:transparent}
body>svg{display:block;width:100%;height:100%}
${css}</style>${body}`

const og = page(`
<div class="glow glow-a"></div><div class="glow glow-b"></div><div class="glow glow-c"></div>
<main>
  <div class="logo">${MARK}<span>JOffers</span></div>
  <div class="copy">
    <span class="pill">Private beta</span>
    <h1>QA jobs, scored<br>for you.</h1>
    <p>Every evening at 18:00 — scored 0–100 against your&nbsp;profile.</p>
  </div>
</main>
<figure>
  <svg viewBox="0 0 100 100">
    <circle class="track" cx="50" cy="50" r="42"/>
    <circle class="arc" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="92 100" transform="rotate(-90 50 50)"/>
  </svg>
  <div class="score"><strong>92</strong><span>Top match</span></div>
</figure>`, `
body{position:relative;overflow:hidden;background:${dark('canvas')};color:${dark('fg')};font-family:Inter,sans-serif;font-feature-settings:'tnum'}
/* Blurred discs instead of radial-gradient(): Skia dithers gradients, and that noise
   alone pushed og.png past its 300 kB budget. */
.glow{position:absolute;border-radius:50%;filter:blur(90px)}
.glow-a{width:440px;height:440px;left:714px;top:95px;background:${to};opacity:.42}
.glow-b{width:420px;height:300px;left:900px;top:470px;background:${from};opacity:.5}
.glow-c{width:420px;height:260px;left:-200px;top:-160px;background:${from};opacity:.28}
main{position:absolute;inset:72px 0 72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.logo{display:flex;align-items:center;gap:18px;font-size:46px;font-weight:700;letter-spacing:-0.03em}
.logo svg{width:60px;height:60px}
.copy{display:flex;flex-direction:column;align-items:flex-start;gap:24px;max-width:660px}
/* Sized for a ~300 px wide preview card, where everything shrinks to a quarter. */
.pill{display:inline-flex;align-items:center;gap:12px;padding:10px 24px;border-radius:999px;font-size:28px;font-weight:600;
  background:${dark('brand-tint')};color:${dark('brand-ink')};box-shadow:inset 0 0 0 1px ${dark('brand')}55}
.pill::before{content:'';width:10px;height:10px;border-radius:50%;background:currentColor}
h1{font-size:76px;line-height:80px;font-weight:700;letter-spacing:-0.035em}
p{font-size:30px;line-height:40px;font-weight:450;color:${dark('fg-muted')};max-width:600px}
figure{position:absolute;right:96px;top:50%;width:340px;height:340px;transform:translateY(-50%)}
figure svg{width:100%;height:100%;overflow:visible}
figure circle{fill:none;stroke-width:7;stroke-linecap:round}
/* The real ScoreRing (plan §2.3): a 92 is the top band, so success on its tint. */
.track{stroke:${dark('success-tint')}}
.arc{stroke:${dark('success')};filter:drop-shadow(0 0 10px ${dark('success')}66)}
.score{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.score strong{font-size:120px;line-height:1;font-weight:700;letter-spacing:-0.04em}
.score span{font-size:32px;font-weight:600;color:${dark('success')}}
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
