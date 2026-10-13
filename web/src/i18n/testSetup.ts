// Vitest setup (vite.config.ts test.setupFiles): every language loaded up front, as the
// browser has it once main.tsx (or a switch) has loaded it.
import { registerMessages } from './messages'
import { pl } from './pl'

registerMessages('pl', pl)
