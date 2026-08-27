# PBS Pairing Search Criteria 来源同步回归测试

## 前置条件

- PBS Portal 可正常进入 Pairing 模块。
- 当前 bid period 有可用于 Search Pairings preview 的 pairing 数据。
- Pairing property catalog 中至少包含一个普通 pairing 条件，例如 `Layover at City`。
- Favorite 列表中至少有一个已保存的 pairing favorite，并且该 favorite 有稳定 `favoriteKey`。
- Existing Pairing Properties 中至少有一个已添加的 pairing property，并且该 property 有稳定 `propertyGroupKey`。

## 测试范围

- `/fpqe/pbs/pairing/search` 页面 `SEARCH CRITERIA` 编辑按钮。
- 从 `ADD PAIRING PROPERTIES` catalog、favorite、`EXISTING PAIRING PROPERTIES` 小眼睛进入 search preview 后的编辑同步行为。
- Search Criteria 弹窗确认 / 取消行为。
- Search Pairings preview 刷新。
- 旧工作台动作移除：`BID THESE PROPERTIES`、`ADD MORE SEARCH CRITERIA`、Search Criteria 行内 favorite/remove 不应出现在该页面。

## 用例 1：搜索页不再显示多条件工作台动作

1. 进入 `/fpqe/pbs/pairing/search`。
2. 查看 `SEARCH CRITERIA` 标题区域和条件行右侧动作。

预期结果：

- 不显示 `BID THESE PROPERTIES`。
- 不显示 `ADD MORE SEARCH CRITERIA`。
- 条件行不显示 favorite / unfavorite 动作。
- 条件行不显示 remove 动作。
- 若有条件，仍显示编辑按钮。

## 用例 2：Catalog 来源只更新当前 preview

1. 从 `ADD PAIRING PROPERTIES` 中选择一个尚未保存的 catalog 条件进入 Search Pairings preview。
2. 点击 `SEARCH CRITERIA` 条件右侧编辑按钮。
3. 修改 bid value。
4. 点击 `UPDATE BID`。

预期结果：

- 弹窗关闭。
- Search Criteria 行显示更新后的 bid summary。
- Search Results 根据新条件刷新。
- 不调用 current draft PATCH。
- 不调用 favorite PATCH。

## 用例 3：Existing 来源编辑同步回原 existing property

1. 从 `EXISTING PAIRING PROPERTIES` 中点击某个条件的小眼睛进入 Search Pairings preview。
2. 点击 `SEARCH CRITERIA` 条件右侧编辑按钮。
3. 修改 bid value。
4. 点击 `UPDATE BID`。

预期结果：

- 请求使用原 `propertyGroupKey` 调用 current draft PATCH。
- 成功后显示 pairing property updated 提示。
- Search Criteria 行显示更新后的 bid summary。
- Search Results 根据新条件刷新。
- 返回 Pairing 页面后，对应 existing property 已更新。

## 用例 4：Favorite 来源编辑同步回原 favorite

1. 从 `FAVORITED PROPERTIES` 中点击某个 favorite 条件的小眼睛进入 Search Pairings preview。
2. 点击 `SEARCH CRITERIA` 条件右侧编辑按钮。
3. 修改 bid value。
4. 点击 `UPDATE BID`。

预期结果：

- 请求使用原 `favoriteKey` 调用 favorite PATCH。
- 成功后显示 favorite updated 提示。
- Search Criteria 行显示更新后的 bid summary。
- Search Results 根据新条件刷新。
- 返回 Pairing 页面后，对应 favorite 已更新。

## 用例 5：Favorite 缺少 stable identity 时阻止同步

1. 构造或使用一个没有 `favoriteKey` 的 favorite preview 来源。
2. 点击 `SEARCH CRITERIA` 条件右侧编辑按钮。
3. 修改 bid value。
4. 点击 `UPDATE BID`。

预期结果：

- 不调用 favorite PATCH。
- 不调用 current draft PATCH。
- 显示 `Unable to update favorite because its saved identity is missing.`。
- Search Criteria 保持原条件，不把 favorite 静默当作 catalog 处理。

## 用例 6：取消编辑不修改条件

1. 从任意来源进入 Search Pairings preview。
2. 点击 `SEARCH CRITERIA` 条件右侧编辑按钮。
3. 修改 bid value。
4. 点击 `CANCEL`。

预期结果：

- 弹窗关闭。
- Search Criteria 行的 bid summary 保持原值。
- Search Results 不因取消操作刷新为新条件结果。
- 不调用任何 PATCH。

## 用例 7：确认编辑时只刷新结果区域

1. 从任意来源进入 Search Pairings preview，并等待初始结果加载完成。
2. 点击 `SEARCH CRITERIA` 条件右侧编辑按钮。
3. 修改 bid value。
4. 点击 `UPDATE BID`。

预期结果：

- Search Criteria 区域保持可见。
- 页面不回到空白 loading shell。
- Search Results 区域显示刷新状态。
- 新结果返回后替换旧结果。
