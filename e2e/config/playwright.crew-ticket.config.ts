import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '../tests/crew-app', testMatch: 'ticket-mockup.spec.ts', workers: 1, reporter: 'list', use: { browserName: 'chromium', channel: 'chrome', headless: true } });
