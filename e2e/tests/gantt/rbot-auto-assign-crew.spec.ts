/**
 * RBot to Auto-assign open pairings (Live Gantt) - Ryan's 2026-09-11 acceptance.
 *
 * Types a plain-English order ("auto assign open pairings to T2004 and T2005 for September
 * 2026") into the real chat box; the action must move the Gantt range onto the month, open
 * the Auto-assign dialog for exactly those crew, and - after the planner presses "Apply to
 * gantt" and Save - each crew must end up with a full month's roster for September.
 *
 * The AI endpoint is stubbed deterministically (same precedent as ai-chat.spec.ts); the
 * backend tool mapping is covered by ai-server/tests/test_chat_tools.py + test_chat_route.py.
 *
 * Data precondition (done once, documented in the report):
 *  - T2004/T2005 are ADD-based CA crew qualified on the B787 FAMILY, but the SSIM schedule
 *    flies the 788/789 variants and there were no B787 flights at all, so the planner had
 *    nothing to offer them.
 *  - Seeded a B787 schedule for ADD (skill 142 fixture add-b787-demo-sep2026.json) and built
 *    a B787 pairing ladder covering September
 *    (live-server/scripts/seed-add-b787-pairing-ladder.mjs).
 *
 * This test WRITES a real roster (10 assignments per crew) into f8_sit_live via the normal
 * draft Save, exactly as a planner would.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth } from '../../utils/gantt-hook'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const screenshotDirectory = path.join(root, 'docs/assets/screenshots/gantt')
const CREW = ['T2004', 'T2005']
const ORDER = 'auto assign open pairings to T2004 and T2005 for September 2026'
const API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const USER = process.env.GANTT_TEST_USER ?? 'admin'
const PASS = process.env.GANTT_TEST_PASS ?? '123456'

type RosterRow = { crewId: string; pairingId: number | null; label: string | null; start: string | null; end: string | null }

/**
 * Clear these two crew's September roster so the run starts from a known-empty month.
 * Ryan's crews are demo/fixture crew; the auto-assign flow is what fills them, and the
 * saved roster is a real write, so a re-run must reset its own precondition.
 */
const resetCrewRoster = async (request: import('@playwright/test').APIRequestContext): Promise<number> => {
  const login = await request.post(`${API}/api/auth/login`, { data: { userCode: USER, password: PASS } })
  expect(login.ok(), `login failed: ${login.status()}`).toBeTruthy()
  const token = ((await login.json()) as { data: { token: string } }).data.token
  const headers = { authorization: `Bearer ${token}` }
  const view = await request.get(
    `${API}/api/roster?crewIds=${CREW.join(',')}&startDate=2026-08-25&endDate=2026-10-07`, { headers })
  expect(view.ok(), `roster read failed: ${view.status()}`).toBeTruthy()
  const body = (await view.json()) as { data: { items?: RosterRow[] } | RosterRow[] }
  const items = Array.isArray(body.data) ? body.data : (body.data.items ?? [])
  const keys = [...new Map(items
    .filter((item) => item.pairingId != null && CREW.includes(String(item.crewId)))
    .map((item) => [`${item.pairingId}:${item.crewId}`, { pairingId: Number(item.pairingId), crewId: String(item.crewId) }]))
    .values()]
  if (!keys.length) return 0
  const del = await request.post(`${API}/api/roster/bulk-delete`, { headers, data: { pairingCrewKeys: keys } })
  expect(del.ok(), `roster reset failed: ${del.status()} ${await del.text()}`).toBeTruthy()
  return keys.length
}

const capture = async (page: Page, checkpoint: string): Promise<string> => {
  fs.mkdirSync(screenshotDirectory, { recursive: true })
  let version = 1
  let target: string
  do { target = path.join(screenshotDirectory, `rbot-auto-assign-${checkpoint}-Ver${version++}.png`) } while (fs.existsSync(target))
  await page.screenshot({ path: target, fullPage: true })
  return path.relative(root, target)
}

