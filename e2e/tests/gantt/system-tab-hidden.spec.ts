import { test, expect } from '@playwright/test'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

test.describe('System tab scheduler entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/altair/live/**', async (route) => {
      await route.fulfill({ json: { code: 200, data: null, message: 'ok' } })
    })
    await page.route('**/altair/live/api/admin/scheduler/jobs', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          data: {
            jobs: [
              {
                id: '1',
                service_code: 'live-server',
                service_name: 'Live Server',
                job_code: 'roster_publish_outbound',
                job_name: 'Roster Publish Outbound Callback',
                job_type: 'interval',
                enabled: 1,
                schedule_type: 'fixed_delay',
                interval_seconds: 300,
                cron_expr: null,
                next_run_at: '2026-07-22T14:50:00.000Z',
                last_run_at: '2026-07-22T14:45:00.000Z',
                last_status: 'success',
                last_error: null,
                last_duration_ms: 12,
                locked_at: null,
                locked_by: null,
                updated_by: 'scheduler',
                updated_at: '2026-07-22T14:45:00.000Z',
              },
              {
                id: '2',
                service_code: 'connector-server',
                service_name: 'Connector Server',
                job_code: 'inbound_sync',
                job_name: 'Inbound Sync',
                job_type: 'cron',
                enabled: 0,
                schedule_type: 'cron',
                interval_seconds: null,
                cron_expr: '*/15 * * * *',
                next_run_at: null,
                last_run_at: null,
                last_status: null,
                last_error: null,
                last_duration_ms: null,
                locked_at: null,
                locked_by: null,
                updated_by: 'system',
                updated_at: '2026-07-22T14:45:00.000Z',
              },
            ],
          },
          message: 'ok',
        },
      })
    })
    await page.route('**/altair/live/api/admin/scheduler/jobs/*/runs?*', async (route) => {
      await route.fulfill({ json: { code: 200, data: { runs: [] }, message: 'ok' } })
    })
    await page.route('**/altair/live/api/auth/me', async (route) => {
      await route.fulfill({
        json: {
          code: 200,
          data: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
          message: 'ok',
        },
      })
    })
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({
          user: { userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 },
          token: 'shell-contract-test-token',
        }),
      )
      window.localStorage.setItem('rois-shell-system-item', 'scheduler')
    })
  })

  test('System tab is available and exposes Scheduler', async ({ page }) => {
    await page.goto(`${BASE}/altair/`)
    await page.waitForSelector('[data-testid="module-nav-data"]', { timeout: 20_000 })

    await expect(page.getByTestId('module-nav-system')).toHaveCount(1)
    await page.getByTestId('module-nav-system').click()
    await expect(page.getByTestId('system-nav-scheduler')).toHaveCount(1)
    await expect(page.getByTestId('system-nav-queue-tasks')).toHaveCount(0)
    await expect(page.getByTestId('system-nav-data-quality')).toHaveCount(0)
    await expect(page.getByTestId('scheduler-service-live-server')).toBeVisible()
    await expect(page.getByTestId('scheduler-service-connector-server')).toBeVisible()
    await expect(page.getByTestId('scheduler-job-row-live-server-roster_publish_outbound')).toBeVisible()

    // Neighbouring tabs are untouched.
    await expect(page.getByTestId('module-nav-dashboard')).toHaveCount(1)
    await expect(page.getByTestId('module-nav-data')).toHaveCount(1)
    await expect(page.getByTestId('nav-regression')).toHaveCount(1)
  })

  test("R'Bot floating chat is hidden while Regression remains available", async ({ page }) => {
    await page.goto(`${BASE}/altair/`)
    await page.waitForSelector('[data-testid="module-nav-data"]', { timeout: 20_000 })

    await expect(page.getByTestId('ai-chat-toggle')).toHaveCount(0)
    await expect(page.getByTestId('nav-regression')).toHaveCount(1)
  })

  test('a persisted System session restores System', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('rois-shell-module', 'system')
      localStorage.setItem('rois-shell-open-tabs', JSON.stringify(['system']))
      localStorage.setItem('rois-shell-system-item', 'scheduler')
    })

    await page.goto(`${BASE}/altair/`)
    await page.waitForSelector('[data-testid="module-nav-data"]', { timeout: 20_000 })

    await expect(page.getByTestId('module-nav-system')).toHaveCount(1)
    await page.getByTestId('module-nav-system').click()
    await expect(page.getByTestId('system-nav-scheduler')).toHaveCount(1)
  })
})
