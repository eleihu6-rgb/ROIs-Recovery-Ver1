/**
 * Legality Tab — legacy ruleset 433 ("F8 Full Ruleset") viewer.
 *
 * The Legality tab (after Data) loads the legacy rule model via
 * GET /api/legality/ruleset/433 and shows each rule as "fn/inst - Name".
 * (It previously targeted workset 103, but 103 was deliberately trimmed to the
 * 2-rule 8002 subset used for Rust-rule testing; the full 14-rule F8 ruleset
 * lives in workset 433.)
 * Clicking Edit expands the params INLINE as a compact aligned table (one row
 * per entry, all columns on a line). A pop-out icon opens the same table in a
 * roomy AppDialog for wide rules like 8056 (24 columns).
 *
 * §No-Illusion: every assertion checks concrete content (columns, values, counts).
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedGanttAuth, ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

/** All rules in workset 433, in display order. paramTables=0 => no configurable params. */
const RULES = [
  { fn: 2014, inst: '001', name: 'Local Night Definition',                     paramTables: 1 },
  { fn: 7272, inst: '001', name: 'Calculate DP of the Reserves',               paramTables: 1 },
  { fn: 7500, inst: '001', name: 'Basic definition of Acc State',              paramTables: 2 },
  { fn: 7501, inst: '001', name: 'Single Day Free from Duty in Rolling Hours', paramTables: 1 },
  { fn: 7502, inst: '001', name: 'The Calculation of Credit Hours',            paramTables: 1 },
  { fn: 7503, inst: '001', name: 'Limits of Consecutive WOCLs',                paramTables: 1 },
  { fn: 7504, inst: '001', name: 'Spacing Rule - WOCL',                        paramTables: 1 },
  { fn: 7505, inst: '001', name: 'Min # GDOs in a RP',                         paramTables: 1 },
  { fn: 7506, inst: '001', name: 'One Checkin Per Day.',                       paramTables: 1 },
  { fn: 7507, inst: '001', name: 'Min # GDOs in a RP (fly/reserve filters)',   paramTables: 1 },
  { fn: 8002, inst: '001', name: 'Maximum Flight Time',                        paramTables: 1 },
  { fn: 8002, inst: '002', name: 'Maximum Hours of Work',                      paramTables: 1 },
  { fn: 8004, inst: '001', name: 'Basic Competency-F8',                        paramTables: 1 },
  { fn: 8030, inst: '001', name: 'Age Restriction',                            paramTables: 1 },
  { fn: 8056, inst: '001', name: 'Roster Spacing',                             paramTables: 1 },
] as const

const RULE_COUNT = RULES.length

