// Turns one line of text into SVG path data, so a standalone SVG (an <img>, a README)
// draws the real wordmark: SVG used as an image can't load web fonts.
// No font tooling needed: Chromium's PDF backend (Skia) writes a variable font as a
// Type3 font, whose glyphs are plain path operators, and the page's text operators
// carry HarfBuzz's positions with kerning and letter-spacing applied.
import { inflateSync } from 'node:zlib'

// Rendered large, then scaled, so the PDF's number rounding vanishes.
const RENDER = 1000

const round = (n) => String(+n.toFixed(2))

// PDF operators and operands, in order; a <hex> string stays one token.
const tokenize = (source) => source.match(/<[\da-f]*>|[^\s<>[\]]+/gi) ?? []

function readPdf(pdf) {
  const streams = new Map()
  for (const match of pdf.matchAll(/(\d+) 0 obj\s*<<([^<>]*)>>\s*stream\r?\n/g)) {
    const start = match.index + match[0].length
    const data = Buffer.from(pdf.slice(start, pdf.indexOf('endstream', start)), 'latin1')
    streams.set(match[1], (match[2].includes('/FlateDecode') ? inflateSync(data) : data).toString('latin1'))
  }
  const fonts = pdf.match(/\/Subtype \/Type3/g) ?? []
  if (fonts.length !== 1 || /\/FontFile/.test(pdf)) {
    throw new Error('outline-text: expected exactly one Type3 font in the PDF; Skia may have changed how it embeds fonts')
  }
  const matrix = pdf.match(/\/FontMatrix \[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number)
  const procs = Object.fromEntries([...pdf.match(/\/CharProcs\s*<<([^>]*)>>/)[1].matchAll(/\/(\S+) (\d+) 0 R/g)]
    .map(([, name, id]) => [name, streams.get(id)]))
  // Differences: a number sets the next code, each name takes the next code.
  const names = []
  let code = 0
  for (const token of tokenize(pdf.match(/\/Differences \[([^\]]*)\]/)[1])) {
    if (/^\d+$/.test(token)) code = Number(token)
    else names[code++] = token.slice(1)
  }
  const content = [...streams.values()].find((stream) => /\bBT\b/.test(stream))
  return { matrix, glyph: (code) => procs[names[code]], content }
}

// Origin of each glyph in CSS px, from the page's text operators (each text object
// sets its own Tm, and nothing outside one starts with T).
function placeGlyphs(content) {
  const placed = []
  let operands = []
  let tm, size, x, y
  for (const token of tokenize(content)) {
    if (/^[-\d.</]/.test(token)) {
      operands.push(token)
      continue
    }
    if (token === 'Tf') size = Number(operands[1])
    else if (token === 'Tm') {
      tm = operands.map(Number)
      if (tm[1] || tm[2]) throw new Error('outline-text: rotated or skewed text is not supported')
      x = tm[4]
      y = tm[5]
    } else if (token === 'Td') {
      x += operands[0] * tm[0]
      y += operands[1] * tm[3]
    } else if (token === 'Tj') {
      const hex = operands[0].slice(1, -1)
      if (hex.length !== 2) throw new Error('outline-text: expected one glyph per Tj')
      placed.push({ code: parseInt(hex, 16), x, y, scaleX: size * tm[0], scaleY: size * tm[3] })
    } else if (/^T|^['"]$/.test(token)) throw new Error(`outline-text: unsupported text operator ${token}`)
    operands = []
  }
  return placed
}

// { d, left, right }: path data in px for `size`, origin on the baseline at the pen
// start, and the ink's horizontal extent.
export async function outlineText(browser, { text, fontFace, style, size }) {
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${fontFace}
body{margin:0}span{${style};font-size:${RENDER}px;white-space:pre}</style><span>${text}</span>`)
    await page.evaluate(() => document.fonts.ready)
    const pdf = await page.pdf({ width: `${text.length * RENDER * 1.5}px`, height: `${RENDER * 2}px` })
    const { matrix, glyph, content } = readPdf(pdf.toString('latin1'))
    const placed = placeGlyphs(content)
    // One glyph per character: a ligature or a fallback font would need another look.
    if (placed.length !== [...text].length) throw new Error(`outline-text: ${placed.length} glyphs for "${text}"`)
    const [origin] = placed
    const k = size / RENDER
    let d = ''
    let left = Infinity
    let right = -Infinity
    for (const { code, x, y, scaleX, scaleY } of placed) {
      const proc = glyph(code)
      if (!proc) throw new Error(`outline-text: no outline for glyph code ${code}`)
      // Glyph space to px, relative to the first glyph's origin.
      const px = (gx) => round(((x - origin.x) + gx * matrix[0] * scaleX) * k)
      const py = (gy) => round(((y - origin.y) + gy * matrix[3] * scaleY) * k)
      let operands = []
      for (const token of tokenize(proc)) {
        if (/^[-\d.]/.test(token)) {
          operands.push(Number(token))
          continue
        }
        const p = (i) => `${px(operands[i])} ${py(operands[i + 1])}`
        if (token === 'd1') {
          left = Math.min(left, Number(px(operands[2])))
          right = Math.max(right, Number(px(operands[4])))
        } else if (token === 'm') d += `M${p(0)}`
        else if (token === 'l') d += `L${p(0)}`
        else if (token === 'c') d += `C${p(0)} ${p(2)} ${p(4)}`
        else if (token === 'h') d += 'Z'
        else if (token !== 'f') throw new Error(`outline-text: unsupported path operator ${token}`)
        operands = []
      }
    }
    return { d, left, right }
  } finally {
    await page.close()
  }
}