/** Per-crew September roster shape read from the same store truth the canvas renders. */
const rosterSummary = (rows: RosterRow[], crewId: string) => {
  const items = rows.filter((row) => String(row.crewId) === crewId)
  const days = new Set<string>()
  const pairings = new Set<number>()
  let overlaps = 0
  const spans = items
    .map((row) => ({ start: Date.parse(row.start ?? ''), end: Date.parse(row.end ?? ''), pairingId: row.pairingId }))
    .sort((a, b) => a.start - b.start)
  for (const span of spans) {
    if (span.pairingId != null) pairings.add(Number(span.pairingId))
    for (let day = new Date(span.start); day <= new Date(span.end); day.setUTCDate(day.getUTCDate() + 1)) {
      days.add(day.toISOString().slice(0, 10))
    }
  }
  for (let i = 1; i < spans.length; i++) if (spans[i].start < spans[i - 1].end) overlaps++
  const september = [...days].filter((day) => day >= '2026-09-01' && day <= '2026-09-30').sort()
  const weeks = new Set(september.map((day) =>
    Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse('2026-09-01T00:00:00Z')) / 604_800_000)))
  return { items: items.length, duties: spans.length, pairings: pairings.size, days: september, weeks, overlaps }
}

test("R'Bot auto-assign - plain-English order fills T2004/T2005 September rosters", async ({ page, request }, testInfo) => {
  // Planning + replaying 20 assignments + Save + four month snapshots legitimately needs more
  // than the suite's 60s default.
  test.setTimeout(300_000)
  const cleared = await resetCrewRoster(request)
  testInfo.annotations.push({ type: 'precondition', description: `cleared ${cleared} existing pairing/crew roster keys for T2004/T2005` })
  await seedGanttAuth(page, request)

  const requests: string[] = []
  await page.route('**/ai/chat', async (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] }
    requests.push(body.messages[body.messages.length - 1]?.content ?? '')
    await route.fulfill({
      json: {
        role: 'assistant',
        content: "Opening Auto-assign open pairings for T2004, T2005 - apply to the gantt, then Save to persist.",
        actions: [{ type: 'auto_assign_pairings', crewIds: CREW, start: '2026-09-01', end: '2026-09-30' }],
      },
    })
  })

  const dashboard = new GanttDashboardPage(page)
  await dashboard.goto()
  await dashboard.expectRosterPaneVisible()
  await page.getByTestId('ai-chat-toggle').click()
  await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

  // 1. Plain English into the real chat box.
  await page.getByTestId('ai-chat-input').fill(ORDER)
  await page.getByTestId('ai-chat-send').click()
  await expect(page.getByTestId('ai-chat-applied')).toContainText('Auto-assigning open pairings for T2004, T2005')
  expect(requests).toContain(ORDER)

  // 2. The real dialog opened for exactly those crew and planned against September.
  await expect(page.getByTestId('auto-assign-dialog')).toBeVisible()
  await expect(page.getByTestId('auto-assign-dialog')).toContainText('2026-09')
  // Auto-assign Duties: R'Bot lands on the configure step (default FLY/RES/DO limits); Analyse fires the planner.
  await page.getByTestId('auto-assign-analyse').click()
  const trace = page.getByTestId('auto-assign-trace')
  await expect(trace).toContainText('T2004', { timeout: 240_000 }) // FLY + RES + DO passes for two crew
  await expect(trace).toContainText('T2005')
  await expect(page.getByTestId('auto-assign-crew')).toHaveCount(2)

  // 3. Apply the replayed plan, then Save the draft.
  const apply = page.getByTestId('auto-assign-apply')
  await expect(apply).toBeVisible({ timeout: 90_000 })
  const applyText = (await apply.textContent())?.trim() ?? ''
  const plannedTotal = Number(applyText.match(/\((\d+)\)/)?.[1] ?? 0)
  expect(plannedTotal, 'September must offer assignable open pairings').toBeGreaterThan(0)
  await apply.click()
  await expect(page.getByTestId('auto-assign-close')).toBeVisible({ timeout: 240_000 })
  const progress = (await page.getByTestId('auto-assign-progress').textContent()) ?? ''
  const applied = Number(progress.match(/applied (\d+)\/(\d+)/)?.[1] ?? 0)
  expect(applied, `replay must apply the planned assignments (${progress})`).toBe(plannedTotal)
  const appliedShot = await capture(page, 'applied')
  await page.getByTestId('auto-assign-close').click()
  await expect(page.getByTestId('auto-assign-dialog')).not.toBeVisible()

  await expect(page.getByTestId('draft-save-btn')).toBeEnabled({ timeout: 30_000 })
  await page.getByTestId('draft-save-btn').click()

  // 4. Show just these two crew, over September.
  await page.evaluate(() => (window as unknown as { __ganttTest: { applyCrewFilter: (f: { crewIds: string[] }) => Promise<void> } }).__ganttTest.applyCrewFilter({ crewIds: ['T2004', 'T2005'] }))
  await page.evaluate(() => (window as unknown as { __ganttTest: { setDateRange: (s: string, e: string) => Promise<void> } }).__ganttTest.setDateRange('2026-09-01', '2026-09-30'))

  const readRoster = async (): Promise<RosterRow[]> =>
    page.evaluate(() => (window as unknown as { __ganttTest: { roster: () => RosterRow[] } }).__ganttTest.roster())
  await expect.poll(async () => (await readRoster()).filter((row) => String(row.crewId) === 'T2004').length, { timeout: 90_000 })
    .toBeGreaterThan(0)
  await expect.poll(async () => (await readRoster()).filter((row) => String(row.crewId) === 'T2005').length, { timeout: 90_000 })
    .toBeGreaterThan(0)

  // 5. Full-month roster, asserted from the same store truth the canvas renders.
  const rows = await readRoster()
  const summaries: Record<string, ReturnType<typeof rosterSummary>> = {}
  for (const crewId of CREW) {
    const s = rosterSummary(rows, crewId)
    summaries[crewId] = s
    expect(s.duties, `${crewId} should hold a month of duties`).toBeGreaterThanOrEqual(8)
    expect(s.pairings, `${crewId} should hold distinct pairings`).toBeGreaterThanOrEqual(8)
    expect(s.overlaps, `${crewId} roster must not double-book duties`).toBe(0)
    expect(s.days[0] <= '2026-09-03', `${crewId} first duty day was ${s.days[0]}`).toBe(true)
    expect((s.days.at(-1) ?? '') >= '2026-09-20', `${crewId} last duty day was ${s.days.at(-1)}`).toBe(true)
    expect(s.weeks.size, `${crewId} should fly in every week of the month`).toBeGreaterThanOrEqual(4)
  }

  // 6. Snapshots across September (the month is wider than one viewport at min zoom).
  const shots: string[] = []
  for (const [index, hours] of [0, 168, 336, 504].entries()) {
    await page.evaluate((offsetHours) => {
      const hook = (window as unknown as { __ganttTest: { zoom: () => { zoomMin: number }; setZoom: (px: number) => void; setScrollX: (x: number) => void } }).__ganttTest
      hook.setZoom(hook.zoom().zoomMin)
      hook.setScrollX(Math.round(offsetHours * hook.zoom().zoomMin))
    }, hours)
    await page.waitForTimeout(400)
    shots.push(await capture(page, `sep-week${index + 1}`))
  }

  await testInfo.attach('rbot-auto-assign', {
    body: JSON.stringify({
      order: ORDER, plannedTotal, applied, summaries,
      screenshots: [appliedShot, ...shots],
    }, null, 2),
    contentType: 'application/json',
  })
  for (const shot of [appliedShot, ...shots]) {
    await testInfo.attach(path.basename(shot), { path: path.join(root, shot), contentType: 'image/png' })
  }
})
