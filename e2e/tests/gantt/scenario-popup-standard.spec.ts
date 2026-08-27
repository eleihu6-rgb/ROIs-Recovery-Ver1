/**
 * Pop-up window standard (AppDialog) — applied to the Scenario page pop-ups.
 *
 * Verifies every scenario pop-up follows the project standard
 * (root CLAUDE.md「弹窗窗口标准」, ref image/pop-up-window-template.png):
 *   1. icon in the top-left of the title bar
 *   2. blue (`bg-primary`) title bar with white (`text-primary-foreground`) title
 *   3. close button in the top-right corner
 *   4. action buttons at the bottom-right (footer)
 *   5. window is movable by dragging the title bar
 *
 * Both scenario pop-ups (Import PBS, Delete confirm) render through the same
 * `@rois/ui` `AppDialog`, so the chrome is asserted on the Import dialog (no
 * data needed) and the Delete dialog is verified to adopt the same standard.
 *
 * Auth is seeded into sessionStorage the same way as the other scenario specs.
 */
import { test, expect, type Locator } from '@playwright/test'
import { gotoScenarioList } from '../../pages/gantt/scenario-nav'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

/** Assert a pop-up follows the standard chrome: blue header, icon, close, footer. */
const expectStandardChrome = async (dialog: Locator, footerButtons: string[]): Promise<void> => {
  const header = dialog.locator('[data-app-dialog-header]')
  await expect(header).toBeVisible()

  // 2 — blue title bar with white title text.
  const headerClass = (await header.getAttribute('class')) ?? ''
  expect(headerClass, 'title bar uses bg-primary (blue)').toContain('bg-primary')
  expect(headerClass, 'title text uses text-primary-foreground (white)').toContain('text-primary-foreground')

  // 1 + 3 — header holds the left icon AND the right close button (two svgs).
  const headerSvgCount = await header.locator('svg').count()
  expect(headerSvgCount, 'header has a left icon + a close button').toBeGreaterThanOrEqual(2)

  // 4 — every action button is in the footer, below the body, bottom-right.
  const headerBox = await header.boundingBox()
  let prevRight = -Infinity
  for (const name of footerButtons) {
    const btn = dialog.getByRole('button', { name })
    await expect(btn).toBeVisible()
    const box = await btn.boundingBox()
    expect(box, `button "${name}" has a box`).not.toBeNull()
    expect(box!.y, `button "${name}" sits below the title bar`).toBeGreaterThan(headerBox!.y + headerBox!.height)
    // Footer buttons are laid out left→right in DOM order.
    expect(box!.x, `button "${name}" is right of the previous footer button`).toBeGreaterThan(prevRight)
    prevRight = box!.x
  }
}

