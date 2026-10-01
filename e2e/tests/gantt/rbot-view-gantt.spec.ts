/**
 * R'Bot "View Gantt" — R'Bot reads the Gantt screen and talks about it (P1 + P2).
 *
 * Real UI: open Live with Roster + Pairing + Flight panes, open R'Bot, press View Gantt.
 * The summary bubble is computed client-side from what the panes render (no LLM), so
 * the numbers are asserted against the panes' own rendered rows (window.__ganttTest
 * rosterPanel / pairingPanelOrder — the same rows the canvas draws), not against itself.
 *
 * Only the LLM reply (…/ai/chat, prefix differs per env) is stubbed — the test asserts the snapshot the
 * UI attaches to the follow-up question carries the same numbers the user saw.
 * Spec: docs/superpowers/specs/2026-09-30-rbot-gantt-viewport-awareness-design.md
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

const SHOT_DIR = '../docs/assets/screenshots/gantt'

interface PaneSnap {
  kind: 'roster' | 'pairing' | 'flight'
  context: string
  window: { startUtc: string; endUtc: string }
  crewInPane?: number
  crewWithDutyInView?: number
  crewWithoutDutyInView?: number
  pairingsInPane?: number
  pairingsInView?: number
  coverage?: { open: number; partial: number; full: number; over: number }
  openPositionPairings?: number
  flightsInView?: number
  aircraftRows?: number
}

const lastSummary = (page: Page) => page.getByTestId('ai-chat-thread').locator('.text-left').last()

const num = (text: string, re: RegExp): number => {
  const m = text.match(re)
  if (!m) throw new Error(`pattern ${re} not found in: ${text}`)
  return Number(m[1])
}

test.describe("R'Bot View Gantt", () => {
  test('Live-RBOT-VIEW-1 — View Gantt reads all open panes; open positions = open + partial; re-read follows zoom-in; follow-up carries the snapshot', async ({ page, request }) => {
    test.setTimeout(180_000)
    await seedGanttAuth(page, request)

    const chatBodies: Array<{ messages: Array<{ content: string }>; viewport?: { panes: PaneSnap[] } }> = []
    await page.route('**/ai/chat', async (route) => {
      chatBodies.push(route.request().postDataJSON())
      await route.fulfill({ json: { role: 'assistant', content: 'Here are the pairings with open positions.', actions: [] } })
    })

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto(60_000)
    await dashboard.expectRosterPaneVisible()
    await dashboard.expectPairingPaneVisible()
    await dashboard.addFlightPane()
    await dashboard.expectFlightPaneVisible()

    // ── Step 1: open R'Bot, press View Gantt ─────────────────────────────────
    await page.getByTestId('ai-chat-toggle').click()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()
    await page.getByTestId('ai-chat-view-gantt').click()

    const bubble1 = lastSummary(page)
    await expect(bubble1).toContainText("Here's what is on your screen:")
    // All three open panes are read, each labelled Live.
    await expect(bubble1).toContainText('Roster (Live,')
    await expect(bubble1).toContainText('Pairings (Live,')
    await expect(bubble1).toContainText('Flights (Live,')
    const text1 = (await bubble1.innerText()).replace(/\s+/g, ' ')

    // Roster: crew count equals the rows the roster pane actually renders.
    const rosterRows = await readHook<Array<{ crewId: string }>>(page, 'rosterPanel')
    expect(rosterRows.length).toBeGreaterThan(0)
    const crew = num(text1, /Roster \(Live,[^)]*\): (\d+) crew/)
    expect(crew).toBe(rosterRows.length)
    const withDuty = num(text1, /(\d+) with duties in view/)
    const without = num(text1, /(\d+) without;/)
    expect(withDuty + without).toBe(crew)

    // Pairings: default coverage filter is Open+Partial, so every pairing in view has an
    // open position — "open positions" must be exactly open + partial, and 0 covered.
    const pairingRows = await readHook<Array<{ id: string }>>(page, 'pairingPanelOrder')
    const inView1 = num(text1, /(\d+) pairings in view/)
    const openPos1 = num(text1, /(\d+) with open positions/)
    const open1 = num(text1, /\((\d+) open,/)
    const partial1 = num(text1, /(\d+) partial\)/)
    expect(inView1).toBeLessThanOrEqual(pairingRows.length)
    expect(openPos1).toBe(open1 + partial1)
    expect(openPos1).toBe(inView1)
    expect(num(text1, /(\d+) covered/)).toBe(0)

    await page.screenshot({ path: `${SHOT_DIR}/rbot-view-gantt-Ver3.png` })

    // ── Step 2: zoom in → the visible window shrinks → a fresh read reflects it ──
    const window1 = text1.match(/Pairings \(Live, ([^)]*)\)/)?.[1]
    await dashboard.zoomIn()
    await dashboard.zoomIn()
    await page.getByTestId('ai-chat-view-gantt').click()
    await expect(page.getByTestId('ai-chat-thread').getByText('View Gantt', { exact: true })).toHaveCount(2)
    const text2 = (await lastSummary(page).innerText()).replace(/\s+/g, ' ')
    const window2 = text2.match(/Pairings \(Live, ([^)]*)\)/)?.[1]
    expect(window2).toBeTruthy()
    expect(window2).not.toBe(window1)
    const inView2 = num(text2, /(\d+) pairings in view/)
    expect(inView2).toBeLessThanOrEqual(inView1)
    // still the same rule after the re-read: every pairing in view has an open position
    expect(num(text2, /(\d+) with open positions/)).toBe(inView2)

    // ── Step 3: follow-up chip → question goes to R'Bot WITH the snapshot the user saw ──
    const followUp = page.getByTestId('ai-chat-followup').filter({ hasText: 'List the pairings with open positions' })
    if (inView2 > 0) {
      await followUp.click()
      await expect(lastSummary(page)).toContainText('Here are the pairings with open positions.')
      expect(chatBodies).toHaveLength(1)
      const sent = chatBodies[0]
      expect(sent.messages.at(-1)?.content).toBe('List the pairings with open positions')
      const panes = sent.viewport?.panes ?? []
      expect(panes.map((p) => p.kind).sort()).toEqual(['flight', 'pairing', 'roster'])
      const sentPairing = panes.find((p) => p.kind === 'pairing')!
      expect(sentPairing.pairingsInView).toBe(inView2)
      expect(sentPairing.openPositionPairings).toBe(num(text2, /(\d+) with open positions/))
      expect(sentPairing.pairingsInPane).toBe(pairingRows.length)
      expect(panes.find((p) => p.kind === 'roster')!.crewInPane).toBe(rosterRows.length)
    } else {
      await expect(followUp).toHaveCount(0)
    }

    await page.screenshot({ path: `${SHOT_DIR}/rbot-view-gantt-followup-Ver3.png` })
  })
})

