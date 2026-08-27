# PBS Award Roster Details 控件清理设计

## 背景

Award 页面用于展示组员最终发布的整月排班结果。当前页面已经调整为 roster-oriented summary，并能从 `roster_publish` 展示最终 roster item。

用户参考旧系统 Roster / Award 结果页面后反馈：

- `ROSTER DETAILS` 右上角的 `Sort by Start Time` 没有明显意义。
- `Show: All` 没有明显意义。
- 底部 `View all duties` 不如直接让明细区上下滚动。
- `Reason Report Preview` 先保留，但需要明确它和 roster details 不是同一个东西。

## 文档依据

AA / 项目需求文档中没有要求 `Sort by Start Time` 或 `Show: All` 这两个控件。

`init-docs/PBS 智能排班竞标系统需求规格书.md` 第 9 章描述的是：

- Award 页面需要生成高可读性的结果面板。
- 月度结果需要展示 credit 等宏观指标。
- 航班结果需要展示 seat / priority 等溯源信息。
- `View Reason Report` 是用于解释未满足需求的诊断报告，例如资历不足、违反工作块限制、TCR 失败等。

因此，这两个按钮不是 AA 文档强制项。当前如果没有真实排序 / 筛选交互，继续展示会让用户以为页面有尚未实现的功能。

## 当前问题

当前 `pbs-portal/src/features/award/components/award-right-panel.tsx` 的 `RosterDetailsPanel` 有以下 UI：

- 标题：`Roster Details`
- 右上按钮：
  - `Sort by Start Time`
  - `Show: All`
- 表格只渲染 `items.slice(0, 14)`
- 表格底部：
  - `Total: N duties`
  - `View all duties`

问题：

- `Sort by Start Time` 当前没有排序选择，也没有改变列表顺序；而列表本身已经按 start time 展示。
- `Show: All` 当前没有筛选菜单，也没有状态变化。
- `View all duties` 当前只是静态按钮，没有真实展开 / 跳转行为。
- `items.slice(0, 14)` 会隐藏一部分 duties，但 UI 又没有真的提供查看全部的有效路径。
- 这些控件让结果页显得像半成品，而不是一个只读 roster 结果页。

## 目标

把 Award 右侧明细区改成“只展示真实可用的功能”：

- 删除无真实功能的 `Sort by Start Time`。
- 删除无真实功能的 `Show: All`。
- 删除 `View all duties`。
- 明细列表直接支持内部纵向滚动，用户可以查看全部 duties。
- 保留 `Reason Report Preview` 区域。
- 不伪造 Reason Report 数据。
- 页面整体保持当前两栏结构：左侧整月日历，右侧 roster details + reason report preview。

## 推荐方案

采用“精简控件 + 内部滚动”的方案。

### Roster Details Header

标题行保留为：

- `ROSTER DETAILS`

标题旁或右侧可以显示非交互计数：

- `9 duties`
- `19 duties`

该计数是状态说明，不是按钮。

### Roster Details Body

表格继续展示现有列：

| 列 | 保留原因 |
|---|---|
| `CODE` | 显示 duty / activity code，例如 `DO`、`VAC`、`PD7`、`FLY`。 |
| `DUTY / ACTIVITY` | 显示 pairing code 或 activity label。 |
| `START` | 展示本条 duty 的开始时间。 |
| `ROUTE / LOCATION` | 飞行显示 route，activity 显示 location / assignment。 |
| `POSITION` | 有岗位时展示；无值显示 `--`。 |
| `CREDIT` | 展示本条 duty credit。 |
| `TYPE` | 展示 item 类型，例如 Pairing、Day Off、VAC、SIM。 |

列表区域使用固定可用高度或 flex 填充高度，并设置 `overflow-y-auto`。

表头应保持可读；若实现成本不高，可以让表头在滚动时保持 sticky。若 sticky 会引入额外布局风险，本次可以先不做。

### Footer

删除 footer 中的 `View all duties`。

如果需要保留总数说明，放到 header 中，不再单独占用表格底部一行。

### Reason Report Preview

`Reason Report Preview` 先保留。

当前数据来源仍然是 `roster_publish`，不是完整 award reason payload。因此：

- `data.report.available === false` 时，继续显示不可用提示。
- 不根据 `roster_publish` 编造 reason rows。
- 顶部 `View Reason Report` 按钮继续 disabled，并使用已有 `disabledReason`。
- 后续只有当 `pbs_award_result / pbs_award_item` 或 solver reason payload 有真实数据时，才补完整 report 内容。

## 方案对比

### 方案 A：删除占位控件，明细表内部滚动（推荐）

优点：

- 最小改动，符合当前只读 roster result 页面定位。
- 不制造假的筛选 / 排序能力。
- 用户可以直接上下滚动查看全部 duties。
- 保留 Reason Report Preview，满足当前用户要求。

