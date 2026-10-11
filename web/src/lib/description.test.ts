import { describe, expect, test } from 'vitest'
import appPy from '../../../job_finder/app.py?raw'
import samples from './__fixtures__/descriptions.json'
import { DESCRIPTION_BULLETS, DESCRIPTION_HEADINGS, parseDescription, type Block } from './description'

const sample = (name: string) => {
  const found = samples.find((s) => s.name === name)
  if (!found) throw new Error(`descriptions.json has no "${name}" sample`)
  return found.text
}

const p = (text: string): Block => ({ type: 'p', text })
const h4 = (text: string): Block => ({ type: 'h4', text })
const ul = (...items: string[]): Block => ({ type: 'ul', items })

describe('collapsed samples (descriptions.json)', () => {
  test('pl-glued-bullets: bullets and headings glued to the previous sentence', () => {
    expect(parseDescription(sample('pl-glued-bullets'))).toEqual([
      p(
        'Firma Przykładowa rozwija platformę płatności dla klientów z całej Europy. Szukamy osoby, która zadba o ' +
          'jakość naszych usług. Dla jednego z zespołów poszukujemy osoby na stanowisko: QA EngineerB2B100% zdalnie',
      ),
      h4('Zakres obowiązków'),
      ul(
        'Projektowanie i utrzymanie testów automatycznych.',
        'Testowanie API REST oraz integracji z bankami.',
        'Przygotowywanie danych testowych.',
        'Współpraca z zespołem developerskim.',
      ),
      h4('Wymagania'),
      ul(
        'Minimum 3 lata doświadczenia w testowaniu.',
        'Dobra znajomość Playwright i TypeScript.',
        'Znajomość SQL.',
        'Komunikatywny angielski.',
      ),
      h4('Mile widziane'),
      ul('Doświadczenie w branży fintech.', 'Znajomość Postmana.'),
      h4('Oferujemy'),
      ul('W pełni zdalną współpracę.', 'Stawkę 150–180 PLN/h netto na B2B.', 'Budżet szkoleniowy.'),
    ])
  })

  test('en-spaced-bullets: spaced bullets, headings without colons, a heading word mid-sentence', () => {
    expect(parseDescription(sample('en-spaced-bullets'))).toEqual([
      p(
        'TypeScript Playwright API QA Engineer Location: Fully remote Reports to: QA Lead We are looking for a QA ' +
          'Engineer to own quality across a healthcare scheduling product.',
      ),
      h4('Responsibilities'),
      ul(
        'Test features end to end, including API, regression and exploratory testing.',
        'Build and maintain E2E tests in TypeScript with Playwright.',
        'Investigate flaky tests and improve reliability.',
        // "requirements" here is part of the sentence, not a heading.
        'Review requirements and acceptance criteria for gaps.',
      ),
      h4('Requirements'),
      ul(
        'Practical experience testing web applications manually and with automation.',
        'Experience with Playwright and TypeScript.',
        'Clear written communication in English.',
      ),
      h4('Nice to have'),
      ul('Experience with HL7 or other healthcare data.', 'CI/CD with GitHub Actions.'),
      h4('Benefits'),
      ul('Remote-first team', 'Paid conference days'),
    ])
  })

  test('pl-glued-headings: no bullets, headings glued to the next sentence, an HTML entity', () => {
    expect(parseDescription(sample('pl-glued-headings'))).toEqual([
      p(
        'W Acme tworzymy oprogramowanie dla sektora e-commerce & logistyki. Dołącz do zespołu, w którym jakość ' +
          'jest wspólną odpowiedzialnością. Szukamy osoby na stanowisko Testera Manualnego, która wesprze zespół ' +
          'w zapewnianiu jakości.',
      ),
      h4('Wymagania'),
      p(
        'Minimum 2 lata doświadczenia w testowaniu oprogramowania. Znajomość języka SQL. Doświadczenie z Jira i ' +
          'narzędziami do raportowania błędów.',
      ),
      h4('Mile widziane'),
      p('Doświadczenie w pracy w zespołach zwinnych (Agile). Znajomość Postmana lub SoapUI.'),
      h4('Oferujemy'),
      p('Pracę zdalną i elastyczne godziny. Prywatną opiekę medyczną.'),
    ])
  })
})

