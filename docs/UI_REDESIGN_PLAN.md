# JOffers redesign plan (v2)

**For the executing session:** the app is in `/Users/michalszuryga/Documents/Projects/Personal/JOffers/Job-offers/web`. Stack: Vite 8, React 19, TS 6, supabase-js. It is hosted on GitHub Pages under `BASE_PATH=/Job-offers/`.

**Scripts** (run in `web/`; §6 defines any that are missing):
- `npm run lint`
- `npm run build`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:screens`
- `npm run test:visual`

Python tests: `pytest -q` in the repo root.

**Do not break:**
- The implicit magic-link flow lands on `BASE_URL` with `#access_token`, and `emailRedirectTo` stays `origin + BASE_URL`.
- All writes go through rpc `save_offer_tracking` only.
- Descriptions are rendered as text nodes only.
- Filters stay in localStorage.
- Sign-up stays closed (`shouldCreateUser:false`).

---

## 1. Goal and success criteria

**Goal:** a trustworthy, product-grade JOffers that serves three groups: the owner's 18:00 phone routine, recruiters arriving from GitHub, and future paying users.

| # | Criterion | Check |
|---|---|---|
| 1 | Nothing raw on screen: no enums, snake_case, raw Supabase errors or Vite assets | e2e plus a grep for `TO_REVIEW\|_penalty` in the rendered text |
| 2 | Phone density (Pixel 7, default view, BatchHeader visible): first `.offer` top ≤ 200 px (budget: app bar 56 + BatchHeader 64 + toolbar 52 + count 24), and ≥ 4 cards fully visible | `states.spec` |
| 3 | Daily loop: tapping the push opens the "New" view. Push → first offer details takes ≤ 2 taps. A status change takes ≤ 2 taps with no Save. Back gesture or Esc closes details and the URL loses `?offer=` | e2e |
| 4 | Score readable at a glance: 4 bands plus a band word. The breakdown adds up to the score, and every label matches `scoring.py` | unit + e2e |
| 5 | WCAG 2.2 AA: axe 0 serious/critical on landing, list, details, demo, privacy and kit, light and dark. 44 px touch targets. Focus is never hidden behind sticky bars or toasts (2.4.11) | `a11y.spec`, `kit.spec` |
| 6 | Lighthouse mobile on the prerendered landing: Perf ≥ 90, A11y 100, BP ≥ 95, SEO ≥ 95 | manual, recorded in the PR |
| 7 | Initial JS per route, gzip, from the Vite manifest: app ≤ 160 KB, landing ≤ 90 KB, demo ≤ 120 KB. No supabase-js in the landing or demo graphs. CSS ≤ 20 KB. Fonts ≤ the measured P1 figure + 10% | `check-bundle.mjs` in both workflows |
| 8 | Product surface: landing, demo, privacy, OG, manifest, theme, PL/EN, routing under the real base path | e2e (`pages` project) + manual |
| 9 | Visual baselines: list and details × phone/desktop × light/dark | `visual.spec` (opt-in CI job) |

---

## 2. Design direction

### 2.1 Brand

**Mark:** a 32×32 squircle (`rx=9`) with fill `linear-gradient(135deg,#4B3BE8,#8B5CF6)`. On it, a white "match ring" and a white J. It echoes ScoreRing.
- Ring: `r=10`, stroke 2.5, dasharray `50.3 12.6`, rotated −90°, round caps.
- J: `M18.5 10.5v6.5a3.5 3.5 0 0 1-7 0`, stroke 3.

**Wordmark:** "JOffers", Inter 700, −0.03em. Logo = mark + wordmark with a 10 px gap.

**Gradient** is used only in the mark, the hero glow and `og.png`.

**Voice:** numbers first, second person, informal "Ty" in Polish. Never write "Error:" followed by raw text.
- "2 new · fetched 2 h ago" / "2 nowe · pobrano 2 godz. temu".
- Positioning line: "QA jobs, scored for you." / "Oferty QA ocenione pod Ciebie."
- Badge: "Private beta".

### 2.2 Colour tokens

Tokens live in `web/src/styles/tokens.css`, which is the only file with hex values. `contrast.test.ts` parses this file and asserts every fg/bg pair that components use: text ≥ 4.5, UI ≥ 3.

```css
:root{color-scheme:light dark}
:root[data-theme=light]{color-scheme:light}
:root[data-theme=dark]{color-scheme:dark}
:root{
--canvas:light-dark(#F5F6FA,#0A0C14);   --surface:light-dark(#FFFFFF,#131726);
--surface-2:light-dark(#EEF0F5,#1A1F31); --surface-raised:light-dark(#FFFFFF,#20263A);
--line:light-dark(#E4E7EF,#252B3D);      /* decorative only */
--line-strong:light-dark(#737B8F,#727C92);/* control borders: 3.71 on light surface-2; 3.58 on dark raised, 4.26 on dark surface */
--fg:light-dark(#0E1120,#E6E9F2);        --fg-muted:light-dark(#586074,#99A1B5); /* ≥5.4:1 everywhere */
--brand:light-dark(#4B3BE8,#9A90FF);     --brand-hover:light-dark(#3B2BC9,#B0A8FF);
--on-brand:light-dark(#FFFFFF,#0A0C14);  --brand-tint:light-dark(#EEECFF,#211C47);
--brand-ink:light-dark(#4B3BE8,#A99FFF); --focus:var(--brand);
--success:light-dark(#047857,#3DD68C);   --success-tint:light-dark(#E1F5EC,#0F2A20);
--info:light-dark(#0369A1,#5BB6F2);      --info-tint:light-dark(#E2EFFA,#0D2335);
--warning:light-dark(#9A5B00,#F0B44C);   --warning-tint:light-dark(#FCF1DC,#2D2210);
--danger:light-dark(#B42318,#FF8A80);    --danger-tint:light-dark(#FDECEA,#2E1517);
}
```

