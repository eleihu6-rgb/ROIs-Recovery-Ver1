# PBS Tier 客户可用编辑能力设计

## 背景

`/tier` 当前已经完成 AA Layer Tab 对应的核心查看能力：

- `BID STATISTICS`：展示 `T1-T7` 的 bid 分布。
- `BID SUMMARY`：按 Tx 汇总当前 Lineholder Current draft 中的 `Pairing / Days Off / Line / Calendar` bids。
- `TIER REVIEW`：展示空 Tx、legacy、unsupported、重复跨 Tx、分布异常和 restrictive hint。
- `Tier Bid Detail`：点击 summary 或 review 后查看 bid 详情。
- `View Pairing Set`：对 Pairing bid 预览当前 Tx 的 pairing set，并复用 Pairing 页全局缓存。

AA Guide 中的 Layer Tab 不只是 review。它也允许用户在汇总 workspace 内通过点选 layer 来修正 bid 所属 layer，并支持删除 property / pairing bid。我们的首期 Tier 是只读 review，这一步需要补上客户可用的轻量编辑能力，让客户在 Tier 检查页发现问题后能直接修正 Tx 或删除 bid。

## 目标

- 在 Tier detail 中提供正式可用的 `Edit Tx` 能力。
- 在 Tier detail 中提供正式可用的 `Delete Bid` 能力。
- 编辑和删除必须调用真实 current draft API，不做前端假状态。
- 保存后刷新 `BID SUMMARY / TIER REVIEW / TIER WARNINGS / View Pairing Set` 相关缓存。
- 操作过程具备 loading、disabled、success、error、确认和并发版本处理。
- legacy / unsupported / 超出 `T1-T7` 的旧数据保持只读，避免误伤历史数据。
- 保持 PBS 职责边界：只保存/检查/预览用户规则，不做 RO/PO/法规/coverage 算法。

## 非目标

- 不在 Tier 里重做完整 Pairing / Days Off / Line 参数编辑器。
- 不在 Tier 里修改具体 bid 值，例如日期、Pairing Total Credit 数值、机场、时间范围、Line property 参数。
- 不做拖拽排序、copy/paste bid、跨 bid group 重排。
- 不做 Award / Reason Report / RO / PO。
- 不导入 Excel。
- 不修改 SQL schema / migration。
- 不新增第三方依赖。
- 不把 AA 原文 `Layer` 术语带入 UI/API/代码；继续使用 `Tier / Tx / T1-T7`。

## AA 对齐说明

AA Guide 对 Layer Tab 的关键能力包括：

- Layer Tab 汇总 days off、pairing 和 line bids。
- 用户可以通过点击/取消 layer 来编辑 bid 所属 layers。
- 用户可以删除 property 或 pairing bid。
- 日历上的 day off 和 specific pairing 可以点开后改 layer 或删除。
- Layer Tab 仍然是汇总 workspace，不要求在这里重做所有 property 参数编辑。

本设计对齐的是“修改所属 Tx”和“删除 bid”这两类客户最需要的修正能力。具体参数编辑仍回到 `Pairing / Days Off / Line / Calendar` 原页面，避免 Tier 页变成四套编辑器的重复实现。

## 推荐方案

采用 **Tier detail 内联编辑 + 复用来源模块 API**。

用户在 `/tier` 点击某条 bid，进入 `Tier Bid Detail`。如果该 bid 可编辑，detail 中显示：

- `Edit Tx`：进入 Tx toggle 编辑状态。
- `Delete Bid`：打开删除确认。
- `Go to Source`：跳回对应来源页面修改具体参数。

保存 Tx 或删除时，前端加载对应来源模块的 current draft 数据，按 `groupKey / propertyGroupKey` 找到真实 property，再调用现有 patch/delete service。成功后失效相关 Query 缓存并重新加载 Tier summary。

### 为什么推荐这个方案

