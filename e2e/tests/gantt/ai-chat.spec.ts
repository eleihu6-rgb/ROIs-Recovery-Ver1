/**
 * AI chat panel — drives Gantt filter/reset via the Zustand stores.
 *
 * The AI endpoint is stubbed deterministically at the network layer so the test
 * asserts the dispatch + real store effect (§No-Illusion), not the LLM. The chat
 * response carries an `actions[]` array; the frontend applies each action and
 * surfaces a confirmation chip (`ai-chat-applied`). We assert BOTH the chip text
 * AND the actual filter-store mutation via window.__ganttTest.filters().
 */
import { test, expect, type Page } from '@playwright/test'
import { GanttDashboardPage } from '../../pages/gantt/gantt-dashboard-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

test.describe('AI chat panel', () => {
  let dashboard: GanttDashboardPage

  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)

    // Deterministic AI stub: filter→BKK crew; reset/clear→reset_filters.
    await page.route('**/altair/ai/chat', async (route) => {
      const body = route.request().postDataJSON() as { messages: { content: string }[] }
      const last = (body.messages[body.messages.length - 1]?.content ?? '').toLowerCase()
      if (last.includes('reset') || last.includes('clear')) {
        await route.fulfill({
          json: { role: 'assistant', content: 'Cleared.', actions: [{ type: 'reset_filters' }] },
        })
      } else {
        await route.fulfill({
          json: {
            role: 'assistant',
            content: 'Filtering to BKK.',
            actions: [{ type: 'filter_crew', bases: ['BKK'] }],
          },
        })
      }
    })

    dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()
  })

  test('Live-1001 — filters crew to BKK, then clears all filters @smoke', async ({ page }) => {
    // 1. Open the panel.
    await page.getByTestId('ai-chat-toggle').click()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

    // 2. Filter request → chip + real store mutation.
    await page.getByTestId('ai-chat-input').fill('show only bangkok crew')
    await page.getByTestId('ai-chat-send').click()

    const applied = page.getByTestId('ai-chat-applied')
    await expect(applied).toContainText('Filtered crew')
    await expect(applied).toContainText('bases=BKK')

    // The filter store actually changed (not just a chip).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const f = window.__ganttTest!.filters() as { crew: { bases: string[] } }
          return f.crew.bases
        }),
      )
      .toEqual(['BKK'])

    // 3. Clear request → reset chip + store cleared.
    await page.getByTestId('ai-chat-input').fill('clear all filters')
    await page.getByTestId('ai-chat-send').click()

    await expect(page.getByTestId('ai-chat-applied').last()).toContainText('Cleared all filters')

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const f = window.__ganttTest!.filters() as { crew: { bases: string[] } }
          return f.crew.bases
        }),
      )
      .toEqual([])
  })
})