### 2.3 Score bands (`lib/score.ts`)

The thresholds are fixed product constants that match the Min score presets. The number is always `--fg`. The ring stroke uses the band colour and the track uses the band tint. The band word is always shown.

| Band | Range | EN / PL | Colour | Tint |
|---|---|---|---|---|
| top | 80–100 | Top match / Świetne dopasowanie | `--success` | `--success-tint` |
| strong | 65–79 | Strong match / Dobre dopasowanie | `--info` | `--info-tint` |
| fair | 50–64 | Fair match / Średnie dopasowanie | `--warning` | `--warning-tint` |
| low | 0–49 | Low match / Słabe dopasowanie | `--fg-muted` | `--surface-2` |
| none | null | Not scored / Bez oceny | dashed `--line-strong`, "–" | — |

### 2.4 Status labels (`lib/status.ts`)

Each status renders as a pill: a 6 px dot plus the label.

| Enum | EN | PL | Tone |
|---|---|---|---|
| TO_REVIEW | To review | Do przejrzenia | surface-2 / fg-muted |
| REVIEW | Reviewed | Przejrzana | surface-2 / fg-muted |
| INTERESTED | Interested | Interesuje mnie | brand-tint / brand-ink |
| CV_GENERATED | CV ready | CV gotowe | brand-tint / brand-ink |
| READY_TO_APPLY | Ready to apply | Gotowe do wysłania | brand-tint / brand-ink |
| APPLIED | Applied | Wysłano | info-tint / info |
| INTERVIEW | Interview | Rozmowa | success-tint / success |
| REJECTED | Rejected | Odrzucona | danger-tint / danger |
| WITHDRAWN | Withdrawn | Wycofana | `--line-strong` border / fg-muted |

**Optgroups:**
- Triage: TO_REVIEW, REVIEW
- Preparing: INTERESTED, CV_GENERATED, READY_TO_APPLY
- Active: APPLIED, INTERVIEW
- Closed: REJECTED, WITHDRAWN

**"New" badge:** solid `--brand` background, `--on-brand` text, 12/16 700, uppercase via CSS, radius 6.

### 2.5 Typography

Inter Variable from `@fontsource-variable/inter`, latin + latin-ext through `unicode-range`, with `font-display:swap`. The fallback is a metric-matched `@font-face "Inter Fallback"` (`src:local(Arial)`, size-adjust ≈107%, ascent/descent overrides via the fontaine values), then `system-ui`. Use tabular-nums for numbers. Inputs are 16 px.

| Token | Size/line | Weight | Use |
|---|---|---|---|
| display | 48/52 (phone 36/40) | 700, −0.03em | landing H1 |
| h1 | 30/36 (phone 24/30) | 700 | page titles |
| h2 | 22/28 | 650 | details title |
| h3 | 17/24 | 600 | sections |
| h4 | 15/22 | 650 | description headings |
| title | 16/22 | 650 unread / 500 otherwise | card title |
| body-lg | 17/28 (phone 16/26) | 400 | description, 68ch |
| body | 15/22 | 400–500 | UI |
| sm | 13/18 | 500 | meta |
| xs | 12/16 | 600, +0.02em | badges |
| num-lg | 28/1 | 700 | details score |

### 2.6 Spacing, radius, elevation, motion

- **Spacing** 4–64 px. Gutters: 16 (<640), 24 (640–1023), 32 (≥1024). Cards are 14/16 padding with a gap of 8.
- **Radius:** sm 6, md 10, lg 14, xl 20 (sheets and panes), full.
- **Shadows:** `--shadow-card` is a ring shadow plus `inset 0 1px 0 var(--sh-hi)`. `--shadow-md` for hover and popovers, `--shadow-lg` for sheets. In dark mode, elevation also steps the surface colour up.
- **Focus:** a 2 px `--focus` outline, offset 2. Scroll padding:
  - Document: `html{scroll-padding-top:var(--sticky-h)}`.
  - Every scrolling pane (details, sheets) sets its own `scroll-padding-top` (its sticky header) and `scroll-padding-bottom` (its sticky footer + `env(safe-area-inset-bottom)` + `var(--toast-h,0px)` + 8px).
- **Motion:** 120 / 200 / 280 ms, `cubic-bezier(.22,1,.36,1)`. Hover lift −1px, press scale .98. Sheets use `@starting-style`, which degrades to no animation. `prefers-reduced-motion` limits motion to fades of ≤ 100 ms.

### 2.7 Icons

Use `lucide-react` with stroke 1.75: 16 px inline, 20 px in buttons, always `aria-hidden`. Icon-only buttons get an `aria-label`.

---

## 3. Tech decisions

**Add:**
- `lucide-react`
- `@fontsource-variable/inter`
- `wouter` v3 (~2.5 KB, `base` support)

**Dev additions:**
- `vitest`, added in P1. If no vitest version accepts Vite 8, use `playwright.unit.config.ts` with no webServer behind the same `test:unit` script.
- `@axe-core/playwright`, added in P4.

**Do not add:** Tailwind or any component/CSS-in-JS library, framer-motion, i18n libraries, date libraries, react-router, charts, a second font, or a service worker.

**Supported browsers:**
- Safari/iOS ≥ 17.5
- Chrome/Edge ≥ 123
- Firefox ≥ 120

Set `build.target` and `build.cssTarget` to `['es2022','chrome123','edge123','firefox120','safari17.5','ios17.5']`, so Lightning CSS never lowers `light-dark()`. `check-bundle` asserts the built CSS still contains `light-dark(` and no `--lightningcss-`.

Every feature in the plan is native at this floor except `content-visibility`. It is progressive and always paired with `contain-intrinsic-size:auto 120px`. The account menu uses `popover` but feature-detects it and falls back to a toggled element. Sign out also appears on the AccessGate and Privacy pages.

