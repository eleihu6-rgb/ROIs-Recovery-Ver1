# Pairing Number 配置弹窗长列表回归测试

## 目标

验证 `Pairing Number` 编辑弹窗在已选择大量 run dates 时仍符合标准弹窗行为：弹窗不越界，底部操作按钮始终可见，已确认 run dates 在弹窗内部滚动。

## 前置条件

- PBS Portal 可正常登录。
- 当前 bid period 允许编辑。
- Pairing 页面存在一条 `Pairing Number` 规则，并且该规则选择了多条 specific date run（建议 20 条以上）。

## 操作步骤

1. 打开 PBS Portal，进入 `Pairing` 页面。
2. 在 `EXISTING PAIRING PROPERTIES` 中找到 `Pairing Number` 规则。
3. 点击该规则右侧的编辑按钮。
4. 观察弹窗标题栏、内容区、`CONFIRMED RUNS` 列表和底部按钮。
5. 在 `CONFIRMED RUNS` 区域内部滚动列表。
6. 点击弹窗右上角 `Close`。
7. 再次打开该规则编辑弹窗，点击背景遮罩和按 `Esc`。

## 预期结果

- 弹窗使用系统标准 `AppDialog` 样式，标题为 `Configure Pairing Number`。
- 弹窗整体位于视口内，不遮挡浏览器顶部，也不把 `UPDATE BID` / `CANCEL` 推到屏幕外。
- `CONFIRMED RUNS` 显示已选数量，例如 `25 selected`。
- 多条 run dates 只在 `CONFIRMED RUNS` 区域内部滚动，弹窗 footer 始终可见。
- 点击右上角 `Close` 可以关闭弹窗。
- 点击背景遮罩或按 `Esc` 不关闭弹窗，避免误丢未保存编辑。

## 边界场景

- 已选择 1 条 run date：不应出现多余空白或错误滚动条。
- 已选择 20 条以上 run dates：弹窗不应超过视口高度。
- 保存中状态：关闭入口不应允许打断 pending 操作。

## 回归范围

- Pairing 页面已有规则编辑。
- Search Pairings 页面 search criteria 编辑。
- `Pairing Number` 的 `Entire Month` / `Specific Date` 切换。
- `ADD BID` / `UPDATE BID` / `SAVE FAVORITE` 的可用性不变。
