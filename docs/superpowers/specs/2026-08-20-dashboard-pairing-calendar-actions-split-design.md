# Dashboard Pairing Calendar Actions 拆分设计

## 背景

前两轮已经完成：

1. `DashboardSchedulePanel` 中 Pairing calendar add/edit/detail 主逻辑抽到 `usePairingCalendarActions`。
2. Bid calendar 日期 `DAYS OFF / PAIRING` 双模式协调逻辑抽到 `useBidCalendarDateActionCoordinator`。

现在 `DashboardSchedulePanel` 已经明显变薄，但 `usePairingCalendarActions` 仍然有 700+ 行，并且混在一起处理两条不同用户路径：

- 点击日期新增 Pairing bid。
- 点击已有 Pairing event 查看详情并编辑 Tx。

这两条路径共享 current period、pairing page data、pairing search period、cache invalidation 等上下文，但状态、UI model、保存动作和错误文案不同。继续放在一个 hook 里，会让后续改 Pairing calendar 时很容易误伤另一条路径。

## 目标

本次是结构优化，不改变业务行为：

- 把 `usePairingCalendarActions` 拆成两个职责更清楚的子 hook。
- 保留 `usePairingCalendarActions` 作为薄组合层，对 `DashboardSchedulePanel` 的外部接口尽量不变。
- 保持所有 query key、API payload、cache patch、message 文案、readonly 行为不变。
- 用已有 Vitest + Playwright 做完整回归，确保页面行为不出问题。

## 非目标

- 不修改 Pairing Preference 的业务规则。
- 不修改 Pairing detail dialog UI。
- 不修改 `PairingCalendarBidPopoverContent`。
- 不修改后端接口、contracts、数据库或 migration。
- 不改变 `usePairingPageData` 的 query key / enabled 语义。
- 不新增缓存策略。
- 不处理 `rule-engine-rs` submodule 当前 dirty 状态。

## 现状职责

`usePairingCalendarActions` 当前负责：

- Pairing page data lazy load。
- current period / readonly 判断。
- date occurrence query。
- detail result query。
- Pairing date add pending state。
- Pairing event detail pending state。
- date add 的 occurrence 选择、tier 选择、blocked by days off 过滤。
- date add 保存、query cache patch、pairing pool count refresh。
- event detail 打开、详情行构造、多 property 选择、Tx 编辑保存。
- dialog view model 组装。
- action popover view model 组装。

## 方案对比

### 方案 A：只把纯 helper 函数搬到单独文件

做法：

- 把 `toggleStringSelection`、`buildPairingCalendarAwardProperty`、`syncPairingCalendarAddInQueryCache`、`extractSelectedPairingOccurrences` 移到 helper 文件。
- hook 状态和 callbacks 不拆。

优点：

- 风险最低。
- 文件会稍微变短。

缺点：

- 主 hook 仍然同时管理 add 和 detail 两条流程。
- 后续维护时仍然需要读完整 hook。
- 结构优化效果有限。

结论：不推荐作为本轮主方案，只能作为拆分时的辅助。

### 方案 B：拆成 date add hook + event detail hook + 薄组合层

做法：

- 新增 `usePairingCalendarDateAddAction`。
- 新增 `usePairingCalendarEventDetailAction`。
- `usePairingCalendarActions` 保留 current period / period resolution / pairing page data 等共享上下文，并把上下文传给两个子 hook。
- `DashboardSchedulePanel` 继续只调用 `usePairingCalendarActions`，避免外部调用点扩散。

优点：

- 边界清楚：新增 bid 和编辑已有 bid 分开。
- 对外 API 最稳定。
- 便于分别测试 add path 和 detail path。
- 不会把刚拆好的 `DashboardSchedulePanel` 再变复杂。

缺点：

- 会新增 2 个 hook 文件。
- 需要谨慎处理共享上下文，避免 duplicate query 或重复计算。

结论：推荐。

### 方案 C：让 `DashboardSchedulePanel` 直接调用两个 Pairing 子 hook

做法：

- 删除或弱化 `usePairingCalendarActions`。
- `DashboardSchedulePanel` 直接组合 `usePairingCalendarDateAddAction` 和 `usePairingCalendarEventDetailAction`。

