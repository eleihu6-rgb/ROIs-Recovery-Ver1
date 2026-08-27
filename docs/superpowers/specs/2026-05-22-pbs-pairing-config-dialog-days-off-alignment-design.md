# PBS Pairing 配置弹窗对齐 Days Off 设计

## 背景

Days Off 配置弹窗的标题区使用两行结构：第一行是弹窗标题，第二行是当前 bid 条件名；内容区第一块是 `TIERS`。Pairing 配置弹窗当前把条件名放在一个 `PROPERTY` 标签块里，视觉上像一个按钮，与 Days Off 不一致，也让用户误以为该字段可操作。

## 目标

- Pairing 配置弹窗标题区对齐 Days Off：
  - 第一行显示 `Configure Pairing Bid`。
  - 第二行显示当前条件名，例如 `Pairing Number`、`Any Landing In Airport`。
- 移除内容区的 `PROPERTY` label 和属性块。
- `TIERS` 移到内容区最顶部。
- `MODE`、`QUANTIFIER`、`BID` 保持现有顺序，位于 `TIERS` 后面。
- 保留现有 `CANCEL / SAVE FAVORITE / ADD BID / UPDATE BID` 行为。

## 范围

- 仅修改 `pbs-portal` Pairing 配置弹窗和相关测试。
- 不修改接口、后端服务、数据库或 Pairing bid 数据语义。
- 弹窗宽度暂不改为 Days Off 的 `620px`，继续保留当前 `760px`，避免 Pairing Number autocomplete 与 tag-list 输入空间变窄。

## 验收标准

- Pairing 弹窗不再显示 `PROPERTY` 标签和属性块。
- 当前条件名显示在 `Configure Pairing Bid` 标题下方。
- `TIERS` 是弹窗内容第一项。
- 新增、收藏、编辑 Existing 都复用该布局。
- 现有 Pairing 配置流程测试通过。

## 测试计划

- 补充/更新 Pairing 页面测试，验证弹窗标题下显示条件名、`PROPERTY` 不出现、`TIERS` 先于 `MODE`/`BID`。
- 运行 Pairing 页面测试和 TypeScript 检查。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 小范围前端弹窗结构调整，主要集中在单个组件和测试。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx` 与 Pairing 页面测试。
- Conflict risk: 低。
- Execution gate: 用户已确认实现。
