import { renderToStaticMarkup } from 'react-dom/server'
import { prerender } from 'react-dom/static'
import { App, preloadPage } from './App'
import { BootSkeleton } from './components/shell/BootSkeleton'
import { I18nProvider } from './i18n'

// The SSR entry of scripts/postbuild.mjs (plan §4.1, §5): the Landing and Privacy as static
// HTML, in English. The browser hydrates them with the same <App> (main.tsx). Never shipped:
// postbuild builds it on its own, into a scratch directory.

export type PrerenderedPage = 'landing' | 'privacy'

const PATHS: Record<PrerenderedPage, string> = { landing: '/', privacy: '/privacy' }

// The page's markup for <div id="root">. prerender() waits for every lazy part (the sign-in
// card, the phone preview, the score model). No progressive chunks: each part is written in
// place, not as a fallback plus a hidden copy that an inline script reveals after first paint.
export async function renderPage(page: PrerenderedPage): Promise<string> {
  await preloadPage(page)
  const { prelude } = await prerender(<App lang="en" ssrPath={PATHS[page]} />, {
    progressiveChunkSize: Number.POSITIVE_INFINITY,
  })
  return new Response(prelude).text()
}

// The CSS-only skeleton members see while the app boots over the prerendered landing
// (html[data-boot=app], BootSkeleton.css). Its own id prefix: the landing's logo gradient ids
// must stay unique in the page.
export function renderBootSkeleton(): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <BootSkeleton />
    </I18nProvider>,
    { identifierPrefix: 'boot-' },
  )
}
