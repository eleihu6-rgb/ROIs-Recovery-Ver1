/**
 * Legal-6042 — param date columns: calendar icon fills YYYY-MM-DD (7509 Eff/Exp).
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, seedGanttAuth } from '../../utils/gantt-hook'

const WORKSET_PBS_SOLVER = 103

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const monthOrdinal = (year: number, monthIndex: number): number => year * 12 + monthIndex

const readCalendarMonth = async (page: Page): Promise<number | null> => {
  const calendar = page.getByRole('grid', { name: 'Pick date calendar' })
  const header = calendar.locator('..').locator('.text-sm.font-semibold.text-foreground').first()
  const text = ((await header.textContent()) ?? '').trim()
  const match = /^(\w+) (\d{4})$/.exec(text)
  if (!match) return null
  const monthIndex = MONTH_LONG.indexOf(match[1] as (typeof MONTH_LONG)[number])
  if (monthIndex < 0) return null
  return monthOrdinal(Number(match[2]), monthIndex)
}

const pickCalendarDay = async (page: Page, isoDate: string): Promise<void> => {
  const [yearStr, monthStr, dayStr] = isoDate.split('-')
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1
  const day = Number(dayStr)

  const calendar = page.getByRole('grid', { name: 'Pick date calendar' })
  await expect(calendar).toBeVisible()
  const popover = calendar.locator('xpath=..')

  const ariaLabel = `Select ${MONTH_SHORT[monthIndex]} ${day}, ${year}`
  const dayCell = page.getByRole('gridcell', { name: new RegExp(ariaLabel, 'i') })
  const targetOrdinal = monthOrdinal(year, monthIndex)

  for (let attempt = 0; attempt < 360; attempt++) {
    if (await dayCell.isVisible()) {
      await dayCell.click()
      return
    }
    const current = await readCalendarMonth(page)
    if (current === null || current < targetOrdinal) {
      await popover.getByRole('button', { name: 'Next month' }).click()
    } else {
      await popover.getByRole('button', { name: 'Previous month' }).click()
    }
  }

  throw new Error(`Could not select calendar day ${isoDate}`)
}

const snapshot7509 = async (request: APIRequestContext) => {
  const token = await ganttApiLogin(request)
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `legality ruleset fetch failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as {
    data: { rules: Array<{ id: number; function: number; instance: string; paramJson: unknown }> }
  }
  const rule = body.data.rules.find((r) => r.function === 7509 && r.instance === '001')
  expect(rule, '7509/001 must exist in workset 103').toBeTruthy()
  return { token, ruleId: rule!.id, paramJson: rule!.paramJson }
}

const restoreParams = async (
  request: APIRequestContext,
  token: string,
  ruleId: number,
  paramJson: unknown,
) => {
  await request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
  })
}

const open7509Editor = async (page: Page, request: APIRequestContext) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-nav-rule-instances').click()
  await page.getByTestId('rule-instances-view').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByTestId('rule-instances-search').fill('7509/001')
  const row = page.getByTestId('rule-instance-row-7509-001')
  await expect(row).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('rule-instance-edit-7509-001').click()
  await page.getByTestId('rule-instance-params-7509-001').waitFor({ state: 'visible', timeout: 10_000 })
  await expect(page.getByTestId('legality-params-editor-7509-001')).toBeVisible()
}

test('Legal-6042 — calendar fills Eff Date and Exp Date as YYYY-MM-DD', async ({ page, request }) => {
  test.setTimeout(120_000)
  const snap = await snapshot7509(request)
  try {
    await open7509Editor(page, request)

    const rows = page.locator('[data-testid^="legality-param-row-7509-001-0-"]')
    if ((await rows.count()) === 0) {
      await page.getByTestId('legality-param-add-row-7509-001-0').click()
    }

    const ri = 0
    await page.getByTestId(`legality-param-edit-7509-001-0-${ri}`).click()

    const crewA = page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-0`)
    const crewB = page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-1`)
    if (!(await crewA.inputValue()).trim()) await crewA.fill('1001')
    if (!(await crewB.inputValue()).trim()) await crewB.fill('2002')

    await page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-2`).fill('2026-08-01')
    await page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-2-calendar`).click()
    await pickCalendarDay(page, '2026-08-15')
    await expect(page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-2`)).toHaveValue('2026-08-15')

    await page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-3`).fill('2026-08-01')
    await page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-3-calendar`).click()
    await pickCalendarDay(page, '2026-08-20')
    await expect(page.getByTestId(`legality-param-cell-input-7509-001-0-${ri}-3`)).toHaveValue('2026-08-20')

    await page.getByTestId(`legality-param-cancel-edit-7509-001-0-${ri}`).click()
  } finally {
    await restoreParams(request, snap.token, snap.ruleId, snap.paramJson)
  }
})