test.describe('Scenario — pop-up window standard (AppDialog)', () => {
  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    const json = (await res.json()) as {
      data: { token: string; userCode: string; userName: string; schema: string }
    }
    return json.data
  }

  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2022 — Import PBS pop-up has standard chrome and is draggable + closable', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    await scenario.importButton.click()
    const dialog = page.getByTestId('import-pbs-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Import PBS Material' })).toBeVisible()

    // Standard chrome: blue header + icon + close button + bottom-right footer.
    await expectStandardChrome(dialog, ['Cancel', 'Confirm'])

    // 5 — drag the title bar and assert the window actually moved.
    const header = dialog.locator('[data-app-dialog-header]')
    const before = await dialog.boundingBox()
    const start = await header.boundingBox()
    expect(before && start).toBeTruthy()
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2)
    await page.mouse.down()
    await page.mouse.move(start!.x + start!.width / 2 + 140, start!.y + start!.height / 2 + 90, { steps: 8 })
    await page.mouse.up()
    const after = await dialog.boundingBox()
    expect(Math.round(after!.x - before!.x), 'window moved right ~140px').toBeGreaterThan(110)
    expect(Math.round(after!.y - before!.y), 'window moved down ~90px').toBeGreaterThan(60)

    // 3 — the top-right close button dismisses the window.
    await page.getByTestId('import-pbs-dialog-close').click()
    await expect(dialog).toBeHidden()
  })

  test('Scen-2023 — typography standard — base 12px, type-scale tokens + mono are live', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    // Base body type is the dense 12px / 1.5 default.
    const body = await page.evaluate(() => {
      const s = getComputedStyle(document.body)
      return { fontSize: s.fontSize, lineHeight: s.lineHeight }
    })
    expect(body.fontSize, 'body base font-size is 12px').toBe('12px')

    // The @theme type-scale + font tokens are registered as :root CSS vars.
    const tokens = await page.evaluate(() => {
      const r = getComputedStyle(document.documentElement)
      return {
        text2xs: r.getPropertyValue('--text-2xs').trim(),
        text3xs: r.getPropertyValue('--text-3xs').trim(),
        fontMono: r.getPropertyValue('--font-mono').trim(),
      }
    })
    expect(tokens.text2xs, '--text-2xs token = 10px').toBe('0.625rem')
    expect(tokens.text3xs, '--text-3xs token = 9px').toBe('0.5625rem')
    expect(tokens.fontMono.toLowerCase(), '--font-mono is a monospace stack').toContain('monospace')

    // The `text-2xs` utility actually compiles and applies — a migrated dialog
    // label renders at exactly 10px (proves the token → utility pipeline).
    await scenario.importButton.click()
    const dialog = page.getByTestId('import-pbs-dialog')
    await expect(dialog).toBeVisible()
    const labelSize = await dialog
      .getByTestId('import-pbs-field-label')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize)
    expect(labelSize, 'text-2xs label renders at 10px').toBe('10px')
  })

  test('Scen-2036 — alignment standard — sidebar "Crew Bids" icon + text line up with PO/RO/TO', async ({ page }) => {
    // bug 101: "Crew Bids" was indented (pl-7) with a smaller icon (h-3.5) and
    // 11px text, so its icon + label did not align with the PO/RO/TO column.
    await page.goto('/altair/')
    await page.waitForLoadState('networkidle')
    await gotoScenarioList(page)
    await expect(page.getByTestId('scenario-nav-ro')).toBeVisible()

    // Left edge (x) of the icon and of the label, per nav item.
    const edges = async (testId: string) => {
      const row = page.getByTestId(testId)
      const iconBox = await row.locator('svg').first().boundingBox()
      const textBox = await row.locator('span').first().boundingBox()
      expect(iconBox && textBox, `${testId} has icon + text`).toBeTruthy()
      return { iconX: iconBox!.x, textX: textBox!.x, iconW: iconBox!.width, iconH: iconBox!.height }
    }

    const po = await edges('scenario-nav-po')
    const ro = await edges('scenario-nav-ro')
    const to = await edges('scenario-nav-to')
    const cb = await edges('scenario-nav-crew-bids')

    // The optimization items already share one column — sanity check.
    expect(Math.abs(po.iconX - ro.iconX), 'PO/RO icon column').toBeLessThanOrEqual(1)
    expect(Math.abs(ro.iconX - to.iconX), 'RO/TO icon column').toBeLessThanOrEqual(1)

    // The bug: Crew Bids must join that same icon + text column (was indented ~12px).
    expect(Math.abs(cb.iconX - to.iconX), 'Crew Bids icon shares the column left-edge').toBeLessThanOrEqual(1)
    expect(Math.abs(cb.textX - to.textX), 'Crew Bids label shares the column left-edge').toBeLessThanOrEqual(1)

    // And its icon is the same size as the siblings (was h-3.5 vs h-4).
    expect(Math.abs(cb.iconW - to.iconW), 'Crew Bids icon same width as siblings').toBeLessThanOrEqual(0.5)
    expect(Math.abs(cb.iconH - to.iconH), 'Crew Bids icon same height as siblings').toBeLessThanOrEqual(0.5)
  })

  test('Scen-2024 — Delete confirm pop-up adopts the same standard chrome', async ({ page }) => {
    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    // Create a throwaway scenario so we have a list item to delete (self-cleaning).
    const name = 'POPUP-STD-DELETE-CHECK'
    await scenario.createRoScenario({
      name,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      crewBase: 'YEG',
      division: 'Pilots',
    })

    const item = scenario.listItemByName(name)
    await expect(item).toBeVisible()

    // Open the row's three-dot menu → Delete to trigger the confirm pop-up.
    await item.hover()
    await item.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    const dialog = page.getByTestId('scenario-delete-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Delete Scenario?' })).toBeVisible()

    // Same standard chrome as every other pop-up.
    await expectStandardChrome(dialog, ['Cancel', 'Delete'])

    // Confirm the delete — removes the throwaway scenario (cleanup) and proves
    // the standardised footer button still wires through to the action.
    await page.getByTestId('scenario-delete-confirm').click()
    await expect(dialog).toBeHidden()
    await expect(scenario.listItemByName(name)).toHaveCount(0)
  })
})
