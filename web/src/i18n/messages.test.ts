import { describe, expect, test } from 'vitest'
import { CATEGORY_ROWS, PENALTY_KEYS } from '../lib/score'
import { STATUSES } from '../lib/types'
import { en, type Messages } from './en'
import { pl } from './pl'

// A key missing from pl.ts must fail the build, not show up as "undefined" on screen.
// tsc checks test files too, so this line errors if Messages ever stops catching it.
const { app: _app, ...withoutApp } = pl
// @ts-expect-error -- `app` is missing
const incomplete: Messages = withoutApp

type Tree = { [key: string]: unknown }

// Every leaf as [path, kind]; functions are called with sample arguments to get their text.
function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') return [[path, value]]
    if (typeof value === 'function') return [[path, String(value(2, 4))]]
    return leaves(value as Tree, path)
  })
}

describe('message files', () => {
  test('pl has exactly the keys and value kinds of en', () => {
    const shape = (tree: Tree): unknown =>
      Object.fromEntries(
        Object.entries(tree).map(([key, value]) => [key, typeof value === 'object' ? shape(value as Tree) : typeof value]),
      )
    expect(shape(pl)).toEqual(shape(en))
    expect(incomplete).toBeDefined()
  })

  test.each([
    ['en', en],
    ['pl', pl],
  ] as const)('%s: nothing raw (enums, snake_case keys, "Error:") and nothing empty', (_lang, messages) => {
    for (const [path, text] of leaves(messages)) {
      expect(text.trim(), path).not.toBe('')
      expect(text, path).not.toMatch(/[A-Z]{2,}_[A-Z]|_penalty|\bError:|undefined|NaN|\[object/)
    }
  })

  test('cover every status, category and penalty', () => {
    for (const messages of [en, pl]) {
      expect(Object.keys(messages.status)).toEqual([...STATUSES])
      expect(Object.keys(messages.score.rows)).toEqual(CATEGORY_ROWS.map((row) => row.key))
      expect(Object.keys(messages.score.penalties)).toEqual([...PENALTY_KEYS])
    }
  })
})

describe('English copy the current e2e relies on', () => {
  test('list', () => {
    expect(en.offers.count(2, 4)).toBe('2 of 4 offers')
    expect(en.batch.summary(2, '2 h ago')).toBe('2 new · fetched 2 h ago')
    expect(en.sources.failedOne('Pracuj.pl')).toBe('Pracuj.pl failed')
    expect(en.sources.title).toBe('Sources')
    expect(en.offers.newBadge).toBe('New')
    expect(en.filters).toMatchObject({
      label: 'Filters', published: 'Published', status: 'Status', source: 'Source', minScore: 'Min score',
      anyScore: 'Any score', search: 'Search title or company',
    })
    expect(Object.values(en.filters.windows)).toEqual(['New', '24 h', '3 days', '7 days', 'Any time'])
    expect(en.status.APPLIED).toBe('Applied')
  })

  test('states (§4.10)', () => {
    expect(en.offers.emptyNew).toBe('No new offers from the last fetch')
    expect([true, false].map(en.offers.nextFetch)).toEqual(['Next fetch today around 12:00', 'Next fetch tomorrow around 12:00'])
    expect(en.offers.showRecent).toBe('Show last 3 days')
    expect(en.offers.empty).toBe('No offers match these filters')
    expect(en.batch.reviewed(1, 2)).toBe('Reviewed 1 of 2')
    expect(en.filters.show(1)).toBe('Show 1 offer')
    expect(en.summary.openBest).toBe('Open best match')
  })

  test('details', () => {
    expect(en.details).toMatchObject({
      label: 'Offer details', back: 'Back to list', close: 'Close details', previous: 'Previous offer',
      next: 'Next offer', rate: 'Rate you quoted', notice: 'Notice period you gave', save: 'Save', saved: 'Saved.',
      interested: 'Mark as interested', dismiss: 'Not for me', status: 'Status',
    })
    expect(en.details.position(3, 12)).toBe('3 / 12')
    expect(en.score.matchedKeywords).toBe('Matched keywords')
    expect(en.toast.status(en.status.APPLIED)).toBe('Status: Applied')
    expect(en.toast.statusFailed).toBe("Couldn't save the status")
    expect(en.salary.above('15 000')).toBe('Above your 15 000 PLN threshold')
  })

  test('singular and plural', () => {
    expect(en.offers.count(1, 1)).toBe('1 of 1 offer')
    expect(en.score.penalties.stale_offer_penalty(1)).toBe('Older than 1 day')
    expect(en.score.penalties.stale_offer_penalty(10)).toBe('Older than 10 days')
    expect(en.sources.partialCount(1)).toBe('1 source partial')
  })
})

describe('plan tables', () => {
  test('status labels (§2.4)', () => {
    expect(Object.values(en.status)).toEqual([
      'To review', 'Reviewed', 'Interested', 'CV ready', 'Ready to apply', 'Applied', 'Interview', 'Rejected', 'Withdrawn',
      'Not for me',
    ])
    expect(Object.values(pl.status)).toEqual([
      'Do przejrzenia', 'Przejrzana', 'Interesuje mnie', 'CV gotowe', 'Gotowe do wysłania', 'Wysłano', 'Rozmowa',
      'Odrzucona', 'Wycofana', 'Nie dla mnie',
    ])
  })

  test('band words (§2.3)', () => {
    expect(en.score.bands).toEqual({
      top: 'Top match', strong: 'Strong match', fair: 'Fair match', low: 'Low match', none: 'Not scored',
    })
    expect(pl.score.bands).toEqual({
      top: 'Świetne dopasowanie', strong: 'Dobre dopasowanie', fair: 'Średnie dopasowanie', low: 'Słabe dopasowanie',
      none: 'Bez oceny',
    })
  })

  test('breakdown rows and penalties (§4.8)', () => {
    expect(Object.values(en.score.rows)).toEqual([
      'Role', 'Technologies', 'Domain', 'Remote', 'Contract', 'Seniority', 'English', 'AI', 'Freshness', 'Salary bonus',
    ])
    expect(PENALTY_KEYS.map((key) => en.score.penalties[key](10))).toEqual([
      '"Automation" in title', 'Programming language in title', 'Older than 10 days',
    ])
  })

  test('source errors and the load error (§4.10)', () => {
    expect(en.sources.errors.blocked(403)).toBe('Blocked by the board (403)')
    expect(en.sources.errors.timeout(null)).toBe('Timed out')
    expect(en.sources.errors.unexpected(null)).toBe('Unexpected error')
    expect(en.sources.partial).toBe("Some offers couldn't be read")
    expect(en.offers.loadError).toBe("Couldn't load offers. Check your connection.")
    expect(['found', 'new', 'seconds'].map((key) => en.sources.stats[key as 'found'](key === 'seconds' ? 4.2 : 12)))
      .toEqual(['12 found', '12 new', '4.2 s'])
    expect(pl.sources.stats.seconds(4.2)).toBe('4,2 s')
    expect([1, 3, 12].map((count) => pl.sources.stats.found(count))).toEqual([
      '1 znaleziona', '3 znalezione', '12 znalezionych',
    ])
  })

  test('salary periods (§5)', () => {
    expect(en.salary.periods).toEqual({ hour: '/h', day: '/day', month: '/month', year: '/year' })
    expect(pl.salary.periods).toEqual({ hour: '/godz.', day: '/dzień', month: '/mies.', year: '/rok' })
  })
})

describe('Polish plurals (one / few / many)', () => {
  test.each([
    [1, '1 nowa', '1 z 1 oferty', '1 dzień temu'],
    [2, '2 nowe', '2 z 2 ofert', '2 dni temu'],
    [5, '5 nowych', '5 z 5 ofert', '5 dni temu'],
    [12, '12 nowych', '12 z 12 ofert', '12 dni temu'],
    [22, '22 nowe', '22 z 22 ofert', '22 dni temu'],
    [25, '25 nowych', '25 z 25 ofert', '25 dni temu'],
  ])('%i', (n, newCount, count, daysAgo) => {
    expect(pl.common.newCount(n)).toBe(newCount)
    expect(pl.offers.count(n, n)).toBe(count)
    expect(pl.time.daysAgo(n)).toBe(daysAgo)
  })

  test.each([
    [1, '1 źródło z błędem', '1 źródło niepełne', 'Wyświetlamy tylko pierwszą ofertę'],
    [2, '2 źródła z błędem', '2 źródła niepełne', 'Wyświetlamy pierwsze 2 oferty'],
    [5, '5 źródeł z błędem', '5 źródeł niepełnych', 'Wyświetlamy pierwsze 5 ofert'],
    [12, '12 źródeł z błędem', '12 źródeł niepełnych', 'Wyświetlamy pierwsze 12 ofert'],
    [22, '22 źródła z błędem', '22 źródła niepełne', 'Wyświetlamy pierwsze 22 oferty'],
    [25, '25 źródeł z błędem', '25 źródeł niepełnych', 'Wyświetlamy pierwsze 25 ofert'],
  ])('%i sources', (n, failed, partial, showing) => {
    expect(pl.sources.failedMany(n)).toBe(failed)
    expect(pl.sources.partialCount(n)).toBe(partial)
    expect(pl.offers.showingFirst(n)).toBe(showing)
  })

  test.each([
    [1, '1 source failed'],
    [2, '2 sources failed'],
  ])('%i failed sources in English', (count, english) => {
    expect(en.sources.failedMany(count)).toBe(english)
  })

  test.each([
    [1, '1 kategoria bez punktów', '1 category with no points'],
    [3, '3 kategorie bez punktów', '3 categories with no points'],
    [5, '5 kategorii bez punktów', '5 categories with no points'],
  ])('%i folded breakdown rows', (n, polish, english) => {
    expect(pl.score.zeroRows(n)).toBe(polish)
    expect(en.score.zeroRows(n)).toBe(english)
  })

  test('large numbers keep pl-PL grouping', () => {
    expect(pl.offers.showingFirst(2000)).toBe('Wyświetlamy pierwsze 2\u00a0000 ofert')
    expect(en.offers.showingFirst(2000)).toBe('Showing the first 2\u00a0000 offers')
  })

  test('the list header and ages read naturally', () => {
    expect(pl.batch.summary(2, '2 godz. temu')).toBe('2 nowe · pobrano 2 godz. temu')
    expect(pl.batch.summary(1, '3 min temu')).toBe('1 nowa · pobrano 3 min temu')
    expect([1, 2, 5].map(pl.filters.show)).toEqual(['Pokaż 1 ofertę', 'Pokaż 2 oferty', 'Pokaż 5 ofert'])
    expect(pl.score.penalties.stale_offer_penalty(10)).toBe('Starsza niż 10 dni')
    expect(pl.time.hours(3)).toBe('3 godz.')
  })
})
