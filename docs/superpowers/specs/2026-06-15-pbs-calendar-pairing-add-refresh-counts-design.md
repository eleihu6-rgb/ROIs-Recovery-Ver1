# PBS Dashboard 左侧日历添加 Pairing 后自动刷新右侧 Counts 设计

日期：2026-06-15  
状态：已确认，已实现  
范围：PBS Portal Dashboard 共享工作台中，左侧 `BIDDING CALENDAR` 添加 Pairing bid 后刷新右侧 `EXISTING PAIRING PROPERTIES` counts

## 背景

在 Dashboard 共享工作台里，左侧 `BIDDING CALENDAR` 可以从某一天的 Pairing occurrence 直接添加一个 `Pairing Number` bid。这个操作最终会调用 `pairingService.addCurrentDraftProperty(...)`，和右侧 Pairing 页面添加 existing pairing property 属于同一类“当前 draft 的 Pairing 条件变更”。

右侧 `EXISTING PAIRING PROPERTIES` 顶部已有当前 Tx 的 counts 汇总，并支持手动点击 `REFRESH`。此前已实现右侧自身添加 / 删除 Pairing condition 后自动刷新当前 Tx counts。

当前缺口是：左侧日历添加 Pairing 成功后，只会 invalidate Pairing page / calendar / tier 相关 query；右侧 counts 的实际刷新逻辑仍封装在 `PairingRightPanel` 的本地状态中，query invalidate 不等价于调用 `countCurrentRules(...)`。因此用户会看到左侧已经添加成功，但右侧 counts 仍可能停留在旧结果或 `Counts need refresh`。

## 目标

左侧 `BIDDING CALENDAR` 添加 Pairing bid 成功后，自动刷新右侧当前 active Tx 的 counts。

具体目标：

- 添加成功后复用现有 `countCurrentRules` / `refreshPairingPoolCounts` 刷新链路。
- 自动刷新使用添加后的 latest existing properties 快照。
- 自动刷新使用右侧当前 active Tx，而不是切换用户当前 Tx / Tier。
- 自动刷新期间复用现有 loading/error/success 展示。
- 添加成功后继续保留现有 `Pairing bid added.` 成功提示。
- 添加失败时保留现有失败提示，不触发 counts refresh。
- 保留手动 `REFRESH` 按钮和 Tx 切换自动刷新行为。

## 非目标

- 不新增后端 API。
- 不改变 `countCurrentRules` request / response contract。
- 不改变 Pairing Search 页面、Pairing Number autocomplete、Bidding Calendar event 查询的 base 过滤规则。
- 不改变右侧 edit property / tier toggle 的现有 stale 策略。
- 不改变左侧日历 days-off 相关操作。
- 不在本次强行扩展到左侧日历的其它 mutation，除非它们已经复用同一个 Pairing add 成功通知链路。

## 当前实现观察

相关文件：

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-portal/src/features/dashboard/calendar-query-invalidations.ts`
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`

当前左侧日历添加 Pairing 的流程：

1. `DashboardSchedulePanel` 根据用户选择的 occurrence 和 tier 构造 `Pairing Number` award property。
2. 调用 `pairingService.addCurrentDraftProperty(property, draftMeta)`。
3. 成功后调用 `invalidatePairingCalendarMutationQueries()`。
4. 关闭弹层并显示 `Pairing bid added.`。

当前右侧 counts 的刷新流程：

1. `PairingRightPanel` 内部维护 `pairingPoolCounts` state。
2. `refreshPairingPoolCounts(tier)` 调用 `pairingService.countCurrentRules(tier, latestExistingProperties, periodCode)`。
3. 手动 `REFRESH`、切换 Tx、右侧自身 add/delete 成功会触发该刷新链路。
4. 左侧日历 add 成功目前不能直接触发这个本地刷新函数。

## 推荐方案

增加一个轻量的 Pairing counts refresh signal，让左侧日历 add 成功后可以通知右侧面板刷新当前 Tx counts。

推荐数据流：

1. 抽出一个 Pairing workbench 级别的刷新信号，例如 `requestPairingPoolCountsRefresh()` / `usePairingPoolCountsRefreshSignal()`。
2. `DashboardSchedulePanel` 在左侧日历 Pairing add 成功后：
   - 先保留现有 `invalidatePairingCalendarMutationQueries()`。
   - 再触发 Pairing counts refresh signal。
3. `PairingRightPanel` 监听该 signal。
4. 当 signal 变化时，`PairingRightPanel` 使用现有 `refreshPairingPoolCounts(resolvePairingPoolCountsTier(activeTierLabelRef.current))` 刷新当前 active Tx。
5. 刷新前确保 `latestPoolCountsInputRef` 已指向 query refetch / hydration 后的 latest existing properties；如果 query refetch 尚未完成，需要避免用旧 properties 立即计算。

这个方案的重点是把“外部 Pairing draft mutation 已成功，需要右侧 count 重新计算”表达成明确事件，而不是依赖 component remount 或 query invalidate 的副作用。

## 备选方案

### 方案 A：共享 refresh signal（推荐）

优点：

