# PBS Bid / Tier Tx 筛选与 Tier Summary 收口设计

## 背景

当前 `Tier` 页底部的 `BID SUMMARY` 和 `Bid` 页顶部的 `EXISTING BID PROPERTIES` 已经高度重合：

- `Bid` 页已经使用 `useTierPageData` 读取同一份 summary 数据。
- `Bid` 页已经复用 `SummaryItemRow`、`TierDetailDialog`、`patchTierSummaryItemTiers`、`deleteTierSummaryItem`。
- `Bid` 页还同时承载新增 bid、favorite、edit、delete、Pairing preview 等操作，比 `Tier` 页更适合作为 bid 管理入口。

同时，左侧 `BIDDING CALENDAR` 的 Tx 选择现在存在一个交互问题：

- `useBiddingCalendarStore.activeTierLabel` 支持空值。
- 如果空值按 `All Tx` 展开，左侧月历和 `/bid` Existing 区域会一次显示 `T1-T7` 的所有 bid，页面过密。
- 产品规则调整为：用户未主动选择 Tx 时，默认按 `T1` 展示。

本设计目标是把页面职责收口：

```text
Bid  = 管理 bid，支持按 Tx 查看 existing bids
Tier = 观察 tier 结果、pairing pool、diagnostics，不再重复管理 bid summary
```

## 目标

1. 移除 `Tier` 页底部 `BID SUMMARY` 区块。
2. 保留 `Tier` 页上方的 pairing pool statistics、warnings、diagnostics、View Pairing Set。
3. 让左侧日历 Tx 选择成为 `Bid` 页 `EXISTING BID PROPERTIES` 的筛选来源。
4. 支持左侧日历 Tx 取消选择：
   - 未选择 Tx = 默认 `T1`
   - 选择 `T2` = 只显示包含 `T2` 的 existing bid
   - 再点一次已选 `T2` = 回到默认 `T1`
5. 不新增一套独立的 Bid 页 Tx tabs，避免出现两个筛选源。

## 非目标

- 不修改后端 API、数据库、migration。
- 不改变 bid 保存 payload。
- 不改变 Pairing Search / Search Pairings 的筛选语义。
- 不重做左侧 calendar 视觉体系。
- 不一次性重构 `TierDetailDialog` 的所有历史用法，除非实现中发现必须收口。

## 推荐方案

### 方案 B：左侧日历作为全局 Tx filter，Bid 页跟随过滤

这是推荐方案。

行为：

- 左侧日历默认按 `T1` 展示。
- `Bid` 页 `EXISTING BID PROPERTIES` 默认展示包含 `T1` 的 existing bid。
- 用户点击左侧 `T2`：
  - 左侧 `T2` 进入选中态。
  - `Bid` 页 existing list 只显示 `item.tiers` 包含 `T2` 的 bid。
  - 如果某个 bid 属于 `T1 + T2`，在 `T2` filter 下仍显示。
- 用户再次点击已选中的 `T2`：
  - 取消 Tx 选择。
  - `Bid` 页回到默认 `T1`。

理由：

- 用户已经把左侧 calendar 理解为 Tx 上下文。
- Bid 页已有完整 bid 管理能力，不需要另建 Tx tabs。
- Tier 页可以专注结果分析，不再重复 existing bid 管理。

### 备选方案 A：Bid 页自己加 Tx tabs

不推荐。

优点是实现局部，缺点是和左侧 calendar 形成两个筛选源。用户可能不知道当前 list 是由哪个控件控制。

### 备选方案 C：保留 Tier BID SUMMARY，只增强 Bid 页筛选

不推荐。

这会继续保留重复入口，后续维护 edit/delete/detail/preview 逻辑时容易分叉。

## 详细行为设计

### 1. 左侧 calendar Tx 选择

当前 `ScheduleTierMatrix` 的 Tx button 只负责选择。需要改为 toggle：

- 点击未选中的 Tx：选择该 Tx。
- 点击已选中的 Tx：清空选择。
- 空选择态下视觉上高亮 `T1`，避免内容按 T1 过滤但按钮看起来没有选择。
- 需要补 aria：
  - 已选中：`aria-pressed="true"`
  - 未选中：`aria-pressed="false"`

`useBiddingCalendarStore.activeTierLabel` 继续用空字符串表示“用户未主动选择”，不新增复杂 store 状态；页面读取时 resolve 为默认 `T1`。

### 2. Calendar event 显示

空选择态显示默认 `T1`。

建议实现：

- `activeTierLabel === ""` 时，calendar matrix 高亮 `T1`。
- `Bid` 页 existing list 显示 `T1 only`。
- Calendar 主日期区域只显示 T1 的可渲染 events，避免 T1-T7 同时展开造成重复 Off 和过密 rows。

关键原则：**空选择态不能再被解释成 All Tx。**

### 3. Bid 页 existing list

`BidPage` 当前：

```ts
const existingItems = uniqueSummaryItems(tierQuery.data?.summaryGroups.flatMap((group) => group.items) ?? []);
```

需要改成：

- 先保留去重逻辑。
- 再按当前 selected Tx 过滤。
- 无 Tx 选择时按 `T1` 筛选。

过滤规则：

```ts
selectedTx === ""       => item.tiers.includes("T1")
selectedTx === "T2"     => item.tiers.includes("T2")
```

UI 文案建议：

