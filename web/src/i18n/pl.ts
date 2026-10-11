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
    close: 'Zamknij',
    // Not "Odrzuć": beside a status toast it would read like the Rejected status.
    dismiss: 'Zamknij',
    retry: 'Ponów',
    undo: 'Cofnij',
  },
  app: {
    signOut: 'Wyloguj się',
  },
  login: {
    title: 'Zaloguj się',
    tagline: 'Oferty QA ocenione pod Ciebie.',
    email: 'E-mail',
    hint: 'Bez hasła. Wyślemy Ci jednorazowy link.',
    send: 'Wyślij link do logowania',
    sent: { before: 'Sprawdź skrzynkę — wysłaliśmy link do logowania na adres ', after: '.' },
    resent: { before: 'Wysłaliśmy nowy link do logowania na adres ', after: '.' },
    anyDevice: 'Działa na każdym urządzeniu. Zajrzyj też do spamu.',
    openGmail: 'Otwórz Gmaila',
    resend: 'Wyślij ponownie',
    resendIn: (seconds: number) => `Wyślij ponownie za ${seconds} s`,
    differentEmail: 'Użyj innego adresu',
    haveCode: 'Masz kod? Wpisz go',
    code: 'Sześciocyfrowy kod',
    codeHint: 'Znajdziesz go w tym samym e-mailu co link.',
    verify: 'Zaloguj się',
    notices: {
      linkExpired: 'Ten link do logowania wygasł albo został już użyty. Wyślij nowy.',
      sessionExpired: 'Twoja sesja wygasła. Zaloguj się ponownie.',
    },
    requestAccess: 'Poproś o dostęp',
    requestBody: (email: string) => `Cześć, proszę o dostęp do JOffers dla adresu ${email}.`,
    errors: {
      privateBeta: 'JOffers jest w zamkniętej becie.',
      rateLimit: 'Zbyt wiele prób. Odczekaj minutę.',
      invalidEmail: 'Wpisz poprawny adres e-mail.',
      generic: 'Nie udało się wysłać linku. Spróbuj ponownie.',
      invalidCode: 'Ten kod jest błędny albo wygasł. Sprawdź go lub wyślij nowy link.',
      codeFailed: 'Nie udało się zalogować tym kodem. Spróbuj ponownie.',
    },
  },
  accessGate: {
    noAccess: 'To konto nie ma jeszcze dostępu.',
    privateBeta: 'JOffers jest w zamkniętej becie.',
    signedInAs: (email: string) => `Zalogowano jako ${email}`,
    requestAccess: 'Poproś o dostęp',
    requestBody: (email: string) => `Cześć, proszę o dostęp do JOffers dla adresu ${email}.`,
    signOut: 'Wyloguj się',
    checkHeading: 'Sprawdzanie dostępu',
    checkFailed: 'Nie udało się sprawdzić dostępu.',
    retry: 'Spróbuj ponownie',
  },
  privacy: {
    title: 'Polityka prywatności',
    updated: (date: string) => `Ostatnia aktualizacja: ${date}`,
    back: 'Wróć do JOffers',
    signOut: 'Wyloguj się',
    signOutFailed: 'Nie udało się wylogować. Sprawdź połączenie.',
    intro:
      'JOffers ocenia oferty pracy QA dla niewielkiej grupy osób z zamkniętej bety. Tu wyjaśniamy, jakich Twoich danych osobowych używa aplikacja, po co i co możesz z tym zrobić.',
    controller: {
      heading: 'Kto odpowiada za Twoje dane',
      body: (name: string) => `Administratorem Twoich danych osobowych jest ${name}, osoba prowadząca JOffers.`,
      unnamed: 'Administratorem Twoich danych osobowych jest osoba prowadząca JOffers.',
      contact: 'Pytania i wnioski:',
    },
    data: {
      heading: 'Jakich danych używamy',
      email: 'Twój adres e-mail — do logowania. Na ten adres wysyłamy linki i kody logowania.',
      tracking:
        'To, co zapisujesz przy ofertach: status oferty (np. Wysłano, Rozmowa), podaną stawkę, okres wypowiedzenia i datę pierwszego oznaczenia oferty jako wysłanej.',
      logs: 'Logi techniczne prowadzone przez usługi wymienione niżej, np. adresy IP i czas zapytań.',
      offers: 'Same oferty pochodzą z publicznych portali z ogłoszeniami i nie są danymi o Tobie.',
    },
    basis: {
      heading: 'Po co i na jakiej podstawie',
      account:
        'Żeby prowadzić Twoje konto i udostępniać Ci aplikację, z której chcesz korzystać: art. 6 ust. 1 lit. b RODO (wykonanie umowy).',
      security:
        'Żeby chronić usługę przed nadużyciami, dzięki logom bezpieczeństwa prowadzonym przez nasze podmioty przetwarzające: art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes).',
    },
    processors: {
      heading: 'Kto przetwarza dane w naszym imieniu',
      intro: 'JOffers korzysta z tych usług jako podmiotów przetwarzających:',
      supabase: 'baza danych i logowanie. Twoje dane są przechowywane w UE (AWS eu-west-1, Irlandia).',
      google: 'serwer SMTP Gmaila wysyła e-maile do logowania i codzienne podsumowanie.',
      github: 'hostuje aplikację na GitHub Pages i prowadzi logi zapytań, w tym adresy IP.',
      transfers:
        'Google i GitHub mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym, z zabezpieczeniami opisanymi w ich własnych warunkach.',
    },
    storage: {
      heading: 'Co JOffers zapisuje w Twojej przeglądarce',
      intro: 'JOffers nie używa plików cookie. Zapisuje te wpisy w pamięci lokalnej przeglądarki (local storage):',
      entry: 'Wpis',
      purpose: 'Do czego służy',
      purposes: {
        'joffers-auth': 'Utrzymuje Twoją sesję logowania (Supabase).',
        'joffers-theme': 'Wybrany motyw: automatyczny, jasny lub ciemny.',
        'joffers-lang': 'Wybrany język.',
        'joffers-filters': 'Twoje filtry i sortowanie listy.',
        'joffers-seen': 'Otwarte oferty, dopóki nie zapiszą się na Twoim koncie.',
        'joffers-shortcuts': 'Czy skróty klawiszowe są włączone.',
      },
      clear: 'Wylogowanie usuwa Twoją sesję, a wyczyszczenie danych tej strony w przeglądarce usuwa resztę.',
    },
    noTracking: {
      heading: 'Bez analityki i reklam',
      body: 'JOffers nie ma analityki, reklam ani śledzenia. Nigdy nie sprzedajemy Twoich danych i nie używamy ich do marketingu.',
    },
    retention: {
      heading: 'Jak długo przechowujemy dane',
      account: 'Konto i dane zapisane przy ofertach: dopóki nie poprosisz o ich usunięcie.',
      offers: 'Oferty, przy których nic nie zapisano: wygasają 14 dni po zniknięciu z portalu.',
      logs: 'Logi usług wymienionych wyżej: zgodnie z ich własnymi zasadami.',
    },
    rights: {
      heading: 'Twoje prawa',
      list: 'Możesz zażądać dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania lub przeniesienia, a także wnieść sprzeciw wobec przetwarzania opartego na prawnie uzasadnionym interesie.',
      how: 'Żeby skorzystać z tych praw, napisz na adres',
      complaint: 'Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych (PUODO):',
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
    clearSearch: 'Wyczyść wyszukiwanie',
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
  toast: {
    status: (label) => `Status: ${label}`,
    statusFailed: 'Nie udało się zapisać statusu',
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
  shell: {
    skipToOffers: 'Przejdź do ofert',
    heading: 'Oferty',
    account: 'Konto',
    signedInAs: 'Zalogowano jako',
    language: 'Język',
    signOut: 'Wyloguj się',
  },
  theme: {
    label: 'Motyw',
    options: { auto: 'Automatyczny', light: 'Jasny', dark: 'Ciemny' },
  },
  notFound: {
    title: 'Nie znaleziono strony',
    body: 'Ta strona nie istnieje albo została przeniesiona.',
    home: 'Przejdź do JOffers',
  },
  offline: {
    message: 'Jesteś offline. Połącz się, aby wczytać oferty i zapisać zmiany.',
  },
  boot: {
    failed: 'Nie udało się wczytać JOffers. Sprawdź połączenie.',
    reload: 'Wczytaj ponownie',
  },
}