优点：

- 少一层组合 hook。

缺点：

- `DashboardSchedulePanel` 又会知道 Pairing 细节。
- 会倒退上一轮 “page component 只做组合” 的目标。
- 外部调用点承担更多参数拼装和互斥清理。

结论：不推荐。

## 推荐设计

采用方案 B。

### `usePairingCalendarActions`

保留为外部入口，职责缩到：

- 保留决定 lazy query 是否启用的最小打开状态：
  - `pendingPairingCalendarAction`
  - `selectedPairingEvent`
- 调用 `usePairingPageData`。
- 计算共享上下文：
  - `currentPeriod`
  - `canEditCurrentBid`
  - `readOnlyMessage`
  - `pairingCalendarPeriod`
  - `pairingPageData`
  - `pairingPageQuery`
- 调用两个子 hook。
- 返回现有 result shape：
  - `actionPopover`
  - `canEditCurrentBid`
  - `currentPeriod`
  - `selectedEventDialog`
  - `clearAction`
  - `clearSelectedEvent`
  - `hasOpenAction`
  - `handleCalendarEventSelect`
  - `requestDateAction`
  - `resetActionState`

对 `DashboardSchedulePanel` 来说，外部接口不应有用户可见变化。

### Hook 组合顺序和 lazy query 约束

现有 `usePairingPageData` 的 enabled 语义必须保持：

```ts
enabled: enabled && (
  pendingPairingCalendarAction !== null
  || selectedPairingEvent !== null
)
```

因此父 hook 必须继续持有这两个“打开目标状态”，再把 state 和 setter 传给子 hook 使用。两个子 hook 不得自行调用 `usePairingPageData`，也不得把 pairing page data query 改成常开。

推荐结构：

1. `usePairingCalendarActions` 持有 `pendingPairingCalendarAction` / `selectedPairingEvent`。
2. `usePairingCalendarActions` 调用一次 `usePairingPageData`。
3. `usePairingCalendarActions` 计算 current period / pairing period。
4. `usePairingCalendarDateAddAction` 接收 `pendingPairingCalendarAction` 和 setter。
5. `usePairingCalendarEventDetailAction` 接收 `selectedPairingEvent` 和 setter。

这样可以拆分内部职责，同时不改变 lazy loading 和 refetch 行为。

### `usePairingCalendarDateAddAction`

负责日期新增 Pairing bid：

- `isPairingCalendarSavePending`
- `pairingCalendarSaveError`
- date occurrence query：
  - key 保持 `["pairing", "calendar-date-occurrences", isoDate, rosterPeriodId]`
- day-off blocked tiers 计算。
- occurrence / tier toggle。
- clear tiers。
- `requestDateAction`
- `handleConfirmPairingCalendarAction`
- date add popover view model。

输入：

- `enabled`
- `pendingPairingCalendarAction`
- `onPendingPairingCalendarActionChange`
- `canEditCurrentBid`
- `readOnlyMessage`
- `pairingCalendarPeriod`
- `pairingPageData`
- `dayOffTiersByDate`
- `requestPairingPoolCountsRefresh`
- `onActionOpen`

输出：

- `actionPopover`
- `clearAction`
- `hasOpenAction`
- `requestDateAction`
- `resetActionState`

### `usePairingCalendarEventDetailAction`

负责已有 Pairing event 详情和 Tx 编辑：

- `selectedPairingEventEditRowKey`
- `selectedPairingEventTiers`
- `isPairingEventSavePending`
- `pairingEventSaveError`
- `selectedPairingEventRefetchedPropertyKey`
- detail result query：
  - key 保持 `["pairing", "calendar-bid-detail-results", rosterPeriodId, selectedPairingDetailTargetKey]`
- `handleCalendarEventSelect`
- detail rows / selected property 解析。
- `handleSaveSelectedPairingEventTiers`
- selected event dialog view model。

输入：

- `enabled`
- `selectedPairingEvent`
- `onSelectedPairingEventChange`
- `canEditCurrentBid`
- `readOnlyMessage`
- `pairingCalendarPeriod`
- `pairingPageData`
- `pairingPageQuery`
- `onEventOpen`