**Platform features:**
- `<dialog>`+`showModal()` only for the Filters and Sources sheets. They never touch history, and React state syncs from the dialog's `close` event, so the Android back gesture/CloseWatcher just closes the sheet.
- Phone details are **not** a dialog (§4.8).
- Also used: `inert`, `<details>`, and `html:has(dialog[open]),html.details-open{overflow:hidden}`.

**Structure** (plain CSS, one `.css` per component; the hooks `.offers`, `.offer` and `.offer-title` are kept):
```
web/src/main.tsx                  bootstrap + lazy route chunks
web/src/prerender.tsx             SSR entry for Landing/Privacy (postbuild)
web/src/styles/{tokens,base,utilities}.css
web/src/i18n/{en,pl,index}.ts(x)
web/src/lib/{supabase,offers,writeQueue,dataSource,format,salary,score,status,description,sources,prefs,theme,router,useMediaQuery}.ts
web/src/lib/score-defaults.json   mirrored from profile.yaml (pytest-enforced)
web/src/components/ui/            Logo Button IconButton TextField Select SegmentedControl RadioChips Badge StatusPill
                                  ScoreRing ScoreBar Sheet Menu Toaster Skeleton EmptyState Callout Kbd VisuallyHidden
web/src/components/shell/         AppShell AppBar AccountMenu SourcesSheet BootSkeleton OfflineBanner DemoBanner
web/src/features/offers/          OffersPage BatchHeader Toolbar FilterPanel ActiveFilterChips OfferList OfferCard TodaySummary
                                  DetailsView DetailsHeader SalaryBlock MatchCard Description TrackingForm ActionBar
web/src/features/{landing,auth,demo}/   Landing Hero PhoneMock Features HowScoreWorks Footer SignInCard | AppRoot AccessGate | Demo fixtures demoSource
web/src/pages/{Privacy,NotFound}.tsx   web/src/dev/Kit.tsx (DEV only)
web/scripts/{postbuild,render-brand-assets,check-bundle,static-server}.mjs
```

**Data changes** (no SQL):
1. **`lib/offers.ts`**
   - `LIST_COLUMNS` stays without `score_breakdown`; the breakdown is loaded in details only.
   - "≈ PLN/month" and the salary sort use `lib/salary.ts`, a port of `monthly_salary_pln` (FX table, `hours_per_month`, `workdays_per_month`), with unit parity tests.
   - The list query uses `.range(0,1999)` with `count:'exact'`. If count > rows, show a Callout "Showing the first 2 000 offers".
   - Meta keys read: `last_fetch_new_ids`, `scoring_profile`, `scores_refreshed_on`.
   - Sort client-side with null scores last.
2. **`lib/writeQueue.ts`**
   - Writes are serialised per offer.
   - Each request is built from the latest *confirmed* `{status, rate, notice}` plus that call's change, because the RPC overwrites all three.
   - `applied_at` = the first time an offer was marked APPLIED. Undo does not clear it; this is documented in the README.
3. **Python**
   - **Effective config:** `collect_live_jobs` returns the effective cfg it used, and callers are updated. `run_fetch` writes `scoring_profile` = `{candidate, scoring, filters, hard_exclusions, scoring_version}`, the same shape as `score_config_signature`.
   - **Daily rescore:** the pure logic of `app.refresh_scores_for_config` moves to `job_finder/rescore.py`. Streamlit wraps it with its session memo. `run_fetch` calls it after every fetch, so freshness and the stale penalty update daily without Streamlit.
   - **`notify-summary`:** builds from `last_fetch_new_ids ∩ rejected=0`. `--hours` is only a fallback when that meta key is missing.
   - **pytest cases:**
     - `scoring_profile` is written.
     - A 9-day-old offer is rescored.
     - The push count equals the new-ids count.
     - `score-defaults.json` equals the profile.yaml scoring section.
     - `web/src/lib/__fixtures__/breakdown.json` equals `score_job()` output for a fixed sample. vitest consumes the same file.
4. **`lib/dataSource.ts`:** `interface DataSource {loadDashboard; loadOfferDetails; saveTracking}` via context. The Supabase implementation sits beside `demoSource`.

---

## 4. Screen specs

### 4.1 Bootstrap and routing

**Routes** (paths are relative to `BASE_URL`):

| Path | Renders |
|---|---|
| `/demo` | Demo |
| `/privacy` | Privacy |
| `/dev/kit` | Kit (DEV only) |
| `/` with `#access_token`, `#error`, or `joffers-auth` in storage | AppRoot (supabase chunk) |
| `/` otherwise | Landing (no supabase-js; SignInCard imports it on focus) |
| anything else | NotFound |

**Head inline script:**
- Sets `data-theme`, `lang`, and `data-boot="app"` when auth or a token hash is present.
- `html[data-boot=app] .landing-static{display:none}`, and it shows a CSS-only BootSkeleton, so signed-in users never see the prerendered landing flash.

**Auth error hash** (`#error_code=otp_expired…`): show a Callout on the landing: "This sign-in link has expired or was already used. Send a new one." The email field gets focus, then `history.replaceState` strips the fragment.

**`?view=new`:** sets the window to New, then is removed with replace.

**`?offer=<id>` history rules:**
- Opening from the closed state **pushes** with `{joffersOffer:true}`.
- Switching offers while details are open **replaces**: card click, prev/next, j/k.
- Closing (button, Esc, back): if `history.state?.joffersOffer`, call `history.back()`; otherwise `navigate('/',{replace:true})`, which handles cold deep links.
- `popstate` drives React state, so the URL and the screen can't diverge.

