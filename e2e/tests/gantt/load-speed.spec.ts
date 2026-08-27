/**
 * §Req5 — 打开 Gantt 时，所有对象应在 1 秒内呈现（月度全量 Gantt 的目标加载速度）。
 *
 * 「加载完成」= __ganttTest.ready()：所有可见数据面板不在加载中、计数>0、Canvas 已绘制。
 * 计时从「打开 Gantt（进入 Live 视图）」开始，到 ready() 为 true 为止。
 *
 * ── 量化目标与诚实门禁（§No-Illusion）────────────────────────────────────────
 * 旧版用 GATE_MS=12_000 这种「可接受时间」式的宽松上限，几乎不可能触发，等于没有门禁。
 * 现改为三档真实数值，并对单次抖动做统计鲁棒化：
 *
 *   TARGET_MS    = 1000  —— §Req5 最终目标（1 秒）。
 *   CHALLENGE_MS = 1200  —— 当前挑战目标：较 ~1290ms 暖态基线快 ~7%（持续 5–10% 提速）。
 *                          这是**真正的性能标杆**，每次如实上报 meetsChallenge，驱动优化。
 *   BUDGET_MS    = 2500  —— 防回归门禁（硬断言）。可经环境变量 GANTT_LOAD_BUDGET_MS 覆盖。
 *                          BUDGET 取「CI/runner 抖动 + 轻度并发争用」之上的退化阈值（CI 为
 *                          workers=1 无争用，本地全量并发会抬高），只拦明显退化；真实目标看 CHALLENGE。
 *
 * 单次冷加载会抖到 ~2.2s（Vite/DB 冷启），故取 SAMPLES 次「全新加载」的中位数做门禁，
 * 对单个离群点稳健，不会偶发误红。
 *
 * 诚实性自检（honesty probe，证明断言确实在测量、而非假绿）：
 *   GANTT_LOAD_BUDGET_MS=0.00001 npx playwright test ... tests/gantt/load-speed.spec.ts
 * 中位数（~1.3s）必然 > 0.00001ms ⇒ 用例必然 FAIL。若此时仍 PASS，说明断言是假象，须修。
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, measureLoadMs, counts, median } from '../../utils/gantt-hook'

/** §Req5 最终性能目标：用户打开 Gantt 后 1 秒内所有对象呈现。 */
const TARGET_MS = 1000
/** 当前挑战目标：较暖态基线提速 ~7%（落地后收紧 BUDGET，持续 5–10% 提速）。 */
const CHALLENGE_MS = 1200
/** 防回归门禁（硬断言）；环境变量可覆盖，便于 honesty probe 与 CI 收紧。 */
const BUDGET_MS = Number(process.env.GANTT_LOAD_BUDGET_MS ?? 2500)
/** 取多次全新加载的中位数做门禁，对冷启动单点抖动稳健。 */
const SAMPLES = 3

test.describe('Gantt — monthly full load speed (§Req5)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
  })

  test('Live-1100 — opening gantt shows all objects within the load budget @perf', async ({ page }, testInfo) => {
    // 多次「全新加载」（每次 page.goto 重置应用状态 → openLiveView 触发全量加载）。
    const samples: number[] = []
    for (let i = 0; i < SAMPLES; i++) samples.push(await measureLoadMs(page))
    const loadMs = median(samples)

    // 加载完成后对象确实呈现（功能正确性，始终断言；与性能无关）。
    const c = await counts(page)
    expect(c.roster, 'roster objects shown after load').toBeGreaterThan(0)
    expect(c.pairing, 'pairing objects shown after load').toBeGreaterThan(0)

    // 如实报告：中位数 + 各次样本 + 与各档目标的差距，供性能增强阶段验收 / 棘轮收紧。
    const meetsTarget = loadMs <= TARGET_MS
    const meetsChallenge = loadMs <= CHALLENGE_MS
    const report = {
      loadMsMedian: loadMs,
      samples,
      targetMs: TARGET_MS,
      challengeMs: CHALLENGE_MS,
      budgetMs: BUDGET_MS,
      meets1sTarget: meetsTarget,
      meetsChallenge,
      rosterObjects: c.roster,
      pairingObjects: c.pairing,
    }
    await testInfo.attach('gantt-load-speed.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    })
    // eslint-disable-next-line no-console
    console.log(
      `GANTT_LOAD median=${loadMs}ms samples=[${samples.join(',')}] ` +
        `target=${TARGET_MS} challenge=${CHALLENGE_MS} budget=${BUDGET_MS} ` +
        `meets1s=${meetsTarget} meetsChallenge=${meetsChallenge} ` +
        `(roster=${c.roster}, pairing=${c.pairing})`,
    )

    // 防回归门禁（硬断言）：中位加载时间不得超过 BUDGET。超过即明显性能退化。
    expect(
      loadMs,
      `median load ${loadMs}ms exceeded budget ${BUDGET_MS}ms — perf regression (samples ${samples.join(',')})`,
    ).toBeLessThanOrEqual(BUDGET_MS)
  })
})