输出：

- `selectedEventDialog`
- `clearSelectedEvent`
- `handleCalendarEventSelect`
- `resetSelectedEventState`

## 共享 helper

可以保留在 `use-pairing-calendar-actions.tsx` 文件内，也可以拆到：

`pbs-portal/src/features/dashboard/pairing-calendar-action-model.ts`

建议第一版只在确有复用时拆 helper，避免过度文件碎片化。以下 helper 可按实际导入关系决定：

- `toggleStringSelection`
- `buildPairingCalendarAwardProperty`
- `syncPairingCalendarAddInQueryCache`
- `extractSelectedPairingOccurrences`

如果子 hook 都要用同一个 helper，再提取；如果只有 date add hook 使用，就放在 date add hook 文件里。

## 数据流

### 日期新增 Pairing bid

1. `DashboardSchedulePanel` 通过 coordinator 调用 `usePairingCalendarActions.requestDateAction`。
2. `usePairingCalendarActions` 转发到 date add hook。
3. date add hook：
   - 检查 readonly。
   - 调用 `onActionOpen` 清理 Days Off action。
   - 设置 pending date action。
   - 触发 occurrence query。
4. 用户选择 occurrence 和 Tx。
5. 保存时继续使用：
   - `runCurrentBidMutation`
   - `pairingService.addCurrentDraftProperty`
   - `syncPairingCalendarAddInQueryCache`
   - `invalidatePairingCalendarMutationQueries`
   - `requestPairingPoolCountsRefresh`

### 已有 Pairing event detail / Tx edit

1. `ScheduleEventCalendar` 点击 existing event。
2. `usePairingCalendarActions.handleCalendarEventSelect` 转发给 detail hook。
3. detail hook：
   - 只接受 `sourceEvent.type === "pairing_bid"`。
   - 调用 `onEventOpen` 清理 date action。
   - 设置 selected event。
   - 触发 detail query。
4. 用户选择/清空 Tx。
5. 保存时继续使用：
   - `runCurrentBidMutation`
   - `pairingService.patchCurrentDraftProperty`
   - `invalidatePairingCalendarMutationQueries`

注意：当前清空所有 Tx 的 detail save 行为仍是 `patchCurrentDraftProperty` 写入 inactive tiers，不引入 `removeCurrentDraftProperty`。如果未来要把清空 Tx 改成删除 property，那是业务行为变更，必须另开 spec。

## 错误处理

不新增新错误：

- add path 文案保持：
  - `Unable to add pairing bid.`
  - `Pairing bid added.`
- detail path 文案保持：
  - `Unable to save pairing bid.`
  - `Pairing bid updated.`
  - `Unable to find this pairing bid in the current draft.`
  - `Unable to load pairing bid tiers.`
  - `Select one pairing bid to edit Tx.`
  - `Unable to load pairing details.`
- readonly 仍使用 `message.warning(readOnlyMessage)`。
- `enabled=false` 不得阻止 Dashboard readonly detail 打开或 detail results query；它只控制 current draft edit 能力和 lazy draft load。
- 不向用户暴露 raw exception。

## 文件变更范围

预计修改：

- `pbs-portal/src/features/dashboard/hooks/use-pairing-calendar-actions.tsx`
  - 缩成组合 hook。

预计新增：

- `pbs-portal/src/features/dashboard/hooks/use-pairing-calendar-date-add-action.tsx`
- `pbs-portal/src/features/dashboard/hooks/use-pairing-calendar-event-detail-action.tsx`

可能修改：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
  - 加强 add/detail 两条路径断言。
- `e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts`
  - 保留并运行 Dashboard detail Playwright；若拆分导致等待点变化，只改测试稳定性，不改产品行为。
- `e2e/tests/pbs-portal/bid-calendar-pairing-date-add.spec.ts`
  - 新增或补强 `/bid` 双模式 Pairing date add 页面级回归。
- `docs/test-cases/pbs/dashboard/2026-08-20-dashboard-pairing-calendar-actions-split.md`
  - 新增人工 QA，用例覆盖 add path、detail path、readonly、error、cache refresh。

## 验收标准