**`postbuild.mjs`:**
1. Runs the SSR build of `prerender.tsx`.
2. Writes the static Landing (EN) into `dist/index.html` and Privacy into `dist/privacy/index.html`.
3. Copies the app shell to `dist/demo/index.html` and `dist/404.html`.

The client uses `hydrateRoot` when the prerendered language matches; otherwise it uses `createRoot`.

### 4.2 Landing (signed out)

**Nav** (64 px, sticky): Logo · How it works · Demo · GitHub · PL/EN · "Sign in" (scrolls to the sign-in card).

**Hero** (2 columns ≥1024, stacked on phone), left column:
- "Private beta" badge.
- H1 "QA jobs, scored for you."
- Lead: "Every evening at 18:00 JOffers checks Polish and international job boards, scores each offer 0–100 against your profile and shows why." No board names until the ROADMAP legal review is signed off.
- **Primary CTA "Try the live demo"** → `/demo`.
- Below it, a SignInCard titled "Beta members: sign in": label "Email", button "Send sign-in link", helper "No password. We'll email you a one-time link."

**Hero, right column:** PhoneMock renders 4 OfferCards from the demo fixtures in their static non-link variant. The whole subtree is `inert` + `aria-hidden`, and the wrapper is `role="img"` with `aria-label` "Preview of the JOffers offer list".

**Below the hero:**
- 3 feature tiles.
- **How the score works:** generated from `score.ts` and `score-defaults.json` (category maxima, the penalty labels below). Then a separate line: "Filtered out before scoring: non-remote roles, junior roles (unless the pay is high), and technologies on your exclusion list."
- Privacy block: "No passwords. No ads. No analytics." This must stay true (open question 6).

**Footer:** © JOffers · controller name · Privacy · GitHub · Contact (required) · language · theme.

**Sign-in, sent state:**
- `role="status"`: "Check your inbox — we sent a sign-in link to **x**."
- "Works on any device. Check spam."
- "Open Gmail" (only for `@gmail.com`).
- Resend with a 60 s countdown.
- "Use a different email".
- **"Have a code? Enter it"**: a 6-digit field calling `verifyOtp({email, token, type:'email'})`. The Supabase email template gets `{{ .Token }}` (owner action). This is the path for the installed iOS app.

**Sign-in errors:**

| Error | Friendly message |
|---|---|
| 422 `otp_disabled` / "Signups not allowed for otp" | "JOffers is in private beta. Try the demo or request access." |
| rate limit | "Too many attempts. Wait a minute." |
| invalid email | "Enter a valid email." |
| anything else | generic message |

The raw message always goes in `<details>` "Technical details". This makes email membership enumerable; that is accepted for the beta and documented.

**Live regions:** each view has at most one `role="status"`. The Toaster uses `aria-live` without a role.

### 4.3 Access gate and boot

- **Boot:** a single BootSkeleton, replacing the 3 text flashes.
- **No access:**
  - Lock icon and "This account doesn't have access yet." (kept).
  - "JOffers is in private beta. Explore the demo with sample data."
  - Buttons: [Try the demo] [Request access] (mailto to `VITE_CONTACT_EMAIL`) [Sign out].
- **Membership error:** Callout with Retry.

### 4.4 App shell

- **App bar:** 56/64 px, sticky, `--surface` with a bottom `--line`. On the right, an avatar button (`aria-label` "Account").
- **AccountMenu:** email, theme Auto/Light/Dark, language, "Keyboard shortcuts" (desktop), Privacy, Sign out.
- No bottom navigation.
- OfflineBanner when offline.

### 4.5 Offer list on phone (<1024 px)

**"New" set:** `newIds ∩ visible offers`. This one set drives the "N new" line, progress, the tab title, the push and the default view.

**Reviewed:** status ≠ TO_REVIEW, synced through the database. When an offer's details open while its status is TO_REVIEW, the app enqueues `REVIEW` (silently, no toast). If that write fails offline, `joffers-seen` in localStorage marks the offer locally and the write retries on the next load. `delete_expired` now also expires REVIEW, so opened-but-ignored offers still expire (pytest).

1. **BatchHeader** (64 px, scrolls away):
   - **Line 1 is always rendered:** "2 new · fetched 2 h ago", the source chip, and a Refresh IconButton.
   - **Source chip:** `lib/sources.ts sourceHealth(result)` returns `ok` | `partial` | `failed`. `OfferParseError` counts as partial. The chip says "Pracuj.pl failed" or "2 sources failed" (warning tone); a partial-only fetch shows a neutral "1 source partial". The chip opens SourcesSheet.
   - **Line 2:** a 4 px progress bar and "Reviewed 1 of 2". It is hidden only when the New set is empty.
2. **Toolbar** (52 px, sticky):
   - SegmentedControl, legend "Published" (visually hidden): **New | 24 h | 3 days | 7 days | Any time**, default **New**. Each native radio is stretched over its segment at `opacity:0`, so `.check()` works.
   - Filters button with a count badge.
3. **ActiveFilterChips** with "Clear all".
4. **Count line:** "2 of 4 offers", `aria-live="polite"`.
5. **OfferCard:** `<a class="offer" href="?offer=…">`, `--surface`, `--shadow-card`, radius 14. The ring is in column 1.
   - **Row 1:** `.offer-title` (2-line clamp) and the age.
     - Unread (status TO_REVIEW) = 650 weight plus an 8 px dot drawn by `.offer-title::before`, so the title text is unchanged.
   - **Row 2:** company · location · contract · source (one line).
   - **Row 3:** salary (or "No salary listed"), then "≈ 24 000 PLN/month" unless the salary is already PLN/month.
     - Right side: **StatusPill whenever status ≠ TO_REVIEW**; otherwise the "New" badge if the offer is in the New set.
   - **Ring:** 44 px, sr text "Match 75 of 100, Strong match". The title comes first in DOM order.
   - **Selected card (desktop):** brand tint with `aria-current="true"`.
