# PBS All Pairings 已添加条件撤销设计

## 背景

在 Pairing 页进入 `All Pairings` 搜索后，用户可以从搜索结果里点击 `ADD PAIRING`，把某个 pairing 作为 `Pairing Number` 条件加入当前 bid draft。当前页面会在 `SEARCH CRITERIA` 区域展示本次已添加的 pairing，但没有撤销入口；如果用户手抖添加错了，只能回到 Pairing 页的 Existing Pairing Properties 再删除，流程不顺。

## 目标

- 在 `Search Pairings` 页面已添加的 `SEARCH CRITERIA` 行上提供删除按钮。
- 删除不是只隐藏页面行，而是撤销刚刚写入 draft 的对应 `Pairing Number` 条件。
- 删除成功后同步刷新 Pairing 页缓存和左侧日历，避免页面仍显示误加的 pairing。

## 范围

- 仅处理 `All Pairings` 页面中通过 `ADD PAIRING` 添加出来的临时 criteria 行。
- 不改变普通 Criteria Search、Current Rules Preview 的既有行为。
- 不新增确认弹窗；该操作用于纠错，删除图标点击后直接执行。
- 不改 pairing 搜索结果过滤、排序、分页逻辑。

## 交互设计

- `SEARCH CRITERIA` 表格中，当存在本次添加的 pairing 条件时，在行内显示已有的删除图标按钮。
- 点击删除：
  - 禁用该行相关操作，避免重复点击。
  - 调用当前 draft property 删除接口。
  - 成功后从 `addedAllPairingCriteriaItems` 中移除该行。
  - 同步更新 `pairingPageDataQueryKey` 缓存中的 `existingProperties`。
  - 调用 `invalidatePairingCalendarQueries()`，刷新左侧日历。
  - 失败时保留该行并显示错误提示。

## 数据与状态

已添加行需要保存 `propertyGroupKey`，因为后端删除 draft property 依赖这个 key。当前 add 成功后已经能拿到 `result.propertyGroupKey`，需要把它放进本地 added criteria 的可追踪状态中，删除时使用。

## 测试

- 增加/更新 `SearchPairingsPage` 测试：
  - 从 All Pairings 添加一个 pairing 后，`SEARCH CRITERIA` 出现该条件和删除按钮。
  - 点击删除按钮会调用删除 draft property 接口。
  - 删除成功后该 criteria 行消失。
  - 删除成功后触发 Pairing 页缓存/日历刷新相关逻辑。

## 验收标准

- 用户在 All Pairings 搜索页误加 pairing 后，可以在同页删除。
- 删除后回 Pairing 页不再看到该误加 pairing 条件。
- 左侧日历不再显示该误加 pairing 对应的色块。
- 普通搜索条件、Current Rules Preview 不出现回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 pbs-portal 的 Search Pairings 页面和对应测试，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`、相关 pairing search 测试，必要时扩展局部类型。
- Conflict risk: 低，但当前工作区已有大量待提交 pairing 改动，实施时需要避免误改无关文件。
- Execution gate: 用户确认本 spec 后再进入实现。
