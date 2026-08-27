# PBS Portal 顶部导航 overflow 菜单修复设计

## 背景

PBS Portal 顶部导航在宽度不足时会把末尾菜单收进三个点 overflow 入口。当前用户反馈：三个点 hover 时没有小手光标，并且点击后菜单打不开或不可用。

## 目标

- 宽度不足时，三个点入口表现为明确可点击按钮。
- 用户点击三个点后可以打开 overflow 菜单。
- overflow 菜单不被顶部导航缩放画布或 `overflow-hidden` 裁剪。
- 点击 overflow 菜单项后正常跳转并关闭菜单。

## 范围

- 修改 `pbs-portal` 顶部导航实现。
- 更新相关单元测试。
- 增加真实浏览器 Playwright 回归测试。
- 增加 QA 手工测试案例。

## 非目标

- 不重新设计顶部导航视觉。
- 不修改导航项列表和路由定义。
- 不调整登录、认证或页面主体布局。

## 实现方案

- 保持现有 `visibleCount` 和 overflow 计算逻辑。
- 给 overflow 入口补明确的 `cursor-pointer`、测试标识和菜单语义。
- 将 overflow 菜单定位在不会被缩放画布裁剪的位置，使用按钮位置计算菜单坐标。
- 路由变化、窗口 resize、点击菜单项时关闭 overflow 菜单。

## 验收标准

- 窄屏下出现 `More navigation` 按钮，hover/cursor 语义正确。
- 点击 `More navigation` 后显示 overflow 菜单。
- 菜单项可点击并跳转到对应页面。
- 单元测试和 Playwright 回归测试通过。