test('the e2e mock description (supabase-mock.ts)', () => {
  expect(
    parseDescription('Full description of X. Wymagania • Playwright i TypeScript • Testy API Oferujemy • Praca zdalna'),
  ).toEqual([
    p('Full description of X.'),
    h4('Wymagania'),
    ul('Playwright i TypeScript', 'Testy API'),
    h4('Oferujemy'),
    ul('Praca zdalna'),
  ])
})

describe('bullets', () => {
  test('emoji with a variation selector stay whole', () => {
    const blocks = parseDescription('Stack:✔️ Playwright✔️TypeScript⭐️ SQL▪️ Git✍️ Docs')
    expect(blocks).toEqual([p('Stack:'), ul('Playwright', 'TypeScript', 'SQL', 'Git', 'Docs')])
    expect(blocks.flatMap((b) => (b.type === 'ul' ? b.items : [b.text])).join('')).not.toMatch(/\uFE0F/u)
  })

  test('the bare forms without U+FE0F work too, as do skin tones', () => {
    expect(parseDescription('Oferujemy:✔ Pracę zdalną ⭐ Szkolenia 👉🏻 Sprzęt')).toEqual([
      h4('Oferujemy'),
      ul('Pracę zdalną', 'Szkolenia', 'Sprzęt'),
    ])
  })

  test('every bullet in the list starts an item, glued or spaced', () => {
    for (const bullet of DESCRIPTION_BULLETS) {
      expect(parseDescription(`Intro.${bullet}one ${bullet} two`), bullet).toEqual([p('Intro.'), ul('one', 'two')])
    }
  })

  test('lines starting with - or * are list items; an empty bullet is dropped', () => {
    expect(parseDescription('Stack\n- Playwright\n* SQL\n•\nThanks.')).toEqual([
      p('Stack'),
      ul('Playwright', 'SQL'),
      p('Thanks.'),
    ])
  })
})

describe('headings', () => {
  test('only count capitalised and as whole words', () => {
    expect(parseDescription('Your requirements: none. Obowiązkiem jest test.')).toEqual([
      p('Your requirements: none. Obowiązkiem jest test.'),
    ])
  })

  test('the longest heading wins', () => {
    expect(parseDescription('Intro. Co oferujemy: Pracę zdalną. Nasze wymagania: SQL.')).toEqual([
      p('Intro.'),
      h4('Co oferujemy'),
      p('Pracę zdalną.'),
      h4('Nasze wymagania'),
      p('SQL.'),
    ])
  })

  test('match across Polish letters (\\b is ASCII-only in JS)', () => {
    expect(parseDescription('Opis firmy.Twoje umiejętności:SQL.Zakres obowiązków:Testy.')).toEqual([
      p('Opis firmy.'),
      h4('Twoje umiejętności'),
      p('SQL.'),
      h4('Zakres obowiązków'),
      p('Testy.'),
    ])
  })

  test('a capitalised heading word mid-sentence stays text, whatever follows it', () => {
    expect(parseDescription('We list Benefits below and more. Benefits Remote work.')).toEqual([
      p('We list Benefits below and more.'),
      h4('Benefits'),
      p('Remote work.'),
    ])
    for (const text of [
      'Check the Requirements: below.',
      'Please check the Requirements: you need 3 years.',
      'Do you meet the Requirements? Great.',
      'Your main Benefits are listed below.',
      // A value after a colon, not a heading qualifier.
      'Location: Fully Remote Benefits: Remote work.',
    ]) {
      expect(parseDescription(text), text).toEqual([p(text)])
    }
    expect(parseDescription('Your main Benefits • Remote')).toEqual([p('Your main Benefits'), ul('Remote')])
  })

  test('capitalised words opening the sentence belong to the heading', () => {
    expect(
      parseDescription('About us. Key Responsibilities: Design tests. Technical Requirements: Playwright.'),
    ).toEqual([
      p('About us.'),
      h4('Key Responsibilities'),
      p('Design tests.'),
      h4('Technical Requirements'),
      p('Playwright.'),
    ])
    expect(parseDescription('Great team. Perks & Benefits: Remote work. Opis. Main Responsibilities • Testing')).toEqual([
      p('Great team.'),
      h4('Perks & Benefits'),
      p('Remote work. Opis.'),
      h4('Main Responsibilities'),
      ul('Testing'),
    ])
    expect(parseDescription('Minimum Requirements: 3 years')).toEqual([h4('Minimum Requirements'), p('3 years')])
  })

  test('a heading before a bullet or colon ends a list item that has no full stop', () => {
    expect(parseDescription('Stack • Testy API Oferujemy • Praca zdalna • Remote-first team Benefits: • Sprzęt')).toEqual([
      p('Stack'),
      ul('Testy API'),
      h4('Oferujemy'),
      ul('Praca zdalna', 'Remote-first team'),
      h4('Benefits'),
      ul('Sprzęt'),
    ])
  })

  test('unless a capitalised word before it could be its own: then it stays in the item', () => {
    expect(
      parseDescription('We build a SaaS product. Key Responsibilities: • Test the API • Write E2E tests Technical Requirements: • 3 years'),
    ).toEqual([
      p('We build a SaaS product.'),
      h4('Key Responsibilities'),
      ul('Test the API', 'Write E2E tests Technical Requirements:', '3 years'),
    ])
    // In an item, only a bullet or colon is strong enough; a capitalised word is not.
    expect(parseDescription('• Testy API Oferujemy Praca zdalna')).toEqual([ul('Testy API Oferujemy Praca zdalna')])
  })

  test('question headings keep their question mark', () => {
    expect(
      parseDescription('Dołącz do zespołu.Kogo szukamy?Osoby z doświadczeniem w testach.Co oferujemy?Pracę zdalną.'),
    ).toEqual([
      p('Dołącz do zespołu.'),
      h4('Kogo szukamy?'),
      p('Osoby z doświadczeniem w testach.'),
      h4('Co oferujemy?'),
      p('Pracę zdalną.'),
    ])
  })

  test('a heading on its own line, all caps', () => {
    expect(parseDescription('About us.\nREQUIREMENTS\nSQL and Git.')).toEqual([
      p('About us.'),
      h4('REQUIREMENTS'),
      p('SQL and Git.'),
    ])
  })
})

