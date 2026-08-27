import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl, readHook, setDateRange } from '../../utils/gantt-hook'

/**
 * Crew Memo + PA-removal (Live-13xx).
 *
 * Backend reuses the existing crew_memo table; the gantt draws a note icon on each
 * roster puck that owns a memo. R'Bot's "remove pre-assignment (PA) for solver"
 * writes type=3 memos visualizing the to-be-de-assigned duties.
 *
 * §No-Illusion: every assertion checks real counts / real rendered badges, not mere
 * visibility.
 */
const FROM = '2026-06-01T00:00:00Z'
const TO = '2026-07-01T00:00:00Z'

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

test.describe('Crew Memo CRUD (Live-1301)', () => {
  test('create → list → delete round-trips a memo', async ({ request }) => {
    const token = await ganttApiLogin(request)
    // Use a throwaway crew id so we never disturb real roster data.
    const crewId = 'E2E-MEMO-1'

    const created = await request.post(`${ganttApiUrl}/api/crew-memo`, {
      ...auth(token),
      data: { crewId, strDtLoc: FROM, endDtLoc: TO, memo: 'regression note', name: 'Manual', type: 1 },
    })
    expect(created.ok()).toBeTruthy()
    const memo = (await created.json()).data
    expect(memo.memo).toBe('regression note')
    expect(memo.status).toBe('Y')

    const listed = await request.get(
      `${ganttApiUrl}/api/crew-memo?crewIds=${crewId}&from=${FROM}&to=${TO}`, auth(token))
    const rows = (await listed.json()).data
    expect(rows.find((m: { id: number }) => m.id === memo.id)?.memo).toBe('regression note')

    const del = await request.delete(`${ganttApiUrl}/api/crew-memo/${memo.id}`, auth(token))
    expect((await del.json()).data.id).toBe(memo.id)

    const afterDel = await request.get(
      `${ganttApiUrl}/api/crew-memo?crewIds=${crewId}&from=${FROM}&to=${TO}`, auth(token))
    const rowsAfter = (await afterDel.json()).data
    expect(rowsAfter.find((m: { id: number }) => m.id === memo.id)).toBeUndefined()
  })
})

test.describe('PA-removal stage 1 (Live-1302)', () => {
  test('crew 113 → 6 flying + 21 day-off memos', async ({ request }) => {
    const token = await ganttApiLogin(request)
    const res = await request.post(`${ganttApiUrl}/api/crew-memo/pa-removal`, {
      ...auth(token),
      data: { crewIds: ['113'], from: FROM, to: TO },
    })
    expect(res.ok()).toBeTruthy()
    const data = (await res.json()).data
    expect(data.written).toBe(27)
    expect(data.byCrew['113']).toBe(27)

    const listed = await request.get(
      `${ganttApiUrl}/api/crew-memo?crewIds=113&from=${FROM}&to=${TO}`, auth(token))
    const rows = (await listed.json()).data as Array<{ name: string }>
    expect(rows.filter((m) => m.name === 'De-assign pairing')).toHaveLength(6)
    expect(rows.filter((m) => m.name === 'De-assign day off')).toHaveLength(21)
  })
})

test.describe('Crew Memo icons render on the gantt (Live-1303)', () => {
  test('crew 113 pucks draw note icons after PA-removal', async ({ page, request }) => {
    const token = await ganttApiLogin(request)
    // Seed the plan BEFORE loading the board so the post-first-paint fetch picks it up.
    await request.post(`${ganttApiUrl}/api/crew-memo/pa-removal`, {
      ...auth(token), data: { crewIds: ['113'], from: FROM, to: TO },
    })

    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await page.getByTestId('module-nav-live').click()

    const empty = page.getByTestId('live-empty-state')
    let atEmpty = true
    try { await empty.waitFor({ state: 'visible', timeout: 5_000 }) } catch { atEmpty = false }
    const pick = async (prefix: string, vals: string[]) => {
      await page.getByTestId(`${prefix}-trigger`).click()
      for (const v of vals) {
        const opt = page.getByTestId(`${prefix}-opt-${v}`)
        await expect(opt).toBeVisible({ timeout: 30_000 }) // reference data can be slow
        await opt.click()
      }
      await page.getByTestId('filter-tab-crew').click()
    }
    if (atEmpty) await empty.click(); else await page.getByTestId('filter-btn').click()
    await expect(page.getByTestId('filter-dialog')).toBeVisible()
    await page.getByTestId('filter-tab-crew').click().catch(() => {})
    await pick('filter-crew-base', ['YVR'])
    await pick('filter-crew-rank', ['CA', 'FO'])
    const idIn = page.getByPlaceholder('e.g. 12345, 67890')
    await idIn.fill('113'); await idIn.press('Enter')
    await page.getByTestId('filter-apply').click()
    await expect(page.getByTestId('filter-dialog')).toBeHidden()
    await empty.waitFor({ state: 'hidden', timeout: 270_000 }).catch(() => {})
    await setDateRange(page, '2026-06-01', '2026-06-30')

    // Wait for crew 113's roster items to stream from the slow remote demo DB.
    await expect.poll(
      () => page.evaluate(() => (window.__ganttTest.roster?.() ?? [])
        .filter((r) => String((r as { crewId?: unknown }).crewId) === '113').length),
      { timeout: 300_000, message: 'crew 113 roster items never loaded' },
    ).toBeGreaterThan(0)

    // Memos fetched post-first-paint, and the matching pucks draw note icons.
    await expect.poll(() => readHook<number>(page, 'memoCount'), { timeout: 60_000 })
      .toBeGreaterThan(0)
    const badges = await page.evaluate(() => window.__ganttTest.memoBadges())
    expect(badges.length).toBeGreaterThan(0)
  })
})
