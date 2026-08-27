# PBS Award 矮屏内容遮挡修复设计

日期：2026-07-29

状态：用户已确认方案 A，可实施

## 1. 问题

PBS Portal Award 页面在 `1280×720` 视口下，右侧 `Roster Details` 内的
`Selected Duty` 会向下溢出，并被后续的 `Reason Report Preview` 遮挡。

根因是 `RosterDetailsPanel` 使用
`max-h-[min(40rem,calc(100dvh-28rem))]`。Award 页面已经位于
`ScaledPageCanvas` 中，布局尺寸由 `--portal-page-shell-height` 管理；再次使用物理视口
`100dvh` 计算内部面板高度，会在缩放后得到过小的未缩放布局高度。面板内部两行仍有固定
最小高度，最终溢出父容器。

## 2. 目标

- `1280×720` 下 `Selected Duty` 与 `Reason Report Preview` 不重叠。
- Roster 表格和 Selected Duty 继续在各自区域内部滚动。
- `1920×1080` 基准布局保持不变。
- 只修改 Award 页面，不修改共享 `ScaledPageCanvas` 或其他 PBS 页面。

## 3. 方案

采用父级 Flex 分配高度：

1. 移除 `RosterDetailsPanel` 基于 `100dvh` 的 `max-height`。
2. 保留 `flex-1 min-h-0`，让它使用右侧栏扣除 Reason Report 后的剩余高度。
3. 将 `ReasonReportPreview` 标记为不可压缩，确保始终位于 Roster Details 下方。
4. 保留现有表格和 Selected Duty 内部滚动，不改变数据、交互和视觉内容。

## 4. 非目标

- 不修改 Award 数据或 API。
- 不修改 Tier、PRM、Reason Report 数据来源。
- 不修改共享缩放组件。
- 不调整其他 PBS 页面。
- 不进行无关样式重构。

## 5. 验收与测试

### 5.1 组件测试

- 确认 `RosterDetailsPanel` 不再包含基于 `100dvh` 的高度限制。
- 确认 Reason Report Preview 使用不可压缩布局。
- 保持 Roster 表格与 Selected Duty 的内部滚动结构。

组件测试只校验结构，不用于证明真实浏览器布局正确。

### 5.2 Playwright 数据场景

复用并扩展 Award adaptive layout E2E，fixture 必须包含：

- 足够多的 roster rows，使 Roster 表格必须纵向滚动。
- 一个包含足够多航段或说明内容的 Pairing，使 Selected Duty 必须纵向滚动。
- `reasonReport.available=true`。
- 至少 3 条报告条目，并包含会换行的长 explanation。
- 另保留 `reasonReport.available=false` 的空报告回归。

### 5.3 `1280×720` 验收

- `Selected Duty`、`Reason Report Preview` 和右侧栏均有非零矩形区域。
- 使用 1px 容差断言：
  `selectedDuty.bottom <= reasonPreview.top + 1`。
- 两个区域的左右边界和上下边界都位于 `award-side-panel` /
  `award-results-page` 内。
- 页面、Award canvas 和 side panel 不产生意外横向或纵向溢出。
- Roster 表格满足 `scrollHeight > clientHeight`；滚动后 `scrollTop` 改变且末端行可访问。
- Selected Duty 满足 `scrollHeight > clientHeight`；滚动后 `scrollTop` 改变且末端内容可访问。
- 滚动其中一个区域不得改变另一个区域的 `scrollTop`。

### 5.4 `1920×1080` 基准回归

- 复用 5.3 的可见性、边界和不重叠断言。
- Header、Summary、Calendar、Roster Details、Selected Duty 和 Reason Report
  Preview 均可见。
- 不改变页面现有两栏结构和主要区域顺序。

### 5.5 QA 与验证命令

更新
`docs/test-cases/pbs/award/2026-07-05-award-adaptive-layout.md`，补充：

- `1280×720` 不重叠检查。
- Reason Report 有数据和无数据两种状态。
- Roster 表格与 Selected Duty 双内部滚动检查。
- `1920×1080` 基准回归。

实施后运行并记录：

```bash
(cd pbs-portal && npm test -- src/features/award/pages/award-page.test.tsx)
(cd pbs-portal && npm run lint)
(cd pbs-portal && npm run build)
npm run check:ui
(cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/award-adaptive-layout.spec.ts)
```

## 6. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 Award 布局组件及对应测试，拆分会增加协调成本。
- Suggested split: 单 Agent 完成。
- Write boundaries: Award 组件、Award Playwright/组件测试、QA 用例。
- Conflict risk: 低。
- Execution gate: 用户已确认方案 A 并要求实施。
