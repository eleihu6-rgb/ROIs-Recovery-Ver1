/**
 * Viol-8012 — END-TO-END USER STORY:
 * edit rule 8056/001 Space from 13 to 14 in ruleset 103, let the scoped live
 * recheck auto-fire, then confirm the live warning text includes both duty
 * date-times and the updated 14 RH threshold.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { ganttApiLogin, ganttApiUrl, gotoGantt, seedGanttAuth, setDateRange } from '../../utils/gantt-hook'

const DEFAULT_RULESET = 103
const GROUP = 'pbs_solver_ruleset'
const FROM = '2026-06-01'
const TO = '2026-07-01'

type ParamTable = { header: string[]; rows: string[][] }
type RuleRow = {
  function: number
  id: number
  instance: string
  paramJson: { tables: ParamTable[] }
}

type LiveViolation = { ruleCode: string; message: string }
type RecheckStatus = { status: string; lastCheckedAt: string | null }

const DATE_TIME_14H_RE =
  /Rest between \(.+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\) and \(.+ \d{4}-\d{2}-\d{2} \d{2}:\d{2}\) is -?\d+:\d{2}, which is below the required 14 RH\./

const getRule8056 = async (request: APIRequestContext, token: string): Promise<RuleRow> => {
  const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${DEFAULT_RULESET}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60_000,
  })
  expect(res.ok(), `get ruleset failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((r) => r.function === 8056 && r.instance === '001')
  expect(rule, '8056/001 not found in ruleset 103').toBeTruthy()
  return rule!
}

const cloneParamJson = (paramJson: RuleRow['paramJson']): RuleRow['paramJson'] =>
  JSON.parse(JSON.stringify(paramJson)) as RuleRow['paramJson']

const withSpace = (paramJson: RuleRow['paramJson'], spaceCol: number, value: string): RuleRow['paramJson'] => {
  const next = cloneParamJson(paramJson)
  next.tables[0].rows[0][spaceCol] = value
  return next
}

const readRecheckStatus = async (
  request: APIRequestContext,
  token: string,
): Promise<RecheckStatus> => {
  const res = await request.get(`${ganttApiUrl}/api/legality/recheck-status?groupCode=${GROUP}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 60_000,
  })
  expect(res.ok(), `recheck-status failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: RecheckStatus }
  return body.data
}

const waitRecheckDoneAfter = async (
  request: APIRequestContext,
  token: string,
  sinceIso: string | null,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let unchangedDoneCount = 0
  while (Date.now() < deadline) {
    const status = await readRecheckStatus(request, token).catch(
      () => ({ status: 'busy', lastCheckedAt: null }) as RecheckStatus,
    )
    if (status.status === 'done') {
      if (!sinceIso || status.lastCheckedAt !== sinceIso) return
      unchangedDoneCount += 1
      if (unchangedDoneCount >= 2) return
    } else {
      unchangedDoneCount = 0
    }
    if (status.status === 'failed') throw new Error('recheck failed')
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error('recheck did not finish in time')
}

const triggerScopedRecheck = async (
  request: APIRequestContext,
  token: string,
  sinceIso: string | null,
): Promise<void> => {
  const res = await request.post(`${ganttApiUrl}/api/legality/recheck`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { groupCode: GROUP, from: FROM, to: TO, ruleCodes: ['8056'] },
    timeout: 60_000,
  })
  expect(res.ok(), `scoped recheck failed: ${res.status()}`).toBeTruthy()
  await waitRecheckDoneAfter(request, token, sinceIso, 300_000)
}

const openLegality103 = async (page: Page, request: APIRequestContext): Promise<void> => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId(`legality-ruleset-card-${DEFAULT_RULESET}`).click()
  await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', {
    timeout: 10_000,
  })
}

const setJuneRange = async (page: Page): Promise<void> => {
  await setDateRange(page, FROM, TO)
}

const read8056Messages = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const testHook = (window as unknown as {
      __ganttTest?: { liveViolations?: () => LiveViolation[] }
    }).__ganttTest
    return (testHook?.liveViolations?.() ?? [])
      .filter((v) => v.ruleCode === '8056')
      .map((v) => v.message)
  })

const waitViolStreamSettled = async (page: Page, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let lastCount = -1
  let stableSince = 0
  while (Date.now() < deadline) {
    const count = (await read8056Messages(page)).length
    if (count > 0 && count === lastCount) {
      if (stableSince === 0) stableSince = Date.now()
      if (Date.now() - stableSince >= 3_000) return
    } else {
      stableSince = 0
      lastCount = count
    }
    await page.waitForTimeout(1_000)
  }
  throw new Error('8056 violation stream did not settle in time')
}

test('Viol-8012 — edit 8056/001 Space 13→14 and confirm live warning text', async ({
  page,
  request,
}) => {
  test.setTimeout(600_000)

  const token = await ganttApiLogin(request)
  const rule = await getRule8056(request, token)
  const originalParamJson = cloneParamJson(rule.paramJson)
  const spaceCol = originalParamJson.tables[0].header.findIndex(
    (h) => String(h).toLowerCase() === 'space',
  )
  expect(spaceCol, 'expected Space column in 8056/001').toBeGreaterThanOrEqual(0)

  try {
    const currentSpace = String(originalParamJson.tables[0].rows[0][spaceCol] ?? '')
    if (currentSpace !== '13') {
      const baseline13 = withSpace(originalParamJson, spaceCol, '13')
      const before = await readRecheckStatus(request, token)
      const patch = await request.patch(`${ganttApiUrl}/api/legality/rule/${rule.id}/params`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { paramJson: baseline13 },
        timeout: 60_000,
      })
      expect(patch.ok(), `failed pre-baseline 8056 Space 13: ${patch.status()}`).toBeTruthy()
      await triggerScopedRecheck(request, token, before.lastCheckedAt)
    }

    await openLegality103(page, request)
    await page.getByTestId('legality-rule-edit-8056-001').click()
    await page.getByTestId('legality-params-editor-8056-001').waitFor({
      state: 'visible',
      timeout: 5_000,
    })
    await page.getByTestId('legality-param-edit-8056-001-0-0').click()

    const rowDialog = page.getByTestId('param-row-dialog')
    await expect(rowDialog).toBeVisible({ timeout: 5_000 })
    const spaceCell = page.getByTestId(`param-row-dialog-cell-${spaceCol}`)
    await expect(spaceCell).toHaveValue('13')
    await spaceCell.fill('14')
    await page.getByTestId('param-row-dialog-confirm').click()
    await expect(rowDialog).toBeHidden({ timeout: 5_000 })

    const before = await readRecheckStatus(request, token)
    const autoPost = page.waitForRequest(
      (req) => req.url().includes('/api/legality/recheck') && req.method() === 'POST',
      { timeout: 15_000 },
    )

    await page.getByTestId('param-save-all-btn').click()
    await expect(page.getByTestId('param-change-log-panel')).toContainText('No changes yet', {
      timeout: 10_000,
    })

    const req = await autoPost
    const body = JSON.parse(req.postData() ?? '{}') as {
      from?: string
      ruleCodes?: string[]
      to?: string
    }
    expect(body.ruleCodes).toEqual(['8056'])
    expect(body.from).toBeTruthy()
    expect(body.to).toBeTruthy()

    await waitRecheckDoneAfter(request, token, before.lastCheckedAt, 300_000)

    await gotoGantt(page)
    await setJuneRange(page)
    await waitViolStreamSettled(page, 90_000)

    const hookMessages = await read8056Messages(page)
    expect(
      hookMessages.some((message) => DATE_TIME_14H_RE.test(message)),
      `expected 8056 message with embedded date-times and 14 RH; got ${hookMessages.slice(0, 3).join(' | ')}`,
    ).toBe(true)

    await page.getByTestId('violations-button').first().click()
    const alertCenter = page.getByTestId('violation-list-dialog')
    await expect(alertCenter).toBeVisible({ timeout: 10_000 })
    await alertCenter.getByTestId('alert-groupby-rule').click()

    const rows8056 = alertCenter.locator('[data-testid="violation-list-row"][data-rule-id="8056/001"]')
    await expect.poll(() => rows8056.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    await expect(rows8056.first()).toContainText(DATE_TIME_14H_RE)

    await page.getByTestId('violation-list-dialog-close').click()
    await expect(alertCenter).toBeHidden({ timeout: 10_000 })
  } finally {
    await request.patch(`${ganttApiUrl}/api/legality/rule/${rule.id}/params`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { paramJson: originalParamJson },
      timeout: 60_000,
    })
  }
})
