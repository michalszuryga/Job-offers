// Scraped descriptions arrive as one whitespace-collapsed line: bullets glued to the
// previous sentence, section headings glued to their content. This rebuilds a readable
// structure. A port of job_finder/app.py format_description, with fixes:
// - bullets match as whole strings, so ✔️ ⭐️ ▪️ ✍️ never lose their U+FE0F half;
// - a bullet starts a new item even when a space precedes it;
// - heading boundaries are Unicode-aware (JS \b only knows ASCII letters);
// - a heading word inside a sentence ("Check the Requirements: below") stays text;
// - question headings ("Kogo szukamy?") count, keeping their question mark.
// Best effort, not a layout reconstruction. Callers render text nodes only.

export type Block = { type: 'h4'; text: string } | { type: 'p'; text: string } | { type: 'ul'; items: string[] }

// Mirrors _DESCRIPTION_BULLETS and _DESCRIPTION_HEADINGS in job_finder/app.py.
export const DESCRIPTION_BULLETS = [
  '•', '✅', '✔️', '🔹', '➡️', '👉', '🎯', '📌', '⭐️', '🚀', '💡', '🔸', '▪️', '‣', '🧡', '🟣', '✍️', '🎁',
] as const

export const DESCRIPTION_HEADINGS = [
  'requirements', 'responsibilities', 'benefits', 'nice to have', 'about the role',
  'wymagania', 'obowiązki', 'oferujemy', 'zakres obowiązków', 'mile widziane',
  'nasze wymagania', 'benefity', 'co oferujemy', 'kogo szukamy', 'twoja rola',
  'twoje zadania', 'twoje umiejętności', 'co zyskujesz', 'o projekcie',
] as const

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Each bullet with its variation selector optional (scraped text has both forms),
// plus an optional skin tone on hand emoji.
const BULLET = DESCRIPTION_BULLETS.map((bullet) => `${escape(bullet.replace(/\uFE0F/g, ''))}\\uFE0F?`).join('|')
const BULLET_SOURCE = `(?:${BULLET})[\\u{1F3FB}-\\u{1F3FF}]?`
// Longest first, so "Zakres obowiązków" wins over a shorter heading inside it.
const HEADING_SOURCE = [...DESCRIPTION_HEADINGS]
  .sort((a, b) => b.length - a.length)
  .map((heading) => escape(heading).replace(/ /g, '\\s+'))
  .join('|')

const TOKEN = new RegExp(`(${BULLET_SOURCE})|(${HEADING_SOURCE})`, 'giu')
const STARTS_WITH_BULLET = new RegExp(`^\\s*(?:${BULLET_SOURCE})`, 'u')
const DASH_ITEM = /^[-*]\s+/

// Scraped text carries a few entities; anything else is left as written.
const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}
const ENTITY = /&(?:amp|lt|gt|quot|#39|nbsp);/g

// Where the previous block ended: line start, a sentence end or colon, or text glued
// straight onto the heading ("100% zdalnieZakres obowiązków").
function startsBlock(before: string): boolean {
  return /^\s*$/u.test(before) || /[.!?:;]\s*$/u.test(before) || /[\p{L}\p{N})%]$/u.test(before)
}

// Up to two capitalised words that open a sentence belong to the heading after them:
// "Key Responsibilities", "Perks & Benefits". Not after a colon, where "Reports to: QA Lead"
// is a value, and never mid-sentence, so "Write E2E tests Technical Requirements:" stays text.
const QUALIFIER = /(?:^|(?<=[.!?]))\s*((?:\p{Lu}[\p{L}\p{N}]*\s+(?:&\s+)?){1,2})$/u

// A capitalised word that may be the heading's own qualifier ("Technical", but not "API").
const TITLE_WORD_END = /\p{Lu}\p{Ll}[\p{L}\p{N}-]*\s*$/u

type Heading = { start: number; end: number; text: string }

