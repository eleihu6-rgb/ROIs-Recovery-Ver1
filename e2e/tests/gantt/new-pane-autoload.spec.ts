/**
 * §Req2 — 打开新面板（Pairing / Flight）时必须自动加载数据，不能留一片空白区域。
 *
 * 默认布局已含 roster + pairing。本用例验证「新增 Flight 面板」后：
 *   - 仅新增面板这一个动作，无需任何额外触发
 *   - flight 对象自动加载（store 计数 > 0）
 *   - Canvas 真的画出了 flight 行（render 回执 totalRows>0），即非空白
 *
 * ── 量化送达时间（§No-Illusion）──────────────────────────────────────────────
 * 旧版只断言「对象最终出现」（30s 无量纲轮询 = 隐含「可接受时间」，不可量化）。现补上
 * 「新增面板 → 服务端把 flight 数据送达并呈现」的真实毫秒预算：
 *   FLIGHT_TARGET_MS    = 800  —— 送达时间目标。
 *   FLIGHT_CHALLENGE_MS = 1200 —— 当前挑战目标（较基线提速 5–10%）。
 *   FLIGHT_BUDGET_MS    = 4000 —— 防回归门禁（硬断言）；env GANTT_PANE_LOAD_BUDGET_MS 可覆盖。
 * 诚实性自检：GANTT_PANE_LOAD_BUDGET_MS=0.00001 运行 ⇒ 必然 FAIL（证明断言确实在测量送达耗时）。
 */
import { test, expect } from '@playwright/test'
import {
  seedGanttAuth,
  gotoGantt,
  waitGanttReady,
  counts,
  renderStats,
  paneTypes,
  measureUntilMs,
} from '../../utils/gantt-hook'

/** flight 数据送达时间目标。 */
const FLIGHT_TARGET_MS = 800
/** 当前挑战目标：较基线提速 5–10%。 */
const FLIGHT_CHALLENGE_MS = 1200
/** 防回归门禁（硬断言）；env 可覆盖，便于 honesty probe 与 CI 收紧。 */
const FLIGHT_BUDGET_MS = Number(process.env.GANTT_PANE_LOAD_BUDGET_MS ?? 4000)

test.describe('Gantt — new pane auto-loads (§Req2)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live-1105 — adding a Flight pane auto-loads flight objects (no blank area) @smoke', async ({ page }, testInfo) => {
    await gotoGantt(page)
    await waitGanttReady(page)

    // 前置：尚无 flight 面板。（注：flight 数据可能已被 openLiveView 的初始 Filter Apply 加载，
    // 故不强断言计数=0；本用例的真实要求是「新增面板后该区域有对象、非空白」。）
    expect(await paneTypes(page)).not.toContain('flight')

    // 唯一动作：新增 Flight 面板
    await page.getByTestId('add-pane-flight').click()
    // 面板已加入布局
    await expect.poll(() => paneTypes(page)).toContain('flight')

    // 量化送达耗时：从「面板已加入」到「flight 对象出现」的毫秒数。
    const deliverMs = await measureUntilMs(
      page,
      (p) => counts(p).then((c) => c.flightRegistrations > 0),
      { timeout: 30_000, message: 'flight pane stayed blank — objects never auto-loaded' },
    )

    const c = await counts(page)
    expect(c.flightRegistrations, 'flight registrations loaded').toBeGreaterThan(0)
    expect(c.flightLegs, 'flight legs loaded').toBeGreaterThan(0)

    // Canvas 真的画了 flight 行（非空白面板）
    await expect
      .poll(async () => {
        const stat = (await renderStats(page)).find((s) => s.paneType.startsWith('flight'))
        return stat?.totalRows ?? 0
      })
      .toBeGreaterThan(0)

    // 如实报告送达耗时与各档目标。
    const report = {
      deliverMs,
      targetMs: FLIGHT_TARGET_MS,
      challengeMs: FLIGHT_CHALLENGE_MS,
      budgetMs: FLIGHT_BUDGET_MS,
      meetsTarget: deliverMs <= FLIGHT_TARGET_MS,
      meetsChallenge: deliverMs <= FLIGHT_CHALLENGE_MS,
      flightRegistrations: c.flightRegistrations,
      flightLegs: c.flightLegs,
    }
    await testInfo.attach('flight-pane-autoload.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    })
    // eslint-disable-next-line no-console
    console.log(
      `FLIGHT_AUTOLOAD deliver=${deliverMs}ms target=${FLIGHT_TARGET_MS} ` +
        `challenge=${FLIGHT_CHALLENGE_MS} budget=${FLIGHT_BUDGET_MS} ` +
        `meetsChallenge=${report.meetsChallenge} (regs=${c.flightRegistrations}, legs=${c.flightLegs})`,
    )

    // 防回归门禁（硬断言）：送达时间不得超过 BUDGET。超过即「面板数据迟迟不来」的退化。
    expect(
      deliverMs,
      `flight auto-load ${deliverMs}ms exceeded budget ${FLIGHT_BUDGET_MS}ms — pane data delivery regression`,
    ).toBeLessThanOrEqual(FLIGHT_BUDGET_MS)
  })
})
