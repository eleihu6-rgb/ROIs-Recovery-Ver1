# Dashboard Bid Calendar Date Action Coordinator 拆分设计

## 背景

上一轮已经把 `DashboardSchedulePanel` 中 Pairing 日历添加、编辑、详情、保存、cache refresh 逻辑抽到 `usePairingCalendarActions`。现在 `DashboardSchedulePanel` 仍然保留了一块协调逻辑：

- 点击 Bid calendar 日期时，决定打开 `DAYS OFF` 还是 `PAIRING` 操作。
- 记住用户上一次选择的日期操作模式。
- 在 Days Off / Pairing 之间切换时，清理另一边的 pending state。
- 在 popover 上方包一层 `DAYS OFF / PAIRING` tab。
- weekday action 与 pairing event detail 打开时，需要清理 pending date intent。

这块逻辑不是纯页面渲染，也不是 Days Off / Pairing 的业务保存逻辑。继续留在 `DashboardSchedulePanel` 会让组件同时承担布局、数据加载、操作协调三类职责，不利于下一步维护。

## 目标

本次只做一次前端职责拆分：

- 新增一个专门的 hook 管理 Bid calendar 日期操作协调。
- 让 `DashboardSchedulePanel` 更接近“页面组合器”：读取数据、调用 hooks、渲染 matrix / calendar / dialogs。
- 保持现有 UI、接口 payload、保存逻辑、query key、cache invalidation 和 readonly 行为不变。
- 保持 Days Off、Pairing、Dashboard 三处共享日历行为一致。

## 非目标

- 不修改 Days Off 保存规则。
- 不修改 Pairing add/edit/detail 保存规则。
- 不修改后端接口、contracts 或数据库。
- 不重做 popover 样式。
- 不引入新的状态库。
- 不改变 sessionStorage key：`pbs.bid.calendar-date-mode`。
- 不扩大 Dashboard 布局或 Message Center 范围。

## 现状职责

### `DashboardSchedulePanel`

当前还负责：

- `bidCalendarDateMode` state。
- `pendingBidCalendarDateIntent` state。
- `readBidCalendarDateMode()`。
- `openBidCalendarDateMode()`。
- `handleRequestBidDateAction()`。
- `handleBidCalendarDateModeChange()`。
- `requestDaysOffDateAction()` / `requestDaysOffWeekdayAction()`。
- `calendarActionPopover` 的 tab 包装和 cancel 包装。

这些逻辑本质上是“两个 action hook 之间的协调器”，不是具体业务 action。

### `useDaysOffCalendarActions`

继续负责 Days Off 自身业务：

- 计算 date / weekday action 的目标日期。
- 选择 tiers。
- 校验 blocked pairing。
- 保存 Days Off draft。
- 更新 days-off page query cache。

### `usePairingCalendarActions`

继续负责 Pairing 自身业务：

- date action 下加载当天 pairing occurrence。
- 选择 pairing occurrence 和 tiers。
- 保存 Pairing Preference。
- 读取/编辑 calendar 上已有 Pairing bid 的 Tx。
- 更新 pairing page query cache 和 pairing pool counts refresh。

## 方案对比

### 方案 A：只在 `DashboardSchedulePanel` 内继续整理函数

做法：

- 把当前函数顺序整理清楚，减少少量重复。
- 不新增文件。

优点：

- 改动最小。
- 不引入新 hook API。

缺点：

- `DashboardSchedulePanel` 仍然知道 Days Off / Pairing 双方的清理细节。
- 后续再加 calendar action 会继续膨胀。
- 测试粒度仍然主要落在大组件上。

结论：不推荐。只能表面变短，职责没有真正分开。

### 方案 B：新增 `useBidCalendarDateActionCoordinator`

做法：

- 新增 hook：`pbs-portal/src/features/dashboard/hooks/use-bid-calendar-date-action-coordinator.tsx`。
- hook 接收 Days Off / Pairing action popover、request/clear/reset 方法和开关。
- hook 内部维护 date action mode、pending date intent、sessionStorage 读写、tab wrapper。
- `DashboardSchedulePanel` 只消费协调后的 handlers 和 `calendarActionPopover`。

优点：

- 职责边界最清晰。
- 不改两个已有业务 action hook。
- 不影响 query/mutation/cache 逻辑。
- 后续单测可以只验证“切换/清理/记忆”行为。

缺点：

- 多一个 hook 文件。
- 需要定义一个小的 options/result 类型。

结论：推荐。它是最小且真实的职责拆分。

### 方案 C：把 Days Off 和 Pairing hooks 合并成一个大 calendar actions hook

做法：

- 新建统一 `useDashboardCalendarActions`，内部同时管理 Days Off、Pairing、date mode、popover、event detail。

优点：

- `DashboardSchedulePanel` 会非常薄。

缺点：

- 会把刚拆开的 Pairing / Days Off 业务重新揉在一起。
- 文件会变成新的大 hook。
- 测试和变更风险更高。