// The heading around a match, or null when the match is just a word in a sentence.
// It has to open a block, and be followed by ":" or "?", a bullet, or a capitalised word.
function heading(line: string, index: number, match: string, inItem: boolean): Heading | null {
  const after = line.slice(index + match.length)
  // Capitalised like a heading, and a whole word: "Obowiązkiem" is not "Obowiązki".
  if (!/^\p{Lu}/u.test(match) || /^\p{Ll}/u.test(after)) return null
  const qualifier = QUALIFIER.exec(line.slice(0, index))?.[1] ?? ''
  const start = index - qualifier.length
  const before = line.slice(0, start)
  const text = qualifier + match
  const punctuation = /^\s*([:?])/.exec(after)
  // A bullet right after is as strong as a colon: "…Testy API. Oferujemy • Praca zdalna".
  const strong = punctuation !== null || STARTS_WITH_BULLET.test(after)
  // List items often lack a full stop, so a strong heading may also end one ("• Testy API
  // Oferujemy • …"), unless a capitalised word before it could be its own ("• Write E2E
  // tests Technical Requirements:"): that stays in the item rather than splitting it.
  const opens = startsBlock(before) || (inItem && strong && !TITLE_WORD_END.test(before))
  if (!opens) return null
  if (punctuation) {
    const end = index + match.length + punctuation[0].length
    return { start, end, text: punctuation[1] === '?' ? `${text}?` : text }
  }
  // Otherwise it needs a capitalised word (or the end of the line) after it.
  return strong || /^\s*(?:\p{Lu}|$)/u.test(after) ? { start, end: index + match.length, text } : null
}

type Segment = { kind: 'text' | 'bullet' | 'heading'; text: string }

function segments(line: string): Segment[] {
  const out: Segment[] = []
  let kind: Segment['kind'] = 'text'
  let start = 0
  const cut = (end: number) => {
    const text = line.slice(start, end).trim()
    if (text) out.push({ kind, text })
  }
  for (const token of line.matchAll(TOKEN)) {
    const index = token.index
    if (token[1]) {
      cut(index)
      kind = 'bullet'
      start = index + token[0].length
      continue
    }
    const found = heading(line, index, token[0], kind === 'bullet')
    if (!found || found.start < start) continue
    cut(found.start)
    out.push({ kind: 'heading', text: found.text })
    kind = 'text'
    start = found.end
  }
  cut(line.length)
  return out
}

// Real line breaks are honoured: each line, and so each blank-line paragraph, is its own
// block. Scraped text arrives on one line; text with breaks came from block elements,
// where a lower-case line is a list item ("znajomość SQL"), not a hard wrap.
function lines(text: string): string[] {
  return text
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// Glued sentences get their space back: "usług.Dla" → "usług. Dla", "stanowisko:QA" → "stanowisko: QA".
// Needs a lower-case letter after the capital, so "ASP.NET" and "Node.JS" stay intact.
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/(?<=[\p{L}\p{N})]{2}[.!?])(?=\p{Lu}\p{Ll})/gu, ' ')
    .replace(/(?<=\p{L}{2}:)(?=\p{Lu})/gu, ' ')
    .trim()
}

export function parseDescription(text: string | null | undefined): Block[] {
  const blocks: Block[] = []
  const addItem = (item: string) => {
    if (!item) return
    const last = blocks.at(-1)
    if (last?.type === 'ul') last.items.push(item)
    else blocks.push({ type: 'ul', items: [item] })
  }
  const decoded = (text ?? '').replace(ENTITY, (entity) => ENTITIES[entity])
  for (const line of lines(decoded)) {
    for (const segment of segments(line)) {
      const content = tidy(segment.text)
      if (segment.kind === 'heading') blocks.push({ type: 'h4', text: content })
      else if (segment.kind === 'bullet') addItem(content)
      else if (DASH_ITEM.test(content)) addItem(content.replace(DASH_ITEM, ''))
      else if (content) blocks.push({ type: 'p', text: content })
    }
  }
  return blocks
}
