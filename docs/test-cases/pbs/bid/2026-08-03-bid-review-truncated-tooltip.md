# Bid Review 截断提示 Tooltip 测试案例

## 前置条件

- 登录 PBS Portal 并进入 `Bid` 页面。
- 当前 Tier 的 `BID REVIEW` 同时包含一条会被截断的长提示和一条可完整显示的短提示。

## 鼠标操作

1. 确认 `BID REVIEW` 保持单行，长提示显示省略号。
2. 鼠标悬停长提示。
3. 确认 Tooltip 显示完整原文，且提示栏高度没有变化。
4. 确认 Tooltip 使用不透明实色背景，后方文字不会穿透。
5. 移开鼠标，确认 Tooltip 关闭。
6. 悬停未截断的短提示，确认不显示 Tooltip。

## 键盘操作

1. 使用 `Tab` 聚焦被截断的长提示。
2. 确认 Tooltip 显示完整原文。
3. 按 `Esc`，确认 Tooltip 关闭且焦点仍留在提示文字上。
4. 再次打开 Tooltip 后按 `Tab` 移出，确认 Tooltip 关闭且焦点正常进入下一个控件。
5. 确认未截断的短提示不会增加额外 Tab 停靠点。

## 缩放与边界

1. 分别在 1920×1080、1366×768 和 1024×768 下检查页面。
2. 确认 Tooltip 是否启用始终由文字实际是否截断决定。
3. 确认 Tooltip 不被工作台边界裁切，也不会触发页面滚动或改变单行布局。
4. 切换 Tier 后确认新提示会重新判断截断状态。

## 回归范围

- `+N more` 按钮和完整 Bid Review 弹层行为不变。
- Existing Bid Properties、Search Pairings 和左侧 Bidding Calendar 布局不变。
- 提示文案、诊断规则和后端接口不变。
