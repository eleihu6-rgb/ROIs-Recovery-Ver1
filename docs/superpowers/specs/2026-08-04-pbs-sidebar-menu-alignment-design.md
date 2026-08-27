# PBS 侧边栏菜单对齐修复

## 目标

修复 PBS 侧边栏中 `Period`、`Bid Definitions`、`Admin Tools` 因 `<button>` 默认居中而未与其他模块菜单一致左对齐的问题。

## 方案

- 保留现有 `<button>` 语义和交互，仅将 PBS 菜单文字明确设为左对齐。
- 不修改 Scenario、Live、Data 等其他侧边栏，也不做组件重构。
- 增加或更新一个 Playwright 回归测试，通过真实 PBS 侧边栏验证菜单计算样式为左对齐，并保留点击导航断言。

## 验收标准

- 管理员可见的三个 PBS 菜单标签均紧跟图标并左对齐；非管理员仍不显示 `Bid Definitions`。
- 选中、悬停、折叠及点击行为保持不变。
- 相关测试、Gantt TypeScript 检查和 UI 标准检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单文件局部样式修复，并行协作成本高于收益。
- Suggested split: 无。
- Write boundaries: Gantt 侧边栏组件、对应测试。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后实施。
