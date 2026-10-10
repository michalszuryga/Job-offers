/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Supported floor (plan §3): Safari/iOS 17.5, Chrome/Edge 123, Firefox 120.
const BROWSERS = ['chrome123', 'edge123', 'firefox120', 'safari17.5', 'ios17.5']

// Preloads the Inter latin woff2 so text does not wait for the CSS to be parsed.
// The file name is only known after hashing, so this runs on the final bundle.
function preloadInterLatin(): Plugin {
  let base = '/'
  return {
    name: 'joffers:preload-inter-latin',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const font = Object.values(ctx.bundle ?? {}).find((output) =>
          /inter-latin-wght-normal.*\.woff2$/.test(output.fileName),
        )
        if (!font) {
          this.warn('Inter latin woff2 not found in the bundle; no font preload added')
          return html
        }
        return {
          html,
          tags: [{
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: base + font.fileName, crossorigin: true },
            injectTo: 'head',
          }],
        }
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadInterLatin()],
  // GitHub Pages serves the app from /<repo-name>/.
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: ['es2022', ...BROWSERS],
    // No 'es2022' here: Vite expands it to Chrome 94 / Safari 16.4, and Lightning
    // CSS would then lower light-dark() into --lightningcss-* vars that ignore
    // the forced data-theme. check-bundle asserts this stays true.
    cssTarget: BROWSERS,
    // check-bundle.mjs reads .vite/manifest.json to size each route's import graph.
    manifest: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Vitest blanks every CSS import, even ?raw, unless opted in; contrast.test.ts reads CSS as ?raw.
    css: { include: [/\.css\?raw$/] },
  },
})
