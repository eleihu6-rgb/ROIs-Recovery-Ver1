/**
 * R'Bot View Gantt on a Scenario Gantt (§Gantt-Unify — same shared panes, Scenario source).
 *
 * Real UI: open Live first (so its panes exist in a hidden tab), then open Scenario 743
 * (RO, DONE, Sep 2026 solver result) from the Scenario list, press View Gantt.
 * Asserts:
 *   - the summary reads the SCENARIO panes ("Scenario 743"), not the hidden Live tab;
 *   - the roster crew count equals the rows the scenario roster pane renders;
 *   - Live-only scope/actions are not offered on a Scenario ("This view" scope, best-fit chip);
 *   - a second read with no edits reports "no changes on screen";
 *   - the follow-up question carries the Scenario snapshot to R'Bot.
 * Only the LLM reply (…/ai/chat) is stubbed. Read-only.
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../../pages/gantt/gantt-dashboard-page'
import { gotoScenarioList } from '../../../pages/gantt/scenario-nav'
import { seedGanttAuth, readHook, ganttApiLogin, ganttApiUrl } from '../../../utils/gantt-hook'

const SHOT_DIR = '../docs/assets/screenshots/gantt'
const SCENARIO_ID = 743

const lastSummary = (page: Page) => page.getByTestId('ai-chat-thread').locator('.text-left').last()
const num = (text: string, re: RegExp): number => {
  const m = text.match(re)
  if (!m) throw new Error(`pattern ${re} not found in: ${text}`)
  return Number(m[1])
}

// Environment gate (§No-Illusion): if the Scenario list API itself is failing (e.g. the
// live-server DB role lacks USAGE on the scenario schema), skip with that reason instead of a
// misleading red or a fake pass. Checked through the same list endpoint the UI calls.
let infraBlocked = ''
test.beforeAll(async ({ request }) => {
  const token = await ganttApiLogin(request)
  const list = await request.get(`${ganttApiUrl}/api/scenario?page=1&pageSize=1&type=RO`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (list.status() >= 500) {
    const body = await list.text()
    infraBlocked = `Scenario list API returns ${list.status()}${body.includes('permission denied') ? ' (DB role lacks access to the scenario schema)' : ''} — Scenario Gantt cannot open in this environment`
  }
})

test('Scen-RBOT-VIEW-1 — View Gantt on Scenario 743 reads the scenario panes, not the hidden Live tab', async ({ page, request }) => {
  test.skip(infraBlocked !== '', infraBlocked)
  test.setTimeout(300_000)
  await seedGanttAuth(page, request)
  const bodies: Array<{ viewport?: { panes: Array<{ kind: string; context: string; crewInPane?: number }>; viewDefaults?: unknown } }> = []
  await page.route('**/ai/chat', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ json: { role: 'assistant', content: 'That is the scenario roster.', actions: [] } })
  })

  // Live first — its panes stay mounted in a hidden tab.
  const dash = new GanttDashboardPage(page)
  await dash.goto(60_000)
  await dash.expectRosterPaneVisible()

  // Open Scenario 743 from the real Scenario list.
  await gotoScenarioList(page)
  await page.getByTestId('scenario-nav-ro').click()
  const item = page.getByTestId('scenario-list-item').filter({
    has: page.getByTestId('scenario-item-id').getByText(`#${SCENARIO_ID}`, { exact: true }),
  })
  await expect(item).toBeVisible({ timeout: 60_000 })
  await item.click()
  await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
  await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 120_000 })
  await expect.poll(async () => (await readHook<Array<{ crewId: string }>>(page, 'scenarioRosterMcred')).length,
    { timeout: 120_000 }).toBeGreaterThan(0)

  // ── Read the scenario screen ───────────────────────────────────────────
  await page.getByTestId('ai-chat-toggle').click()
  await page.getByTestId('ai-chat-view-gantt').click()
  const bubble = lastSummary(page)
  await expect(bubble).toContainText("Here's what is on your screen:")
  await expect(bubble).toContainText(`Roster (Scenario ${SCENARIO_ID},`)
  await expect(bubble).not.toContainText('(Live,') // hidden Live tab is not "on screen"
  const text = (await bubble.innerText()).replace(/\s+/g, ' ')

  const rows = await readHook<Array<{ crewId: string }>>(page, 'scenarioRosterMcred')
  expect(num(text, new RegExp(`Roster \\(Scenario ${SCENARIO_ID},[^)]*\\): (\\d+) crew`))).toBe(rows.length)
  // Live-only scope / actions are not offered on a Scenario.
  await expect(bubble).not.toContainText('"This view" scope')
  await expect(page.getByTestId('ai-chat-followup').filter({ hasText: 'best-fit' })).toHaveCount(0)
  await page.screenshot({ path: `${SHOT_DIR}/scenario-rbot-view-gantt-Ver1.png` })

  // ── Second read, no edits → no changes ─────────────────────────────────
  await page.getByTestId('ai-chat-view-gantt').click()
  await expect(lastSummary(page)).toContainText('no changes on screen.')

  // ── Follow-up carries the Scenario snapshot ────────────────────────────
  await page.getByTestId('ai-chat-input').fill('how many crew are in this scenario view?')
  await page.getByTestId('ai-chat-send').click()
  await expect(lastSummary(page)).toContainText('That is the scenario roster.')
  const sent = bodies.at(-1)!
  const roster = sent.viewport!.panes.find((p) => p.kind === 'roster')!
  expect(roster.context).toBe(`Scenario ${SCENARIO_ID}`)
  expect(roster.crewInPane).toBe(rows.length)
  expect(sent.viewport!.panes.every((p) => p.context === `Scenario ${SCENARIO_ID}`)).toBe(true)
  expect(sent.viewport!.viewDefaults).toBeUndefined()
})