- Header 仍为 `EXISTING BID PROPERTIES`。
- 可在 header 旁或列表上方显示轻量状态：
  - `T1 · 5 bids`
  - `T2 · 4 bids`
- 空结果：
  - T1：`No bid properties are attached to T1.`
  - selected Tx：`No bid properties in T2.`

### 4. Tier 页收口

`TierRightPanel` 底部的 `BID SUMMARY` section 移除。

保留：

- `BidStatisticsSection`
- `TierReviewSection`
- `TierPairingSetPreviewDialog`
- warnings / diagnostics

如果 diagnostics 中仍需要打开某个 bid 的详细信息：

- 可以保留 diagnostic detail 能力作为 review 辅助。
- 但长期方向是：编辑 / 删除 / 重新分配 Tx 都应该从 `Bid` 页完成。
- 如果实现中发现 `TierDetailDialog` 在 Tier 页仍暴露编辑/删除操作，优先改成 `Open in Bid` 或只读 detail，避免 Tier 页继续变相承担 bid 管理职责。

### 5. 可持久化行为

本次不改变任何持久化语义：

- 不改 bid payload。
- 不改 tiers 保存接口。
- 不改 delete 接口。
- 不改 pairing preview API。
- 不改 calendar current API。

## 影响范围

预计涉及：

- `pbs-portal/src/shared/store/use-bidding-calendar-store.ts`
- `pbs-portal/src/shared/components/schedule/schedule-tier-matrix.tsx`
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts`
- `pbs-portal/src/features/bid/pages/bid-page.tsx`
- `pbs-portal/src/features/tier/components/tier-right-panel.tsx`
- `pbs-portal/src/features/tier/pages/tier-page.test.tsx`
- `pbs-portal/src/features/bid/pages/bid-page.test.tsx`
- `pbs-portal/src/shared/components/schedule/schedule-tier-matrix.test.tsx`
- `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`
- 相关 Help / QA 文档

不涉及：

- `live-server`
- `sql`
- `packages/contracts`

## 测试要求

### 自动化测试

至少覆盖：

1. `ScheduleTierMatrix`
   - 点击未选 Tx 会选中。
   - 点击已选 Tx 会触发清空选择。
   - 空选择态 resolve 为 T1 active row。

2. `BidPage`
   - 无 Tx 选择时显示 T1 existing bid。
   - 选择 `T2` 时只显示 `item.tiers` 包含 `T2` 的 bid。
   - 一个 bid 属于 `T1/T2` 时，在 `T2` 下仍显示。
   - selected Tx 空结果显示 `No bid properties in T2.`
   - Existing summary 不显示 raw JSON。

3. `TierPage / TierRightPanel`
   - 不再渲染底部 `BID SUMMARY`。
   - 仍渲染 pairing pool statistics 和 diagnostics。

4. Calendar mapper / schedule panel
   - 空 `activeTierLabel` 被解析为默认 `T1`。
   - 默认状态下不渲染 T2-T7 的月历 events。

5. `lineholder-summary-formatters`
   - Airport Preference Json bid 输出可读文案。
   - 不把 `{"type":"airport-preference"...}` 作为 UI summary 发送给前端。

### Playwright

需要真实 UI 回归：

1. 打开 Bid 页。
2. 默认左侧 T1 active，existing list 显示 T1 bids。
3. 点击左侧 `T2`，Bid 页 existing list 只显示 T2 bids。
4. 再点 `T2`，恢复 T1 bids。
5. 打开 Tier 页，确认底部 `BID SUMMARY` 不存在，statistics / diagnostics 仍可见。

### UI Gate

前端视觉变更后必须跑：

- `cd pbs-portal && npm test`
- `cd pbs-portal && npm run lint -- --quiet`
- `cd pbs-portal && npm run build`
- `cd /Users/lei/Codehub/rois-ai && npm run check:ui`
- 相关 Playwright 用例

## 风险与处理

### 风险 1：默认展开全部 Tx 导致日期区域过于拥挤

处理：

- 空选择统一按 T1 处理。
- 只有用户明确点击 T2-T7 时，才切换到对应 Tx。

### 风险 2：日历快捷新增 bid 需要 Tx

处理：

- 如果用户未选择 Tx 时触发需要具体 Tx 的 calendar action，使用默认 T1，与左侧视觉高亮和 `/bid` Existing 过滤保持一致。

### 风险 3：Tier diagnostics 仍有编辑入口

处理：

- 本次核心是移除底部重复 summary。
- 如实现中发现 diagnostic detail 继续暴露完整编辑/删除，应收口成只读或跳转 Bid 页，避免重复管理入口。

## 验收标准

- `Tier` 页不再显示底部 `BID SUMMARY` 区块。
- `Bid` 页成为 existing bid 的唯一主管理入口。
- 左侧日历 Tx 可取消选择。
- 无 Tx 选择时，Bid existing list 显示 T1。
- 选择某个 Tx 时，Bid existing list 只显示包含该 Tx 的 bid。
- Existing summary 不暴露 raw JSON。
- 不改变后端接口、数据库或 bid payload。
- 自动化与 Playwright 回归通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `pbs-portal` 的共享 calendar state、Bid page、Tier page，状态耦合较强，拆分多 agent 容易产生冲突。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal` UI / tests / help / QA。
- Conflict risk: Medium，主要风险是 calendar 空选态影响 existing bid filter 和 calendar action。
- Execution gate: 用户确认本 spec 后再实现；实现阶段不得修改后端、SQL 或 contracts。