结论：不推荐。这不是 simplify，是换一个地方变复杂。

## 推荐设计

采用方案 B，新增：

`pbs-portal/src/features/dashboard/hooks/use-bid-calendar-date-action-coordinator.tsx`

建议接口：

```ts
type BidCalendarDateMode = "days-off" | "pairing";

type UseBidCalendarDateActionCoordinatorOptions = {
  dayOffActionPopover: ScheduleCalendarActionPopover | null;
  pairingActionPopover: ScheduleCalendarActionPopover | null;
  showDateModeTabs: boolean;
  onDaysOffDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  onDaysOffWeekdayAction: (weekdayIndex: number, weekdayLabel: string, anchor: ScheduleCalendarActionAnchor) => void;
  onPairingDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  onClearDaysOffAction: () => void;
  onClearPairingAction: () => void;
  onClearPairingEvent: () => void;
};

type UseBidCalendarDateActionCoordinatorResult = {
  calendarActionPopover: ScheduleCalendarActionPopover | null;
  handleRequestBidDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  handleRequestDaysOffWeekdayAction: (weekdayIndex: number, weekdayLabel: string, anchor: ScheduleCalendarActionAnchor) => void;
  clearPendingDateIntent: () => void;
};
```

实际实现时可以按现有命名微调，但职责应保持一致。

### Hook 组合顺序约束

为了避免 hook 之间形成循环依赖，`DashboardSchedulePanel` 中的组合顺序保持明确：

1. 先创建一个本地 `clearBidCalendarDateIntentRef` 或稳定 callback shell，默认 no-op。
2. 调用 `useDaysOffCalendarActions`。
3. 调用 `usePairingCalendarActions`，其 `onActionOpen` 只清 Days Off action；`onEventOpen` 调用 `clearBidCalendarDateIntentRef.current()` 并清 Days Off action。
4. 调用 `useBidCalendarDateActionCoordinator`，拿到真实的 `clearPendingDateIntent` 后写入 ref。

这样 Pairing event detail 打开时仍能清理 date intent，但 `usePairingCalendarActions` 不需要 import 或直接依赖 coordinator。实现也可以用等价的稳定 callback 方案，但不能把 date intent state 留回 `DashboardSchedulePanel`。

## 数据流

### 点击单个日期

1. `ScheduleEventCalendar` 调用 `onRequestBidDateAction(isoDate, anchor)`。
2. coordinator 保存 `pendingDateIntent`。
3. coordinator 读取当前 mode：
   - `days-off`：清 Pairing action / Pairing selected event，打开 Days Off date action。
   - `pairing`：清 Days Off action，打开 Pairing date action。
4. coordinator 返回带 tab wrapper 的 `calendarActionPopover`。
5. 用户切换 tab 时，coordinator 使用同一个 `pendingDateIntent` 重新打开另一种 action。

### 点击 weekday

weekday 目前只属于 Days Off 批量操作：

1. coordinator 清 Pairing action / Pairing selected event。
2. coordinator 清 `pendingDateIntent`，避免显示 date mode tab。
3. 调用 Days Off weekday action。

### 点击已有 Pairing event

已有 Pairing event detail 不属于“新增日期操作”：

1. `usePairingCalendarActions` 的 `onEventOpen` 回调触发。
2. coordinator 清 Days Off action。
3. coordinator 清 `pendingDateIntent`。
4. Pairing detail dialog 正常打开。

## UI 行为

- 只有 `/bid` 共享工作台的“双模式日期入口”才显示 `DAYS OFF / PAIRING` 两个 tab，也就是 `editableDaysOffCalendar=true` 且 `pairingCalendarAwardBid=true` 的组合场景。
- Dashboard 首页只展示日历和已有事件详情，不应因为本次重构新增 date add tab。
- `/days-off` 单模式日期 popover 不显示 Pairing tab。
- `/pairing` 单模式日期 popover 不显示 Days Off tab。
- tab 样式、宽度规则、ARIA role 保持现状。
- weekday popover 不显示 `DAYS OFF / PAIRING` tab。
- Pairing event detail dialog 不显示该 tab。
- popover cancel 后清理 `pendingDateIntent`，下次点击日期重新锚定到新日期。

## 错误处理

本次不新增用户可见错误。

- Days Off 保存错误仍由 `useDaysOffCalendarActions` 处理。
- Pairing 保存/详情错误仍由 `usePairingCalendarActions` 处理。
- coordinator 不消费 API，不直接发 toast。
- sessionStorage 只保存 mode；如果取到非法值，继续 fallback 到 `days-off`。

## 文件变更范围

预计修改：

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
  - 删除 date mode / pending intent / popover tab wrapper 的本地逻辑。
  - 接入 coordinator hook。

预计新增：