describe('text', () => {
  test('decodes the safe entity set once, leaving the rest as written', () => {
    expect(parseDescription('A &amp; B &lt;b&gt; &quot;Q&quot; it&#39;s&nbsp;ok &amp;lt; &copy;')).toEqual([
      p('A & B <b> "Q" it\'s ok &lt; &copy;'),
    ])
  })

  test('honours real line breaks, blank lines included', () => {
    expect(parseDescription('First one.\n\nSecond one.\r\nThird one.\rFourth one.')).toEqual([
      p('First one.'),
      p('Second one.'),
      p('Third one.'),
      p('Fourth one.'),
    ])
    // Never joined across a blank line, even when the next paragraph starts lower-case.
    expect(parseDescription('Kim jesteśmy\n\nfirma działa od 2010 roku')).toEqual([
      p('Kim jesteśmy'),
      p('firma działa od 2010 roku'),
    ])
  })

  test('lower-case lines after a heading stay separate', () => {
    expect(parseDescription('Wymagania:\nznajomość SQL\ndoświadczenie w testach API\nkomunikatywny angielski')).toEqual([
      h4('Wymagania'),
      p('znajomość SQL'),
      p('doświadczenie w testach API'),
      p('komunikatywny angielski'),
    ])
  })

  test('puts the space back into glued sentences without splitting names', () => {
    expect(parseDescription('Znamy SQL.Doświadczenie z ASP.NET i Node.JS jest plusem.Pracujemy zdalnie.')).toEqual([
      p('Znamy SQL. Doświadczenie z ASP.NET i Node.JS jest plusem. Pracujemy zdalnie.'),
    ])
  })

  test.each([null, undefined, '', '   \n  '])('%j has no blocks', (text) => {
    expect(parseDescription(text)).toEqual([])
  })
})

// The lists are copied from the Streamlit app, so read its source to catch drift.
test('bullets and headings mirror job_finder/app.py', () => {
  const bullets = /_DESCRIPTION_BULLETS\s*=\s*"([^"]*)"/.exec(appPy)?.[1]
  expect(DESCRIPTION_BULLETS.join('')).toBe(bullets)
  const headings = /_DESCRIPTION_HEADINGS\s*=\s*\(([^)]*)\)/.exec(appPy)?.[1] ?? ''
  expect([...DESCRIPTION_HEADINGS]).toEqual([...headings.matchAll(/"([^"]+)"/g)].map(([, heading]) => heading))
})
