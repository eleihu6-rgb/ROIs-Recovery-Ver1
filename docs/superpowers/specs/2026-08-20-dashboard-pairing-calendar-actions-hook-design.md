# Dashboard Pairing Calendar Actions Hook 拆分设计

## 背景

`pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx` 当前承担了太多职责：

- Dashboard bidding calendar 的整体展示。
- Days Off 左侧日历添加逻辑。
- Pairing 左侧日历添加 bid 逻辑。
- Pairing bid 详情弹窗和 tier 修改逻辑。
- Pairing draft 查询、occurrence 查询、detail 查询。
- Pairing bid 新增 / 更新 mutation。
- TanStack Query cache patch、query invalidation、pool count refresh。
- popover 状态、toast、保存 pending / error 状态。

这个组件已经接近 900 行，后续继续维护 Dashboard 日历、Pairing 日历交互、Days Off 日历交互时，容易互相影响。上一阶段 simplify/performance spec 已把它列为 Phase 1 的低风险职责整理点。

本次目标是重构职责边界，不改变用户可见行为。

## 目标

- 把 Dashboard 中 Pairing calendar add/edit 相关动作抽成一个 feature-local hook。
- 保持 Dashboard 日历 UI、按钮文案、toast、popover、detail dialog 行为不变。
- 保持 Days Off 日历 hook 和现有 `DashboardSchedulePanel` 数据流不变。
- 降低 `dashboard-schedule-panel.tsx` 的状态和副作用复杂度，让它主要负责：
  - calendar 数据展示；
  - Days Off action hook 与 Pairing action hook 的组合；
  - 渲染 `ScheduleTierMatrix` / `ScheduleEventCalendar` / `PairingCalendarBidDetailDialog`。

## 非目标

- 不改 Dashboard 页面布局、颜色、尺寸、响应式规则。
- 不改 `ScheduleEventCalendar` / `ScheduleTierMatrix` 共享组件。
- 不改 Pairing bid payload、保存接口、draft version 语义。
- 不改 Days Off 日历添加逻辑。
- 不新增 UI 依赖。
- 不做 pairing condition dialog descriptor 化；那属于后续 Phase 2。

## 当前代码观察

### 当前 `DashboardSchedulePanel` 中 Pairing 相关职责

主要状态：

- `pendingPairingCalendarAction`
- `isPairingCalendarSavePending`
- `pairingCalendarSaveError`
- `selectedPairingEvent`
- `selectedPairingEventEditRowKey`
- `selectedPairingEventTiers`
- `isPairingEventSavePending`
- `pairingEventSaveError`
- `selectedPairingEventRefetchedPropertyKey`

主要 query / mutation：

- `usePairingPageData`
- `pairingService.searchPairingOccurrencesByDate`
- `loadPairingDetailResults`
- `pairingService.addCurrentDraftProperty`
- `pairingService.patchCurrentDraftProperty`
- `runCurrentBidMutation`

主要 cache / side effect：

- `syncPairingCalendarAddInQueryCache`
- `invalidatePairingCalendarMutationQueries`
- `usePairingPoolCountsRefreshStore`
- `message.success/error/warning`

这些代码属于 Pairing calendar action，而不是 Dashboard layout 本身。

## 方案比较

### 方案 A：只抽纯 helper，保留所有 state 在组件里

做法：

- 把 `buildPairingCalendarAwardProperty`、`syncPairingCalendarAddInQueryCache`、`extractSelectedPairingOccurrences` 等 helper 移到单独文件。
- 组件仍保留所有 `useState`、query、mutation。

优点：

- diff 小。
- 行为风险较低。

缺点：

- 主要复杂度仍留在组件内。
- 不能明显改善“状态和副作用混在渲染组件里”的问题。

结论：不推荐作为本阶段主方案。

### 方案 B：抽 `usePairingCalendarActions` hook，组件保留组合逻辑

做法：

- 新建 `pbs-portal/src/features/dashboard/hooks/use-pairing-calendar-actions.tsx`。
- hook 接管 Pairing calendar add/edit 的 state、query、mutation、cache sync 和事件 handler。
- `DashboardSchedulePanel` 继续负责：
  - 当前 period / can edit / read-only message 的归并；
  - Days Off hook 与 Pairing hook 的模式切换；
  - 最终把 `actionPopover` 和 detail dialog props 渲染出来。

优点：

- 职责边界清晰，风险可控。
- 不需要拆共享 calendar 组件。
- 能明显降低 `DashboardSchedulePanel` 的状态和 mutation 复杂度。
- 适合一阶段完成并回归。