test.describe("AI chat — R'Bot example tips reflect the airline's real setup (regression)", () => {
  /**
   * The empty-state hint used to hardcode "show only Bangkok crew". Bangkok/BKK is
   * not a base for this airline, so the suggested prompt could never match a crew
   * filter. The tips must now be drawn from the airline's ACTUAL setup — a stored
   * snapshot from /api/ai/hints (base/rank/fleet/crew id) — never "Bangkok".
   */
  const HINTS = { base: 'PVG', rank: 'CA', fleet: 'A320', crewId: '10234' }
  // Every client-specific example token the panel may surface (rotating subset).
  const CLIENT_TOKENS = [HINTS.base, HINTS.rank, HINTS.fleet, HINTS.crewId]

  const stubHints = (page: import('@playwright/test').Page) =>
    page.route('**/altair/live/api/ai/hints', (route) => route.fulfill({ json: HINTS }))

  test('Live-1002 — tips use stored hints (base/rank/fleet/crew id), never Bangkok', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    // Start from a clean cache so the panel fetches and persists the snapshot.
    await page.addInitScript(() => window.localStorage.removeItem('rbot.hints.v1'))
    await stubHints(page)

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()

    await page.getByTestId('ai-chat-toggle').click()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

    const tips = page.getByTestId('ai-chat-tips')
    // Wait until the stored snapshot has loaded and a real client-specific example
    // has rendered (the generic fallback shows before the fetch resolves).
    await expect(tips).toContainText(
      /show only PVG crew|show CA crew|show A320 fleet crew|find crew 10234/,
    )
    // The dead "Bangkok" example is gone for good.
    await expect(tips).not.toContainText('Bangkok')
    // Exactly 3 comma-separated examples, always anchored by "clear all filters".
    await expect(tips).toContainText('clear all filters')
    const tipText = (await tips.textContent())!.replace(/^Try:\s*/, '').replace(/\.$/, '')
    const items = tipText.split('",').map((s) => s.replace(/"/g, '').trim())
    expect(items).toHaveLength(3)
    expect(items[items.length - 1]).toContain('clear all filters')

    // Every client-specific example shown comes from the real stored hints.
    const clientItems = items.filter(
      (t) => !t.includes('clear all filters') && !t.includes('sort roster'),
    )
    expect(clientItems.length).toBeGreaterThan(0)
    for (const item of clientItems) {
      expect(CLIENT_TOKENS.some((tok) => item.includes(tok))).toBe(true)
    }

    // The snapshot was persisted — subsequent opens render without a fresh pull.
    const cached = await page.evaluate(() => window.localStorage.getItem('rbot.hints.v1'))
    expect(cached).toContain('"base":"PVG"')
  })

  test('Live-1003 — a real crew-id example prompt actually filters the crew list', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await stubHints(page)

    // Stub the AI: a crew-id prompt → filter_crew by crewIds (now a supported field).
    await page.route('**/altair/ai/chat', (route) =>
      route.fulfill({
        json: {
          role: 'assistant',
          content: 'Filtering to crew 10234.',
          actions: [{ type: 'filter_crew', crewIds: ['10234'] }],
        },
      }),
    )

    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await dashboard.expectRosterPaneVisible()

    await page.getByTestId('ai-chat-toggle').click()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()

    await page.getByTestId('ai-chat-input').fill('find crew 10234')
    await page.getByTestId('ai-chat-send').click()

    // Chip confirms the applied crew-id filter…
    await expect(page.getByTestId('ai-chat-applied')).toContainText('crewIds=10234')
    // …and the filter store actually carries the crew id (not just a chip).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const f = window.__ganttTest!.filters() as { crew: { crewIds: string[] } }
          return f.crew.crewIds
        }),
      )
      .toEqual(['10234'])
  })
})

/** Send one chat message and wait for the assistant entry to land. */
const sendChat = async (page: Page, text: string): Promise<void> => {
  await page.getByTestId('ai-chat-input').fill(text)
  await page.getByTestId('ai-chat-send').click()
  await expect(page.getByTestId('ai-chat-busy')).toHaveCount(0, { timeout: 30_000 })
}