interface HookRosterItem { crewId: string; pairingId: number | null; start: string | null; end: string | null }

test.describe("R'Bot View Gantt — what changed since the last read (P2)", () => {
  test('Live-RBOT-VIEW-2 — a staged unassign shows as "crew lost duties"; Undo shows it back as "gained"; nothing saved', async ({ page, request }) => {
    test.setTimeout(180_000)
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto(60_000)
    await dashboard.expectRosterPaneVisible()

    // Pick a crew on screen with exactly ONE loaded flying duty, well inside the date
    // range, so "unassign crew X" is unambiguous and the change is inside the view.
    const range = await readHook<{ start: string; end: string }>(page, 'dateRange')
    const lo = Date.parse(range.start) + 8 * 86_400_000
    const hi = Date.parse(range.end) - 8 * 86_400_000
    const shown = new Set((await readHook<Array<{ crewId: string }>>(page, 'rosterPanel')).map((r) => r.crewId))
    const items = await readHook<HookRosterItem[]>(page, 'roster')
    const byCrew = new Map<string, HookRosterItem[]>()
    for (const it of items) byCrew.set(it.crewId, [...(byCrew.get(it.crewId) ?? []), it])
    const crewId = [...byCrew.entries()].find(([id, its]) => {
      if (!shown.has(id) || its.some((i) => i.pairingId == null)) return false
      if (new Set(its.map((i) => i.pairingId)).size !== 1) return false
      return its.every((i) => i.start && Date.parse(i.start) > lo && Date.parse(i.start) < hi)
    })?.[0]
    expect(crewId, 'a crew with exactly one flying duty inside the range').toBeTruthy()

    // The user asks R'Bot to take the crew off the duty (LLM reply stubbed; dispatch is real
    // and only STAGES a draft — Save is never pressed).
    await page.route('**/ai/chat', (route) => route.fulfill({
      json: { role: 'assistant', content: 'Staged.', actions: [{ type: 'unassign_task', crewId }] },
    }))

    await page.getByTestId('ai-chat-toggle').click()
    await page.getByTestId('ai-chat-view-gantt').click()
    await expect(lastSummary(page)).toContainText("Here's what is on your screen:")
    await expect(lastSummary(page)).not.toContainText('Since your last read')

    await page.getByTestId('ai-chat-input').fill(`take ${crewId} off their duty`)
    await page.getByTestId('ai-chat-send').click()
    await expect(page.getByTestId('ai-chat-applied').last()).toContainText(`Removed crew ${crewId}`)

    // Read again → R'Bot reports exactly that change on that crew.
    await page.getByTestId('ai-chat-view-gantt').click()
    await expect(lastSummary(page)).toContainText('Since your last read')
    await expect(lastSummary(page)).toContainText(`crew lost duties: ${crewId} −1`)
    await expect(lastSummary(page)).not.toContainText('Your view moved')
    // Regression (coverage recompute): only the ONE pairing the crew left may change (it can
    // lose a position and enter the Open/Partial pane); no other pairing may flip or appear.
    // Before the fix this step reported 3 coverage flips + 12 pairings appearing.
    const diffText = (await lastSummary(page).innerText()).replace(/\s+/g, ' ')
    const pairingLines = diffText.match(/(\d+) pairing\(s\) (?:changed coverage|now have open positions|now fully covered|appeared in the pairing pane|left the pairing pane)/g) ?? []
    expect(pairingLines.map((l) => Number(l.split(' ')[0])).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: `${SHOT_DIR}/rbot-view-gantt-diff-Ver3.png` })

    // Undo through the real toolbar → the next read shows the duty coming back.
    await page.getByTestId('draft-undo-btn').click()
    await page.getByTestId('ai-chat-view-gantt').click()
    await expect(lastSummary(page)).toContainText(`crew gained duties: ${crewId} +1`)
  })
})

