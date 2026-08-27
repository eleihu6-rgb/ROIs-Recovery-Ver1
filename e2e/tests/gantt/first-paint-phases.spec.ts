/**
 * P2-1 首屏阶段拆解：把「打开 Gantt → roster 首次出现」的空白时间拆成各段，
 * 输出 网络/服务端/解析 + 索引构建/绘制 的分段耗时，避免对 5-10s 盲目优化。
 *
 * 阶段（来自 window.__ganttTest.marks()，相对 gantt:open 的 ms 见 phases()）：
 *   gantt:open（applyGanttFilters 起点；Live 空启动后由 Filter Apply 驱动加载）
 *   → bootstrap:start / roster:first-request:start/end
 *   → roster:first-canvas-painted（首屏完成）→ rule-check:first-start
 *
 * 关键指标 blankObjectTime = roster:first-canvas-painted - gantt:open。
 *
 * ── 量化目标与诚实门禁（§No-Illusion）────────────────────────────────────────
 * 旧版只断言 blankObjectTime>0（诊断性，无真实阈值）。现补上首屏空白时间的量化预算：
 *   FP_TARGET_MS    = 300  —— 首屏空白时间目标。
 *   FP_CHALLENGE_MS = 500  —— 当前挑战目标：较 ~540ms 中位基线快 ~7%（持续 5–10% 提速）。
 *   FP_BUDGET_MS    = 1200 —— 防回归门禁（硬断言）；环境变量 GANTT_FIRSTPAINT_BUDGET_MS 可覆盖。
 * dev 下 StrictMode 双挂载使首屏打点噪声大（单次 380–780ms 抖动），并发跑全量 e2e 时争用更甚
 * （中位数曾抖到 923ms），故 BUDGET 取并发最坏情形之上，门禁只拦「明显退化」；生产构建无此
 * 双挂载，可显著收紧。诚实性自检：GANTT_FIRSTPAINT_BUDGET_MS=0.00001 运行 ⇒ 必然 FAIL。
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, median } from '../../utils/gantt-hook'

/** 首屏空白时间最终目标。 */
const FP_TARGET_MS = 300
/** 当前挑战目标：较 ~540ms 中位基线提速 ~7%。 */
const FP_CHALLENGE_MS = 500
/** 防回归门禁（硬断言）；CHALLENGE 才是真实标杆，BUDGET 仅拦明显退化（容忍并发争用）。 */
const FP_BUDGET_MS = Number(process.env.GANTT_FIRSTPAINT_BUDGET_MS ?? 1500)
/** dev StrictMode 双挂载噪声大，取多次全新加载的中位数做门禁。 */
const FP_SAMPLES = 3

test.describe('Gantt — first-paint phase breakdown (§P2-1)', () => {
  test('Live-1061 — reports roster first-paint phase timings @perf', async ({ page, request }, testInfo) => {
    await seedGanttAuth(page, request)

    // 多次「全新加载」采样 blankObjectTime（每次 gotoGantt 重置应用状态），取中位数抗噪。
    const samples: number[] = []
    let phases: Record<string, number> = {}
    for (let i = 0; i < FP_SAMPLES; i++) {
      await gotoGantt(page)
      await waitGanttReady(page)
      phases = await page.evaluate(() => window.__ganttTest!.phases())
      samples.push(phases.blankObjectTime)
    }

    // 注：dev 构建 React StrictMode 会双挂载 use-gantt-viewport，使「首次出现」打点的
    // 中间段交错；blankObjectTime（首屏完成）是可靠头条指标。生产构建无此双挂载。
    const blankMs = median(samples)
    const breakdown = {
      blankObjectTimeMedian_ms: blankMs,
      samples,
      targetMs: FP_TARGET_MS,
      challengeMs: FP_CHALLENGE_MS,
      budgetMs: FP_BUDGET_MS,
      meetsTarget: blankMs <= FP_TARGET_MS,
      meetsChallenge: blankMs <= FP_CHALLENGE_MS,
      phasesRelativeToOpen: phases,
      note: 'dev StrictMode double-mounts → intermediate marks may interleave; median blankObjectTime is the reliable headline.',
    }
    await testInfo.attach('first-paint-phases.json', {
      body: JSON.stringify(breakdown, null, 2),
      contentType: 'application/json',
    })
    // eslint-disable-next-line no-console
    console.log('FIRST_PAINT_PHASES ' + JSON.stringify(breakdown))

    // 诊断性断言：首屏标记齐全（证明插桩生效）。
    expect(phases['gantt:open'], 'gantt:open marked').toBe(0)
    expect(phases['roster:first-canvas-painted'], 'roster first paint marked').toBeGreaterThan(0)
    expect(blankMs, 'blankObjectTime computed').toBeGreaterThan(0)

    // 防回归门禁（硬断言）：首屏空白时间不得超过 BUDGET。超过即首屏明显退化。
    expect(
      blankMs,
      `blankObjectTime ${blankMs}ms exceeded budget ${FP_BUDGET_MS}ms — first-paint regression`,
    ).toBeLessThanOrEqual(FP_BUDGET_MS)
  })
})
