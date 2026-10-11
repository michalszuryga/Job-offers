import { defineConfig, devices } from '@playwright/test'

// Served under the real GitHub Pages base path, so absolute-URL bugs fail here.
// Specs navigate with page.goto('./…'), relative to baseURL.
const BASE_PATH = '/Job-offers/'
const BASE_URL = `http://localhost:4173${BASE_PATH}`
// The UI kit only exists on the dev server (main.tsx), so kit.spec gets its own.
const KIT_URL = `http://localhost:5174${BASE_PATH}`
// The same dist/ with GitHub Pages semantics (no SPA fallback, real 301s and 404s).
const PAGES_URL = `http://localhost:4174${BASE_PATH}`

// Supabase is mocked at the network level (see e2e/supabase-mock.ts), so the
// app is built against a fake project URL that never resolves. The controller and
// contact are stand-ins for the owner's (web-pages.yml); tests.yml sets the same.
const env = {
  VITE_SUPABASE_URL: 'http://supabase.test',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  VITE_CONTROLLER_NAME: 'Test Controller',
  VITE_CONTACT_EMAIL: 'privacy@example.test',
  BASE_PATH,
}

const preview = 'npm run preview -- --port 4173 --strictPort'
const KIT_SPEC = 'kit.spec.ts'
const PAGES_SPEC = 'pages.spec.ts'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Screenshot specs are opt-in (npm run test:screens / test:visual). Compared with '1'
  // because VISUAL is also the editor variable many shells export.
  grepInvert: process.env.VISUAL === '1' ? undefined : /@screens|@visual/,
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: [KIT_SPEC, PAGES_SPEC] },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: [KIT_SPEC, PAGES_SPEC] },
    // Routing under the real base path as GitHub Pages serves it (plan §6).
    { name: 'pages', use: { ...devices['Desktop Chrome'], baseURL: PAGES_URL }, testMatch: PAGES_SPEC },
    // axe and target sizes on every kit component: 32 px with a mouse, 44 px on touch.
    { name: 'kit', use: { ...devices['Desktop Chrome'], baseURL: KIT_URL }, testMatch: KIT_SPEC },
    { name: 'kit-phone', use: { ...devices['Pixel 7'], baseURL: KIT_URL }, testMatch: KIT_SPEC },
  ],
  webServer: [
    {
      // CI builds once with the same env (and checks the bundle) before the tests.
      command: process.env.PW_PREBUILT === '1' ? preview : `npm run build && ${preview}`,
      url: BASE_URL,
      env,
      reuseExistingServer: !process.env.CI,
    },
    {
      // After the preview entry: webServers start in order, and this one serves the dist/
      // that entry builds.
      command: 'node scripts/static-server.mjs --port 4174',
      url: PAGES_URL,
      env,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Needs no build, so PW_PREBUILT leaves it alone.
      command: 'npm run dev -- --port 5174 --strictPort',
      url: KIT_URL,
      env,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
