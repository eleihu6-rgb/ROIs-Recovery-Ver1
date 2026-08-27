/**
 * Rule 7509/001 — Avoid Co-pairing reaches the real Gantt Alert Center.
 *
 * The test installs a temporary discovered crew-pair fixture, consumes the persisted
 * legality result produced by the server recheck path, and restores the original
 * parameter row in finally before ending.
 */
import { expect, test } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

const WORKSET_PBS_SOLVER = 103

type RuleRow = {
  function: number
  instance: string
  paramJson: { tables: Array<{ header: string[]; rows: string[][] }> }
}

type LiveViolation = {
  crewId?: string
  pairingId: number | null
  ruleCode: string
  severity: number
  message: string
}

type ParamJson = { tables: Array<{ header: string[]; rows: string[][] }> }
type RuleRowWithId = RuleRow & { id: number }
type Fixture = { crewA: string; crewB: string; flightId: number; pairingIds: number[] }

const GROUP = String(WORKSET_PBS_SOLVER)

type DateWindow = { from: string; to: string }

const cloneParamJson = (paramJson: ParamJson): ParamJson =>
  JSON.parse(JSON.stringify(paramJson)) as ParamJson

const withFixtureRow = (paramJson: ParamJson, fixture: Fixture, window: DateWindow): ParamJson => {
  const next = cloneParamJson(paramJson)
  next.tables[0].rows = [[fixture.crewA, fixture.crewB, window.from, window.to]]
  return next
}

const patchParamJson = async (
  request: Parameters<typeof ganttApiLogin>[0],
  token: string,
  ruleId: number,
  paramJson: ParamJson,
): Promise<void> => {
  const res = await request.patch(`${ganttApiUrl}/api/legality/rule/${ruleId}/params`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { paramJson },
    timeout: 60_000,
  })
  expect(res.ok(), `patch 7509 params failed: ${res.status()}`).toBeTruthy()
}

const runRecheck = async (
  request: Parameters<typeof ganttApiLogin>[0],
  token: string,
  window: DateWindow,
): Promise<void> => {
  const statusUrl = `${ganttApiUrl}/api/legality/recheck-status?groupCode=${encodeURIComponent(GROUP)}`
  const readStatus = async (): Promise<string> => {
    const status = await request.get(statusUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    })
    if (!status.ok()) return 'unknown'
    return ((await status.json()) as { data: { status: string } }).data.status
  }

  // PATCH /params also schedules a background refresh. If it is still running,
  // the explicit scoped POST is intentionally deduplicated by the server. Wait
  // for that refresh, then issue the scoped recheck for the selected RP window.
  const waitDone = async (): Promise<void> => {
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const status = await readStatus()
      if (status === 'done') return
      expect(status, '7509 recheck failed').not.toBe('failed')
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    throw new Error('7509 recheck did not settle within 300 seconds')
  }

  if (await readStatus() === 'computing') await waitDone()
  const started = await request.post(`${ganttApiUrl}/api/legality/recheck`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { groupCode: GROUP, from: window.from, to: window.to, ruleCodes: ['7509'] },
    timeout: 60_000,
  })
  expect(started.ok(), `7509 recheck failed: ${started.status()}`).toBeTruthy()
  await waitDone()
}

const selectFixtureRosterPeriod = async (page: Parameters<typeof gotoGantt>[0]): Promise<void> => {
  const trigger = page.getByTestId('toolbar-rp-multiselect-trigger')
  await trigger.click()
  // Add RP06 before removing the default RP08 so the selector never enters its
  // auto-default empty state, which would immediately restore the current RP.
  await page.getByTestId('toolbar-rp-multiselect-opt-6').click()
  await page.getByTestId('toolbar-rp-multiselect-opt-8').click()
  await page.keyboard.press('Escape')

  await page.getByTestId('filter-btn').click()
  await page.getByTestId('filter-dialog').getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
}

const readLoadedWindow = async (page: Parameters<typeof gotoGantt>[0]): Promise<DateWindow> => {
  const range = await page.evaluate(() => {
    const hook = (window as unknown as { __ganttTest: { dateRange: () => { start: string; end: string } } }).__ganttTest
    return hook.dateRange()
  })
  return { from: range.start.slice(0, 10), to: range.end.slice(0, 10) }
}

