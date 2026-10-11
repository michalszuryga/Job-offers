import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
// Cascade order matters: tokens first, component styles last.
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/utilities.css'
import './app.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'

function render(node: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>{node}</I18nProvider>
    </StrictMode>,
  )
}

// The UI kit at <base>/dev/kit (plan §4.1), dev server only. import.meta.env.DEV is a
// literal false in a build, so the branch and the Kit chunk are dropped from dist
// (check-bundle asserts it).
const KIT_PATH = `${import.meta.env.BASE_URL}dev/kit`

if (import.meta.env.DEV && location.pathname.replace(/\/+$/, '').endsWith(KIT_PATH)) {
  Promise.all([import('./dev/Kit'), import('./components/ui')]).then(([{ Kit }, { ToastProvider }]) =>
    render(
      <ToastProvider>
        <Kit />
      </ToastProvider>,
    ),
  )
} else {
  render(<App />)
}
