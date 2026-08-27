import { test, expect, type Page } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

// Months for parsing the "Jun 12" Date column into a sortable number.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateKey = (label: string): number => {
  const [m, d] = label.trim().split(/\s+/)
  return MONTHS.indexOf(m) * 100 + Number(d)
}

// Rel 7 (the latest, shown by default) groups changes per nav tab. It has no
// Rule or Data sections, and is summarised as text only — no gallery strips.
const REL7_AREAS = ['Live', 'Scenario', 'System', 'Regression', 'Global']

// Rel 6 groups changes per nav tab. It has no Data or Regression sections, and
// is text-only; it is preserved by selecting it explicitly once Rel 7 became
// the default.
const REL6_AREAS = ['Live', 'Scenario', 'Rule', 'System', 'Global']

// Rel 4 groups per nav tab and is text-only; it is preserved by selecting it
// explicitly once Rel 5 became the default.
const REL4_AREAS = ['Live', 'Scenario', 'Rule', 'Data', 'System', 'Global']

// Rel 3 also groups per nav tab and is text-only; it is preserved by selecting it
// explicitly once Rel 4 became the default.
const REL3_AREAS = ['Live', 'Scenario', 'Rule', 'Data', 'System', 'Global']

const REL2_AREAS = ['Live', 'Scenario', 'Rule', 'Data', 'Regression', 'System']

// Rel 2 carries a gallery only on the areas with a new visual surface; the perf
// areas show none. Assert EXACT counts (quality rule: never just "an image
// renders").
const REL2_GALLERY_COUNTS: Record<string, number> = {
  Live: 1,       // Alert Center
  Rule: 1,       // Legality tab
  Data: 1,       // Assignment grid
  Regression: 1, // category tree + naming ids
}
const REL2_NO_GALLERY = ['Scenario', 'System']

// Rel 1 still carries its notable-screenshot galleries — assert EXACT counts so
// switching to the older release keeps proving the images load (quality rule).
// Live 5→4 and Data/Regression →0: those screenshots were removed in the
// 2026-07-31 Help-content reorg, and Rel 1 no longer references them.
const REL1_GALLERY_COUNTS: Record<string, number> = {
  Live: 4,
  Scenario: 3,
  Rule: 1,
  Data: 0,
  Regression: 0,
}

const openRelease = async (page: Page) => {
  await page.click('[data-testid="nav-release"]')
  await expect(page.getByTestId('release-view')).toBeVisible()
}

const selectRelease = async (page: Page, n: number) => {
  await page.getByTestId(`release-tree-item-${n}`).click()
  await expect(page.getByTestId('release-detail-title')).toContainText(`Rel ${n}`)
}

