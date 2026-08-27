# PBS Days Off Add 弹窗内选择 Tier 设计

## 背景

当前 `ADD DAYS OFF PROPERTIES` 区域在添加 Days Off property 前，需要先使用外部 TIERS 选择，再点击 `+` 打开 `Configure Days Off Bid` 弹窗配置条件。这个交互把“选择适用 Tier”和“配置 Bid 条件”拆在两个位置，用户添加一个规则时容易感觉流程断裂。

用户明确口径：

- 只调整 `ADD DAYS OFF PROPERTIES` 添加区域。
- `EXISTING DAYS OFF PROPERTIES` 仍然显示每条已添加规则的 tiers，因为它是最终规则展示。
- 左侧日历点击添加 Off 不变，它本来就在弹窗/Popover 中选择 tier。
- Pairing / Line 不在本轮修改范围。

## 目标

- 点击 `ADD DAYS OFF PROPERTIES` 中某个 property 的 `+` 后，在 `Configure Days Off Bid` 弹窗内选择 Tier。
- Add 区域外部 TIERS 不再显示或不再作为添加前置条件。
- 弹窗 Tier 默认选择 `T1`。
- Confirm/Add 时使用弹窗内的 Tier 选择作为 property.tiers。
- Existing property 编辑弹窗也保留/支持 Tier 修改。
- Existing 列表仍展示已添加规则的 tiers。

## 非目标

- 不隐藏 Existing 区域的 tiers。
- 不修改左侧日历快捷 Off 的 Tier 选择逻辑。
- 不修改 Pairing / Line 页面。
- 不改后端 API/schema。
- 不引入新依赖。

## 设计

### Add 流程

1. 用户在 `ADD DAYS OFF PROPERTIES` 中点击 property 的 `+`。
2. 打开 `Configure Days Off Bid` 弹窗。
3. 弹窗中显示 Tier 选择控件，默认选中 `T1`。
4. 用户配置日期、范围、时间窗口等 bid 参数。
5. 点击确认后，前端提交 property draft，tiers 来自弹窗选择。

### Existing 编辑流程

1. 用户点击 Existing property。
2. 打开同一个 `Configure Days Off Bid` 弹窗。
3. 弹窗 Tier 选择默认带入该 Existing property 当前 tiers。
4. 保存后更新该 property 的 tiers 和 bid 参数。

### Add 区域外部 TIERS

`ADD DAYS OFF PROPERTIES` 区域不再显示外部 TIERS 选择。若共享组件目前统一渲染 tiers，需要为 Days Off Add 区域提供局部开关，避免影响 Existing、Pairing、Line。

## 验收标准

- Days Off Add 区域看不到外部 TIERS 选择。
- 点击 Add 打开弹窗后，弹窗内显示 Tier 选择，默认 T1。
- 不改 Tier 时添加 property，提交 tiers 为 `["T1"]`。
- 修改弹窗 Tier 后添加 property，提交用户选择的 tiers。
- Existing 区域仍显示每条 property 的 tiers。
- Existing 点击编辑时弹窗内带入原 tiers，并可修改。
- 左侧日历快捷 Off 的 Tier 选择保持原行为。
- Line 页面测试通过，证明共享布局未被误伤。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是 Days Off 单个添加/编辑交互流，主要集中在同一组前端组件和测试，拆分会增加冲突。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/days-off/`，必要时少量调整共享 rule-bids 组件的 props 和测试。
- Conflict risk: 中等，主要风险是误伤 Existing 展示或 Pairing/Line 共用布局。
- Execution gate: 用户确认本文档后再实现。

## 实施记录

状态：已实施。

- `ADD DAYS OFF PROPERTIES` 区域已隐藏外部 TIERS 选择与 TIERS 表头。
- `Configure Days Off Bid` 弹窗已增加 Tier 选择，默认至少选中 `T1`。
- Add 确认时提交弹窗内的 tiers。
- Existing 编辑弹窗复用同一 Tier 选择，并带入已有 tiers。
- Existing 列表仍显示 tiers。
- 左侧日历快捷 Off 未改动。
- Pairing / Line 未改动。

已验证：

```bash
pnpm --dir pbs-portal test -- days-off-page.test.tsx shared-bidding-workbench-layout.test.tsx line-page.test.tsx
pnpm --dir pbs-portal build
pnpm --dir pbs-portal lint -- src/features/days-off/components/days-off-bid-dialog.tsx src/features/days-off/pages/days-off-page.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/rule-bids/components/rule-bid-property-table.tsx src/features/rule-bids/components/rule-bid-right-panel.tsx
```
