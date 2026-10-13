import { createRoot, hydrateRoot } from 'react-dom/client'
// Cascade order matters: tokens first, component styles last.
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/utilities.css'
import './app.css'
import { App, pageAt, preloadPage } from './App'
import { detectLang, loadMessages } from './i18n'
import { captureAuthHash, hasAuthNotice } from './lib/authHash'
import { startsInApp } from './lib/session'

// Before the AppRoot chunk can load: supabase-js (detectSessionInUrl) consumes an expired-link
// fragment as soon as its client exists. Nothing imported above loads supabase-js.
captureAuthHash()

const container = document.getElementById('root')!
const page = pageAt(location.pathname, startsInApp())

// postbuild.mjs prerenders the Landing and Privacy in English and marks the root with what it
// rendered. React takes that markup over (hydrates) when this visit renders the same thing;
// anything else (another language, an expired-link notice, the app) renders from scratch.
const lang = detectLang()
const hydrate = container.dataset.prerendered === page && container.dataset.lang === lang
  && !(page === 'landing' && hasAuthNotice())

// The page's chunk and the language's messages first (App.tsx route(), i18n/messages.ts), so
// the first render is the page itself, in its language, not a fallback. A chunk that fails to
// load is retried by the route and caught by its boundary; missing messages fall back to English.
Promise.allSettled([preloadPage(page), loadMessages(lang)])
  .then(() => {
    if (hydrate) hydrateRoot(container, <App />)
    else createRoot(container).render(<App />)
  })
