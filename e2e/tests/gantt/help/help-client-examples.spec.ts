import { test, expect, type Page } from '@playwright/test'
import { ganttApiUrl } from '../../../utils/gantt-hook'
import { openHelp } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

/**
 * Help examples must be CLIENT-SPECIFIC — they use the airline's own base airport from
 * `/api/ai/hints`, never a hardcoded "BKK / Asia/Bangkok".
 */
test.describe('Help examples are client-specific', () => {
  let base: string

  test.beforeEach(async ({ page, request }) => {
    const login = await request.post(`${ganttApiUrl}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(login.ok(), `gantt login failed: ${login.status()}`).toBeTruthy()
    const token = ((await login.json()) as { data: { token: string } }).data.token
    const res = await request.get(`${ganttApiUrl}/api/ai/hints`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    base = ((await res.json()) as { data: { base: string } }).data.base
    expect(base, 'client base airport from /api/ai/hints').toBeTruthy()

    await openHelp(page, BASE)
  })

  const openTopic = async (page: Page, nav: string) => {
    const search = page.getByPlaceholder('Search topics…')
    await search.fill(nav)
    await page.getByRole('button', { name: nav, exact: true }).first().click()
    await page.getByRole('article').waitFor({ timeout: 5_000 })
  }

  test('Live-1074 — timezone topic uses the client base, not BKK / Bangkok', async ({ page }) => {
    await openTopic(page, 'Switching time zones')
    const article = page.getByRole('article')
    await expect(article).toContainText(base)
    await expect(article).not.toContainText('BKK')
    await expect(article).not.toContainText('Bangkok')
  })
})
