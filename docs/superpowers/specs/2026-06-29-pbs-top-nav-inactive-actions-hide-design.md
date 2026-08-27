# PBS Portal 顶部导航未启用 Action 隐藏设计

## 背景

PBS Portal 顶部导航右侧当前展示了 Notifications 小铃铛和 Settings 齿轮图标，但这两个入口没有实际业务能力：

- Notifications 没有通知面板、数据请求或跳转行为。
- Settings 没有有效页面，历史 `/portal/settings` 仍指向 `/404`。

这会让用户误以为功能已完成但点击无效，降低产品可信度。

## 目标

- 隐藏顶部导航右侧未启用的 Notifications 和 Settings 图标。
- 保留已可用入口：版本号、开发环境 UI Inspector、Log out、头像、用户名。
- 不改变导航主菜单、overflow 菜单、登录态或退出逻辑。

## 实现范围

- 更新 `pbs-portal/src/app/layout/dashboard-top-nav.tsx`，移除未启用按钮和未使用 icon import。
- 更新 `pbs-portal/src/app/layout/dashboard-top-nav.test.tsx`，断言 Notifications / Settings 不再作为可点击按钮出现。
- 更新 PBS navigation 人工测试说明，补充“未启用入口不展示”的验收点。

## 验收标准

- 顶部导航右侧不再显示小铃铛和设置图标。
- Log out 仍可点击并展示确认弹窗。
- 开发环境 UI Inspector 仍按现有开关展示。
- 顶部导航 overflow 菜单行为不回归。
- 单测、lint、build 至少通过相关验证。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动范围很小，集中在单个组件和测试。
- Suggested split: 不拆分。
- Write boundaries: `dashboard-top-nav.tsx`、对应测试与测试文档。
- Conflict risk: 低。
- Execution gate: 用户确认后实施。
