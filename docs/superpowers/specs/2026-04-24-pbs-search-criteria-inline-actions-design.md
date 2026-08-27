# PBS Search Criteria 行内操作设计

日期：2026-04-24
作者：Codex
状态：已实现

## 背景

当前 `/pairing/search` 的 `SEARCH CRITERIA` 只展示从 `ADD PAIRING PROPERTIES` 通过 eye preview 带入的一条条件摘要。用户在看到真实搜索结果后，如果觉得该条件满意，还需要回到 `/pairing` 页面再重新添加同一条 property，操作链路偏绕。

产品上，这条 criteria 已经是一个可投递的 generic pairing rule，因此它应当具备和 `/pairing` 的 `ADD PAIRING PROPERTIES` 行相近的操作能力。

## 目标

把 `/pairing/search` 的单条 `SEARCH CRITERIA` 从只读摘要升级为可操作行：

- 可点击 `+` 将当前 criteria 直接加入当前 Pairing draft
- 可点击爱心收藏 / 取消收藏该 property
- 可编辑当前 criteria 的 bid / award-avoid / any-every
- 可选择 `LAYERS`，决定点击 `+` 时加入哪些 layer
- 编辑后重新触发 search preview，刷新下方结果
- 不显示 eye icon，因为当前页面已经是 preview/search 结果页

## 交互决策

点击 `+` 后：

- 直接保存到当前用户、当前周期、`Current` Pairing draft
- 页面继续停留在 `/pairing/search`
- 用户可以继续查看结果
- 用户如需回到规则编辑器，可点击现有 `ADD MORE SEARCH CRITERIA`

这个决策避免打断搜索结果查看，也符合“看满意后直接加入 draft”的工作流。

## 范围

### 本期包含

- `/pairing/search` 的 `SEARCH CRITERIA` 行展示：
  - property name
  - add button
  - favorite button
  - edit button
  - bid summary / edit control
  - layer toggles
- 使用当前 preview property 作为 criteria 初始状态
- 点击 `+` 后调用现有 Pairing draft 保存链路
- 收藏复用现有 pairing favorite 接口
- 编辑 criteria 后重新调用 `POST /api/pairing-search/preview`

### 本期不包含

- 多条 search criteria
- AND / OR 组合查询
- `BID THESE PROPERTIES` 的真实批量写回
- `Pairing ID` / `Pairing ID on Date` specific bid
- planned absence 冲突日期禁用
- 改造后端 search contract

## 数据与状态

`SearchPairingsPage` 需要在 preview 打开时维护一份本地 criteria 状态：

- `propertyCode`
- `name`
- `action`
- `quantifier`
- `bid`
- `layers`
- `favorited`

其中：

- `propertyCode / name / action / quantifier / bid` 参与 preview search payload
- `layers` 只用于点击 `+` 保存 draft，不参与 search payload
- `favorited` 只影响收藏按钮状态

初始 layer 建议沿用从 `/pairing` 带入的 available property layer 状态；如果路由 state 里没有 layers，则默认 `L1` active。

## UI 规则

- `SEARCH CRITERIA` 表头增加 `LAYERS`
- 行内操作顺序为：`+`、heart、edit
- 不出现 eye icon
- 非编辑态显示 bid summary
- 编辑态复用 `PairingBidControl`，并显示 `MODE`、`QUANTIFIER` 控制
- layer toggle 复用 `LayerToggleGroup`
- 收藏按钮遵循当前已确认行为：取消收藏需要确认弹窗

## 保存行为

点击 `+` 时：

1. 基于当前 criteria 构造一条 `PairingExistingProperty`
2. 合并到当前 draft properties
3. 调用 `pairingService.saveCurrentDraft`
4. 成功后保持在 `/pairing/search`

为避免覆盖用户在 `/pairing` 页面已保存的内容，保存前应读取当前 draft 或使用当前 page data query 中的最新 draft 状态，再追加当前 criteria。

## 验收标准

- 从 `/pairing` 点击 available property 的 eye 进入 `/pairing/search`
- `SEARCH CRITERIA` 行显示 `+ / heart / edit / bid / layers`
- criteria 行不显示 eye icon
- 修改 bid 后重新请求 preview，并刷新结果统计 / 结果列表
- 点击 `+` 后调用当前 Pairing draft 保存链路，并留在 `/pairing/search`
- 点击爱心可收藏，取消收藏仍需要确认
- 现有 search results、pagination、Add More Search Criteria 行为不回退
- 相关 `PairingPage` 与 `SearchPairingsPage` 测试通过