- `pbs-portal/src/features/dashboard/hooks/use-bid-calendar-date-action-coordinator.tsx`
  - 管理 date action mode、pending intent、tab wrapper、互斥清理。

预计测试更新：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
  - 保留现有 Days Off / Pairing 日期点击回归。
  - 补充或强化 tab 切换时互斥清理与保存路径不变的断言。
- `docs/test-cases/pbs/dashboard/2026-08-20-dashboard-bid-calendar-date-action-coordinator.md`
  - 新增人工 QA 用例，覆盖 Bid 双模式入口、Dashboard 不新增 date add、Days Off / Pairing 单模式入口、weekday 和 event detail 清理。

可选新增：

- `pbs-portal/src/features/dashboard/hooks/use-bid-calendar-date-action-coordinator.test.tsx`
  - 如果现有测试难以精确覆盖 hook 行为，再新增 hook-level 测试。
  - 优先不新增复杂测试工具；先复用现有 component/workbench 测试。

## 验收标准

1. `DashboardSchedulePanel` 不再直接维护：
   - `bidCalendarDateMode`
   - `pendingBidCalendarDateIntent`
   - `openBidCalendarDateMode`
   - `handleBidCalendarDateModeChange`
   - date action tab wrapper JSX
2. `/bid` 双模式入口的单个日期点击仍默认打开上次记忆的 mode。
3. `/bid` 双模式入口的 `DAYS OFF / PAIRING` tab 切换仍在同一个日期上生效。
4. Dashboard 首页不会新增 date add tab。
5. `/days-off` 和 `/pairing` 单模式入口不会显示对方 tab。
6. weekday Days Off action 不显示 Pairing tab。
7. 打开 Pairing event detail 后不会残留 Days Off date popover。
8. Days Off 保存、Pairing add、Pairing event Tx edit 的接口 payload 不变。
9. readonly period 下仍不能保存 current bid。
10. Dashboard、Bid/Pairing shared workbench 相关回归测试通过。

## 验证计划

最小验证：

```bash
pnpm --dir pbs-portal exec vitest run src/app/layout/shared-bidding-workbench-layout.test.tsx
pnpm --dir pbs-portal exec vitest run src/features/dashboard/pages/dashboard-page.test.tsx
pnpm --dir pbs-portal exec eslint src/features/dashboard/components/dashboard-schedule-panel.tsx src/features/dashboard/hooks/use-bid-calendar-date-action-coordinator.tsx
```

UI/构建验证：

```bash
pnpm --dir pbs-portal build
npm run check:ui
```

真实 UI 回归：

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts --reporter=list --no-deps
```

如果本次改动触发共享 workbench 日期 add 行为风险，再补跑已有 Pairing / Days Off 页面相关 E2E 或增加轻量 Playwright 用例。

人工 QA 文档：

```text
docs/test-cases/pbs/dashboard/2026-08-20-dashboard-bid-calendar-date-action-coordinator.md
```

该文档必须随实现一起新增或更新，不要求本 spec 阶段提前创建。

## 风险与控制

### 风险 1：互斥清理遗漏

可能表现：

- Days Off popover 和 Pairing popover 状态残留。
- 切 tab 后保存到了旧日期或旧 tier。

控制：

- coordinator 内统一持有 pending intent。
- 每次打开一种 action 前，先调用另一种 action 的 clear。
- weekday 和 event detail 必须清 pending intent。

### 风险 2：sessionStorage 行为变化

可能表现：

- 用户上次选了 Pairing，下次日期点击没有记住。

控制：

- 保留 key `pbs.bid.calendar-date-mode`。
- 只允许 `pairing` 读出来，其余 fallback `days-off`，与现状一致。

### 风险 3：Dashboard accidentally 获得 Pairing add 行为

可能表现：

- Dashboard 页面出现不该保存的 Pairing add 入口。

控制：

- `pairingCalendarAwardBid` 仍由调用方控制。
- coordinator 只协调 popover，不绕过 `usePairingCalendarActions({ enabled })`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是小范围 refactor，核心修改集中在 `DashboardSchedulePanel` 与一个新增 hook；并行写代码会增加接口不一致风险。
- Suggested split: 不建议拆分。可在实现完成后单独让 reviewer 子任务做只读检查。
- Write boundaries: 主 agent 修改 dashboard component、new hook、相关测试和 QA 文档。
- Conflict risk: 中等；多个 agent 容易同时改 `DashboardSchedulePanel`。
- Execution gate: 用户确认本 spec 后再实现。

## 实施顺序

1. 对 `DashboardSchedulePanel` 和新 coordinator 目标符号跑 GitNexus impact。
2. 新增 coordinator hook，先搬迁现有逻辑，不改行为。
3. `DashboardSchedulePanel` 接入 hook，删除本地协调代码。
4. 更新现有测试断言，必要时增加 hook-level 单测。
5. 跑最小验证、UI check、Playwright 回归。
6. 跑 GitNexus `detect_changes`。
