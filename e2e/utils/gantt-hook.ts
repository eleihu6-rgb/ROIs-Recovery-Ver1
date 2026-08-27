/**
 * Gantt Playwright 共享工具（DRY，见根 CLAUDE.md「代码复用」）。
 *
 * 统一封装：
 *  - `seedGanttAuth` —— 经 API 登录 + addInitScript 注入 sessionStorage('rois-auth')。
 *    （Gantt 鉴权在 per-tab sessionStorage，Playwright storageState 无法持久化，必须每次注入。）
 *  - `gotoGantt`     —— 打开 /altair/ 并等待 window.__ganttTest 自省钩子就绪。
 *  - `readHook`      —— 在页面上下文调用 window.__ganttTest 的某个方法并取回结果。
 *  - `waitGanttReady`—— 轮询 __ganttTest.ready()，确保「所有可见数据面板的对象已呈现」。
 *
 * 所有断言都基于 Canvas 渲染所依据的同一份 store 真值 + 绘制回执，
 * 不使用「canvas 有非空像素」这类假象证明（见 §No-Illusion）。
 */
import { expect, type Page, type APIRequestContext } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

export interface GanttCounts {
  roster: number
  pairing: number
  flightRegistrations: number
  flightLegs: number
}

export interface PaneRenderStat {
  paneId: string
  paneType: string
  totalRows: number
  width: number
  height: number
  renders: number
  ts: number
}

/** Base URL of the live-server API (override via GANTT_API_URL). */
export const ganttApiUrl = GANTT_API

interface GanttAuth { token: string; userCode: string; userName: string; schema: string; isAdmin: number }

