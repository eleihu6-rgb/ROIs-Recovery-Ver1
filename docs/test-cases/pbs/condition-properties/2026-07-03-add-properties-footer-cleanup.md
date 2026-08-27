# PBS Add Properties Footer 清理人工测试用例

## 前置条件

- PBS Portal 可正常登录。
- 当前 period 处于可编辑状态。
- 测试账号至少能访问 Days Off、Pairing、Line、Reserve 页面。

## 测试范围

- Days Off：`ADD DAYS OFF PROPERTIES`
- Pairing：`ADD PAIRING PROPERTIES`
- Line：`ADD LINE PROPERTIES`
- Reserve：`ADD RESERVE BID`

## 用例 1：底部误导按钮已移除

操作步骤：

1. 打开 Days Off 页面。
2. 查看右侧 Add Properties 区域底部。
3. 切换到 Pairing、Line、Reserve 页面重复检查。

预期结果：

- 底部不显示 `Cancel`。
- 底部不显示 `Reset All`。
- `Total N items` 仍显示。
- 分页控件仍显示在底部右侧。

## 用例 2：分页仍可使用

操作步骤：

1. 打开任一 Add Properties 列表条目超过一页的页面。
2. 点击下一页。
3. 使用 `Go to` 输入页码并回车或失焦。

预期结果：

- 页码正常切换。
- 列表内容按页变化。
- 不出现 `Cancel` / `Reset All`。

## 用例 3：搜索和 tab 切换不受影响

操作步骤：

1. 在 Add Properties 搜索框输入关键字。
2. 切换 `FAVORITED PROPERTIES` / `ALL PROPERTIES`。
3. 清空搜索框。

预期结果：

- 搜索结果正常过滤。
- tab 切换正常。
- 清空搜索后列表恢复当前 tab 的默认结果。

## 用例 4：业务保存不受影响

操作步骤：

1. 在 Days Off 添加一个 property。
2. 编辑刚添加的 property。
3. 删除刚添加的 property。

预期结果：

- 新增、编辑、删除都能正常保存。
- 左侧 BIDDING CALENDAR 与右侧 Existing Properties 正常同步。
- footer 按钮移除不影响业务操作。

## 回归关注点

- Add Properties footer 不应再出现误导性清空按钮。
- 分页靠右后不应遮挡或压缩内容。
- Help 文案不应再引导用户使用 `Reset All`。