6. **Tab title:** `(N) JOffers`, where N = New set with status TO_REVIEW.
7. **Refresh:** on `visibilitychange` when data is >10 min old, or via the button.

### 4.6 Filters

The same FilterPanel component is used everywhere. On phone it sits in a bottom-sheet `<dialog aria-label="Filters">` (85dvh, footer [Reset] [Show N offers]).

**Controls:**
- Search "Search title or company"
- RadioChips "Min score": Any score | 50+ | 65+ | 80+
- Status (All statuses + optgroups; "To review" replaces the old "Hide reviewed" checkbox, which is dropped)
- Source
- Sort: Best match | Newest | Highest salary

**Defaults:** `{window:'new', minScore:0, status:'ALL', source:'ALL', query:'', sort:'score'}`.

**Prefs v2 migration:**
- A stored `24h` becomes `new` once.
- `minScore` snaps down to a preset.
- `hideReviewed` is dropped.

### 4.7 Desktop (≥1024 px)

**Toolbar:** container max 1280, 32 px gutters. Two sticky rows (104 px total), with no popovers and every control inline:
- Row 1: Published segmented · Search (flex 1, min 240) · Sort.
- Row 2: Min score chips · Status · Source · "Clear all".

Both rows fit at 1024 px (about 960 px of content).

**Below:**
- BatchHeader.
- A grid `minmax(400px,460px) minmax(0,1fr)` with a 24 px gap.
- The details `<aside>` is sticky in the right column: its own scroller, radius 20.

**Nothing selected:** TodaySummary tiles:
- New since the last fetch.
- Best new match: ring and title as plain text, plus a **button "Open best match"**.
- In progress.
- Sources OK 7/8 (from `sourceHealth`).

Then the keyboard hints (P9).

**Responsive duplicates** (Status location, FilterPanel inline vs sheet, back vs close) are mounted conditionally with `useMediaQuery('(min-width:1024px)')`, never just hidden with CSS.

### 4.8 Offer details

**Phone container: DetailsView.** A `position:fixed; inset:0; overflow:auto; overscroll-behavior:contain` view, not a dialog.
- While it is open, the list stays mounted under `inert` + `aria-hidden` and `html.details-open{overflow:hidden}` is set. `scrollY` is saved and restored on close.
- It slides in over 280 ms.
- Focus goes to the h2 on open and returns to the card on close.
- Esc and back both close through the router (§4.1).

**Desktop container:** the same `<aside class="details" aria-label="Offer details">` in the right pane.

**Scroll padding:** the aside sets `scroll-padding-top:56px; scroll-padding-bottom:calc(64px + env(safe-area-inset-bottom) + var(--toast-h,0px) + 8px)`.

**Header** (sticky, 56 px):
- Phone: ChevronLeft "Back to list". Desktop: X "Close details".
- "3 / 12" with prev/next ("Previous offer"/"Next offer"); both replace history.
- Desktop only: the Status select and "Open offer".

**Body:**
1. **Hero:**
   - h2 title.
   - Icon row: company, location, contract, "Published 3 h ago" (absolute date in `title`), source.
   - **SalaryBlock:** the range, "≈ … PLN/month (est.)", and "Above/Below your 15 000 PLN threshold" when `salary_assessment` exists.
2. **MatchCard:**
   - 64 px ring, score and band word.
   - "Why" line: the top 2 positive categories with matched terms shown in `candidate` casing, e.g. "Playwright, TypeScript · Remote".
   - "Scores updated today" (from `scores_refreshed_on`).
   - **"Why 75?"** rows, in this order, each with its maximum's config path:

     | Key | Label | Max from |
     |---|---|---|
     | role | Role | `scoring.weights.role` |
     | technology | Technologies | `scoring.weights.technologies` |
     | domain | Domain | `scoring.weights.domain` |
     | remote | Remote | `scoring.weights.remote` |
     | contract | Contract | `scoring.weights.contract` |
     | seniority | Seniority | `scoring.weights.seniority` |
     | language | English | `scoring.weights.language` |
     | ai | AI | `scoring.weights.ai` |
     | freshness | Freshness | `scoring.weights.recency_max` (default 10) |
     | salary_bonus | Salary bonus | `scoring.salary_bonus.points` |

     The maxima come from `scoring_profile`, falling back to `score-defaults.json`.
   - **Penalties** come from their signed values and have no bar: `title_automation_penalty` '"Automation" in title', `title_programming_language_penalty` "Programming language in title", `stale_offer_penalty` "Older than N days".
   - Zero rows fold into `<details>`.
   - "Total 75 / 100", with a "capped at 100" or "floored at 0" note when needed.
   - `<ul aria-label="Matched keywords">`.
   - No hard_reject UI: rejected offers never load.
3. **TrackingForm:**
   - Collapsed unless the status is ≥ READY_TO_APPLY or a value exists.
   - Fields "Rate you quoted" and "Notice period you gave"; Save is enabled only when the form is dirty.
   - `role="status"` "Saved."; on failure "Couldn't save. Try again." with Retry.
4. **Description** (`lib/description.ts`, a port of `format_description`):
   - Insert breaks before `_DESCRIPTION_BULLETS` (•✅✔️🔹➡️👉🎯📌⭐️🚀💡🔸▪️‣🧡🟣✍️🎁) and before the PL/EN `_DESCRIPTION_HEADINGS`. Real newlines are also honoured.
   - Split on `\n{2,}`.
   - A block that is a heading, optionally followed by ":", becomes an `h4`; any rest of the block becomes a `p`.
   - Consecutive bullet blocks (or blocks starting with `-`/`*`) become a `<ul>` with the marker stripped.
   - Everything else is a `<p>`.
   - Text nodes only. Clamped to 14 lines on phone with "Show full description".
   - Unit tests use 3 anonymised collapsed samples taken from the DB.

