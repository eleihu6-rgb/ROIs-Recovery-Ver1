# PBS Tier Detail Drilldown / Review 定位设计

## 背景

`/tier` 当前已经具备只读 Bid Review / Summary 和 `TIER REVIEW` 诊断提醒：

- `BID STATISTICS` 展示 `T1-T7` 的 bid 数量分布。
- `BID SUMMARY` 按 Tier 展示当前 Lineholder Current draft 的 bid 和条件链。
- `TIER REVIEW` 展示空 Tier、legacy、unsupported、跨 Tx 重复、分布异常、restrictive hint 等提醒。

下一步需要解决“看到了提醒之后，客户如何快速理解和定位”的问题。用户点击某条 bid 或 review 提醒后，应能看到该 bid 的完整只读详情，而不是在 summary 列表里反复找。

## 目标

- 在 `/tier` 增加只读 Detail Drilldown。
- 点击 `BID SUMMARY` 的 bid row，打开详情 overlay。
- 点击 `TIER REVIEW` 的诊断提醒，打开与该提醒相关的详情 overlay。
- 详情中清楚展示 bid 本身、关联 Tx、conditions、warning / diagnostic 原因。
- 支持 legacy / unsupported 旧数据的只读解释。
- 不新增 API，不新增数据库查询，完全基于现有 summary response 和 mapper 后的前端数据。

## 非目标

- 不做编辑、保存、删除、拖拽、重排。
- 不做 Award Engine。
- 不做 Reason Report。
- 不做真实 Pairing Pool / View Pairing Set。
- 不导入 Excel。
- 不修改 SQL/schema。
- 不把 `Layer` 术语带入 UI/API/代码；继续使用 `Tier / Tx / T1-T7`。

## 推荐方案

采用 **只读 overlay dialog**，风格参考现有 Pairing calendar detail dialog。

选择原因：

- 当前 `/tier` 已经是右侧面板布局，内部 drawer 会压缩可读空间。
- overlay 能容纳 bid、conditions、review reasons、legacy 标记等信息。
- overlay 不改变页面数据流，也不需要额外路由。
- 与项目已有 detail 弹层交互一致，用户容易理解。

## 交互设计

### 打开方式

1. 点击 `BID SUMMARY` 中任意 bid row：
   - 打开 `Tier Bid Detail` overlay。
   - 详情聚焦该 bid。

2. 点击 `TIER REVIEW` 中任意 diagnostic row：
   - 如果 diagnostic 有 `groupKey` 或 `itemIds`，打开相关 bid 详情。
   - 如果 diagnostic 只关联 Tier，例如 `emptyTier` / `heavyTier` / `lightTier`，打开 Tier-level review 详情，展示相关 Tx 和提醒原因。
   - 如果 diagnostic 同时关联多个 bid，首期展示所有可匹配 bid 的 compact list。

### 关闭方式

- 点击 `Close` 按钮关闭。
- 按 `Escape` 关闭。
- 首期不要求点击 backdrop 关闭，避免误关闭。

### 视觉结构

Overlay 内容分区：

1. Header
   - 标题：`Tier Bid Detail` 或 `Tier Review Detail`
   - 副标题：主 bid readable text 或 diagnostic message。

2. Summary
   - Bid type badge。
   - Action。
   - Label。
   - Readable text。
   - 关联 Tx chips。
   - Legacy / unsupported 标记。

3. Conditions
   - 展示 condition chain。
   - 无条件时显示 `No additional conditions.`。

4. Review Reasons
   - 展示与该 bid / Tier 匹配的 diagnostics。
   - 展示与该 bid / Tier 匹配的 warnings。
   - 区分 `info` 与 `warning` 视觉。

5. Related Bids
   - 当从 diagnostic 打开且匹配多个 bid 时，展示可点击的 compact related bid list。
   - 点击 related bid 后，在同一个 overlay 中切换焦点。

## 数据设计

不改后端 contract。

前端在 `TierPageData` 内保留现有字段：

- `summaryGroups`
- `legacyItems`
- `diagnostics`
- `warnings`

新增前端-only helper 类型：

```ts
type TierDetailTarget =
  | { kind: "summaryItem"; itemId: string; groupKey: string }
  | { kind: "diagnostic"; diagnosticId: string };
```

新增前端-only selector/helper：

- `findTierSummaryItemById(data, itemId)`
- `findTierSummaryItemsByDiagnostic(data, diagnostic)`
- `findTierDiagnosticsForItem(data, item)`
- `findTierWarningsForItem(data, item)`

匹配规则：

- `groupKey` 优先。
- `itemIds` 次之。
- legacy / unsupported 可通过 `warningCode`、`tier`、`tiers` 辅助匹配。
- 对 `emptyTier / heavyTier / lightTier` 这类 Tier-level diagnostic，不强行绑定 bid。

## 组件设计

新增或调整：

- `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx`
  - 纯展示组件。
  - 接收 resolved detail view model。

- `pbs-portal/src/features/tier/tier-detail-selectors.ts`
  - 负责从 `TierPageData` 解析 detail 数据。
  - 纯函数，便于单测。

- `TierRightPanel`
  - 管理当前 selected target 状态。
  - 给 `SummaryItemRow` 和 `DiagnosticRow` 增加 button-like 交互。
  - 打开 overlay dialog。

## 可访问性

- Overlay 使用 `role="dialog"` 和 `aria-modal="true"`。
- 可点击 row 使用 `<button type="button">` 或显式 button 语义，避免 div click。
- `Close` 按钮有清晰文本。
- 支持 `Escape` 关闭。
- 不依赖颜色作为唯一信息来源，severity 仍有文案和图标。

## 错误和空状态

- 匹配不到 bid 时，不报错；显示 Tier-level review detail。
- 没有 conditions 时显示空状态文案。
- 没有 related bids 时不显示 related 区块。
- diagnostics 为空时仍可从 summary row 打开 bid detail。

## 测试计划

前端单元测试：

- `tier-detail-selectors.test.ts`
  - summary item target 能解析到正确 bid。
  - diagnostic 通过 `groupKey` 匹配 bid。
  - diagnostic 通过 `itemIds` 匹配 bid。
  - Tier-level diagnostic 不强行匹配 bid。
  - legacy / unsupported item 能带出 warning/review reason。

- `tier-right-panel.test.tsx`
  - 点击 summary row 打开 detail overlay。
  - 点击 diagnostic row 打开 review detail overlay。
  - overlay 展示 bid readable text、Tx chips、conditions。
  - `Close` 和 `Escape` 能关闭 overlay。
  - 空 diagnostics 不影响 summary row detail。

回归：

- `BID SUMMARY` 仍在容器内滚动。
- `TIER REVIEW` 仍在容器内滚动。
- `/pairing`、`/days-off`、`/line` 编辑保存链路不受影响。

## 验收标准

- 用户能从 summary row 打开只读 bid detail。
- 用户能从 diagnostic row 打开对应 review detail。
- overlay 不提供任何编辑或保存入口。
- legacy / unsupported 数据能被解释，不导致页面报错。
- 不新增后端查询，不改变已有 API contract。
- 页面滚动体验保持稳定。
- 根目录 `npm run verify:pbs` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该功能主要集中在 `pbs-portal/src/features/tier`，交互状态、selector、组件测试耦合较紧，单人串行更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/*`、必要时新增 `docs/test-cases/pbs/tier/*`。
- Conflict risk: 中等。当前 Tier diagnostics 改动尚未提交，继续在同一 feature slice 上顺序开发可以减少冲突。
- Execution gate: 用户确认本 spec 后再实施。