test.describe('Release tab', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto(`${BASE}/altair/`)
    await page.waitForSelector('[data-testid="nav-release"]', { timeout: 20_000 })
  })

  test('Live-1202 — Release tab sits after Help in the top nav', async ({ page }) => {
    await expect(page.getByTestId('nav-help')).toBeVisible()
    await expect(page.getByTestId('nav-release')).toBeVisible()
    const help = await page.getByTestId('nav-help').boundingBox()
    const release = await page.getByTestId('nav-release').boundingBox()
    expect(help && release && release.x > help.x).toBeTruthy()
  })

  test('Live-1203 — latest release (Rel 7) shows its commit-range cursor', async ({ page }) => {
    await openRelease(page)
    // All seven releases are listed, latest (Rel 7) on top and selected by default.
    await expect(page.getByTestId('release-tree-item-7')).toContainText('Rel 7')
    await expect(page.getByTestId('release-tree-item-7')).toContainText('Aug 14, 2026')
    await expect(page.getByTestId('release-tree-item-6')).toContainText('Rel 6')
    await expect(page.getByTestId('release-tree-item-5')).toContainText('Rel 5')
    await expect(page.getByTestId('release-tree-item-4')).toContainText('Rel 4')
    await expect(page.getByTestId('release-tree-item-3')).toContainText('Rel 3')
    await expect(page.getByTestId('release-tree-item-2')).toContainText('Rel 2')
    await expect(page.getByTestId('release-tree-item-1')).toContainText('Rel 1')
    await expect(page.getByTestId('release-detail-title')).toContainText('Rel 7 — Aug 14, 2026')
    // The generation cursor (commit range) proves the "from → to" tracking for Rel 7.
    await expect(page.getByTestId('release-detail')).toContainText('df315d3e … 9c7c59de')
    await expect(page.getByTestId('release-detail')).toContainText('Aug 12, 2026 – Aug 14, 2026')
  })

  test('Live-1204 — changes are grouped per nav tab, in nav-tab order', async ({ page }) => {
    await openRelease(page)
    // Every nav-tab area that has changes is present (Rel 7 has no Rule or Data sections).
    for (const area of REL7_AREAS) {
      await expect(page.getByTestId(`release-area-${area}`)).toBeVisible()
    }
    // Sections appear top-to-bottom in nav order (Live above Scenario above System above Regression above Global).
    const areas = ['Live', 'Scenario', 'System', 'Regression', 'Global']
    const ys = await Promise.all(
      areas.map(async (a) => (await page.getByTestId(`release-area-${a}`).boundingBox())!.y),
    )
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]).toBeLessThan(ys[i])
  })

  test('Live-1205 — Rel 7 curated changes are present with exact wording', async ({ page }) => {
    await openRelease(page)
    await expect(page.getByTestId('release-table-Live')).toContainText('Rule warnings name only the crews you actually moved')
    await expect(page.getByTestId('release-table-Scenario')).toContainText('Scenario draft legality uses the scenario filter RP')
    await expect(page.getByTestId('release-table-Scenario')).toContainText('Reserve Priority dialog shows the algorithm’s real default')
    await expect(page.getByTestId('release-table-System')).toContainText('Roles page pairs a persistent role list with a permission editor')
    await expect(page.getByTestId('release-table-System')).toContainText('PBS Users table adds Base and Rank columns')
    await expect(page.getByTestId('release-table-Regression')).toContainText('Regression tab reports when the AI backend is unavailable')
    await expect(page.getByTestId('release-table-Global')).toContainText('SSO Login button signs you in through single sign-on')
    // Both change types are represented (Rel 7 has fixes too).
    await expect(page.getByText('Bug fix', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Enhancement', { exact: true }).first()).toBeVisible()
  })

  test('Live-1206 — each table is sorted by date, latest on top', async ({ page }) => {
    await openRelease(page)
    for (const area of ['Live', 'Scenario']) {
      const cells = page.locator(`[data-testid="release-table-${area}"] tbody tr td:first-child`)
      const labels = await cells.allInnerTexts()
      expect(labels.length).toBeGreaterThan(0)
      const keys = labels.map(dateKey)
      const sorted = [...keys].sort((a, b) => b - a)
      expect(keys, `${area} rows must be date-descending`).toEqual(sorted)
    }
  })

  test('Live-1207 — Rel 7, Rel 6, Rel 4 and Rel 3 are text-only: no galleries on any area', async ({ page }) => {
    await openRelease(page)
    for (const area of REL7_AREAS) {
      await expect(page.getByTestId(`release-gallery-${area}`)).toHaveCount(0)
    }
    await expect(page.locator('[data-testid="release-detail"] img')).toHaveCount(0)
    // Rel 6, Rel 4 and Rel 3 were also text-only; preserve that coverage by selecting them explicitly.
    await selectRelease(page, 6)
    for (const area of REL6_AREAS) {
      await expect(page.getByTestId(`release-gallery-${area}`)).toHaveCount(0)
    }
    await expect(page.locator('[data-testid="release-detail"] img')).toHaveCount(0)
    await selectRelease(page, 4)
    for (const area of REL4_AREAS) {
      await expect(page.getByTestId(`release-gallery-${area}`)).toHaveCount(0)
    }
    await expect(page.locator('[data-testid="release-detail"] img')).toHaveCount(0)
    await selectRelease(page, 3)
    for (const area of REL3_AREAS) {
      await expect(page.getByTestId(`release-gallery-${area}`)).toHaveCount(0)
    }
    await expect(page.locator('[data-testid="release-detail"] img')).toHaveCount(0)
  })

  test('Live-1208 — area sections collapse and expand on click', async ({ page }) => {
    await openRelease(page)
    await selectRelease(page, 3)
    const live = page.getByTestId('release-area-Live')
    const row = page.getByTestId('release-table-Live').getByText('Esc clears every pane selection', { exact: true })
    await expect(row).toBeVisible()
    await live.locator('> button').click()
    await expect(row).toBeHidden()
    await live.locator('> button').click()
    await expect(row).toBeVisible()
  })

  test('Live-1211 — selecting Rel 3 shows its content and cursor', async ({ page }) => {
    await openRelease(page)
    await selectRelease(page, 3)
    await expect(page.getByTestId('release-detail-title')).toContainText('Rel 3 — Jun 24, 2026')
    await expect(page.getByTestId('release-detail')).toContainText('2a20546e … f9dd74d0')
    await expect(page.getByTestId('release-detail')).toContainText('Jun 15, 2026 – Jun 24, 2026')
    await expect(page.getByTestId('release-table-Live')).toContainText('Crew memos on the roster')
    await expect(page.getByTestId('release-table-Scenario')).toContainText('Roster Quality Analyzer — three checks')
    await expect(page.getByTestId('release-table-Rule')).toContainText('Edit legality rule parameters in place')
    await expect(page.getByTestId('release-table-Data')).toContainText('Browse database tables from the Data tab')
    await expect(page.getByTestId('release-table-System')).toContainText('Slimmer top navigation')
    await expect(page.getByTestId('release-table-Global')).toContainText('Save & autofill your login')
  })

  test('Live-1209 — selecting Rel 2 shows its content and galleries still load', async ({ page }) => {
    await openRelease(page)
    await selectRelease(page, 2)
    await expect(page.getByTestId('release-detail-title')).toContainText('Rel 2 — Jun 15, 2026')
    await expect(page.getByTestId('release-detail')).toContainText('b434a374 … 2a20546e')
    for (const area of REL2_AREAS) {
      await expect(page.getByTestId(`release-area-${area}`)).toBeVisible()
    }
    await expect(page.getByTestId('release-table-Live')).toContainText('Alert Center lists live rule violations')
    await expect(page.getByTestId('release-table-Rule')).toContainText('Legality tab browses multiple rulesets')

    let expectedTotal = 0
    for (const [area, count] of Object.entries(REL2_GALLERY_COUNTS)) {
      expectedTotal += count
      await expect(page.locator(`[data-testid="release-gallery-${area}"] img`)).toHaveCount(count)
    }
    for (const area of REL2_NO_GALLERY) {
      await expect(page.getByTestId(`release-gallery-${area}`)).toHaveCount(0)
    }
    const allImgs = page.locator('[data-testid="release-detail"] img')
    await expect(allImgs).toHaveCount(expectedTotal)
    await expect
      .poll(async () =>
        allImgs.evaluateAll((els) => (els as HTMLImageElement[]).every((im) => im.naturalWidth >= 200)),
      )
      .toBe(true)
  })

  test('Live-1210 — selecting Rel 1 shows its content and galleries still load', async ({ page }) => {
    await openRelease(page)
    await selectRelease(page, 1)
    await expect(page.getByTestId('release-detail-title')).toContainText('Rel 1 — Jun 12, 2026')
    await expect(page.getByTestId('release-detail')).toContainText('1a8f9b45 … b434a374')
    await expect(page.getByTestId('release-table-Live')).toContainText('Flight Navi table')

    let expectedTotal = 0
    for (const [area, count] of Object.entries(REL1_GALLERY_COUNTS)) {
      expectedTotal += count
      await expect(page.locator(`[data-testid="release-gallery-${area}"] img`)).toHaveCount(count)
    }
    const allImgs = page.locator('[data-testid="release-detail"] img')
    await expect(allImgs).toHaveCount(expectedTotal)
    // Every screenshot actually decoded to a real PNG (not a broken 404 swap).
    await expect
      .poll(async () =>
        allImgs.evaluateAll((els) => (els as HTMLImageElement[]).every((im) => im.naturalWidth >= 200)),
      )
      .toBe(true)
  })
})