- 复用已有 Pairing / Days Off / Line 的真实校验、并发版本和 mutation API。
- 不在 Tier 页面复制复杂业务参数编辑逻辑。
- 与 AA 的 Layer Tab 修正能力一致。
- 风险可控，主要新增前端 orchestration 和少量 summary contract 字段。
- 客户使用时是正式保存链路，不是 demo 状态。

## 方案对比

### 方案 A：Tier detail 内联编辑 Tx + 删除（推荐）

优点：

- 客户能在检查页直接修正最常见问题。
- 复用现有模块 API，后端改动较小。
- 不引入拖拽、复制、重排等高风险交互。

代价：

- Tier 需要知道 summary item 对应的来源模块和 source key。
- 前端需要处理跨模块缓存失效。

### 方案 B：Tier 只提供跳转到来源页面

优点：

- 实现最简单。
- 几乎不新增写入逻辑。

代价：

- 不符合 AA Layer Tab 的“workspace 内直接修正 layer”体验。
- 客户检查到问题后需要来回跳页面，效率低。

### 方案 C：Tier 做完整编辑器

优点：

- 一个页面理论上能改所有内容。

代价：

- 重复 Pairing / Days Off / Line / Calendar 的复杂编辑器。
- 会放大并发版本、保存顺序、校验、缓存一致性和 UI 复杂度。
- 当前阶段不推荐。

## 数据契约设计

当前 `PbsLineholderSummaryItem` 已有：

- `id`
- `groupKey`
- `bidType`
- `tiers`
- `source`
- `warningCode`

为了让 Tier 能安全定位真实可编辑对象，需要增强 summary item 的来源身份。建议增加可选字段：

```ts
type PbsLineholderSummaryEditableSource = {
  module: "Pairing" | "DaysOff" | "Line" | "Calendar";
  propertyGroupKey: string;
};

type PbsLineholderSummaryItem = {
  // existing fields...
  editableSource?: PbsLineholderSummaryEditableSource;
};
```

说明：

- `module` 用于选择正确 service。
- `propertyGroupKey` 必须是来源 draft mutation API 能识别的 key。
- `editableSource` 只给 current draft 且支持编辑的 item 返回。
- legacy / unsupported / 超出 `T1-T7` 的 item 不返回 `editableSource`，前端即视为只读。
- Calendar day off 如果当前已有稳定 patch/delete 能力，则可返回 `module: "Calendar"`；如果只能按日期批量 patch，则本轮先只读并显示 `Go to Source`。

### Draft Identity

Tier summary response 顶层已有：

- `draftKey`
- `bidId`
- `periodCode`
- `bidContext`
- `draftVersion`

前端仍优先使用来源模块 current draft 的 `draftMeta` 做 mutation，因为现有 service 需要完整来源 page data，并且来源模块 mapper 已经封装了 property payload。

## 前端数据设计

`TierSummaryItem` 增加：

```ts
type TierEditableSource = {
  module: "Pairing" | "DaysOff" | "Line" | "Calendar";
  propertyGroupKey: string;
};

type TierSummaryItem = {
  // existing fields...
  editableSource?: TierEditableSource;
  isEditable: boolean;
};
```

`isEditable` 计算规则：

- 必须有 `editableSource`。
- `warningCode` 不存在。
- 所有 tiers 都在 `T1-T7` 范围内。
- bidType 不是 `Unsupported` / `Reserve`。

## 交互设计

### Tier Bid Detail 默认态

可编辑 bid 显示：

- 当前 Tx chips。
- `Edit Tx` 按钮。
- `Delete Bid` 按钮。
- `Go to Pairing / Days Off / Line / Calendar` 来源入口。
- Pairing bid 继续显示 `View Pairing Set`。

只读 bid 显示：

- 当前 Tx chips。
- 只读原因，例如 `Review-only legacy item`、`Unsupported bid`、`Outside T1-T7`。
- `Go to Source` 如果能定位来源页面则保留，否则不显示。
- 不显示 `Edit Tx` 和 `Delete Bid`。

