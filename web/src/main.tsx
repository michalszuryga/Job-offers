import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Route, Router, Switch } from 'wouter'
// Cascade order matters: tokens first, component styles last.
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/utilities.css'
import './app.css'
import { BootSkeleton } from './components/shell/BootSkeleton'
import { RouteErrorBoundary } from './components/shell/RouteErrorBoundary'
import { I18nProvider } from './i18n'
import { captureAuthHash } from './lib/authHash'

// Before the AppRoot chunk can load: supabase-js (detectSessionInUrl) consumes an expired-link
// fragment as soon as its client exists. Nothing imported above loads supabase-js.
captureAuthHash()

// One lazy chunk per route (§5): supabase-js lives only in AppRoot's. The entry is never a
// Fast Refresh boundary (an edit here reloads the page), so components may live here.
/* oxlint-disable react/only-export-components */
const AppRoot = lazy(() => import('./features/auth/AppRoot').then((m) => ({ default: m.AppRoot })))
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })))
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })))

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <Router base={BASE}>
        {/* Each route is a second request after the entry, so it can fail on its own. */}
        <RouteErrorBoundary>
          <Suspense fallback={<BootSkeleton />}>
            <Switch>
              <Route path="/">
                <AppRoot />
              </Route>
              {/* Patterns take an optional trailing slash: Pages redirects /privacy to /privacy/. */}
              <Route path="/privacy">
                <Privacy />
              </Route>
              {Kit && (
                <Route path="/dev/kit">
                  <Kit />
                </Route>
              )}
              {/* /demo too, until P8. */}
              <Route>
                <NotFound />
              </Route>
            </Switch>
          </Suspense>
        </RouteErrorBoundary>
      </Router>
    </I18nProvider>
  </StrictMode>,
)