缺点：

- hook 入参和返回值需要设计清楚，避免变成“把大组件搬到 hook 里”。

结论：推荐。

### 方案 C：同时拆 Pairing action hook、Bid date mode hook、Dialog view model

做法：

- 抽 `usePairingCalendarActions`。
- 抽 `useBidCalendarDateMode`。
- 抽 detail dialog props builder / popover builder。

优点：

- 组件可以变得更薄。

缺点：

- 一次 diff 较大，容易把行为不变的重构做成多点修改。
- 测试和 review 成本更高。

结论：不作为本次第一步；可以等方案 B 稳定后再判断是否需要继续。

## 推荐设计

采用方案 B。

### 新 hook

新增：

`pbs-portal/src/features/dashboard/hooks/use-pairing-calendar-actions.tsx`

建议入参：

```ts
type UsePairingCalendarActionsOptions = {
  enabled: boolean;
  canEditCurrentBid: boolean;
  readOnlyMessage: string;
  currentPeriod: CurrentPeriodLike | undefined;
  periodCode: string;
  dayOffTiersByDate: Map<string, Set<string>>;
  clearDaysOffCalendarAction: () => void;
};
```

实际类型应复用现有项目类型，不为 refactor 新建跨模块 contract。

建议返回：

```ts
type UsePairingCalendarActionsResult = {
  actionPopover: ScheduleCalendarActionPopover | null;
  selectedEventDialog: {
    event: ScheduleCalendarEvent;
    props: PairingCalendarBidDetailDialogViewModel;
  } | null;
  hasOpenAction: boolean;
  clearAction: () => void;
  clearSelectedEvent: () => void;
  requestDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  handleCalendarEventSelect: (event: ScheduleCalendarEvent) => void;
};
```

实现时不一定要完全照这个命名；关键是返回结构要表达清楚：

- pending pairing date action；
- selected pairing event detail；
- request / clear / select event handlers；
- popover 和 dialog 所需 props。

### hook 内部职责

hook 负责：

- `pendingPairingCalendarAction` 状态。
- Pairing date occurrence 查询。
- Pairing detail 查询。
- Pairing draft 查询 `usePairingPageData`。
- Pending occurrence / tier toggle。
- Add pairing bid mutation。
- Existing pairing bid tier edit mutation。
- Pairing cache patch / invalidation / pool count refresh。
- Pairing add/edit success/error toast。
- Pairing event detail not-found / draft-load error 状态。

hook 内必须保留这些 query / mutation 不变量：

- `usePairingPageData` 的启用条件仍与当前逻辑一致：只有 `pairingCalendarAwardBid` 存在，且正在打开 Pairing date action 或 selected pairing event detail 时才启用。
- `currentPeriod` fallback 顺序不变：`pairingPageQuery.data.rightPanel.draftMeta.currentPeriod` -> `daysOffPageQuery.data.rightPanel.draftMeta.currentPeriod` -> `serverBiddingCalendar.currentPeriod`。
- `periodCode` fallback 顺序不变：`pairingPageQuery.data.rightPanel.draftMeta.periodCode` -> `serverBiddingCalendar.periodCode` -> `""`。
- occurrence query key 不变：`["pairing", "calendar-date-occurrences", isoDate, rosterPeriodId]`。
- detail query key 不变：`["pairing", "calendar-bid-detail-results", rosterPeriodId, selectedPairingDetailTargetKey]`。
- occurrence/detail query 继续使用 `workbenchQueryDefaults`。
- add / patch 都继续通过 `runCurrentBidMutation` 执行，确保 mutation 使用最新 draft meta，不能直接绕过 draft version 保护。
- add / patch 成功后继续执行现有 cache patch、`invalidatePairingCalendarMutationQueries` 和 `requestPairingPoolCountsRefresh`，不能只靠页面刷新恢复状态。

hook 不负责：

- `bidCalendarDateMode`（Days Off / Pairing tab 选择）最终是否抽出，本次先保留在 `DashboardSchedulePanel`。
- Days Off action 的打开和保存。
- 顶部标题、calendar 尺寸、loading/error panel。

### dialog props 类型边界

当前 `PairingCalendarBidDetailDialog` 的 props 类型不是稳定导出的公共 contract。实现时二选一：