test.describe('AI chat — interactive combos (regression)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    const dashboard = new GanttDashboardPage(page)
    await dashboard.goto()
    await page.getByTestId('ai-chat-toggle').click()
    await expect(page.getByTestId('ai-chat-panel')).toBeVisible()
  })

  test('Live-1004 — combo: one AI turn filters crew AND sorts the roster — data actually refetched', async ({ page }) => {
    // Stub a single response carrying BOTH actions (live LLM verified to emit this
    // combo for "filter crew to base YEG and sort roster by crewId desc").
    await page.route('**/altair/ai/chat', (route) =>
      route.fulfill({
        json: {
          role: 'assistant',
          content: 'Filtered and sorted.',
          actions: [
            { type: 'filter_crew', bases: ['YEG'] },
            { type: 'sort_roster', paneId: 'roster', field: 'crewId', direction: 'desc' },
          ],
        },
      }),
    )
    await sendChat(page, 'show yeg base crew sorted by crewId descending')

    // Both confirmation chips rendered (one per applied action, in order).
    await expect(page.getByTestId('ai-chat-applied')).toContainText([
      'Filtered crew (bases=YEG)',
      'Sorted roster by crewId desc',
    ])

    // Regression: the crew LIST is refetched, not just the draft filter mutated.
    // (use-ai-chat used to call refreshAllPanes(), which reloads the OLD crew ids —
    // an AI crew filter never changed the visible crew set.)
    await expect
      .poll(async () => {
        const bases = await readHook<string[][]>(page, 'crewBases')
        const withRecords = bases.filter((b) => b.length > 0)
        return withRecords.length > 0 && withRecords.every((b) => b.includes('YEG'))
      }, { timeout: 60_000 })
      .toBe(true)

    // appliedFilters is marked → the roster pane shows the filtered/total badge.
    const totals = await readHook<{ total: number; unfilteredTotal: number }>(page, 'crewTotals')
    expect(totals.unfilteredTotal).toBeGreaterThan(totals.total)
    await expect(
      page.getByTestId('roster-pane').first().getByTestId('pane-filtered-count'),
    ).toHaveText(`${totals.total}/${totals.unfilteredTotal}`)

    // Sort criteria applied AND the visible panel order is actually descending.
    expect(await readHook<Array<{ column: string; direction: string }>>(page, 'rosterSort'))
      .toEqual([{ column: 'crewId', direction: 'desc' }])
    await expect
      .poll(async () => {
        const rows = await readHook<Array<{ crewId: string }>>(page, 'rosterPanelOrder')
        const ids = rows.map((r) => Number(r.crewId))
        return ids.length > 1 && ids.every((v, i) => i === 0 || ids[i - 1] >= v)
      }, { timeout: 30_000 })
      .toBe(true)
  })

  test('Live-1006 — RBot applies multi-key roster sorting criteria', async ({ page }) => {
    await page.route('**/altair/ai/chat', (route) =>
      route.fulfill({
        json: {
          role: 'assistant',
          content: 'Sorted.',
          actions: [{
            type: 'sort_roster',
            paneId: 'roster',
            criteria: [
              { column: 'rank', direction: 'asc' },
              { column: 'crewId', direction: 'desc' },
            ],
          }],
        },
      }),
    )

    await sendChat(page, 'sort roster by rank asc then crew id descending')

    await expect(page.getByTestId('ai-chat-applied')).toContainText(
      'Sorted roster by rank asc, crewId desc',
    )
    expect(await readHook<Array<{ column: string; direction: string }>>(page, 'rosterSort'))
      .toEqual([
        { column: 'rank', direction: 'asc' },
        { column: 'crewId', direction: 'desc' },
      ])

    await expect
      .poll(async () => {
        const rows = await readHook<Array<{ crewId: string; rank: string }>>(page, 'rosterPanelOrder')
        if (rows.length < 2) return false
        return rows.every((row, index) => {
          if (index === 0) return true
          const prev = rows[index - 1]
          const rankCmp = prev.rank.localeCompare(row.rank)
          if (rankCmp < 0) return true
          if (rankCmp > 0) return false
          return Number(prev.crewId) >= Number(row.crewId)
        })
      }, { timeout: 30_000 })
      .toBe(true)
  })

  test('Live-1005 — date range change via AI reloads the board onto the new period', async ({ page }) => {
    const before = await readHook<{ start: string; end: string }>(page, 'dateRange')

    await page.route('**/altair/ai/chat', (route) =>
      route.fulfill({
        json: {
          role: 'assistant',
          content: 'Date range updated.',
          actions: [{ type: 'set_date_range', start: '2026-07-01', end: '2026-07-15' }],
        },
      }),
    )
    await sendChat(page, 'set the date range from 2026-07-01 to 2026-07-15')

    await expect(page.getByTestId('ai-chat-applied')).toContainText('Date range 2026-07-01 → 2026-07-15')

    // The AI set_date_range action writes filterStore.dateRange (interpreted in the
    // display timezone, like the old picker did). The toolbar date pickers were removed,
    // so verify via the store truth.
    const after = await readHook<{ start: string; end: string }>(page, 'dateRange')
    expect(after.start).not.toBe(before.start)
    const spanDays = (Date.parse(after.end) - Date.parse(after.start)) / 86_400_000
    expect(spanDays).toBeGreaterThan(14)
    expect(spanDays).toBeLessThan(16)

    // The reload actually ran: every loaded roster item overlaps the new window
    // (±1 day slack for display-timezone offset vs UTC item timestamps).
    await expect
      .poll(async () => {
        const items = await readHook<Array<{ start: string; end: string }>>(page, 'roster')
        if (items.length === 0) return 'empty'
        const lo = Date.parse('2026-06-30T00:00:00Z')
        const hi = Date.parse('2026-07-17T00:00:00Z')
        return items.every((it) => Date.parse(it.end) >= lo && Date.parse(it.start) < hi)
          ? 'in-range' : 'out-of-range'
      }, { timeout: 60_000 })
      .toBe('in-range')
  })
})
