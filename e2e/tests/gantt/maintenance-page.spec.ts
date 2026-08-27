import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const maintenanceHtml = readFileSync(
  path.resolve(__dirname, '../../../deploy/nginx/maintenance.html'),
  'utf8',
)

test.describe('UAT Gantt maintenance page', () => {
  test('renders the fixed English notice', async ({ page }) => {
    await page.route('**/*', (route) =>
      route.fulfill({ status: 503, contentType: 'text/html', body: maintenanceHtml }),
    )
    await page.goto('https://maint.test/altair/')
    await expect(page.getByText('System Under Maintenance')).toBeVisible()
    await expect(page.getByText(/scheduled maintenance/i)).toBeVisible()
  })

  test('auto-reloads when the maintenance gate is lifted', async ({ page }) => {
    let probes = 0
    let gateLifted = false
    let navCount = 0
    page.on('request', (req) => {
      if (req.isNavigationRequest()) navCount += 1
    })

    // Once the gate lifts, a reload must serve the real app (which has no probe
    // JS), not the maintenance page — otherwise the probe would loop forever.
    const appHtml = '<!DOCTYPE html><html lang="en"><body><div id="app">APP LOADED</div></body></html>'

    await page.route('**/*', (route) => {
      const req = route.request()
      const url = new URL(req.url())
      // Only fetch probes (not navigation requests) count toward the gate probe.
      // First probe → 503 (still in maintenance). Second probe → 200 → auto-reload.
      if (!req.isNavigationRequest() && url.pathname.endsWith('/altair/')) {
        probes += 1
        if (probes >= 2) gateLifted = true
        return route.fulfill({
          status: probes >= 2 ? 200 : 503,
          contentType: 'text/html',
          body: maintenanceHtml,
        })
      }
      // Navigation request (initial load or the post-gate reload): serve the app
      // once the gate has been lifted, the maintenance page otherwise.
      return route.fulfill({
        status: gateLifted ? 200 : 503,
        contentType: 'text/html',
        body: gateLifted ? appHtml : maintenanceHtml,
      })
    })

    await page.goto('https://maint.test/altair/?poll=50')
    await expect(page.getByText('System Under Maintenance')).toBeVisible()
    await expect.poll(() => probes, { timeout: 5_000 }).toBeGreaterThanOrEqual(1) // initial on-load probe fired

    // ?poll=50 → interval probe after ~50ms returns 200 → page reloads into the app.
    await expect.poll(() => navCount, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
    await expect(page.getByText('APP LOADED')).toBeVisible()
  })
})