const discoverFixture = async (page: Parameters<typeof gotoGantt>[0]): Promise<Fixture> => {
  let fixture: Fixture | null = null
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline && fixture === null) {
    fixture = await page.evaluate(() => {
      const hook = (window as unknown as { __ganttTest: { roster: () => Array<Record<string, unknown>> } }).__ganttTest
      const byFlight = new Map<number, Array<{ crewId: string; pairingId: number }>>()
      for (const row of hook.roster()) {
        const flightId = Number(row.fltId)
        const pairingId = Number(row.pairingId)
        const crewId = String(row.crewId ?? '').trim()
        if (!Number.isInteger(flightId) || flightId <= 0 || !Number.isInteger(pairingId) || pairingId <= 0 || !crewId) continue
        const members = byFlight.get(flightId) ?? []
        if (!members.some((member) => member.crewId === crewId && member.pairingId === pairingId)) {
          members.push({ crewId, pairingId })
        }
        byFlight.set(flightId, members)
      }
      for (const [flightId, members] of byFlight) {
        const distinctPairings = [...new Set(members.map((member) => member.pairingId))]
        if (members.length >= 2 && distinctPairings.length >= 2) {
          const [first, second] = members
          return { crewA: first.crewId, crewB: second.crewId, flightId, pairingIds: distinctPairings }
        }
      }
      return null
    })
    if (fixture === null) await page.waitForTimeout(1_000)
  }
  expect(fixture, 'the loaded RP06 roster must contain a physical flight shared by two pairings').not.toBeNull()
  return fixture as Fixture
}

test('Rule-7509 — persisted co-pairing violations identify crew and flight in Alert Center', async ({ page, request }) => {
  test.setTimeout(420_000)

  const token = await ganttApiLogin(request)
  const ruleset = await request.get(`${ganttApiUrl}/api/legality/ruleset/${WORKSET_PBS_SOLVER}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(ruleset.ok(), `legality ruleset fetch failed: ${ruleset.status()}`).toBeTruthy()
  const body = (await ruleset.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((row) => row.function === 7509 && row.instance === '001') as RuleRowWithId | undefined
  expect(rule, '7509/001 must exist in workset 103').toBeTruthy()
  expect(rule!.paramJson.tables[0].header).toEqual(['Crew A', 'Crew B', 'Eff Date', 'Exp Date'])

  const originalParamJson = cloneParamJson(rule!.paramJson)
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  await selectFixtureRosterPeriod(page)
  const window = await readLoadedWindow(page)
  const fixture = await discoverFixture(page)

  try {
    await patchParamJson(request, token, rule!.id, withFixtureRow(originalParamJson, fixture, window))
    await runRecheck(request, token, window)
    await gotoGantt(page)
    await selectFixtureRosterPeriod(page)

    await expect
      .poll(
        () => page.evaluate(() => {
          const hook = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViolation[] } }).__ganttTest
          return (hook?.liveViolations?.() ?? []).filter((row) => row.ruleCode === '7509').length
        }),
        { timeout: 60_000, intervals: [500], message: 'persisted 7509 violations must reach the Gantt store' },
      )
      .toBeGreaterThan(0)

    const violations = await page.evaluate(() => {
      const hook = (window as unknown as { __ganttTest: { liveViolations: () => LiveViolation[] } }).__ganttTest
      return hook.liveViolations().filter((row) => row.ruleCode === '7509')
    })
    expect(violations.every((row) => row.pairingId != null && row.pairingId > 0)).toBe(true)
    expect(violations.every((row) => row.crewId)).toBe(true)
    expect(violations.some((row) => /co-paired on flight/i.test(row.message))).toBe(true)

    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '7509/001' })).toHaveCount(1)

    const rows = dialog.locator('[data-testid="violation-list-row"][data-rule-id="7509/001"]')
    await expect.poll(() => rows.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    await expect(rows.first()).toContainText('7509/001')
    await expect(rows.first()).toContainText(/co-paired on flight/i)
  } finally {
    await patchParamJson(request, token, rule!.id, originalParamJson)
    await runRecheck(request, token, window)
  }
})