const openLegality = async (page: Page, request: APIRequestContext) => {
  await seedGanttAuth(page, request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-rule-sets-view').waitFor({ state: 'visible', timeout: 10_000 })
  // 103 "PBS Solver Ruleset" now equals 433 in size (both carry the full F8 ruleset after
  // every F8 rule was migrated into 103), so the tab may auto-select the Default (103) on load. Select 433
  // explicitly so these tests deterministically start on the full F8 ruleset.
  await page.getByTestId('legality-ruleset-card-433').click()
  // SIT may label workset 433 as "Portal Default Ruleset FD"; DEV historically "F8 Full Ruleset".
  await expect(page.getByTestId('legality-set-name')).toContainText(
    /F8 Full Ruleset|Portal Default Ruleset/,
    { timeout: 10_000 },
  )
}

test.describe('Legality Tab — rulesets 433 + 103', () => {
  test(`Legal-6001 — tab opens after Data and loads F8 Full Ruleset with all ${RULE_COUNT} rules`, async ({ page, request }) => {
    await openLegality(page, request)

    await expect(page.getByTestId('module-nav-legality')).toBeVisible()
    await expect(page.getByTestId('legality-rule-sets-header-icon')).toBeVisible()
    // BOTH rulesets are listed: 433 "F8 Full Ruleset" (fullest, loaded first) + 103 "PBS Solver Ruleset".
    await expect(page.getByTestId('legality-ruleset-card-433')).toContainText('F8 Full Ruleset')
    await expect(page.getByTestId('legality-ruleset-card-433')).toContainText(`${RULE_COUNT} rules`)
    await expect(page.getByTestId('legality-ruleset-card-103')).toContainText('PBS Solver Ruleset')
    // 103 now holds ALL the F8 rules, every one ported to the Rust engine — including 7507/001.
    await expect(page.getByTestId('legality-ruleset-card-103')).toContainText(`${RULE_COUNT} rules`)

    // The gantt DEFAULT rule set is 103 (matches default GANTT rule_group pbs_solver_ruleset).
    // Only 103 carries the "Default" badge; 433 does not.
    await expect(page.getByTestId('legality-ruleset-default-103')).toHaveText('Default')
    await expect(page.getByTestId('legality-ruleset-default-433')).toHaveCount(0)

    const rows = page.locator('[data-testid^="legality-rule-row-"]')
    await expect(rows).toHaveCount(RULE_COUNT)

    for (const r of RULES) {
      await expect(page.getByTestId(`legality-rule-name-${r.fn}-${r.inst}`))
        .toHaveText(`${r.fn}/${r.inst}`)
      await expect(page.getByTestId(`legality-rule-row-${r.fn}-${r.inst}`))
        .toContainText(r.name)
    }
  })

  test('Legal-6014 — Rule Instances and Rule Sets collapse into flashing detail-header restore buttons', async ({ page, request }) => {
    await openLegality(page, request)

    const catalog = page.getByTestId('rule-catalog-tree')
    const sets = page.getByTestId('legality-rule-sets-aside')
    const detailHeader = page.getByTestId('legality-detail-header')
    await expect(catalog).toBeVisible()
    await expect(sets).toBeVisible()

    await page.getByTestId('legality-rule-instances-hide').click()
    await expect(catalog).toHaveCount(0)
    await expect(page.getByTestId('legality-catalog-sets-splitter')).toHaveCount(0)
    const showCatalog = page.getByTestId('legality-rule-instances-show')
    await expect(showCatalog).toBeVisible()
    await expect(detailHeader.getByTestId('legality-rule-instances-show')).toBeVisible()
    await expect(showCatalog).toHaveClass(/animate-nav-hint/)
    await showCatalog.click()
    await expect(catalog).toBeVisible()
    await expect(page.getByTestId('legality-catalog-sets-splitter')).toBeVisible()

    await page.getByTestId('legality-rule-sets-hide').click()
    await expect(sets).toHaveCount(0)
    await expect(page.getByTestId('legality-sets-detail-splitter')).toHaveCount(0)
    const showSets = page.getByTestId('legality-rule-sets-show')
    await expect(showSets).toBeVisible()
    await expect(detailHeader.getByTestId('legality-rule-sets-show')).toBeVisible()
    await expect(showSets).toHaveClass(/animate-nav-hint/)

    await page.getByTestId('legality-rule-instances-hide').click()
    await expect(showCatalog).toBeVisible()
    const restoreBoxes = await Promise.all([showCatalog.boundingBox(), showSets.boundingBox()])
    expect(restoreBoxes[0]).toBeTruthy()
    expect(restoreBoxes[1]).toBeTruthy()
    expect(
      Math.abs(restoreBoxes[0]!.x - restoreBoxes[1]!.x),
      'both detail-header restore buttons must not overlap',
    ).toBeGreaterThanOrEqual(restoreBoxes[0]!.width)
    await showCatalog.click()

    await showSets.click()
    await expect(sets).toBeVisible()
    await expect(page.getByTestId('legality-sets-detail-splitter')).toBeVisible()
  })

  test('Legal-6008 — selecting the 103 Rust dev ruleset shows only its Rust-migrated rules', async ({ page, request }) => {
    await openLegality(page, request)

    // Switch from the default full set to the Rust dev set (one rule added per migrated rule).
    await page.getByTestId('legality-ruleset-card-103').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('PBS Solver Ruleset', { timeout: 10_000 })

    // 103 == 433: full F8 ruleset including 7507/001.
    const rows = page.locator('[data-testid^="legality-rule-row-"]')
    await expect(rows).toHaveCount(RULE_COUNT)
    await expect(page.getByTestId('legality-rule-name-8002-001')).toHaveText('8002/001')
    await expect(page.getByTestId('legality-rule-name-8002-002')).toHaveText('8002/002')
    await expect(page.getByTestId('legality-rule-name-8056-001')).toHaveText('8056/001')
    await expect(page.getByTestId('legality-rule-name-7502-001')).toHaveText('7502/001')
    await expect(page.getByTestId('legality-rule-name-8030-001')).toHaveText('8030/001')
    await expect(page.getByTestId('legality-rule-name-8004-001')).toHaveText('8004/001')
    await expect(page.getByTestId('legality-rule-name-7501-001')).toHaveText('7501/001')
    await expect(page.getByTestId('legality-rule-name-2014-001')).toHaveText('2014/001')
    await expect(page.getByTestId('legality-rule-name-7503-001')).toHaveText('7503/001')
    await expect(page.getByTestId('legality-rule-name-7500-001')).toHaveText('7500/001')
    await expect(page.getByTestId('legality-rule-name-7504-001')).toHaveText('7504/001')
    await expect(page.getByTestId('legality-rule-name-7505-001')).toHaveText('7505/001')
    await expect(page.getByTestId('legality-rule-name-7507-001')).toHaveText('7507/001')
    await expect(page.getByTestId('legality-rule-row-7507-001')).toContainText(
      'Min # GDOs in a RP (fly/reserve filters)',
    )
    await expect(page.getByTestId('legality-rule-name-7272-001')).toHaveText('7272/001')

    // Switching back to 433 restores the same full set (103 and 433 now match).
    await page.getByTestId('legality-ruleset-card-433').click()
    await expect(page.getByTestId('legality-set-name')).toContainText('F8 Full Ruleset', { timeout: 10_000 })
    await expect(rows).toHaveCount(RULE_COUNT)
  })

  test('Legal-6009 — double-clicking a rule row toggles its params (show then hide)', async ({ page, request }) => {
    await openLegality(page, request)

    const row = page.getByTestId('legality-rule-row-8002-001')
    const params = page.getByTestId('legality-params-8002-001')

    // Initially collapsed.
    await expect(params).toBeHidden()

    // First double-click → params visible.
    await row.dblclick()
    await expect(params).toBeVisible()
    await expect(params.getByText('40:00', { exact: true })).toBeVisible()

    // Second double-click → params hidden again.
    await row.dblclick()
    await expect(params).toBeHidden()
  })

  test('Legal-6002 — 8002/001 Edit expands an INLINE table with all columns + entries', async ({ page, request }) => {
    await openLegality(page, request)

    await expect(page.getByTestId('legality-rule-name-8002-001')).toHaveText('8002/001')
    await expect(page.getByTestId('legality-rule-row-8002-001')).toContainText('Maximum Flight Time')

    // Edit expands inline (no dialog).
    await page.getByTestId('legality-rule-edit-8002-001').click()
    const params = page.getByTestId('legality-params-8002-001')
    await expect(params).toBeVisible()
    await expect(page.getByTestId('legality-param-dialog')).toHaveCount(0)

    // All 10 columns present (incl. applicability cols the new model dropped).
    await expect(params.locator('[data-testid^="legality-param-col-8002-001-0-"]')).toHaveCount(10)
    for (const col of ['Bases', 'Ranks', 'Fleets', 'Crew Teams', 'Period', 'Unit', 'Prorated', 'Max Limits', 'Min Limits', 'Type']) {
      await expect(params.getByText(col, { exact: true })).toBeVisible()
    }

    // 4 entries: the 3 BH windows (28/100/200-day) + the new Type=CH monthly band row.
    await expect(params.locator('[data-testid^="legality-param-row-8002-001-0-"]')).toHaveCount(4)
    // 28-day Max Limit was adjusted 112:00 → 40:00 (prep for re-migrating 8002).
    await expect(params.getByText('40:00', { exact: true })).toBeVisible()
    await expect(params.getByText('1000:00', { exact: true })).toBeVisible()
    // The new credit-hour band row: CM period, 75:00 max, Type=CH (Credit Hour).
    await expect(params.getByText('CM', { exact: true })).toBeVisible()
    await expect(params.getByText('75:00', { exact: true })).toBeVisible()
    await expect(params.getByText('CH', { exact: true })).toBeVisible()
  })

  test('Legal-6003 — 8056 pop-out icon opens the roomy dialog showing all 24 columns', async ({ page, request }) => {
    await openLegality(page, request)

    // Pop-out icon opens the AppDialog (the roomy view for wide rules).
    await page.getByTestId('legality-rule-popup-8056-001').click()
    const dialog = page.getByTestId('legality-param-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('8056/001 - Roster Spacing')

    // Resizable: edge/corner handles from AppDialog `resizable`.
    await expect(page.getByTestId('app-dialog-resize-se')).toBeVisible()
    const before = await dialog.boundingBox()
    expect(before, 'param dialog should have a box').toBeTruthy()
    const handle = page.getByTestId('app-dialog-resize-se')
    const hb = await handle.boundingBox()
    expect(hb, 'SE resize handle should have a box').toBeTruthy()
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb!.x + hb!.width / 2 + 80, hb!.y + hb!.height / 2 + 60, { steps: 8 })
    await page.mouse.up()
    const after = await dialog.boundingBox()
    expect(after, 'param dialog should still have a box after resize').toBeTruthy()
    expect(after!.width).toBeGreaterThan(before!.width + 20)
    expect(after!.height).toBeGreaterThan(before!.height + 20)

    // All columns render on one header row of the table (8056 currently has 26).
    await expect(dialog.locator('[data-testid^="legality-param-col-8056-001-0-"]')).toHaveCount(26)
    for (const col of ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit', 'Directional', 'Utilize Post Duty Rest']) {
      await expect(dialog.getByText(col, { exact: true })).toBeVisible()
    }
    await expect(dialog.getByText('FLY|SBY|SIM', { exact: true })).toBeVisible()

    await page.getByTestId('legality-param-dialog-close').click()
    await expect(dialog).toBeHidden()
  })

  test('Legal-6013 — pop-out params expose horizontal scrolling without reaching the last row', async ({ page, request }) => {
    await openLegality(page, request)

    await page.getByTestId('legality-rule-popup-7505-001').click()
    const dialog = page.getByTestId('legality-param-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('7505/001 - Min # GDOs in a RP')
    // Meta subtitle (category · severity · Ref …) is intentionally omitted.
    await expect(dialog.getByText(/DO · Soft/)).toHaveCount(0)
    await expect(dialog.getByTestId('legality-param-table-7505-001-0')).toBeVisible()

    const outer = dialog.getByTestId('legality-param-scroll-area')
    await expect(outer).toBeVisible()
    const verticalPadding = await outer.evaluate((el) => {
      const body = el.parentElement
      const editor = el.querySelector<HTMLElement>('[data-testid^="legality-params-editor-"]')
      if (!(body instanceof HTMLElement) || !editor) return null
      const bodyStyle = getComputedStyle(body)
      const editorStyle = getComputedStyle(editor)
      return {
        bodyTop: parseFloat(bodyStyle.paddingTop),
        bodyBottom: parseFloat(bodyStyle.paddingBottom),
        editorTop: parseFloat(editorStyle.paddingTop),
        editorBottom: parseFloat(editorStyle.paddingBottom),
      }
    })
    expect(verticalPadding, 'dialog body and editor padding').toEqual({
      bodyTop: 6,
      bodyBottom: 6,
      editorTop: 4,
      editorBottom: 4,
    })
    const footerPad = await dialog.locator('.border-t.border-border').last().evaluate((el) => {
      const s = getComputedStyle(el)
      return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) }
    })
    expect(footerPad, 'footer padding just above Close height').toEqual({ top: 4, bottom: 4 })
    // Admin editor: tables column owns X+Y (viewport-sized) so H bar is visible without
    // scrolling to the last row, and CHANGES stays pinned on the right.
    // Read-only pop-out falls back to the outer scroll-area.
    const tableScroll = dialog.getByTestId('legality-param-table-scroll-7505-001')
    const scrollPort = (await tableScroll.count()) > 0 ? tableScroll : outer
    const metrics = await scrollPort.evaluate((el) => ({
      canScrollX: el.scrollWidth > el.clientWidth + 1,
      canScrollY: el.scrollHeight > el.clientHeight + 1,
      initialScrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }))
    expect(metrics.canScrollX, 'params viewport must own horizontal overflow').toBe(true)
    expect(metrics.canScrollY, 'params viewport must own vertical overflow').toBe(true)
    expect(metrics.initialScrollTop, 'test starts at the top, not after scrolling to the last row').toBe(0)
    // Viewport must be clipped to dialog height — otherwise H scrollbar sits under last row.
    expect(
      metrics.clientHeight < metrics.scrollHeight * 0.85,
      'scrollport must be shorter than full table content so H bar is on the visible viewport',
    ).toBe(true)

    const changes = dialog.getByTestId('param-change-log-panel')
    const before = await Promise.all([
      scrollPort.boundingBox(),
      changes.boundingBox(),
    ])
    expect(before[0], 'table scroll area geometry').toBeTruthy()
    expect(before[1], 'CHANGES panel geometry').toBeTruthy()
    expect(
      (before[1]!.x + before[1]!.width / 2) > (before[0]!.x + before[0]!.width),
      'CHANGES must sit to the right of the table scroll area before X scroll',
    ).toBe(true)

    await scrollPort.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await expect(dialog.getByText('Leave Days Range', { exact: true })).toBeVisible()

    if ((await changes.count()) > 0) {
      const after = await Promise.all([
        scrollPort.boundingBox(),
        changes.boundingBox(),
      ])
      expect(after[1], 'CHANGES still laid out after X scroll').toBeTruthy()
      expect(
        Math.abs((after[1]!.x) - (before[1]!.x)) < 2,
        'CHANGES must stay pinned on the right while the params table scrolls horizontally',
      ).toBe(true)
      expect(
        (after[1]!.x + after[1]!.width / 2) > (after[0]!.x + after[0]!.width),
        'CHANGES must remain to the right of the table after X scroll',
      ).toBe(true)
    }

    await page.getByTestId('legality-param-dialog-close').click()
    await expect(dialog).toBeHidden()
  })

  test('Legal-6010 — 7505/001 carries the FULL 27-row DO/VAC band (14× RP 31-31 + 13× RP 30-30), not just 1 row', async ({ page, request }) => {
    // Regression: param_json for 7505/001 had been truncated to a single row
    // (RP 30-30 / DO=12 / VAC 0-1); the GUI faithfully showed only 1 row. The legacy
    // 433 ruleset defines 27 rows — a DO→VAC sliding band. Restore migration:
    // sql/migration/2026-06-15-rule-7505-001-restore-do-band-rows.sql.

    // 1) API: the legality ruleset really serves all 27 rows, split 14 (31-31) + 13 (30-30).
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/433`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset 433 fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }
    const rule = body.data.rules.find((r) => Number(r.function) === 7505 && r.instance === '001')!
    const pj = rule.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    const col = (name: string) => t.header.indexOf(name)
    expect(t.rows).toHaveLength(27)
    const rp = (range: string) => t.rows.filter((r) => r[col('RP Days Range')] === range)
    expect(rp('31-31')).toHaveLength(14)
    expect(rp('30-30')).toHaveLength(13)
    // The band slides: in the 31-31 block, Min DO runs 13→0 as VAC days rise.
    expect(rp('31-31').map((r) => r[col('Min DO')])).toEqual(
      ['13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0'],
    )
    // Concrete endpoints: most-DO / least-VAC and least-DO / most-VAC.
    const top = rp('31-31')[0]
    expect(top[col('Min DO')]).toBe('13')
    expect(top[col('Leave Days Range')]).toBe('0-0')
    const bottom = rp('31-31')[13]
    expect(bottom[col('Min DO')]).toBe('0')
    expect(bottom[col('Leave Days Range')]).toBe('30-31')

    // 2) GUI: opening the rule's params renders all 27 rows with the real values.
    await openLegality(page, request)
    await page.getByTestId('legality-rule-edit-7505-001').click()
    const params = page.getByTestId('legality-params-7505-001')
    await expect(params).toBeVisible()
    await expect(params.locator('[data-testid^="legality-param-row-7505-001-0-"]')).toHaveCount(27)
    // The two extreme band rows are both actually painted.
    await expect(params.locator('[data-testid^="legality-param-row-7505-001-0-0"]').first()).toContainText('13')
    await expect(params.getByText('30-31', { exact: true })).toBeVisible()
  })

  test('Legal-6011 — 7272/001 carries the supplied standby-DP params (Assignments/Offset/Rate/SBY/Notification)', async ({ page, request }) => {
    // 7272/001 "Calculate DP of the Reserves" was the last member of 433 with
    // param_json = NULL (shown as "No configurable parameters"). It is now filled
    // from product config: SBY|PRAM|PRPM / 00:00 / 0.33 / 00:00 / 00:00.
    // Migration: sql/migration/2026-06-15-rule-7272-001-param-json.sql.

    // 1) API: the legality ruleset serves the 5-column table with the exact values.
    const token = await ganttApiLogin(request)
    const res = await request.get(`${ganttApiUrl}/api/legality/ruleset/433`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `legality ruleset 433 fetch failed: ${res.status()}`).toBeTruthy()
    const body = (await res.json()) as {
      data: { rules: Array<{ function: number; instance: string; paramJson: unknown }> }
    }
    const rule = body.data.rules.find((r) => Number(r.function) === 7272 && r.instance === '001')!
    const pj = rule.paramJson as { tables: Array<{ header: string[]; rows: string[][] }> }
    const t = pj.tables[0]
    expect(t.header).toEqual([
      'Assignments', 'Standby Offset', 'Rate', 'SBY Limit', 'Notification Limit',
    ])
    expect(t.rows).toHaveLength(1)
    const col = (name: string) => t.header.indexOf(name)
    const row = t.rows[0]
    expect(row[col('Assignments')]).toBe('SBY|PRAM|PRPM')
    expect(row[col('Standby Offset')]).toBe('00:00')
    expect(row[col('Rate')]).toBe('0.33')
    expect(row[col('SBY Limit')]).toBe('00:00')
    expect(row[col('Notification Limit')]).toBe('00:00')

    // 2) GUI: Edit expands the inline table with all 5 columns + the concrete values.
    await openLegality(page, request)
    await page.getByTestId('legality-rule-edit-7272-001').click()
    const params = page.getByTestId('legality-params-7272-001')
    await expect(params).toBeVisible()
    // No longer the param-less placeholder.
    await expect(params).not.toContainText('No configurable parameters')
    await expect(params.locator('[data-testid^="legality-param-col-7272-001-0-"]')).toHaveCount(5)
    for (const c of ['Assignments', 'Standby Offset', 'Rate', 'SBY Limit', 'Notification Limit']) {
      await expect(params.getByText(c, { exact: true })).toBeVisible()
    }
    await expect(params.getByText('SBY|PRAM|PRPM', { exact: true })).toBeVisible()
    await expect(params.getByText('0.33', { exact: true })).toBeVisible()
  })

  test('Legal-6004 — every rule Edit shows its params inline (all rules now carry params; none say "No configurable parameters")', async ({ page, request }) => {
    await openLegality(page, request)

    for (const r of RULES) {
      const key = `${r.fn}-${r.inst}`
      await page.getByTestId(`legality-rule-edit-${key}`).click()
      const params = page.getByTestId(`legality-params-${key}`)
      await expect(params).toBeVisible()

      if (r.paramTables === 0) {
        await expect(params).toContainText('No configurable parameters')
        await expect(params.locator('[data-testid^="legality-param-table-"]')).toHaveCount(0)
      } else {
        await expect(params.locator('[data-testid^="legality-param-table-"]')).toHaveCount(r.paramTables)
        await expect(params.locator(`[data-testid^="legality-param-col-${key}-0-"]`).first()).toBeVisible()
        await expect(params.locator(`[data-testid^="legality-param-row-${key}-0-"]`).first()).toBeVisible()
      }
      // Collapse before the next rule.
      await page.getByTestId(`legality-rule-edit-${key}`).click()
    }
  })

  test('Legal-6012 — no-violation compute rules carry the Definition category chip', async ({ page, request }) => {
    await openLegality(page, request)

    // These four rules emit NO violations — they compute a value that other rules
    // consume — so they share the 'Definition' taxonomy chip (2026-06-15 reclassification
    // of 7500/7502/7272 from the legacy 'Duty'). Regression guard: before the migration
    // 7500/7502/7272 read 'Duty', which these assertions would have caught.
    await expect(page.getByTestId('legality-rule-category-2014-001')).toHaveText('Definition') // already Definition
    await expect(page.getByTestId('legality-rule-category-7500-001')).toHaveText('Definition') // Basic definition of Acc State
    await expect(page.getByTestId('legality-rule-category-7502-001')).toHaveText('Definition') // Calculation of Credit Hours
    await expect(page.getByTestId('legality-rule-category-7272-001')).toHaveText('Definition') // Calculate DP of the Reserves

    // A real constraint rule must NOT be relabelled — it keeps its own non-Definition category.
    await expect(page.getByTestId('legality-rule-category-7501-001')).not.toHaveText('Definition')
  })
})
