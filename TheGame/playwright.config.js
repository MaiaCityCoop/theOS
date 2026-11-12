import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun ./node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
