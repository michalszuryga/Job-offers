import { defineConfig, devices } from '@playwright/test'

// Served under the real GitHub Pages base path, so absolute-URL bugs fail here.
// Specs navigate with page.goto('./…'), relative to baseURL.
const BASE_PATH = '/Job-offers/'
const BASE_URL = `http://localhost:4173${BASE_PATH}`

// Supabase is mocked at the network level (see e2e/supabase-mock.ts), so the
// app is built against a fake project URL that never resolves.
const env = {
  VITE_SUPABASE_URL: 'http://supabase.test',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  BASE_PATH,
}

const preview = 'npm run preview -- --port 4173 --strictPort'

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
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // CI builds once with the same env (and checks the bundle) before the tests.
    command: process.env.PW_PREBUILT === '1' ? preview : `npm run build && ${preview}`,
    url: BASE_URL,
    env,
    reuseExistingServer: !process.env.CI,
  },
})
