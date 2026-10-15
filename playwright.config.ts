import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'https://localhost:5188', ignoreHTTPSErrors: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node --import tsx tests/serve.ts', url: 'https://localhost:5188/api/bootstrap', ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 30000 },
})
