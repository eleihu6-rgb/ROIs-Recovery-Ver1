# PBS Period 删除四个无效字段实施计划

1. 删除 Gantt Period 页面、年度生成、列表、预览及 API 类型中的四个字段。
2. 删除 Live Server Period schema、响应映射和 SQL 读写，并补旧字段 400 回归。
3. 删除 Live Server、PBS Server 的 Drizzle 字段映射及 schema 定义。
4. 新增幂等 DROP COLUMN migration 文件，但不执行数据库。
5. 更新 Playwright 与人工测试用例。
6. 运行 TypeScript、构建、UI、Period、Tier、Award、算法导出和真实页面回归。
7. 核对 GitNexus 与 diff 范围，不提交 Git，不执行数据库 migration。
