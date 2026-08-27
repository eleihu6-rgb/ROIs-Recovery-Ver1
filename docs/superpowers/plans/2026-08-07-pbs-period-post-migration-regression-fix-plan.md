# PBS Period Migration 后回归修复实施计划

1. 在 Current Bid 的合并查询中统一 roster Period ID 类型，补充聚焦 SQL 断言。
2. 修正 Award `upcomingPeriod` 的返回语义及 Portal 提示回归断言。
3. 预览 DEV/SIT/UAT 回填候选，以独立事务逐字段回填并核验 24/24/24 条。
4. 使用真实账号验证 Pairing Bid 与 Award API。
5. 运行聚焦测试、Playwright、UI 门禁、TypeScript 编译、四模块构建和 GitNexus 变更审计。