1. `usePairingCalendarActions` 不再直接维护 date add 和 event detail 的全部局部状态。
2. 日期新增 Pairing bid 行为不变：
   - 单模式 Pairing 页面能打开 date add popover。
   - Bid 双模式 `PAIRING` tab 能打开同一 add popover。
   - occurrence list、search、blocked tiers、Clear、ADD BID 状态不变。
   - add payload 不变。
   - 保存后 pairing pool count refresh 仍触发。
3. 既有 Pairing event detail 行为不变：
   - Dashboard / shared calendar 中点击 existing pairing event 能打开 detail dialog。
   - Dashboard 中 `pairingCalendarAwardBid=false` 时，readonly detail 和 detail results query 仍然可用。
   - 多 property event 仍需要选择 edit target。
   - Tx toggle、clear tiers、save、清空 Tx 后从展示列表移除的用户可见行为不变。
   - detail query key 和 result 展示不变。
   - 清空所有 Tx 的保存行为仍走 `patchCurrentDraftProperty`，不改成 remove。
4. readonly period 行为不变：
   - add path 不允许保存。
   - detail edit path 不允许保存。
5. 错误提示不变，且不暴露 raw exception。
6. Dashboard 页面不新增 Pairing date add 入口。
7. `/days-off` 页面不受影响。

## 自动化验证计划

必须跑：

```bash
pnpm --dir pbs-portal exec vitest run src/app/layout/shared-bidding-workbench-layout.test.tsx
pnpm --dir pbs-portal exec vitest run src/features/dashboard/pages/dashboard-page.test.tsx
pnpm --dir pbs-portal exec vitest run src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pnpm --dir pbs-portal exec eslint src/features/dashboard/hooks/use-pairing-calendar-actions.tsx src/features/dashboard/hooks/use-pairing-calendar-date-add-action.tsx src/features/dashboard/hooks/use-pairing-calendar-event-detail-action.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx
pnpm --dir pbs-portal build
npm run check:ui
```

必须跑 Playwright：

```bash
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts --reporter=list --no-deps
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/bid-calendar-pairing-date-add.spec.ts --reporter=list --no-deps
```

本次必须新增或补强 `/bid` date add 的 Playwright 页面测试：

- 打开 `/bid`。
- 点击日期 `Add bid for ...`。
- 切到 `PAIRING` tab。
- 选择 occurrence 和 Tx。
- 验证 add request payload 或成功状态。

Vitest 仍保留 shared workbench add path payload 断言，但不能替代这个 Playwright 页面测试。

额外回归断言：

- `pairingService.getPageData` 不因拆分被重复调用。
- existing event 缺失 cache 时仍只 refetch pairing draft 一次。
- date occurrence query key 和 detail query key 不变。

## GitNexus / 风险控制

实施前必须跑：

```bash
node .gitnexus/run.cjs impact --repo rois-ai --uid '<usePairingCalendarActions uid>' --direction upstream
```

实施后必须跑：

```bash
node .gitnexus/run.cjs detect_changes --repo rois-ai --scope compare --base-ref main
```

如果 impact 是 HIGH，需要先向用户说明影响范围，再继续按本 spec 的窄范围执行。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次拆分集中在一个 hook 的状态和 callbacks，虽然文件数会增加，但 add path 和 detail path 共享 pairing page data、period、query invalidation，多个 agent 并行写容易产生接口不一致。
- Suggested split: 不建议并行实现。可以实现后派只读 reviewer 检查 add/detail 两条路径是否漏掉状态。
- Write boundaries: 主 agent 修改 Pairing calendar hooks、相关测试和 QA 文档。
- Conflict risk: 中等；并行修改同一个源 hook 容易冲突。
- Execution gate: 用户确认本 spec 后再实现。

## 实施顺序

1. 跑 `usePairingCalendarActions` impact，确认上游影响。
2. 新建 date add hook，搬迁 date add state / query / popover / save。
3. 新建 event detail hook，搬迁 selected event state / detail query / dialog / save。
4. 收缩 `usePairingCalendarActions` 为组合层。
5. 更新或补强测试。
6. 跑 Vitest、eslint、build、UI check、Playwright。
7. 跑 GitNexus `detect_changes`。