/** API 登录，返回完整认证信息（token + 用户）。 */
const ganttApiLoginFull = async (request: APIRequestContext): Promise<GanttAuth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `gantt login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: GanttAuth }).data
}

/** API 登录，仅返回 JWT token（供直接打 API 的测试复用，无需 page）。 */
export const ganttApiLogin = async (request: APIRequestContext): Promise<string> =>
  (await ganttApiLoginFull(request)).token

/** API 登录并把 token 注入 sessionStorage，必须在首次 goto 之前调用。 */
export const seedGanttAuth = async (page: Page, request: APIRequestContext): Promise<string> => {
  const auth = await ganttApiLoginFull(request)
  await page.addInitScript((a) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: { userCode: a.userCode, userName: a.userName, schema: a.schema, isAdmin: a.isAdmin ?? 0 },
        token: a.token,
      }),
    )
  }, auth)
  return auth.token
}

/**
 * Query a real scenario from the live DB instead of hardcoding an id/name in a test — demo
 * data drifts between environments (a scenario present when a test was written may be gone
 * later), which turns a hardcoded fixture id into a flaky/stale test. Only read-only precondition
 * lookup (§Simulate-User allows this); the test's actual user action still drives the real UI.
 */
export const findScenario = async (
  request: APIRequestContext,
  token: string,
  opts: { fileType: 'PO' | 'RO' | 'TO'; status?: 'DRAFT' | 'RUNNING' | 'DONE' | 'FAILED' | 'PUBLISHED' },
): Promise<{ id: number; name: string }> => {
  const params = new URLSearchParams({ fileType: opts.fileType, pageSize: '1', ...(opts.status ? { status: opts.status } : {}) })
  const res = await request.get(`${GANTT_API}/api/scenario?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `scenario list query failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data: { items: Array<{ id: number; name: string }> } }
  const item = body.data.items[0]
  expect(item, `no ${opts.fileType}${opts.status ? `/${opts.status}` : ''} scenario found to run this test against`).toBeTruthy()
  return item
}

/**
 * 进入 Live（Gantt）视图。Live 现在以"空 Gantt"启动（Open Live View 弹窗已删除）——
 * 通过空态引导卡打开全局 Filter 弹窗，默认（无筛选）Apply 触发 bootstrap 全量加载。
 * 若数据已加载（appliedFilters 已设置，空态卡不出现），直接返回。
 */
export const openLiveView = async (page: Page): Promise<void> => {
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  // 空态卡未出现 = 本会话已拉取过数据（缓存视图），无需再次加载。
  try {
    await expect(emptyState).toBeVisible({ timeout: 5_000 })
  } catch {
    // 守卫：Live 工具栏必须在场 —— 否则是 Live 视图压根没渲染（运行时错误/
    // 鉴权失败），不能让这里静默通过、把失败推迟成下游误导性的断言。
    await expect(page.getByTestId('refresh-btn')).toBeVisible({ timeout: 5_000 })
    return
  }
  await emptyState.click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).not.toBeVisible({ timeout: 10_000 })
  // Worst-case: bootstrap 90s timeout + fallback fetchCrews 30s + buffer → 270s total.
  await expect(emptyState).not.toBeVisible({ timeout: 270_000 })
}

/** 打开 Gantt：导航 → 等待自省钩子 → 切到 Live 视图。 */
export const gotoGantt = async (page: Page): Promise<void> => {
  // The SPA can render authenticated content while a long-lived remote/API
  // request keeps the browser's `load` event open. DOM readiness is sufficient
  // here; the test hook and Live navigation below are the actual readiness
  // checks for the Gantt workflow.
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
    timeout: 30_000,
  })
  await openLiveView(page)
}

/** 在页面上下文调用 window.__ganttTest[method]() 并取回结果。 */
export const readHook = async <T>(page: Page, method: string): Promise<T> =>
  page.evaluate((m) => {
    const api = window.__ganttTest as unknown as Record<string, () => unknown>
    return api[m]() as unknown
  }, method) as Promise<T>

/**
 * Test-only range setter (setup precondition; replaces the removed toolbar date pickers).
 * Sets the gantt date range + re-applies. NOT a user action — the feature under test
 * is still driven through the real UI.
 */
export const setDateRange = async (page: Page, startIso: string, endIso: string): Promise<void> =>
  page.evaluate(
    ({ s, e }) => (window.__ganttTest as unknown as { setDateRange: (a: string, b: string) => Promise<void> }).setDateRange(s, e),
    { s: startIso, e: endIso },
  )

/** 当前各面板已加载对象计数。 */
export const counts = (page: Page): Promise<GanttCounts> => readHook<GanttCounts>(page, 'counts')

/** Canvas 实际绘制回执。 */
export const renderStats = (page: Page): Promise<PaneRenderStat[]> =>
  readHook<PaneRenderStat[]>(page, 'render')

/** 取某面板的绘制回执（按 paneType 前缀匹配，如 'roster' 命中 'roster-main'）。 */
export const paneRenderStat = async (
  page: Page,
  paneTypePrefix: string,
): Promise<PaneRenderStat | undefined> =>
  (await renderStats(page)).find((s) => s.paneType.startsWith(paneTypePrefix))

/** 某面板累计绘制次数（无回执则 0）。 */
export const paneRenders = async (page: Page, paneTypePrefix: string): Promise<number> =>
  (await paneRenderStat(page, paneTypePrefix))?.renders ?? 0

/** P1-2: 模拟某类面板纵向滚动（仅改本 pane viewport.scrollY，不置全局 dirty）。返回被滚动的 paneId。 */
export const scrollPaneVertically = (
  page: Page,
  paneTypePrefix: string,
  dy: number,
): Promise<string[]> =>
  page.evaluate(
    ({ prefix, delta }) => {
      const api = window.__ganttTest as unknown as {
        scrollPaneVertically: (p: string, d: number) => string[]
      }
      return api.scrollPaneVertically(prefix, delta)
    },
    { prefix: paneTypePrefix, delta: dy },
  )

/** 已加载 roster 对象（轻量字段）。 */
export const rosterObjects = (page: Page): Promise<Array<Record<string, unknown>>> =>
  readHook(page, 'roster')

/** 已加载 pairing 对象（轻量字段）。 */
export const pairingObjects = (page: Page): Promise<Array<Record<string, unknown>>> =>
  readHook(page, 'pairings')

/** 已加载 flight 航段对象（轻量字段）。 */
export const flightObjects = (page: Page): Promise<Array<Record<string, unknown>>> =>
  readHook(page, 'flights')

/** 缩放状态。 */
export const zoomState = (page: Page): Promise<{ pxPerHour: number; zoomMin: number; zoomMax: number; dirty: boolean }> =>
  readHook(page, 'zoom')

/** 当前可见面板类型。 */
export const paneTypes = (page: Page): Promise<string[]> => readHook<string[]>(page, 'paneTypes')

/** 打开全局筛选弹窗，切到指定 tab。 */
export const openFilter = async (page: Page, tab: 'crew' | 'pairing' | 'flight'): Promise<void> => {
  await page.getByTestId('filter-btn').click()
  await expect(page.getByTestId('filter-dialog')).toBeVisible()
  await page.getByTestId(`filter-tab-${tab}`).click()
}

/** 点击 Apply Filters 并等待弹窗关闭 + 面板重新就绪。 */
export const applyFilter = async (page: Page): Promise<void> => {
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).toBeHidden()
  await waitGanttReady(page)
}

/**
 * Light apply — clicks Apply, waits for dialog to close, then waits for network
 * to settle via networkidle. Does NOT call waitGanttReady, so it works correctly
 * when the filter legitimately returns 0 results (rank/fleet with no data in
 * current period; partial/open status when dataset has none). Use this for any
 * filter test where zero results is a valid outcome (Rule 7: data-gap handling).
 */
export const applyFilterLight = async (page: Page): Promise<void> => {
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('filter-dialog')).toBeHidden()
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
}

/**
 * Rule 1 (filter-test-rules.md) — data-driven dropdown selection.
 * Opens the dropdown, reads the FIRST available option from `[data-testid^="${testId}-opt-"]`,
 * clicks it, then closes by re-clicking the tab header.
 * Returns the selected value so tests can assert against it.
 * Use this instead of hardcoding values that might not exist in the dataset.
 */
export const selectFirstAvailableOption = async (
  page: Page,
  testId: string,
  closeTab: 'crew' | 'pairing' | 'flight',
): Promise<string> => {
  await page.getByTestId(`${testId}-trigger`).click()
  const firstOpt = page.locator(`[data-testid^="${testId}-opt-"]`).first()
  await expect(firstOpt).toBeVisible({ timeout: 15_000 })
  const attr = (await firstOpt.getAttribute('data-testid')) ?? ''
  const value = attr.slice(`${testId}-opt-`.length)
  await firstOpt.click()
  await page.getByTestId(`filter-tab-${closeTab}`).click()
  return value
}

/**
 * 在多选下拉里选一个值。选完后点一下当前 tab，把下拉收起来，
 * 以免 Apply 被下拉浮层遮挡。
 */
export const selectDropdownOption = async (
  page: Page,
  testId: string,
  value: string,
  closeTab: 'crew' | 'pairing' | 'flight',
): Promise<void> => {
  await page.getByTestId(`${testId}-trigger`).click()
  // 选项来自 reference-store（弹窗打开时异步加载）；并行跑测时后端可能繁忙，
  // 显式等待选项出现，避免 15s action-timeout 偶发超时。
  const option = page.getByTestId(`${testId}-opt-${value}`)
  await expect(option).toBeVisible({ timeout: 30_000 })
  await option.click()
  await page.getByTestId(`filter-tab-${closeTab}`).click()
}

/** 新增 Flight 面板并等待其对象自动加载。 */
export const addFlightPane = async (page: Page): Promise<void> => {
  const addFlightButton = page.getByTestId('add-pane-flight')
  await expect(addFlightButton).toBeVisible({ timeout: 30_000 })
  await expect(addFlightButton).toBeEnabled({ timeout: 30_000 })
  await addFlightButton.click({ timeout: 30_000 })
  await expect
    .poll(() => counts(page).then((c) => c.flightRegistrations), {
      timeout: 30_000,
      message: 'flight pane never auto-loaded',
    })
    .toBeGreaterThan(0)
}

/**
 * 等待「所有可见数据面板的对象已呈现给用户」。
 * 失败时抛错，便于把超时归因为「数据未加载」而非「页面卡死」。
 */
export const waitGanttReady = async (page: Page, timeout = 30_000): Promise<void> => {
  await expect
    .poll(() => page.evaluate(() => window.__ganttTest?.ready() ?? false), {
      timeout,
      message: 'gantt did not reach ready() — panes never showed objects',
    })
    .toBe(true)
}

/**
 * 测量「打开 Gantt（进入 Live 视图）→ 所有对象呈现」耗时（毫秒）。
 * 计时从点击 Live（用户「打开 gantt」的动作）开始，到 ready() 为 true 为止。
 * 先完成导航与钩子就绪，避免把首包/HMR 等无关耗时计入。
 */
export const measureLoadMs = async (page: Page, timeout = 30_000): Promise<number> => {
  await page.goto('/altair/')
  await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout })
  const t0 = Date.now()
  await openLiveView(page)
  await waitGanttReady(page, timeout)
  return Date.now() - t0
}

/**
 * 通用「数据送达耗时」计时器：从调用起，到 predicate 首次为真的毫秒数（超时抛错）。
 * 用于把「服务端在可接受时间内把数据送达客户端」这类**无量纲**断言改成真实毫秒预算。
 * 取多次中位数请用 `median`（见各 @perf 用例），单点对冷启动/并发争用敏感。
 */
export const measureUntilMs = async (
  page: Page,
  predicate: (p: Page) => Promise<boolean>,
  opts: { timeout?: number; message?: string } = {},
): Promise<number> => {
  const { timeout = 30_000, message = 'predicate never became true' } = opts
  const t0 = Date.now()
  await expect.poll(() => predicate(page), { timeout, message }).toBe(true)
  return Date.now() - t0
}

/**
 * Registers the route mocks that every scenario-canvas test needs before
 * opening a scenario gantt:
 *
 *  1. Catch-all abort — instantly aborts any unmocked request to the live-server,
 *     preventing slow remote-DB queries from filling the browser's HTTP/1.1
 *     connection pool (6 slots per host) and starving React lazy-chunk imports.
 *  2. Auth/me mock — the app calls GET /api/auth/me on page load to validate the
 *     session token. If aborted, the catch block clears sessionStorage and shows
 *     the login screen. We return a minimal valid user response instead.
 *  3. Scenario list / detail / KPI mocks — bypass the remote Postgres (15-30s)
 *     and serve the target scenario immediately so `scenarioRow()` finds it fast.
 *
 * Call this BEFORE registering the test-specific gantt-data and lock-status
 * mocks. Those register last (highest LIFO priority) and correctly override
 * the catch-all.
 *
 * @param page     Playwright Page
 * @param id       Scenario ID to expose in the list (default: 6)
 * @param name     Scenario display name (default: 'RO-2026-06 YEG Test---')
 */
export const seedScenarioListMocks = async (
  page: Page,
  id = 6,
  name = 'RO-2026-06 YEG Test---',
): Promise<void> => {
  const item = {
    id,
    name,
    fileType: 'RO',
    status: 'DONE',
    strDtLoc: '2026-03-01',
    endDtLoc: '2026-03-31',
    optimizedCount: 1,
    leadinLive: 0,
    updatedBy: 'test',
    updatedAt: '2026-03-01T00:00:00.000Z',
  }
  const list = { items: [item], total: 1, page: 1, pageSize: 20, totalPages: 1 }
  const detail = {
    ...item,
    worksetId: null, version: null, ruleGroupCode: null, rulesetId: null,
    pairingScenarioId: null, filterParams: null, comments: null,
    createdBy: 'test', createdAt: '2026-03-01T00:00:00.000Z',
  }

  const ok = (data: unknown) =>
    JSON.stringify({ code: 200, data, message: 'ok' })
  const json = { status: 200, contentType: 'application/json' }

  // 1. Catch-all (lowest LIFO priority — registered first).
  await page.route(
    (url) => url.pathname.startsWith('/altair/live/'),
    (route) => route.abort(),
  )

  // 2. Auth/me — must succeed or the app logs out.
  await page.route(
    (url) => url.pathname === '/altair/live/api/auth/me',
    (route) => route.fulfill({ ...json, body: ok({ userCode: 'admin', userName: 'Admin User', schema: 'f8', isAdmin: 1 }) }),
  )

  // Reference store: bases, ranks, fleets, pairing-types all hit the remote DB.
  // Return empty arrays by default — callers that need specific options should
  // register their own route AFTER this call (higher LIFO priority = overrides).
  await page.route((url) => url.pathname === '/altair/live/api/base', (route) => route.fulfill({ ...json, body: ok([]) }))
  await page.route((url) => url.pathname === '/altair/live/api/rank', (route) => route.fulfill({ ...json, body: ok([]) }))
  await page.route((url) => url.pathname === '/altair/live/api/fleet', (route) => route.fulfill({ ...json, body: ok([]) }))
  await page.route((url) => url.pathname === '/altair/live/api/pairing/types', (route) => route.fulfill({ ...json, body: ok([]) }))
  // Timezone options (also hits remote DB via live-server)
  await page.route((url) => url.pathname === '/altair/live/base/timezone-options', (route) => route.fulfill({ ...json, body: ok([]) }))

  // 3. Scenario list
  await page.route(
    (url) => url.pathname === '/altair/live/api/scenario',
    (route) => route.fulfill({ ...json, body: ok(list) }),
  )

  // 4. Scenario detail
  await page.route(
    (url) => url.pathname === `/altair/live/api/scenario/${id}`,
    (route) => route.fulfill({ ...json, body: ok(detail) }),
  )

  // 5. Scenario KPIs
  await page.route(
    (url) => url.pathname === `/altair/live/api/scenario/${id}/kpi`,
    (route) => route.fulfill({ ...json, body: ok([]) }),
  )
}

/** 取数组中位数（对单点离群稳健）。各 @perf 用例共用。 */
export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
