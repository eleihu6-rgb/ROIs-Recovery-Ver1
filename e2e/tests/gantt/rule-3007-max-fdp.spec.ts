/**
 * Rule 3007/001 — Max FDP Per Duty reaches the real Gantt Alert Center.
 *
 * Temporarily tightens MAX FDP to 01:00, scoped-rechecks 3007, then asserts Alert
 * Center lists 3007/001. Restores the original param_json in finally.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl, gotoGantt, seedGanttAuth } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')

type ParamJson = { tables: Array<{ header: string[]; rows: string[][] }> }
type RuleRow = {
  id: number
  function: number
  instance: string
  paramJson: ParamJson
}
type RulesetListItem = { id: number; isDefault?: boolean; ruleCount?: number }
type LiveViolation = {
  crewId?: string
  pairingId: number | null
  ruleCode: string
  severity: number
  message: string
}
type DateWindow = { from: string; to: string }

const cloneParamJson = (paramJson: ParamJson): ParamJson =>
  JSON.parse(JSON.stringify(paramJson)) as ParamJson

const maxFdpCol = (header: string[]): number =>
  header.findIndex((h) => h.replace(/\s+/g, '').toUpperCase() === 'MAXFDP')

const withTightMaxFdp = (paramJson: ParamJson): ParamJson => {
  const next = cloneParamJson(paramJson)
  const table = next.tables[0]
  const col = maxFdpCol(table.header)
  expect(col, '3007 param table must have a MAX FDP column').toBeGreaterThanOrEqual(0)
  table.rows = table.rows.map((row) => {
    const copy = [...row]
    copy[col] = '01:00'
    return copy
  })
  return next
}

const resolveWorksetId = async (
  request: Parameters<typeof ganttApiLogin>[0],
  token: string,
): Promise<number> => {
  const listed = await request.get(`${ganttApiUrl}/api/legality/rulesets`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (listed.ok()) {
    const body = (await listed.json()) as { data: RulesetListItem[] }
    const rows = body.data ?? []
    const preferred = rows.find((row) => row.id === 103)
      ?? rows.find((row) => row.isDefault)
      ?? rows[0]
    if (preferred?.id) return preferred.id
  }
  for (const id of [103, 1]) {
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) continue
    const body = (await res.json()) as { data: { rules?: RuleRow[] } | null }
    if (body.data?.rules) return id
  }
  throw new Error('no legality workset containing rules was found')
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
  expect(res.ok(), `patch 3007 params failed: ${res.status()}`).toBeTruthy()
}

const runRecheck = async (
  request: Parameters<typeof ganttApiLogin>[0],
  token: string,
  group: string,
  window: DateWindow,
): Promise<void> => {
  const statusUrl = `${ganttApiUrl}/api/legality/recheck-status?groupCode=${encodeURIComponent(group)}`
  const readStatus = async (): Promise<string> => {
    const status = await request.get(statusUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    })
    if (!status.ok()) return 'unknown'
    return ((await status.json()) as { data: { status: string } }).data.status
  }

  const waitDone = async (): Promise<void> => {
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const status = await readStatus()
      if (status === 'done') return
      expect(status, '3007 recheck failed').not.toBe('failed')
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    throw new Error('3007 recheck did not settle within 300 seconds')
  }

  if (await readStatus() === 'computing') await waitDone()
  const started = await request.post(`${ganttApiUrl}/api/legality/recheck`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { groupCode: group, from: window.from, to: window.to, ruleCodes: ['3007'] },
    timeout: 60_000,
  })
  expect(started.ok(), `3007 recheck failed: ${started.status()}`).toBeTruthy()
  await waitDone()
}

const readLoadedWindow = async (page: Parameters<typeof gotoGantt>[0]): Promise<DateWindow> => {
  const range = await page.evaluate(() => {
    const hook = (window as unknown as { __ganttTest: { dateRange: () => { start: string; end: string } } }).__ganttTest
    return hook.dateRange()
  })
  return { from: range.start.slice(0, 10), to: range.end.slice(0, 10) }
}

test('Rule-3007 — over-limit FLY duty appears in Alert Center as 3007/001', async ({ page, request }) => {
  test.setTimeout(420_000)

  const token = await ganttApiLogin(request)
  const worksetId = await resolveWorksetId(request, token)
  const group = String(worksetId)
  const ruleset = await request.get(`${ganttApiUrl}/api/legality/ruleset/${worksetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(ruleset.ok(), `legality ruleset fetch failed: ${ruleset.status()}`).toBeTruthy()
  const body = (await ruleset.json()) as { data: { rules: RuleRow[] } }
  const rule = body.data.rules.find((row) => row.function === 3007 && row.instance === '001')
  expect(rule, `3007/001 must exist in workset ${worksetId} (apply sql/seed/2026-09-08-fdp-3007-rules.sql)`).toBeTruthy()

  const originalParamJson = cloneParamJson(rule!.paramJson)
  await seedGanttAuth(page, request)
  await gotoGantt(page)
  const window = await readLoadedWindow(page)

  try {
    await patchParamJson(request, token, rule!.id, withTightMaxFdp(originalParamJson))
    await runRecheck(request, token, group, window)
    await gotoGantt(page)

    await expect
      .poll(
        () => page.evaluate(() => {
          const hook = (window as unknown as { __ganttTest?: { liveViolations?: () => LiveViolation[] } }).__ganttTest
          return (hook?.liveViolations?.() ?? []).filter((row) => row.ruleCode === '3007').length
        }),
        { timeout: 90_000, intervals: [500], message: 'persisted 3007 violations must reach the Gantt store' },
      )
      .toBeGreaterThan(0)

    const violations = await page.evaluate(() => {
      const hook = (window as unknown as { __ganttTest: { liveViolations: () => LiveViolation[] } }).__ganttTest
      return hook.liveViolations().filter((row) => row.ruleCode === '3007')
    })
    expect(violations.every((row) => row.pairingId != null && row.pairingId > 0)).toBe(true)
    expect(violations.some((row) => /flight duty period/i.test(row.message))).toBe(true)

    await page.getByTestId('violations-button').first().click()
    const dialog = page.getByTestId('violation-list-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('alert-groupby-rule').click()
    await expect(dialog.locator('[data-testid="alert-group-item"]', { hasText: '3007/001' })).toHaveCount(1)

    const rows = dialog.locator('[data-testid="violation-list-row"][data-rule-id="3007/001"]')
    await expect.poll(() => rows.count(), { timeout: 15_000, intervals: [500] }).toBeGreaterThan(0)
    await expect(rows.first()).toContainText('3007/001')
    await expect(rows.first()).toContainText(/flight duty period/i)

    const ganttShot = path.join(REPO, 'docs/assets/screenshots/gantt/rule-3007-max-fdp-Ver1.png')
    const rustShot = path.join(REPO, 'image/RUST/3007/3007-alert-center-Ver1.png')
    await page.screenshot({ path: ganttShot, fullPage: true })
    await dialog.screenshot({ path: rustShot })
  } finally {
    await patchParamJson(request, token, rule!.id, originalParamJson)
    await runRecheck(request, token, group, window)
  }
})