- 语义清楚：外部 Pairing add 成功后显式请求刷新 counts。
- 不需要把 `refreshPairingPoolCounts` 向上传递多层 props。
- 不依赖组件是否 remount。
- 后续如果其它 dashboard 外部入口也会修改 Pairing condition，可以复用同一信号。

缺点：

- 需要新增一个很小的共享状态/事件工具。
- 需要仔细处理 signal 和 query refetch 的先后顺序，避免旧 properties 参与计算。

### 方案 B：右侧监听 query data 变化后自动刷新

优点：

- 不新增 event/signal 概念。
- 可以直接利用 `pairingPageDataQueryKey` refetch 后的 data 变化。

缺点：

- 右侧 page data 的变化来源较多，容易对无关 hydration 触发 counts refresh。
- 需要额外判断是否来自左侧日历 add，否则可能改变 edit/tier toggle 的现有 stale 策略。
- 行为边界不如显式 signal 清楚。

### 方案 C：把右侧刷新函数通过 props 传给左侧

优点：

- 直接调用，容易理解。

缺点：

- 会增加 Dashboard layout、schedule panel、right panel 之间的耦合。
- 需要调整组件层级接口，改动面比本问题需要的大。
- 后续其它入口复用性差。

推荐采用方案 A。

## 关键实现约束

- 左侧 add 成功后，不能在 right panel 仍持有旧 `existingProperties` 时立即计算旧 counts。
- 如果采用 signal，需要让 right panel 在完成新数据同步后再刷新，或者 signal 携带一个能等到 invalidation/refetch 完成的流程。
- 若用户快速连续添加多个 Pairing bid，继续依赖现有 `poolCountsRequestSeqRef` 防止旧 count 请求覆盖新结果。
- 如果右侧面板当前不在页面上或尚未挂载，signal 不应造成错误；后续挂载时按正常 page data hydrate。
- 添加失败路径不能触发 signal。

## 验收标准

- 在 Dashboard 共享工作台中，用户从左侧 `BIDDING CALENDAR` 添加 Pairing bid 成功后，右侧当前 active Tx counts 自动刷新。
- 自动刷新调用 `pairingService.countCurrentRules(...)`。
- `countCurrentRules(...)` 使用添加后的 existing properties 快照，包含新添加的 `Pairing Number` property。
- 自动刷新不改变用户当前 active Tx / Tier。
- 添加成功后页面不长期停留在 `Counts need refresh`。
- 添加失败时不调用 `countCurrentRules(...)`，仍显示添加失败提示。
- 手动 `REFRESH` 行为保持不变。
- 右侧自身添加 / 删除自动刷新行为不回退。

## 测试计划

前端单测：

- 在 `shared-bidding-workbench-layout.test.tsx` 增加左侧日历 add 成功后的 counts refresh 用例：
  - 渲染共享 workbench。
  - 从左侧日历选择 Pairing occurrence 和 tier。
  - 点击 `ADD BID`。
  - 断言 `pairingService.addCurrentDraftProperty(...)` 成功调用。
  - 断言右侧触发 `pairingService.countCurrentRules(...)`。
  - 断言 count 调用的 properties 包含新添加的 `Pairing Number` bid。
- 增加左侧 add 失败用例或扩展现有失败用例：
  - mock `addCurrentDraftProperty` reject。
  - 断言不调用 `countCurrentRules(...)`。
  - 断言原有失败提示仍显示。
- 保留 `pairing-page.test.tsx` 中右侧 add/delete 自动刷新测试，确保不回退。

验证命令：

```bash
cd pbs-portal
npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/pairing/pages/pairing-page.test.tsx
npm run build
```

## 实现结果

- 新增 `usePairingPoolCountsRefreshStore`，用于在 Dashboard 左侧日历和 Pairing 右侧面板之间传递 counts refresh 请求。
- 左侧 `BIDDING CALENDAR` 添加 Pairing bid 成功后，会先把新增的 `Pairing Number` property 同步到 `pairingPageData` query cache，再发送 refresh 请求。
- refresh 请求携带保存后的 `existingProperties` 快照，右侧 `PairingRightPanel` 直接用该快照调用现有 `countCurrentRules(...)`，避免 query refetch / hydration 时序导致旧条件参与计算。
- 添加失败路径不发送 refresh 请求。
- 保留现有 query invalidation、成功 / 失败提示、手动 `REFRESH`、Tx 切换自动刷新、右侧自身 add/delete 自动刷新行为。

## 验证结果

已执行：

```bash
cd pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx
npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx
npm run build
```

结果：

- `pairing-page.test.tsx`：54 tests passed。
- `shared-bidding-workbench-layout.test.tsx`：33 tests passed。
- `npm run build`：通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在 PBS Portal 前端共享工作台和 Pairing right panel 状态桥接，代码范围小，单 agent 处理更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/dashboard/`、`pbs-portal/src/features/pairing/`、`pbs-portal/src/app/layout/` 相关测试；如需要，新增 `docs/test-cases/pbs/pairing/` 测试说明。
- Conflict risk: 低；主要风险是和现有 query invalidation / local counts state 顺序冲突。
- Execution gate: 用户确认本 spec 后再进入实现。