test.describe("R'Bot View Gantt — 'for this view' fills build scope (P2, real LLM)", () => {
  test('Live-RBOT-VIEW-3 — after narrowing to one base, "build pairings for this view" opens Pairing Build pre-filled from the view', async ({ page, request }) => {
    test.setTimeout(240_000)
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto(60_000)
    await dashboard.expectPairingPaneVisible()

    // No stub: the real ai-server + LLM handle both instructions.
    await page.getByTestId('ai-chat-toggle').click()
    await page.getByTestId('ai-chat-input').fill('show only YEG base pairings')
    await page.getByTestId('ai-chat-send').click()
    await expect(page.getByTestId('ai-chat-applied').last()).toContainText('YEG', { timeout: 60_000 })
    // Poll (not single-shot): the filter reloads pairings asynchronously; the old
    // all-base rows are still there right after the chip appears.
    await expect.poll(async () => {
      const ps = await readHook<Array<{ base: string | null }>>(page, 'pairings')
      return ps.length > 0 && ps.every((p) => p.base === 'YEG')
    }, { timeout: 60_000 }).toBe(true)

    await page.getByTestId('ai-chat-view-gantt').click()
    const summary = (await lastSummary(page).innerText()).replace(/\s+/g, ' ')
    const scope = summary.match(/"This view" scope for build \/ auto-assign: base YEG[^.]*?(\d{4}-\d{2}-\d{2}) – (\d{4}-\d{2}-\d{2})/)
    expect(scope, summary).toBeTruthy()
    const [, viewStart, viewEnd] = scope!

    await page.getByTestId('ai-chat-input').fill('build pairings for this view')
    await page.getByTestId('ai-chat-send').click()
    // The scope comes from the view — either the LLM read it from viewDefaults or the
    // server filled what the LLM left out ("Using … from your Gantt view"). Both are fine;
    // what matters is the reply names the view's base and the dialog carries the view's scope.
    await expect(page.getByTestId('ai-chat-applied').last()).toContainText('Opening Pairing Build Automation — YEG', { timeout: 90_000 })
    await expect(lastSummary(page)).toContainText('YEG')

    // The real Pairing Build dialog opens with the view's scope — nothing is built.
    const dialog = page.getByTestId('roundtrip-builder-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('rt-rbot-banner')).toBeVisible()
    await expect(page.getByTestId('rt-base')).toHaveValue('YEG')
    await expect(page.getByTestId('rt-from')).toHaveValue(viewStart)
    await expect(page.getByTestId('rt-to')).toHaveValue(viewEnd)
    await page.screenshot({ path: `${SHOT_DIR}/rbot-view-gantt-this-view-Ver2.png` })
  })
})
