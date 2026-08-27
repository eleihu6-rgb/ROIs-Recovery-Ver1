# PBS All Pairings 每页数量选择测试案例

## 前置条件

- 使用具有 Pairing Bid 权限的 Crew 登录 PBS Portal。
- 当前 Bid Period 至少存在 101 个可用 Pairing。

## 主流程

1. 进入 Pairing 页面并点击 `ALL PAIRINGS`。
2. 确认分页下拉默认显示 `30/Page`。
3. 切换为 `50/Page`。
4. 翻到非第一页，再切换为 `100/Page`。
5. 切回 `30/Page`。

## 预期结果

- 下拉包含 `30/Page`、`50/Page`、`100/Page`。
- 每次切换都回到第 1 页，并按所选数量重新请求结果。
- 总页数、页码、左右翻页和 Go to 与当前每页数量一致。
- 快速连续切换时最终结果与最后选择一致。
- 请求失败时保留最后成功结果，并使用既有页面错误状态。
- Current Rules 和单 Property Preview 不显示可编辑的每页数量选择器。
