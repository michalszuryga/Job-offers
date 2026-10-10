import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo-name>/.
  base: process.env.BASE_PATH ?? '/',
})
