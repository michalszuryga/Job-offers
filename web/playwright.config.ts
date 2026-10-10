import { defineConfig, devices } from '@playwright/test'

// Supabase is mocked at the network level (see e2e/supabase-mock.ts), so the
// app is built against a fake project URL that never resolves.
const env = {
  VITE_SUPABASE_URL: 'http://supabase.test',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    env,
    reuseExistingServer: !process.env.CI,
  },
})
