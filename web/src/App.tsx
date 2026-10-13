import { lazy, StrictMode, Suspense, useEffect, useLayoutEffect, useState, type ComponentType } from 'react'
import { Route, Router, Switch } from 'wouter'
import { BootSkeleton } from './components/shell/BootSkeleton'
import { RouteErrorBoundary } from './components/shell/RouteErrorBoundary'
import { I18nProvider, type Lang } from './i18n'
import { takeAuthNotice, type AuthNotice } from './lib/authHash'
import { startsInApp } from './lib/session'

// The route tree, shared by the browser (main.tsx) and the prerender (prerender.tsx), so the
// static Landing and Privacy hydrate against exactly what was rendered at build time.
// Components live beside the routes on purpose; this module is never a Fast Refresh boundary.
/* oxlint-disable react/only-export-components */

// A lazy route chunk that can also be loaded up front (§5). main.tsx loads the current page's
// before the first render, and a loaded route renders at once: no fallback over the
// prerendered page while it hydrates, nor a skeleton flash before the app. Picked once per
// mount, so a route never swaps its component (and loses its state) mid-life.
function route<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null
  const preload = () =>
    load().then((component) => {
      loaded = component
      return component
    })
  const Lazy = lazy(() => preload().then((component) => ({ default: component })))
  function RouteChunk(props: P) {
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy)
    return <Component {...props} />
  }
  return Object.assign(RouteChunk, { preload })
}

// supabase-js lives only in AppRoot's chunk (check-bundle).
const AppRoot = route(() => import('./features/auth/AppRoot').then((m) => m.AppRoot))
const Landing = route(() => import('./features/landing/Landing').then((m) => m.Landing))
const Demo = route(() => import('./features/demo/Demo').then((m) => m.Demo))
const Privacy = route(() => import('./pages/Privacy').then((m) => m.Privacy))
const NotFound = route(() => import('./pages/NotFound').then((m) => m.NotFound))

// The UI kit at <base>/dev/kit (§4.1), dev server only. import.meta.env.DEV is a literal false
// in a build, so the chunk is dropped from dist (check-bundle asserts it).
const Kit = import.meta.env.DEV
  ? lazy(async () => {
      const [{ Kit }, { ToastProvider }] = await Promise.all([import('./dev/Kit'), import('./components/ui')])
      return {
        default: () => (
          <ToastProvider>
            <Kit />
          </ToastProvider>
        ),
      }
    })
  : null

// Routes are relative to the base path (GitHub Pages serves the app from /Job-offers/).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export type Page = 'landing' | 'app' | 'demo' | 'privacy' | 'kit' | 'notFound'

// The page a path shows, the way the <Switch> below picks it. Patterns take an optional
// trailing slash: Pages redirects /privacy to /privacy/.
export function pageAt(pathname: string, inApp: boolean): Page {
  const path = pathname.toLowerCase().startsWith(BASE.toLowerCase()) ? pathname.slice(BASE.length) : pathname
  if (path === '' || path === '/') return inApp ? 'app' : 'landing'
  if (/^\/privacy\/?$/i.test(path)) return 'privacy'
  if (/^\/demo\/?$/i.test(path)) return 'demo'
  if (Kit && /^\/dev\/kit\/?$/i.test(path)) return 'kit'
  return 'notFound'
}

const CHUNKS: Partial<Record<Page, { preload: () => Promise<unknown> }>> = {
  app: AppRoot,
  landing: Landing,
  demo: Demo,
  privacy: Privacy,
  notFound: NotFound,
}

export function preloadPage(page: Page): Promise<unknown> {
  return CHUNKS[page]?.preload() ?? Promise.resolve()
}

// An expired-link fragment from this page load (captured by main.tsx before anything could
// load supabase-js). Read once, then cleared after the first mount, so a later visit to '/'
// starts clean.
let pageNotice: AuthNotice | null | undefined
const noticeOnce = () => {
  if (pageNotice === undefined) pageNotice = takeAuthNotice()
  return pageNotice
}

// '/' (§4.1): the app when there is a session to pick up (a stored one, or a magic link's
// #access_token), otherwise the landing, which never loads supabase-js until its sign-in
// card is used. A code entered there signs in without a reload, so it switches over.
function Home() {
  const [notice] = useState(noticeOnce)
  const [inApp, setInApp] = useState(startsInApp)
  useEffect(() => {
    pageNotice = null
  }, [])
  if (inApp) return <AppRoot notice={notice} />
  return <Landing notice={notice} onSignedIn={() => setInApp(true)} />
}

// Once React shows something, the head script's boot state is over: the static skeleton
// goes, and html[data-boot] no longer hides a landing (AppRoot shows one after a sign-out).
function BootDone() {
  useLayoutEffect(() => {
    document.documentElement.removeAttribute('data-boot')
    document.querySelector('.boot-static')?.remove()
  }, [])
  return null
}

interface Props {
  // Pinned for the prerender; detected in the browser.
  lang?: Lang
  // The path to render on the server (wouter's ssrPath), relative to the base.
  ssrPath?: string
}

export function App({ lang, ssrPath }: Props) {
  return (
    <StrictMode>
      <I18nProvider lang={lang}>
        <Router base={BASE} ssrPath={ssrPath && BASE + ssrPath}>
          {/* Each route is a second request after the entry, so it can fail on its own. */}
          <RouteErrorBoundary>
            <Suspense fallback={<BootSkeleton />}>
              <Switch>
                <Route path="/">
                  <Home />
                </Route>
                <Route path="/privacy">
                  <Privacy />
                </Route>
                <Route path="/demo">
                  <Demo />
                </Route>
                {Kit && (
                  <Route path="/dev/kit">
                    <Kit />
                  </Route>
                )}
                <Route>
                  <NotFound />
                </Route>
              </Switch>
            </Suspense>
          </RouteErrorBoundary>
          <BootDone />
        </Router>
      </I18nProvider>
    </StrictMode>
  )
}