缺点：

- 暂时没有高级筛选能力。
- 如果未来 duties 很多，可能还需要虚拟滚动或按日期分组。

### 方案 B：把 `Sort by Start Time` / `Show: All` 做成真实功能

优点：

- 控件不再是占位。
- 可扩展成按类型筛选、按时间排序、按 code 筛选。

缺点：

- AA 文档没有要求这两个控件。
- 当前数据规模和页面目标不需要。
- 会扩大实现和测试范围。

### 方案 C：完全复刻参考系统右侧 day detail cards

优点：

- 更接近用户提供的参考截图。
- 能展示 flight log、hotel、crew list 等高级详情。

缺点：

- 需要额外数据支持，不是单纯 UI 清理。
- 会改变当前 Award 页面信息架构。
- 当前用户本次明确的问题集中在 `ROSTER DETAILS` 的无意义控件，不应扩大范围。

## 推荐结论

本次采用方案 A。

理由：

- 用户当前要解决的是右侧明细区“无意义控件”和“查看全部 duties”问题。
- AA 文档没有要求 `Sort by Start Time` / `Show: All`。
- 当前页面没有真实排序 / 筛选状态，删除比保留占位更专业。
- `Reason Report Preview` 保留，但继续保持不可用态，不伪造解释数据。

## 数据与接口影响

本次不改接口，不改数据库，不改 `roster_publish` 数据同步。

前端使用现有数据：

- `data.items`：渲染全部 roster details rows。
- `data.items.length`：显示 duties count。
- `data.report.available` / `data.report.disabledReason`：控制 Reason Report Preview 和按钮状态。

## 实现范围

预计需要改：

- `pbs-portal/src/features/award/components/award-right-panel.tsx`
  - 删除 `Sort by Start Time` / `Show: All` 按钮。
  - 删除 `items.slice(0, 14)` 限制，改为渲染全部 items。
  - 给表格容器加内部纵向滚动。
  - 删除 `View all duties`。
  - 将 `Total: N duties` 调整为 header 中的非交互计数，或保留为非交互文本但不再带按钮。
  - 保留 `ReasonReportPreview`。

预计需要改测试：

- `pbs-portal/src/features/award/pages/award-page.test.tsx`
  - 断言不再出现 `Sort by Start Time`。
  - 断言不再出现 `Show: All`。
  - 断言不再出现 `View all duties`。
  - 断言全部 duties 都可在 DOM 中渲染，不再只显示前 14 条。
  - 断言 `Reason Report Preview` 仍然存在。

视实现情况可能需要补充 QA 文档：

- `docs/test-cases/pbs/award/2026-07-04-award-roster-details-controls-cleanup.md`

如 runtime UI 代码发生变化，按项目规则 bump frontend version。

## 不做范围

- 不实现真实排序菜单。
- 不实现真实筛选菜单。
- 不新增 day detail drawer。
- 不实现 Flight Log。
- 不实现 hotel / crew list 详情。
- 不改变 Reason Report 生成逻辑。
- 不改 `pbs_award_result` / `pbs_award_item`。
- 不改 `roster_publish` 同步逻辑。
- 不改左侧月历数据或样式。

## 验收标准

- `ROSTER DETAILS` 区域不再显示 `Sort by Start Time`。
- `ROSTER DETAILS` 区域不再显示 `Show: All`。
- `ROSTER DETAILS` 区域不再显示 `View all duties`。
- duties 多于当前可视高度时，明细区内部可以上下滚动查看。
- 不再通过 `slice(0, 14)` 截断 duties。
- `Reason Report Preview` 仍然显示。
- Reason Report 无真实数据时，仍显示不可用提示，不展示伪造 reason rows。
- 顶部 `View Reason Report` 在无 reason 数据时仍 disabled。
- 1920 x 1080 基线下，右侧面板不出现明显空洞和无意义控件。

## 测试方案

自动化：

```bash
npm --prefix pbs-portal test -- src/features/award/pages/award-page.test.tsx
npm --prefix pbs-portal run build
npm run check:ui
```

如果改动触及共享布局或路由，再补充：

```bash
npm --prefix pbs-portal test -- src/app/router/app-routes.test.tsx
```

手动 / Playwright：

- 打开 Award 页面。
- 使用一个 duties 数量超过可视行数的账号 / period。
- 确认右侧 `ROSTER DETAILS` 内部可滚动。
- 确认 `Reason Report Preview` 仍在右侧下方。
- 确认不存在 `Sort by Start Time`、`Show: All`、`View all duties`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单页 UI 清理和测试更新，改动集中在 Award 组件，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/award/**`、必要 QA 测试文档、version bump。
- Conflict risk: 低；但需要注意当前工作区可能已有其他未跟踪 spec，不应误提交。
- Execution gate: 用户确认该 spec 后再实施。
