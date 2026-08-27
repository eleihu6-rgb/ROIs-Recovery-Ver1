/**
 * Gantt Dashboard Page Object — Live (Gantt) view.
 *
 * 注意：
 *  - 应用落地页是 Dashboard 模块；Roster/Pairing 面板只有切到 **Live** 后才挂载并加载数据。
 *  - Gantt 鉴权在 per-tab sessionStorage（'rois-auth'），Playwright storageState 无法持久化，
 *    必须每次用 addInitScript 注入（见 e2e/utils/gantt-hook.ts: seedGanttAuth）。
 *  - 主体是 Canvas，内容断言走 window.__ganttTest 自省钩子，而非像素。
 */
import { type Page, type Locator, expect } from '@playwright/test'
import { openLiveView, waitGanttReady, addFlightPane } from '../../utils/gantt-hook'

export class GanttDashboardPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────
  get refreshButton(): Locator { return this.page.getByTestId('refresh-btn') }
  get filterButton(): Locator { return this.page.getByTestId('filter-btn') }
  get rosterPane(): Locator { return this.page.getByTestId('roster-pane') }
  get pairingPane(): Locator { return this.page.getByTestId('pairing-pane') }
  get flightPane(): Locator { return this.page.getByTestId('flight-pane') }
  get rosterCanvas(): Locator { return this.page.getByTestId('roster-canvas') }
  get pairingCanvas(): Locator { return this.page.getByTestId('pairing-canvas') }
  get flightCanvas(): Locator { return this.page.getByTestId('flight-canvas') }
  get flightDetailDialog(): Locator { return this.page.getByTestId('flight-detail-dialog') }

  // ─── Actions ─────────────────────────────────────────────────────────

  /** 打开 Gantt：导航 → 等待钩子 → 切到 Live → 等待默认面板对象呈现。 */
  async goto(readyTimeout = 30_000): Promise<void> {
    await this.page.goto('/altair/')
    await this.page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
      timeout: 30_000,
    })
    await openLiveView(this.page)
    await waitGanttReady(this.page, readyTimeout)
  }

  /** 新增 Flight 面板并等待其自动加载。 */
  async addFlightPane(): Promise<void> {
    await addFlightPane(this.page)
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click()
    await expect(this.refreshButton).toBeEnabled({ timeout: 30_000 })
  }

  async zoomIn(): Promise<void> {
    await this.page.getByTestId('zoom-in').click()
  }

  async zoomOut(): Promise<void> {
    await this.page.getByTestId('zoom-out').click()
  }

  async openFilters(): Promise<void> {
    await this.filterButton.click()
  }

  // ─── Assertions ──────────────────────────────────────────────────────
  async expectRosterPaneVisible(): Promise<void> {
    await expect(this.rosterPane).toBeVisible()
  }

  async expectPairingPaneVisible(): Promise<void> {
    await expect(this.pairingPane).toBeVisible()
  }

  async expectFlightPaneVisible(): Promise<void> {
    await expect(this.flightPane).toBeVisible()
  }
}