- 推荐：hook 返回 feature-local view model，`DashboardSchedulePanel` 在渲染处把 view model 映射成 `PairingCalendarBidDetailDialog` props。
- 如果需要返回完整 props，使用 `ComponentProps<typeof PairingCalendarBidDetailDialog>` 推导类型，而不是为了本次重构强行导出私有 props 类型。

### DashboardSchedulePanel 调整

`DashboardSchedulePanel` 保留：

- `calendarDraft`
- `bidCalendarDateMode`
- `pendingBidCalendarDateIntent`
- `useDashboardCalendarData`
- `useDaysOffCalendarActions`
- calendar 尺寸计算
- `CurrentPeriodStatus`
- `ScheduleTierMatrix`
- `ScheduleEventCalendar`
- `PairingCalendarBidDetailDialog` 渲染挂载点

并通过 `usePairingCalendarActions` 获取：

- Pairing date `requestDateAction`
- Pairing action popover
- Pairing event select handler
- Pairing detail dialog props / close handler
- Pairing action clear handler

### 交互保持

必须保持以下行为不变：

- 在 Dashboard 左侧日历点击日期：
  - 如果 Days Off 和 Pairing 都可用，仍显示 `DAYS OFF / PAIRING` tab。
  - 默认模式仍读取 `sessionStorage` 的 `pbs.bid.calendar-date-mode`。
  - 切换 tab 仍写回同一 key。
- Bidding closed / read-only period：
  - 日期点击不应暴露新增 Days Off / Pairing action，也不应打开新增 popover。
  - 已存在的 pairing bid event 仍可以打开 detail dialog 查看。
  - Tx edit 控件和保存按钮在 `canEditCurrentBid=false` 时仍保持禁用。
  - 现有 warning 只作为 handler 被间接调用时的保护，不作为主要 UI 入口行为。
- Pairing date action：
  - 仍按日期加载 pairing occurrences。
  - 仍能选择 occurrence 和 tier。
  - 与已选 Days Off 冲突的 tier 仍被 block 并自动剔除。
  - 保存成功后仍更新 Pairing page cache、invalidate calendar queries、触发 pool counts refresh。
- 点击已有 pairing calendar event：
  - 仍打开 detail dialog。
  - 多 property event 仍要求选择一个 detail row 后才能编辑 Tx。
  - property not found 时仍尝试 refetch 一次。
  - 保存 Tx 成功后仍关闭 dialog 并刷新相关 queries。

## 测试策略

### 单元 / 组件测试

优先补一个 feature-local hook/component 级测试，覆盖最容易在 refactor 中坏掉的行为：

- `DashboardSchedulePanel` 在 pairing calendar enabled 时点击日期仍构造 Pairing action popover。
- mock occurrence rows 后，选择 occurrence + tier 后 Add Bid 按钮可用。
- 同一日期有 Days Off blocking tier 时，被 block 的 tier 不可保存或会被剔除。
- 点击 pairing bid event 仍打开 `PairingCalendarBidDetailDialog`。
- 保存 Pairing date action 后，自动化断言必须覆盖：
  - mutation 仍通过 `runCurrentBidMutation` 或等价 mock 路径拿到最新 draft meta；
  - Query cache 被 patch 或相关 query 被 invalidate；
  - `requestPairingPoolCountsRefresh` 被调用；
  - UI 反馈仍使用现有 message/toast 入口。
- 如果本次修改触碰共享 workbench calendar 行为，更新或补充 `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx` 中的日历添加 / tab 切换断言。
- 如果本次修改影响 Pairing page pool refresh 假设，更新或补充 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx` 中的 pool count refresh 断言。

如果现有 test harness 难以直接驱动日历点击，可以先用 component test 覆盖渲染与 handler wiring，再用 Playwright 覆盖真实 UI。但 mutation / cache / pool refresh 不能只放到人工 QA，至少要有 Vitest 级自动化保护。

### Playwright

需要新增或更新 PBS Portal E2E，走真实 UI：

建议文件：

- 扩展现有 `e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts`，继续覆盖 existing pairing event detail。
- 新增 `e2e/tests/pbs-portal/dashboard-calendar-pairing-actions.spec.ts`，覆盖 date action popover / tab 切换。

最小覆盖：

- 登录 PBS Portal。
- 打开 `/dashboard`。
- 等待 `dashboard-schedule-panel` 或 calendar 区域出现。
- 点击一个可操作日期。
- 验证 popover 打开且可看到 `DAYS OFF / PAIRING` tab。
- 切到 `PAIRING`。
- 验证 Pairing action 内容可见：loading 结束后 occurrence 区域或空态可见。
- 点击已有 pairing event，验证 detail dialog 可打开。

如果测试数据环境没有稳定 pairing occurrence，Playwright 可以只覆盖入口、tab 切换、popover 和 existing event detail；add/save 的 mutation、cache patch、pool refresh 必须由 Vitest mock 数据覆盖。不能用 `request.post` 业务接口代替用户动作。

### QA 人工测试案例

新增：

`docs/test-cases/pbs/dashboard/2026-08-20-dashboard-pairing-calendar-actions-refactor.md`

覆盖：

- Dashboard calendar 基本渲染。
- Days Off date action。
- Pairing date action。
- Days Off / Pairing tab 切换与 sessionStorage 记忆。
- Pairing event detail dialog。
- Bidding closed read-only warning。
- Bid 页面 / Reserve 页面 / Award 页面 quick smoke，确认共享 bidding calendar 没被破坏。

## 验证命令

实现后至少运行：

```bash
cd pbs-portal
pnpm test
pnpm run lint
pnpm run build

