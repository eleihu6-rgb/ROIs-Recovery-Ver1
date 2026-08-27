# PBS Period 移除 Roster Period ID 手工输入实施计划

1. 更新 Gantt Period Admin 类型与 Add/Edit 表单，删除 `rosterPeriodId` 请求字段和输入框。
2. 更新 Live Server Period Admin 请求/响应契约；旧请求携带 `rosterPeriodId` 时返回 `400`。
3. 保留后端按 `Period Code` 匹配或创建 `roster_period` 的现有逻辑，编辑继续使用 URL `:id`。
4. 更新 focused Vitest 与 Playwright，验证字段消失、请求体不含该字段、自动绑定和保存正常。
5. 运行 TypeScript、生产构建、`npm run check:ui`、`git diff --check` 和 GitNexus 变更检查。

本次不修改数据库，不执行 migration，未经用户再次授权不创建 Git commit。
