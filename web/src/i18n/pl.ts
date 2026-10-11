import type { Messages } from './en'
import { formatNumber, plPlural } from './intl'

// Polish UI copy. Typed as Messages, so a missing or extra key fails tsc.
// Informal "Ty" (§2.1) without gendered verb forms ("podałeś/podałaś").

const n = (value: number, digits = 0) => formatNumber(value, 'pl', digits)
const days = (count: number) => plPlural(count, 'dzień', 'dni', 'dni')
// "1 nowa, 2 nowe, 5 nowych" (oferta is feminine).
const newOffers = (count: number) => `${n(count)} ${plPlural(count, 'nowa', 'nowe', 'nowych')}`

export const pl: Messages = {
  common: {
    loading: 'Wczytywanie…',
    tryAgain: 'Spróbuj ponownie',
    technicalDetails: 'Szczegóły techniczne',
    newCount: newOffers,
  },
  app: {
    signOut: 'Wyloguj się',
    checkingAccess: 'Sprawdzanie dostępu…',
    accessError: 'Nie udało się sprawdzić dostępu. Odśwież stronę.',
    noAccess: 'To konto nie ma jeszcze dostępu.',
  },
  login: {
    tagline: 'Oferty QA ocenione pod Ciebie.',
    email: 'E-mail',
    send: 'Wyślij link do logowania',
    sending: 'Wysyłanie…',
    sent: { before: 'Sprawdź skrzynkę — wysłaliśmy link do logowania na adres ', after: '.' },
    errors: {
      privateBeta: 'JOffers jest w zamkniętej becie, a tego adresu nie ma jeszcze na liście.',
      rateLimit: 'Zbyt wiele prób. Odczekaj minutę.',
      invalidEmail: 'Wpisz poprawny adres e-mail.',
      generic: 'Nie udało się wysłać linku. Spróbuj ponownie.',
    },
  },
  offers: {
    loading: 'Wczytywanie ofert…',
    loadError: 'Nie udało się wczytać ofert. Sprawdź połączenie.',
    lastFetch: (ago, newCount) => `Ostatnie pobranie ${ago} · ${newOffers(newCount)}`,
    lastFetchUndated: (newCount) => `Ostatnie pobranie · ${newOffers(newCount)}`,
    noFetch: 'Jeszcze nic nie pobrano',
    failedSources: (names) => `nie pobrano: ${names}`,
    // "z 1 oferty", "z 4 ofert": genitive after "z".
    count: (shown, total) => `${n(shown)} z ${n(total)} ${plPlural(total, 'oferty', 'ofert', 'ofert')}`,
    showingFirst: (count) =>
      plPlural(count, 'Wyświetlamy tylko pierwszą ofertę', `Wyświetlamy pierwsze ${n(count)} oferty`,
        `Wyświetlamy pierwsze ${n(count)} ofert`),
    empty: 'Żadna oferta nie pasuje do tych filtrów.',
    newBadge: 'NOWA',
  },
  filters: {
    label: 'Filtry',
    published: 'Opublikowano',
    windows: {
      any: 'Kiedykolwiek',
      // Short enough for the half-width select on a phone.
      '24h': 'Ostatnia doba',
      '3d': 'Ostatnie 3 dni',
      '7d': 'Ostatnie 7 dni',
    },
    status: 'Status',
    allStatuses: 'Każdy status',
    source: 'Źródło',
    allSources: 'Każde źródło',
    minScore: 'Min. wynik',
    search: 'Szukaj stanowiska lub firmy',
    sortLabel: 'Sortowanie',
    sort: { score: 'Najlepiej dopasowane', newest: 'Najnowsze', salary: 'Najwyższe wynagrodzenie' },
  },
  status: {
    TO_REVIEW: 'Do przejrzenia',
    REVIEW: 'Przejrzana',
    INTERESTED: 'Interesuje mnie',
    CV_GENERATED: 'CV gotowe',
    READY_TO_APPLY: 'Gotowe do wysłania',
    APPLIED: 'Wysłano',
    INTERVIEW: 'Rozmowa',
    REJECTED: 'Odrzucona',
    WITHDRAWN: 'Wycofana',
  },
  statusGroups: {
    triage: 'Selekcja',
    preparing: 'Przygotowanie',
    active: 'W toku',
    closed: 'Zamknięte',
  },
  details: {
    label: 'Szczegóły oferty',
    back: '← Wróć do listy',
    published: (ago) => `opublikowano ${ago}`,
    publishedUnknown: 'Brak daty publikacji',
    openOffer: 'Otwórz oryginalną ofertę',
    status: 'Status',
    rate: 'Zaproponowana stawka',
    ratePlaceholder: 'np. 120 PLN/godz. B2B',
    notice: 'Podany okres wypowiedzenia',
    noticePlaceholder: 'np. 1 miesiąc',
    save: 'Zapisz',
    saving: 'Zapisywanie…',
    saved: 'Zapisano.',
    saveError: 'Nie udało się zapisać. Spróbuj ponownie.',
    score: (score) => `Wynik ${score}`,
    matched: (terms) => `Dopasowane: ${terms}`,
    description: 'Opis',
    noDescription: 'Brak opisu.',
    loadError: 'Nie udało się wczytać szczegółów. Sprawdź połączenie i otwórz ofertę ponownie.',
  },
  salary: {
    notListed: 'Brak widełek',
    periods: { hour: '/godz.', day: '/dzień', month: '/mies.', year: '/rok' },
    approxMonthly: (amount) => `≈ ${amount} PLN/mies.`,
  },
  score: {
    bands: {
      top: 'Świetne dopasowanie',
      strong: 'Dobre dopasowanie',
      fair: 'Średnie dopasowanie',
      low: 'Słabe dopasowanie',
      none: 'Bez oceny',
    },
    rows: {
      role: 'Stanowisko',
      technology: 'Technologie',
      domain: 'Branża',
      remote: 'Praca zdalna',
      contract: 'Umowa',
      seniority: 'Poziom',
      language: 'Angielski',
      ai: 'AI',
      freshness: 'Świeżość',
      salary_bonus: 'Bonus za wynagrodzenie',
    },
    penalties: {
      title_automation_penalty: () => '„Automation” w tytule',
      title_programming_language_penalty: () => 'Język programowania w tytule',
      stale_offer_penalty: (count) => `Starsza niż ${count} ${days(count)}`,
    },
    ring: (score, band) => `Wynik ${score} na 100, ${band}`,
    breakdown: 'Składowe wyniku',
    points: (points, max) => `${points} / ${max}`,
    zeroRows: (count) =>
      `${n(count)} ${plPlural(count, 'kategoria', 'kategorie', 'kategorii')} bez punktów`,
    total: (total, max) => `Razem ${total} / ${max}`,
    capped: 'ograniczone do 100',
    floored: 'podniesione do 0',
    matchedKeywords: 'Dopasowane słowa kluczowe',
    hardExclusions:
      'Odrzucane przed oceną: oferty bez pracy zdalnej, stanowiska juniorskie (chyba że stawka jest wysoka) i oferty z technologiami z Twojej listy wykluczeń.',
  },
  sources: {
    title: 'Źródła',
    errors: {
      blocked: (status) => (status ? `Zablokowane przez portal (${status})` : 'Zablokowane przez portal'),
      timeout: () => 'Przekroczono limit czasu',
      unexpected: (status) => (status ? `Nieoczekiwany błąd (${status})` : 'Nieoczekiwany błąd'),
    },
    partial: 'Części ofert nie udało się odczytać',
    stats: {
      // Number first, like the stats beside it: "12 znalezionych · 3 nowe · 4,2 s".
      found: (count) => `${n(count)} ${plPlural(count, 'znaleziona', 'znalezione', 'znalezionych')}`,
      new: newOffers,
      seconds: (seconds) => `${n(seconds, 1)} s`,
    },
    failedOne: (name) => `${name}: błąd`,
    failedMany: (count) => `${n(count)} ${plPlural(count, 'źródło', 'źródła', 'źródeł')} z błędem`,
    partialCount: (count) =>
      `${n(count)} ${plPlural(count, 'źródło niepełne', 'źródła niepełne', 'źródeł niepełnych')}`,
  },
  time: {
    justNow: 'przed chwilą',
    minutesAgo: (count) => `${count} min temu`,
    hoursAgo: (count) => `${count} godz. temu`,
    daysAgo: (count) => `${count} ${days(count)} temu`,
    now: 'teraz',
    minutes: (count) => `${count} min`,
    hours: (count) => `${count} godz.`,
    days: (count) => `${count} ${days(count)}`,
    unknown: 'brak daty',
  },
}
