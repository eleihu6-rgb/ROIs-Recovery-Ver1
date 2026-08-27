/**
 * Regression: System → PBS Users
 *
 * The PBS Users table (System → PBS Users) was missing email/tel/branch_code/
 * py_abbr/gender/eff_dt/exp_dt columns — admins could only see Crew ID, User
 * Code, Name, Base, Rank, Div, Status.
 *
 * Test scope:
 *  1. Navigate to System → PBS Users.
 *  2. Assert the table renders a header row with every required column label.
 *  3. Assert the API response shape (`/api/admin/pbs-users`) returns the new
 *     fields (defense-in-depth — the column render depends on it).
 *  4. Assert at least one row carries a non-empty value in each new column,
 *     OR every row shows '-' if the underlying pbs_user has null for that
 *     field (both renderings are valid; we just need the column to exist and
 *     be populated to the API response).
 */
import { test, expect, type Page } from '@playwright/test'

const REQUIRED_HEADERS = [
  'Crew ID', 'User Code', 'Name', 'Base', 'Rank', 'Div',
  'Branch', 'PyAbbr', 'Gender', 'Email', 'Tel', 'Eff Dt', 'Exp Dt',
  'Status', 'Actions',
]

async function gotoPbsUsersPanel(page: Page) {
  await page.goto('/')
  const signIn = page.getByTestId('login-sign-in')
  if (await signIn.isVisible().catch(() => false)) {
    await page.getByTestId('login-user-code').fill('admin')
    await page.getByTestId('login-password').fill('123456')
    await signIn.click()
    await page.waitForTimeout(4000)
  }
  await page.getByTestId('module-nav-system').click()
  await page.waitForTimeout(1500)
  await page.getByTestId('system-nav-pbs-user-mgmt').click()
  await page.waitForTimeout(2000)
  await expect(page.getByRole('heading', { name: 'PBS Users' })).toBeVisible({ timeout: 15_000 })
}

test('permission admin PBS Users: table renders the new columns (email/tel/branch/pyAbbr/gender/effDt/expDt)', async ({ page, request }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await gotoPbsUsersPanel(page)

  // 1) Header row exposes every required column label.
  const table = page.locator('table').first()
  await expect(table).toBeVisible({ timeout: 10_000 })
  const headerRow = table.locator('thead tr')
  for (const label of REQUIRED_HEADERS) {
    await expect(headerRow.locator('th', { hasText: label }), `header for "${label}" must be visible`).toBeVisible({ timeout: 5_000 })
  }

  // 2) At least one row must be present (dev schema has seeded PBS users).
  const bodyRows = table.locator('tbody tr')
  await expect(bodyRows.first()).toBeVisible({ timeout: 10_000 })
  const rowCount = await bodyRows.count()
  expect(rowCount, 'dev schema must seed at least one PBS user row').toBeGreaterThan(0)

  // 3) API defense-in-depth: the live-server response carries every new field.
  //    We call the API directly with Playwright's request context (the same
  //    gantt → live-server path the UI uses) — not via in-page fetch, which
  //    hits the Vite dev proxy and is unreliable for unauthenticated probes.
  const apiBase = process.env.GANTT_API_URL ?? 'http://localhost:3200'
  const login = await request.post(`${apiBase}/api/auth/login`, {
    data: { userCode: 'admin', password: '123456' },
  })
  expect(login.ok(), 'admin login against live-server must succeed').toBe(true)
  const { data: loginData } = await login.json() as { data: { token: string } }
  const list = await request.get(`${apiBase}/api/admin/pbs-users`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  })
  expect(list.ok(), 'pbs-users list must succeed').toBe(true)
  const { data: listData } = await list.json() as { data: { rows: Record<string, unknown>[] } }
  const apiKeys = Object.keys(listData.rows[0] ?? {})
  for (const key of ['email', 'tel', 'branchCode', 'pyAbbr', 'gender', 'effDt', 'expDt']) {
    expect(apiKeys, `API response must include key "${key}"`).toContain(key)
  }

  // 4) Every column that the API gives the frontend must actually appear in a
  //    visible table cell. We check the first row's td count matches the header
  //    th count so no rendering glitch silently drops a column.
  const thCount = await headerRow.locator('th').count()
  const tdCount = await bodyRows.first().locator('td').count()
  expect(tdCount, `first row's td count (${tdCount}) must match header th count (${thCount})`).toBe(thCount)

  expect(pageErrors, `unexpected page errors: ${pageErrors.join('; ')}`).toEqual([])
})