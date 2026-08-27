import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'
import { seedGanttAuth, readHook } from '../../utils/gantt-hook'

interface ValidityBlock { crewId: string; blockMs: number }

/**
 * Scenario Rule 2（失效红线，scenario 侧共享实现）：scenario 窗口内 rank 覆盖断档的机组，
 * 在 scenario-roster 上应有失效点探针。数据依赖目标环境（UAT 已实证 scenario #14：
 * 窗口 2026-06-01..06-30，crew 1450 rank CA 于 2026-06-12 失效、13040 FO 于 2026-06-21 失效，
 * 均无后续覆盖记录）。
 * 需 SCENARIO_GANTT_SOURCE=db（默认）。
 */
test.describe('scenario crew validity red line', () => {
  test('scenario roster exposes validity blocks for in-window rank expiries', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seedGanttAuth(page, page.request)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()
    const row = await scenario.scenarioRow(14, 'RO-YEG-May2026')
    await row.click()
    await page.getByTestId('scenario-detail-panel').getByTestId('scenario-open-btn').click()
    // Scenario gantt needs a loaded result; skip when the env lacks it (data-dependent).
    const noResult = page.locator('main').getByText('Scenario has no loaded result')
    if (await noResult.isVisible().catch(() => false)) {
      test.skip(true, 'scenario #14 has no loaded result in this environment')
    }
    await expect(page.getByTestId('scenario-gantt-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('scenario-roster-canvas')).toBeVisible({ timeout: 20_000 })

    // 等 scenario 窗口内失效机组的 block 出现在探针中。
    await expect
      .poll(async () => {
        const blocks = (await readHook<ValidityBlock[]>(page, 'scenarioRosterValidityBlocks')) ?? []
        const b = blocks.find((x) => x.crewId === '1450')
        return b?.blockMs ?? null
      }, { timeout: 30_000, message: 'scenario 1450 validity block' })
      .not.toBeNull()

    const blocks = (await readHook<ValidityBlock[]>(page, 'scenarioRosterValidityBlocks')) ?? []
    // 1450 rank CA 失效于 2026-06-12（窗口内）。
    const b1450 = blocks.find((b) => b.crewId === '1450')
    expect(b1450).toBeTruthy()
    expect(new Date(b1450!.blockMs).toISOString().slice(0, 10)).toBe('2026-06-12')
    // 13040 rank FO 失效于 2026-06-21（窗口内）。
    const b13040 = blocks.find((b) => b.crewId === '13040')
    if (b13040) {
      expect(new Date(b13040.blockMs).toISOString().slice(0, 10)).toBe('2026-06-21')
    }
  })
})
