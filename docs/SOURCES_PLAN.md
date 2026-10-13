# Plan: rozszerzenie źródeł o międzynarodowy remote

Status: **zaplanowane, nie rozpoczęte** (2026-10-14).
Otwarta decyzja: oferty z ograniczeniem regionu („US only” itp.) — twarde wykluczenie (rekomendacja) czy tylko kara punktowa?

## Kontekst
Obecne źródła: 6 polskich (NFJ, Pracuj, JustJoin, Bulldog, TestDevJobs, Eldorado) + RemoteOK i We Work Remotely (głównie USA).
Brakuje remote z Europy/EMEA i ofert bezpośrednio od firm. Nowe źródło = plik w `job_finder/sources/` + wpis w `job_finder/collector.py` (lista źródeł).

## Etap 0 — filtr kwalifikowalności regionu (fundament)
- `infer_remote` w `job_finder/sources/web_utils.py` uznaje „Remote – US only” za remote.
- Nowy helper w `web_utils.py` analizujący `location` + `description`:
  - odrzuca: US only, must be based in US/UK, North America, LATAM, APAC, Canada only;
  - przepuszcza: Worldwide, Anywhere, Europe, EU, EMEA, Poland, CET.
- Lista fraz w `config/profile.yaml` (nowa sekcja w `hard_exclusions`), bez zmian schematu bazy.
- Od razu czyści RemoteOK i WWR.

## Etap 1 — portale remote z publicznym API (adaptery wzorem `remoteok.py`)
1. Himalayas — `himalayas.app/jobs/api`, pole `locationRestrictions`.
2. Remotive — `remotive.com/api/remote-jobs?category=qa`, pole `candidate_required_location`.
3. Jobicy — `jobicy.com/api/v2/remote-jobs?geo=europe`.
- Później ewentualnie: Working Nomads (`workingnomads.com/api/exposed_jobs/`), Arbeitnow (`arbeitnow.com/api/job-board-api`).
- Przed implementacją sprawdzić ToS każdego API (limity, wymóg atrybucji).

## Etap 2 — ATS-y firm (największy zysk)
- `job_finder/sources/ats.py`: źródła Greenhouse, Lever, Ashby (Workable później).
  - Greenhouse: `boards-api.greenhouse.io/v1/boards/{slug}/jobs`
  - Lever: `api.lever.co/v0/postings/{slug}?mode=json`
  - Ashby: `api.ashbyhq.com/posting-api/job-board/{slug}`
- Lista firm w `config/companies.yaml`: `{name, ats, slug}`; rozbudowa bez zmian w kodzie.
- W UI 3 źródła (nie per firma); błąd jednej firmy → `errors`, nie wywraca źródła.
- Filtr tytułu `looks_like_qa_role` przed szczegółami.
- Start: ~30 firm remote-first zatrudniających w Europie, slugi zweryfikowane żywym zapytaniem do API.
- Katalog firm do ręcznego przeglądania: startup.jobs (link „Apply” zdradza ATS i slug). Nie scrapować startup.jobs — brak API, 403 dla botów, robots.txt.

## Etap 3 — opcjonalnie
- HN „Who is hiring” przez Algolia API (`hn.algolia.com/api/v1`) — miesięcznie, tekst bez struktury.
- Maile z alertów LinkedIn przez Gmail IMAP — wymaga hasła aplikacji jako sekretu w GitHub; nie scrapować LinkedIn.

## Do sprawdzenia przy okazji
- Waluty: próg pensji w scoringu w PLN, nowe źródła podają USD/EUR — czy jest przeliczanie?
- Duplikaty między agregatorem a ATS — przy duplikacie preferować bezpośredni link z ATS.
- `published_at` z każdego ATS (wpływa na recency i karę za stare oferty).
- Czy web app nie ma zakodowanej na sztywno listy źródeł.

## Tryb pracy
Etap = osobny commit z testami (wzorem `tests/test_remote_sources.py`). Lean: główna pętla, bez dużych workflowów.
Zatrzymanie po każdym etapie na weryfikację po fetchu o 18:00.