### Edit Tx

点击 `Edit Tx` 后：

- Tx 区域变成 `T1-T7` toggle group。
- 当前所属 Tx 预选。
- 至少选择 1 个 Tx；全部取消时 `Save` disabled，并显示简短提示。
- `Cancel` 回到默认态。
- `Save Tx` 调用来源模块 patch API。
- 保存中禁用 dialog 内所有会冲突的 action。
- 保存成功后关闭编辑态，刷新 Tier summary 和相关来源缓存。
- 保存失败保留编辑态，并显示错误。

### Delete Bid

点击 `Delete Bid` 后：

- 弹出确认区或确认 dialog。
- 文案明确说明删除会从 current draft 移除该 bid。
- `Cancel` 返回 detail。
- `Delete` 调用来源模块 delete API。
- 删除中禁用其他 action。
- 删除成功后关闭 detail，刷新 Tier summary 和相关来源缓存。
- 删除失败不关闭 detail，并显示错误。

### Go to Source

`Go to Source` 用于修改具体参数：

- Pairing -> `/pairing`
- DaysOff -> `/days-off`
- Line -> `/line`
- Calendar -> `/dashboard` 或当前日历入口

本轮不要求深链到具体 property row，但需要保留用户上下文，不做破坏性跳转。

## Mutation Orchestration

新增前端 helper，例如：

```ts
type TierEditAction =
  | { kind: "patchTiers"; item: TierSummaryItem; tiers: string[] }
  | { kind: "delete"; item: TierSummaryItem };
```

建议新增 `tier-editing-service.ts` 或 `tier-editing-actions.ts`，职责：

1. 根据 `item.editableSource.module` 加载来源 page data。
2. 在来源 `existingProperties` 中按 `propertyGroupKey` 找到真实 property。
3. patch 时复制该 property，仅替换 `tiers` active 状态。
4. delete 时调用来源 service 的 remove 方法。
5. 返回 mutation response 或抛出标准错误。

来源模块映射：

- Pairing：`pairingService.getPageData()`、`patchCurrentDraftProperty()`、`removeCurrentDraftProperty()`。
- DaysOff：`daysOffService.getPageData()`、`patchCurrentDraftProperty()`、`removeCurrentDraftProperty()`。
- Line：`lineService.getPageData()`、`patchCurrentDraftProperty()`、`removeCurrentDraftProperty()`。
- Calendar：本轮先只读，除非实现中确认已有稳定单项删除/改 Tx 能力。

## 缓存与性能

成功 mutation 后需要失效或更新：

- Tier summary query。
- 对应来源模块 page data query。
- Pairing page data query，若 Pairing 被修改或删除。
- Pairing set preview state，避免显示旧结果。

性能要求：

- 打开 detail 不额外请求。
- 点击 `Edit Tx` 不额外请求。
- 点击 `Save Tx` / `Delete` 时才加载来源 page data。
- 优先使用 query cache；没有缓存时再请求。
- 不为每个 summary row 额外发请求。

## 并发与错误处理

需要覆盖：

- stale draft version：展示“当前 bid 已被更新，请刷新后再试”类错误，并失效缓存。
- 找不到 source property：展示“Unable to locate the source bid. Refresh the page and try again.”。
- 网络/API 失败：保留当前 detail，显示错误，不吞掉失败。
- 删除成功后 detail 关闭，避免展示已删除对象。
- 保存成功后如果该 item 已不属于当前 Tx，summary 以刷新后的数据为准。

## 旧数据和安全边界

以下情况只读：

- `warningCode` 存在。
- `source !== "currentDraft"`。
- `bidType === "Unsupported"`。
- 任意 tier 不在 `T1-T7`。
- 没有 `editableSource`。
- Calendar item 暂无稳定单项 mutation 能力。

只读不是失败状态。UI 要解释原因，避免客户误以为系统坏了。

