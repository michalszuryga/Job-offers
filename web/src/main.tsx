import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Cascade order matters: tokens first, component styles last.
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/utilities.css'
import './app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
