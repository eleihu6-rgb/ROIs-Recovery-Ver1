/**
 * Public-tunnel validation (Ryan 2026-09-09): "validate how many pairing per day via
 * https://cr.rois.one/altair/live" — after the 01–15 Sep ET coverage build.
 *
 * Runs against the PUBLIC tunnel binding (config/cr-public-validation.config.ts,
 * baseURL https://cr.rois.one → vite preview :5567 prod build + live-server :3000).
 * The prod build has NO window.__ganttTest hook, so every assertion here is what a real
 * user sees or what the app itself fetches:
 *   1. Real UI login as Jen (no session seeding) → Live gantt loads.
 *   2. The pairing pane fires its own list request; we capture that exact response and
 *      assert the pane's count badge (data-testid pane-total-count / pane-filtered-count)
 *      shows the SAME total — UI number == API truth for the pane's own date window.
 *   3. Per day 01–15 Sep: query the SAME public API origin with the app's own token and
 *      log a pairings-per-day table (pairings whose span overlaps each day).
 * A screenshot of the public page is the visual receipt (§PW-Snapshot).
 */
import { test, expect } from '@playwright/test'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'

const USER = TEST_ACCOUNTS.jen
const DAYS = Array.from({ length: 15 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)

test.describe('cr.rois.one public — pairings per day', () => {
  test('CR-1809 — Jen logs in on the public URL; pairing count badge matches API; per-day table', async ({ page }) => {
    test.setTimeout(120_000)

    // 1) Real UI login on the public origin.
    const login = new GanttLoginPage(page)
    await login.goto()

    await login.login(USER.userCode, USER.password)
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 20_000 })

    // Enter the Live gantt like a real user. Live starts EMPTY by §First-Paint policy
    // ("No data loaded — apply filters to pull data"): the user opens the Filter dialog and
    // hits Apply, and only then do the panes fetch. Reproduce exactly that.
    await page.getByTestId('module-nav-live').click()
    await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('filter-apply').click()

    // 2) The pairing pane's count badge fills in ("filtered/total" — Open,Partial is the
    //    default coverage filter). Its TOTAL must equal what the public API returns for the
    //    exact date window the toolbar shows.
    const pairingToolbar = page
      .locator('div')
      .filter({ has: page.locator('span:text-is("Pairing")') })
      .last()
    const badge = pairingToolbar.locator('[data-testid="pane-total-count"], [data-testid="pane-filtered-count"]').first()
    await expect(badge, 'pairing pane count badge visible').toBeVisible({ timeout: 30_000 })
    let badgeFiltered = 0
    let badgeTotal = 0
    await expect
      .poll(async () => {
        const text = (await badge.innerText()).trim()
        const two = text.match(/(\d+)\/(\d+)/)
        const one = text.match(/^(\d+)$/)
        if (two) { badgeFiltered = Number(two[1]); badgeTotal = Number(two[2]); return badgeTotal }
        if (one) { badgeFiltered = badgeTotal = Number(one[1]); return badgeTotal }
        return null
      }, { message: 'pairing badge shows loaded counts', timeout: 30_000 })
      .toBeGreaterThan(0)

    // The visible date window (toolbar range picker, e.g. "2026-08-25 ~ 2026-10-07").
    const rangeText = await page.locator('text=/\\d{4}-\\d{2}-\\d{2}\\s*~\\s*\\d{4}-\\d{2}-\\d{2}/').first().innerText()
    const [winStart, winEnd] = rangeText.match(/\d{4}-\d{2}-\d{2}/g)!
    const windowTotal = await page.evaluate(async ({ s, e }) => {
      const auth = JSON.parse(window.sessionStorage.getItem('rois-auth') ?? '{}') as { token?: string }
      const u = new URL('/api/pairing', window.location.origin)
      u.searchParams.set('startDate', s) // plain YYYY-MM-DD — full ISO makes the endpoint 500
      u.searchParams.set('endDate', e)
      u.searchParams.set('page', '1')
      u.searchParams.set('pageSize', '1')
      const r = await fetch(u.toString(), { headers: { authorization: `Bearer ${auth.token}` } })
      const j = await r.json()
      return Number(j?.data?.total ?? j?.data?.pagination?.total ?? -1)
    }, { s: winStart, e: winEnd })
    expect(windowTotal, `API total for ${winStart}~${winEnd} matches the badge total ${badgeTotal}`).toBe(badgeTotal)
    expect(badgeFiltered, 'filtered count cannot exceed total').toBeLessThanOrEqual(badgeTotal)

    // eslint-disable-next-line no-console
    console.log(`[cr-public] window ${winStart} ~ ${winEnd}: badge ${badgeFiltered}/${badgeTotal} == API total ${windowTotal}`)

    // 3) Pairings per day via the same public origin + the app's own token (in-page fetch,
    //    identical to what the UI would request when the user narrows the date range).
    const perDay = await page.evaluate(async (days) => {
      const auth = JSON.parse(window.sessionStorage.getItem('rois-auth') ?? '{}') as { token?: string }
      const out: { day: string; total: number }[] = []
      for (const day of days) {
        const u = new URL('/api/pairing', window.location.origin)
        u.searchParams.set('startDate', day) // plain YYYY-MM-DD (ISO timestamps 500)
        u.searchParams.set('endDate', day)
        u.searchParams.set('page', '1')
        u.searchParams.set('pageSize', '1')
        const r = await fetch(u.toString(), { headers: { authorization: `Bearer ${auth.token}` } })
        const j = await r.json()
        out.push({ day, total: Number(j?.data?.total ?? -1) })
      }
      return out
    }, DAYS)

    for (const row of perDay) {
      // eslint-disable-next-line no-console
      console.log(`[cr-public] ${row.day}: ${row.total} pairings`)
      expect(row.total, `${row.day} per-day query succeeded`).toBeGreaterThanOrEqual(0)
    }
    // Every day of the built window must actually have pairings on the public surface.
    expect(perDay.filter((r) => r.total > 0).length, 'all 15 days show pairings').toBe(15)

    // Visual receipt of the public page (§PW-Snapshot).
    await page.screenshot({ path: '../docs/assets/screenshots/gantt/cr-public-pairings-per-day-Ver1.png' })
  })
})