## 可访问性与 UI 质量

- 编辑 Tx 使用 toggle/checkbox 语义，不用纯 div click。
- 删除必须有确认步骤。
- 所有按钮有明确 disabled 和 loading 状态。
- 错误信息在 dialog 内可见。
- 不使用大段说明文字压住操作区；按钮文案短、明确。
- 弹层内内容继续容器内滚动，不滚动整个页面。
- `Escape` 关闭 detail 时，如果有未保存 Tx 编辑，先退出编辑态或提示确认，避免误丢状态。

## 文件边界

预计涉及：

- `packages/contracts/pbs-lineholder-summary.d.ts`
- `pbs-server/src/services/lineholder/lineholder-summary-service.ts`
- `pbs-portal/src/features/tier/types.ts`
- `pbs-portal/src/features/tier/tier-draft-mappers.ts`
- `pbs-portal/src/features/tier/tier-detail-selectors.ts`
- `pbs-portal/src/features/tier/tier-editing-actions.ts`（新增）
- `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx`
- `pbs-portal/src/features/tier/components/tier-right-panel.tsx`
- `pbs-portal/src/features/tier/components/tier-right-panel.test.tsx`
- `pbs-portal/src/features/tier/tier-draft-mappers.test.ts`
- `pbs-portal/src/features/tier/tier-detail-selectors.test.ts`
- `docs/test-cases/pbs/tier/2026-05-12-tier-editing.md`

如实现中发现 `packages/contracts/*.d.ts` 是生成/手写约定，需要按项目现有模式最小改动，不引入构建产物噪音。

## 测试计划

### 前端单元测试

- 可编辑 Pairing item 在 detail 中显示 `Edit Tx` / `Delete Bid` / `Go to Pairing`。
- legacy / unsupported item 不显示编辑和删除。
- `Edit Tx` 进入后显示 `T1-T7` toggle。
- 全部 Tx 取消时不能保存。
- 保存 Tx 成功后调用正确来源 service patch，并失效 Tier summary cache。
- 保存 Tx 失败时保留 dialog 和错误信息。
- 删除前需要确认。
- 删除成功后关闭 detail，并失效 Tier summary cache。
- 删除失败时保留 dialog 和错误信息。
- Pairing 修改后清空 pairing set preview state。

### 后端测试

- summary item 对 current draft Pairing / DaysOff / Line 返回 `editableSource`。
- legacy / unsupported / T8+ item 不返回 `editableSource`。
- summary response 不改变现有只读字段语义。

### 回归

- `View Pairing Set` 仍复用 Pairing cache。
- `BID SUMMARY` 和 `TIER REVIEW` 仍在容器内滚动。
- `/pairing`、`/days-off`、`/line` 原有编辑保存链路不受影响。
- 根目录 `npm run verify:pbs` 通过。

## 验收标准

- 客户能在 Tier detail 中修改某条可编辑 bid 的 `T1-T7` 归属并真实保存。
- 客户能在 Tier detail 中删除某条可编辑 bid 并真实保存。
- 保存/删除后的 Tier summary、review、warnings 和 Pairing Set preview 不显示旧数据。
- 只读旧数据有明确原因，不允许误编辑。
- 错误、并发和 loading 状态完整。
- 不新增算法职责，不改 SQL schema，不新增依赖。
- `npm run verify:pbs` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务集中在 Tier detail 状态、来源模块 service 复用、summary contract 和缓存失效，文件之间耦合紧；并行拆分容易同时修改同一批 Tier 文件。
- Suggested split: 不拆分。
- Write boundaries: `packages/contracts/pbs-lineholder-summary.d.ts`、`pbs-server/src/services/lineholder/*`、`pbs-portal/src/features/tier/*`、必要的 Tier QA 文档。
- Conflict risk: 中等。当前 Tier 性能/可读性修正仍在工作树中，继续单人串行能减少冲突。
- Execution gate: 用户确认本 spec 后再开始实现。