**Phone ActionBar** (sticky bottom, 64 + safe-area): [Status select] [Star "Mark as interested", hidden when status ≥ INTERESTED] [Primary "Open offer"].

### 4.9 Status interactions and toasts

**Status change** (select or Star):
1. Optimistic update.
2. `writeQueue`.
3. Toast "Status: Applied · Undo" for 6 s.

Undo writes the previous status; it does not clear `applied_at`. On failure, roll back and show "Couldn't save the status · Retry".

**Status changes never auto-advance.** The only exception is P10 "Not for me".

**Toaster:**
- At most one toast.
- Phone: above the ActionBar. Desktop: bottom-right.
- It sets `--toast-h` while visible.
- It has a "Dismiss" button, and the timer pauses on hover or focus.
- Toasts wait while a sheet dialog is open.

### 4.10 States

- **Empty, New view:** "No new offers from the last fetch", "Next fetch today at 18:00" (Europe/Warsaw; "tomorrow" after 18:00), [Show last 3 days].
- **Empty with filters:** "No offers match these filters", [Clear filters].
- **Load error:** "Couldn't load offers. Check your connection.", [Try again], technical details.
- **Session expired:** Landing with the Callout "Your session expired. Sign in again."
- **SourcesSheet:**
  - Each row shows "12 found · 3 new · 4.2 s", omitting any field missing from older runs.
  - Partial rows: "Some offers couldn't be read".
  - Humanised errors: 401/403 → "Blocked by the board (403)", timeout → "Timed out", anything else → "Unexpected error". The raw text goes in `<details>`.

### 4.11 Demo and Privacy

**`/demo`:** `demoSource` with 12 fictional offers. The descriptions are collapsed, like real ones.
- Covers all bands, hourly B2B, a stale offer, a penalty and a null score.
- 3 new offers and one failed source.
- Fictional company and board names until the legal review.
- DemoBanner on every screen. Zero Supabase requests.

**`/privacy`:**
- Controller name and contact email (`VITE_CONTROLLER_NAME`, `VITE_CONTACT_EMAIL`; required for public deploy).
- Data: email (sign-in), tracking data (status, rate, notice).
- Purpose and legal basis.
- Processors:
  - Supabase (state the confirmed region)
  - Google (Gmail SMTP for sign-in mail)
  - GitHub (Pages hosting, request logs)
- Browser storage: `joffers-auth`, `joffers-theme`, `joffers-lang`, `joffers-filters`, `joffers-seen`, `joffers-shortcuts`.
- No analytics or ads; retention; rights (access, deletion by email).
- No Terms page until the legal review.

---

## 5. Accessibility, performance, i18n

**Accessibility:**
- Contrast is enforced by `contrast.test.ts`.
- Colour is never the only signal.
- Targets: 44 px on coarse pointers, 32 px on desktop.
- Skip link "Skip to offers", one h1 per view.
- Shortcuts can be turned off and are ignored while a field has focus.
- `<html lang>` follows the UI language.
- Focus is never obscured (§2.6, §4.8).

**Performance:**
- Lazy route chunks; supabase-js only in the AppRoot chunk.
- Landing and Privacy are prerendered.
- Preload the Inter latin woff2 through a `transformIndexHtml` plugin that resolves the hashed name.
- `check-bundle.mjs` reads `dist/.vite/manifest.json` (`build.manifest:true`), sums each route entry's static import graph, gzips it, and asserts the §1 budgets plus "no supabase-js in landing/demo".

**i18n:**
- EN + PL now. `pl.ts` is typed as `Messages`, so a missing key fails `tsc`.
- `Intl.PluralRules`; numbers use `pl-PL` grouping.
- Periods: `/h /day /month /year` and `/godz. /dzień /mies. /rok`.
- Ages: "3 h" and "3 godz.".
- Scraped text is not translated.

---

## 6. Testing

**npm scripts:**
- `test:unit`: `vitest run`
- `test:e2e`: `playwright test`
- `test:screens`: `VISUAL=1 playwright test --grep @screens`
- `test:visual`: `VISUAL=1 playwright test --grep @visual`
- `test:visual:update`: `docker run --rm -v $PWD:/w -v /w/node_modules -w /w mcr.microsoft.com/playwright:v1.64.0-noble sh -c "npm ci && VISUAL=1 npx playwright test --grep @visual --update-snapshots"`

**Playwright config:**
- `locale:'en-US'`, `timezoneId:'Europe/Warsaw'`, `grepInvert:/@screens|@visual/` unless `VISUAL=1`.
- `BASE_PATH=/Job-offers/`, `baseURL:'http://localhost:4173/Job-offers/'`, and every spec uses `page.goto('./…')`.
- When `PW_PREBUILT=1`, the webServer only runs `vite preview`.

**Playwright projects:**

| Project | Server | Scope |
|---|---|---|
| desktop | preview :4173 | Desktop Chrome, 1280 px |
| phone | preview :4173 | Pixel 7 |
| pages | `scripts/static-server.mjs` :4174, GitHub Pages semantics (no SPA fallback, `dir`→`dir/` 301, unknown→`404.html` with status 404) | `pages.spec` |
| kit | `vite` dev :5174 | `kit.spec` (axe + 44 px targets) |

**CI:**
- `tests.yml`, web job: `npm ci` → lint → `test:unit` → build (test env) → `check-bundle` → `playwright test` (`PW_PREBUILT=1`).
- `web-pages.yml`: runs `check-bundle` after the production build. From P8 it sets `REQUIRE_PUBLIC_CONFIG=1`, so the build fails without the controller name and contact.
- Visual job: `container: mcr.microsoft.com/playwright:v1.64.0-noble`, `continue-on-error: true` until it has been green for 2 weeks.

