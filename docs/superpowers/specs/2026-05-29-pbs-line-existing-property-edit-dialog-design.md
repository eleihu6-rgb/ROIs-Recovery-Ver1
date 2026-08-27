# PBS Line Existing Properties 编辑交互优化设计

日期：2026-05-29  
状态：待用户确认  
范围：`pbs-portal` Line 页面右侧 `EXISTING LINE PROPERTIES` 的展示与编辑交互。

## 背景

当前 Line 页面中，已添加条件会直接在 `EXISTING LINE PROPERTIES` 中展示完整 bid 控件。对于 `Commuter Pattern` 这类复杂条件，控件高度较大，会把列表撑开，视觉上不如 Pairing 右侧清爽。

Pairing 的右侧已有成熟模式：

- 已添加条件列表保持紧凑。
- 复杂配置通过编辑 icon 打开弹窗修改。
- 修改确认后再更新当前 draft。

用户希望 Line 也采用相同思路，但只对复杂条件显示编辑入口；简单 `Enabled` 类条件没有必要弹窗。

## 目标

1. `EXISTING LINE PROPERTIES` 保持紧凑，不再让复杂 bid 控件直接撑开列表。
2. Line 复杂条件在已有列表中显示编辑 icon。
3. 点击编辑 icon 后打开 Line 配置弹窗修改当前条件。
4. 简单 `Enabled` 条件不显示编辑 icon，也不弹窗。
5. 行为与 Pairing 右侧已有条件编辑方式保持一致。

## 条件分类

### 简单条件

这些条件显示为 `Enabled`，不需要编辑 icon：

- `401 Max Credit Window`
- `402 Min Credit Window`
- `403 Clear Schedule and Start Next Bid Group`
- `404 No Same Day Pairings`
- `405 Waive No Same Day Duty Starts`

### 复杂条件

这些条件需要编辑 icon，点击后弹窗修改：

- `406 Forget Line`
- `407 Min Base Layover`
- `408 Commuter Pattern`

后续如果 Line 新增复杂 bid 类型，可以继续加入同一判断逻辑。

## 交互设计

### 已有条件列表

`EXISTING LINE PROPERTIES` 中：

- Property 名称继续显示在左侧。
- Delete icon 保持现状。
- 简单条件的 Bid 继续显示只读 `Enabled`。
- 复杂条件的 Bid 不直接展开完整控件。
- 复杂条件显示编辑 icon，点击打开弹窗。

推荐展示方式：

- `Forget Line`：Bid 列显示当前数字摘要，例如 `1`，旁边显示编辑 icon。
- `Min Base Layover`：Bid 列显示当前时间摘要，例如 `013:00`，旁边显示编辑 icon。
- `Commuter Pattern`：Bid 列显示短摘要，例如 `4 off / 4-5 on`，旁边显示编辑 icon。

这样用户能扫描当前值，但不会在表格里展开大控件。

### 编辑弹窗

复用现有 `LineBidDialog`：

- 打开时带入当前 existing property 的 bid 和 tiers。
- 弹窗按钮文案改为更新语义，例如 `UPDATE BID`。
- 不显示 `SAVE FAVORITE`，因为这是修改已有 bid，不是收藏。
- 点击确认后调用现有 Line patch API 更新当前 draft。

## 技术设计

### 前端组件

涉及文件：

- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`
- 必要时扩展 `rule-bid-right-panel` 的现有插槽能力。

实现思路：

1. Line 页面设置 `existingBidEditMode="dialog"` 或等价能力，但不要让所有 Line 条件都显示编辑 icon。
2. 增加 `shouldShowExistingEditAction` 之类的判断能力，或在现有 row 中按 Line 传入策略控制编辑 icon。
3. Line 只对 `406/407/408` 返回 true。
4. `renderExistingPropertyEditDialog` 使用 `LineBidDialog`。
5. `LineBidDialog` 支持 existing property 入参，或者在调用前把 existing property 转成 dialog 所需结构。

### 后端/API

不需要改后端 SQL 或 API：

- 已有 `PATCH /line-bids/current/properties/:propertyGroupKey` 可以更新 bid 和 tiers。
- 本次只改变前端展示和编辑入口。

## 验收标准

1. `Max Credit Window / Min Credit Window / No Same Day Pairings` 等 `Enabled` 条件不显示编辑 icon。
2. `Forget Line / Min Base Layover / Commuter Pattern` 显示编辑 icon。
3. `Commuter Pattern` 在已有列表中不再展开大块 Pattern 控件。
4. 点击复杂条件编辑 icon 后弹出 Line 配置弹窗。
5. 修改并确认后，已有条件更新成功，调用的是现有 patch 逻辑。
6. 删除、tiers、添加条件、收藏条件不受影响。
7. Line 页面相关测试通过，`pbs-portal build` 通过。

## 不做范围

- 不改 Line 后端 SQL。
- 不改 Favorite 语义。
- 不改 Pairing 页面。
- 不新增 Line 条件。
- 不改变简单 `Enabled` 条件的业务含义。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在 Line 前端展示和一个共享 row 组件的小扩展，范围不大，多 agent 协调成本高于收益。
- Suggested split: 不建议拆分。
- Write boundaries: 主要在 `pbs-portal/src/features/line` 与 `pbs-portal/src/features/rule-bids`。
- Conflict risk: Low-Medium。共享 row 组件会影响 DaysOff/Line，需要测试守住现有行为。
- Execution gate: 用户确认本 spec 后再开始实现。