cd ..
npx playwright test e2e/tests/pbs-portal/dashboard-calendar-pairing-actions.spec.ts --config=e2e/config/playwright.config.ts --project=pbs-portal --reporter=list
npx playwright test e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts --config=e2e/config/playwright.config.ts --project=pbs-portal --reporter=list
```

Playwright 前提：

- 运行前需确认 `pbs-portal` 页面本身可访问：如果 Playwright config 没有自动启动 portal web server，就需要先启动本地 portal 或指向可用的 baseURL。
- 如果 E2E 依赖真实登录和真实 pbs-server，需先确认 pbs-server 可访问，或配置 `PBS_API_URL` 指向可用环境。
- 如果 E2E 完全 mock API / auth，并使用空 `storageState` 或本地 session 注入，应使用 `--no-deps`，避免项目依赖的 `pbs-setup` 尝试真实登录：

```bash
npx playwright test e2e/tests/pbs-portal/dashboard-calendar-pairing-actions.spec.ts --config=e2e/config/playwright.config.ts --project=pbs-portal --no-deps --reporter=list
npx playwright test e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts --config=e2e/config/playwright.config.ts --project=pbs-portal --no-deps --reporter=list
```

由于涉及前端样式附近文件但目标不是视觉变更，如果没有改 className / CSS，可不跑 `npm run check:ui`；如果实现过程中触碰样式 class，需要补跑并报告。

## 风险与控制

- 风险：hook 入参过多，变成“把大组件搬进 hook”。
  - 控制：hook 只持有 Pairing action 相关状态；date mode 和 Dashboard layout 保留在组件。
- 风险：Days Off action 和 Pairing action 互相关闭逻辑漏掉。
  - 控制：明确传入 `clearDaysOffCalendarAction`，保留现有打开 Pairing 时关闭 Days Off、打开 Days Off 时关闭 Pairing 的行为。
- 风险：cache patch 行为变化导致 Bid 页面 Existing Properties 不更新。
  - 控制：`syncPairingCalendarAddInQueryCache` 逻辑整体迁移，测试断言保存后 invalidate / pool refresh 仍执行。
- 风险：read-only period 仍打开 action。
  - 控制：hook 内保留 `canEditCurrentBid` guard 和 warning。
- 风险：Playwright 数据不稳定。
  - 控制：E2E 优先覆盖稳定入口和弹窗行为；保存流程若依赖特定 occurrence，可在 QA 手测中补充，或后续准备稳定 fixture。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是同一个组件向一个 hook 的小范围职责拆分，状态和 handler 强耦合，多 agent 容易编辑同一文件产生冲突。
- Suggested split: 不拆分。
- Write boundaries: `dashboard-schedule-panel.tsx`、新增 `use-pairing-calendar-actions.tsx`、对应测试和 QA 文档。
- Conflict risk: Medium，主要风险来自 Dashboard component 与 hook 的 props/handler 边界。
- Execution gate: 用户确认本 spec 后再实现；实现期间不改 UI 行为。

## 验收标准

- 用户可见 Dashboard 日历行为不变。
- `dashboard-schedule-panel.tsx` 中 Pairing add/edit 状态和 mutation 逻辑明显减少。
- 新 hook 只在 dashboard feature 内部使用，不引入跨模块公共抽象。
- Pairing date action、existing pairing event detail、Days Off action 仍可用。
- 自动化测试和 Playwright 回归通过。
- 工作区 diff 不包含无关视觉调整或业务规则修改。