**Mock (`supabase-mock.ts`) options:** `{member, offers?, newIds?, failJobs?, otp?: 'ok'|'signupsDisabled', now?}`.

**Mock changes:**
- **P3:**
  - The details breakdown adds `contract:10, freshness:5` (sums to 75).
  - Descriptions are collapsed and realistic: "Full description of X. Wymagania • Playwright i TypeScript • Testy API Oferujemy • Praca zdalna".
  - `fetch_runs` results gain `candidates/inserted/seconds`, and one row is `OfferParseError`.
  - A `scoring_profile` meta row.
- **P5:** `/auth/v1/verify` (code sign-in).
- **P6:** default `newIds` = [acme, beta].

**Clock:** `states.spec` and `visual.spec` call `page.clock.setFixedTime(FIXED_NOW)` (a fixed past date) and pass `now:FIXED_NOW` to the mock.

**e2e delta for `app.spec.ts`, per phase:**

| Phase | Lines | Change |
|---|---|---|
| P1 | all `goto('/')` | `goto('./')`; nothing else changes (the badge stays a literal "NEW" inside `.offer-title`) |
| P3 | 87 | 'APPLIED' → 'Applied' |
| P6 | 30 | `['Senior QA Engineer','QA Analyst']`, and `.offer` nth 0/1 contain 'New' |
| P6 | 33 | `getByText('2 new · fetched 2 h ago')` |
| P6 | 34 | button 'Pracuj.pl failed' → dialog 'Sources' contains 'Blocked by the board (403)' |
| P6 | 42 | `getByRole('radio',{name:'Any time'}).check()` |
| P6 | 45/48 | phone: `openFilters`; radio '65+' / 'Any score' |
| P6 | 46 | `['Test Engineer','Senior QA Engineer']` |
| P6 | 49–54 | phone: wrap in `openFilters`/`closeFilters` |
| P6 | 57–58 | phone: `openFilters`; radio 'Any time' `toBeChecked()` |
| P6 | 66, 87 | role button → role link (87 still expects 'Applied') |
| P6 | 77–82 | `[{REVIEW,'',''},{APPLIED,'140 PLN/h B2B','1 month'}]` |
| P7 | 69 | list 'Matched keywords' items → `['playwright','typescript']` |
| P7 | 77–82 | `[{REVIEW,'',''},{APPLIED,'',''},{APPLIED,'140 PLN/h B2B','1 month'}]` |
| P7 | 85 | 'Back to list' |

**New specs, scoped by phase:**
- **`pages.spec`:**
  - P5: `./` → 200; `./privacy` → 301 → Privacy heading; `./nope` → 404 + NotFound; `./?offer=` deep link.
  - P8: `./demo` and `./demo/`.
- **`navigation.spec`:**
  - P5: deep link; `goBack` closes and stays in the app; Esc closes and the URL has no `?offer=`; desktop open A → click B → `goBack` lands on the list.
  - P7, phone: open → Next → `goBack` lands on the list; focus returns to the card; Esc on phone.
- **`public.spec`:**
  - P5: `otp:'signupsDisabled'` → private-beta message; code entry signs in; `#error_code=otp_expired` → Callout and a clean URL.
  - P8: demo has 0 `supabase.test` requests; no-access → "Try the demo"; `pl-PL` → `html[lang=pl]`; Dark persists across reload.
- **`states.spec`** (P6):
  - A 30 h-old offer in `newIds` appears in the default view.
  - An offer with a null `published_at` in `newIds` appears.
  - Empty New → "Show last 3 days".
  - `failJobs:1` → Try again works.
  - Density with `offers:` 8 new offers and default filters.
  - 0 new + a failed source still shows the chip and Refresh.
- **`triage.spec`** (P7):
  - Star → INTERESTED keeps the saved rate; Undo → REVIEW.
  - Status failure rolls back.
  - Save then an immediate Star → the final call keeps the new rate.
  - Tab title count.
- **`a11y.spec`** (P6 list, P7 details, P8 public), light and dark. The phone case tabs to Save and asserts its bounding box doesn't intersect the ActionBar or the toast.
- **`keyboard.spec`** (P9, desktop).
- **`screens.spec @screens`** (P1): 8 PNGs, no assertions.
- **`visual.spec @visual`** (P9): `toHaveScreenshot({animations:'disabled', maxDiffPixelRatio:0.01})` with the clock fixed.

---

## 7. Phases

Each phase is shippable on its own.

**Standard verify (V) after every phase:**
1. `npm run lint && npm run build && npm run test:unit && node scripts/check-bundle.mjs && npm run test:e2e`
2. `npm run test:screens`, then review the PNGs.
3. `pytest -q` if Python was touched.

**P1 — Foundations**
- Tasks:
  - tokens.css (new line-strong values), base.css, and `app.css` rewritten on tokens.
  - Inter + fallback face; head script for theme and lang.
  - Band colours on the existing `.score`; restyle the "NEW" badge in place (same text and position).
  - vitest + `contrast.test.ts`; npm scripts.
  - Playwright base path + `goto('./')`.
  - `build.target`/`cssTarget`/`manifest`.
  - `check-bundle` (app/CSS budgets, measure woff2 to set the font budget, `light-dark(` assertion), wired into **both** workflows plus an explicit build step in `tests.yml`.
  - `screens.spec`.
- Accept:
  - Hex values only in tokens.css.
  - No theme flash.
  - The suite passes with only the P1 delta.
  - Forced dark theme checked manually in an iOS 17.5 simulator.

**P2 — Brand assets and meta**
- Tasks:
  - Logo and favicon SVGs.
  - `render-brand-assets.mjs` (Playwright Chromium) → apple-touch, 192, 512, maskable, `og.png`.
  - Manifest (`start_url`/`scope "./"`, standalone).
  - Meta, OG, `theme-color` ×2.
  - Remove the Vite assets.
