# PBS Pairing Number 在 ALL PROPERTIES 中置顶设计

## 背景

Pairing 页面中 `Pairing Number` 是高频且核心的 Pairing bid 条件。它同时关联右侧手动添加流程、左侧小日历快速添加 Pairing 的数据语义，以及后续日历展示。当前 `ALL PROPERTIES` 仍按 catalog/filter 结果顺序展示，会让 `Pairing Number` 看起来只是普通条件。

## 目标

- `ALL PROPERTIES` 中，只要 `Pairing Number` 出现在筛选结果里，就始终显示在第一位。
- 搜索或筛选后，如果结果包含 `Pairing Number`，仍保持第一位。
- `FAVORITED PROPERTIES` 不强制置顶，保留收藏快照列表的原有顺序。
- `EXISTING PAIRING PROPERTIES` 不调整顺序，保留用户添加顺序。

## 范围

- 仅修改 `pbs-portal` Pairing 前端列表排序和测试。
- 不修改接口、后端服务、数据库、收藏语义或 Existing 顺序。

## 实现方案

在 `filterPairingAvailableProperties` 完成 tab、keyword、pairing number、pairing type、date range 筛选后，对 `activeTab === "all"` 的结果做稳定排序：

- `propertyCode === 102` 的 `Pairing Number` 排在最前。
- 其他属性保持原有相对顺序。
- `activeTab === "favorited"` 不排序。

## 验收标准

- Pairing `ALL PROPERTIES` 默认列表第一项为 `Pairing Number`。
- 搜索结果包含 `Pairing Number` 时，它仍位于当前结果第一位。
- `FAVORITED PROPERTIES` 顺序不因该规则改变。
- `EXISTING PAIRING PROPERTIES` 顺序不因该规则改变。

## 测试计划

- 单元测试覆盖 `filterPairingAvailableProperties` 的 `ALL PROPERTIES` 置顶规则。
- 单元测试覆盖 `FAVORITED PROPERTIES` 不置顶。
- 运行 Pairing list helper 测试与 Pairing 页面测试。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动很小，集中在前端列表 helper 与测试。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/pairing-property-list.ts` 与相关测试。
- Conflict risk: 低。
- Execution gate: 用户已确认实现。
