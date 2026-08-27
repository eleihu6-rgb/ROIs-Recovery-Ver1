/**
 * Cloudflare tunnel connectivity smoke tests.
 *
 * Verifies that:
 * 1. The local gantt dev server (:5173, the tunnel origin) is serving the login page.
 * 2. The public tunnel URL (flair.rois.cloud) reaches the same page.
 *
 * Run local only:
 *   npx playwright test e2e/tests/gantt/tunnel-connection.spec.ts --grep "@local" --project=gantt-setup
 *
 * Run tunnel URL:
 *   npx playwright test e2e/tests/gantt/tunnel-connection.spec.ts --grep "@tunnel" --project=gantt-setup
 */
import { test, expect } from '@playwright/test'

const LOCAL = process.env.GANTT_ORIGIN ?? 'http://localhost:5173'
const TUNNEL = 'https://flair.rois.cloud'
const GANTT_PATH = '/altair/'

// Force Chromium to resolve flair.rois.cloud to Cloudflare's proxy IP
// when the local system DNS has a stale negative cache (e.g. Tailscale MagicDNS).
test.use({
  launchOptions: {
    args: ['--host-resolver-rules=MAP flair.rois.cloud 172.67.209.130'],
  },
})

test.describe('Cloudflare Tunnel — flair.rois.cloud', () => {
  test('Live-1230 — local: gantt serves login page at the tunnel origin @local', async ({ page }) => {
    await page.goto(`${LOCAL}${GANTT_PATH}`)
    await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('login-user-code')).toBeVisible()
    await expect(page.getByTestId('login-sign-in')).toBeVisible()
  })

  test('Live-1231 — tunnel: flair.rois.cloud serves gantt login page @tunnel', async ({ page }) => {
    await page.goto(`${TUNNEL}${GANTT_PATH}`)
    await expect(page.getByRole('heading', { name: 'ROIS' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('login-user-code')).toBeVisible()
    await expect(page.getByTestId('login-sign-in')).toBeVisible()
  })

  test('Live-1232 — tunnel: page title matches app @tunnel', async ({ page }) => {
    await page.goto(`${TUNNEL}${GANTT_PATH}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/ROIS|Gantt|Crew/i, { timeout: 20_000 })
  })

  test('Live-1233 — tunnel: API health via vite proxy (live-server) @tunnel', async ({ page }) => {
    // Use page.evaluate so the request goes through Chromium's network stack
    // (respects --host-resolver-rules, unlike the Node.js `request` fixture).
    const status = await page.evaluate(async (url) => {
      const res = await fetch(url)
      return res.status
    }, `${TUNNEL}/altair/live/health`)
    expect(status).toBeLessThan(500)
  })
})