- Accept: installable in Chrome; no Vite assets.

**P3 — Domain, data, i18n**
- Web tasks:
  - `score.ts` (mapping table, bands, `breakdownRows`, hard-exclusion copy), `status.ts`, `format.ts`, `salary.ts`, `description.ts` (wired into the current details), `sources.ts`, `prefs.ts`, `writeQueue.ts`, i18n, `offers.ts` query changes.
  - Unit tests: bands 49/50/64/65/79/80/null, the breakdown fixture, cap note, salary parity, PL plurals, description samples, null-last sort.
- Python tasks: effective cfg, `scoring_profile`, `rescore.py` + daily rescore in `run_fetch`, notify from `newIds`, the contract fixtures, pytest.
- Also: mock P3 changes; e2e P3 delta.
- Accept: nothing raw rendered; a `pl.ts` key gap fails tsc; pytest passes.

**P4 — UI kit**
- Tasks:
  - `components/ui/*`.
  - `dev/Kit.tsx`, reached through a DEV-only path check in `main.tsx`.
  - `@axe-core/playwright` and the `kit` project.
- Accept: `kit.spec` is clean in light and dark; 44 px coarse targets.

**P5 — Bootstrap, routing, shell, auth**
- Tasks:
  - wouter; route split; history rules; NotFound.
  - AppRoot and AccessGate; shell (AccountMenu with popover fallback).
  - `postbuild` (copies only; prerender arrives in P8).
  - Privacy page (unlinked until P8).
  - Existing Login: `shouldCreateUser:false`, error mapping, code entry, expired-link Callout.
  - `static-server.mjs` + `pages` project.
  - `navigation.spec`, `public.spec`, `pages.spec` (P5 scope).
  - Owner: add `{{ .Token }}` to the email template.
- Accept:
  - Manual: the magic link works on a phone; code sign-in works inside the **installed iOS app**; the Android back gesture closes details.
  - Specs pass.

**P6 — Offer list**
- Tasks:
  - New view + prefs v2 + `?view=new`; promote-on-open + `delete_expired` REVIEW (pytest).
  - BatchHeader, Toolbar, FilterPanel (sheet and the desktop two-row toolbar), chips, OfferCard, list, SourcesSheet, states, tab title, refresh, TodaySummary.
  - Push wiring: `notify.py` click URL = `APP_URL + "?view=new"`, plus an ntfy action "Open best match" → `?offer=<best>`. Owner sets the repo variable `APP_URL=https://michalszuryga.github.io/Job-offers/`. README updated.
  - e2e P6 delta; `states.spec`; `a11y` list.
- Accept: density; push → New view; no empty half on desktop.

**P7 — Details and status**
- Tasks:
  - DetailsView (phone fixed view / desktop aside), header with prev/next, SalaryBlock, MatchCard, Description component, TrackingForm, ActionBar, Toaster, scroll padding.
  - `triage.spec`; e2e P7 delta; `navigation.spec` P7 scope; `a11y` details.
- Accept: breakdown reconciles; focus moves in and back; Save is never obscured.

**P8 — Public surface**
- Tasks:
  - Prerendered Landing; SignInCard restyle (demo first); PhoneMock inert.
  - Demo; Privacy linked; AccessGate actions.
  - `check-bundle` landing and demo graphs; `REQUIRE_PUBLIC_CONFIG`.
  - `public.spec` and `pages.spec` remainder.
- Accept:
  - Controller name and contact set.
  - Lighthouse meets §1.
  - `/demo` makes 0 Supabase requests.
  - Manual iPhone check of sign-in and the code path.

**P9 — Productivity and polish**
- Tasks:
  - Keyboard triage (j/k replace history, Enter, Esc, o, i, /, ?), the shortcuts dialog and toggle.
  - Motion pass.
  - Visual job (noble container, opt-in).
  - README screenshots; ROADMAP ticks.
- Accept: every §1 criterion is green.

**P10 (optional, owner approval) — "Not for me"**
- Tasks:
  - `DISMISSED` in the `web_access.sql` allow-list, `DEFAULT_STATUSES` (expired like TO_REVIEW), Streamlit, `types.ts`, `status.ts`; pytest.
  - SQL is applied first.
  - Then ActionBar [Not for me] plus the `x` shortcut. **This is the single, deliberate exception to "never auto-advance":** it advances to the next offer.
- Accept: production RPC accepts DISMISSED; triage covers it.

---

## 8. Out of scope and open questions

**Out of scope:**
- Multi-tenant data and per-user scores (Stage 3b); profile editing; pipeline page; full Settings.
- Payments; Terms (until the legal review).
- Board logos, and board names on public pages until the legal review.
- Service worker and web push; "Fetch now".
- Waitlist table: v1 uses "Request access" by mailto. A later waitlist needs an insert-only RLS policy plus CAPTCHA.
- Opening sign-ups: that would need Supabase CAPTCHA and a transactional SMTP provider instead of Gmail.

**Open questions** (work proceeds on the default):
1. **Controller name and contact email** for `/privacy`, the footer and "Request access". *Required before P8 ships*; there is no "hide it" default.
2. **Promote opened offers to REVIEW and expire REVIEW like TO_REVIEW?** *Default:* yes. If rejected, keep `joffers-seen` and label progress "on this device".
3. **DISMISSED status (P10)?** *Default:* yes, after P7, SQL first.
4. **Brand #4B3BE8 + "Private beta"?** *Default:* yes.
5. **Custom domain?** *Default:* stay on Pages. A switch changes `BASE_PATH`, the Supabase redirect, the OG URL and `APP_URL`.
6. **Analytics?** *Default:* none, so "No analytics" stays true. Any later cookieless counting updates `/privacy` and the landing copy in the same PR.
7. **Name the boards on the landing?** *Default:* no, until the legal review or the owner's explicit sign-off.
