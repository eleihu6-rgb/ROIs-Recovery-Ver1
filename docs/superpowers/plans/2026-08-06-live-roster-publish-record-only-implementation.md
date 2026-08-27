# Live 发布 record-only 实施计划

1. 删除快照 writer、游标、环境变量及配置示例；验证 Live Server 无新增 env 可编译启动。
2. 简化 `applyDiff`：保留 Crew 完整性和范围校验，在同一事务写 adjust、roster_publish、精确成功记录。
3. 将 COMMIT ACK 核实改为 Period、batch、精确 Crew 记录集合和 adjust 数量三态判断。
4. 收紧通用 Schedule Publish service，只允许生成非成功态记录。
5. 调整 PBS Award resolver：移除文件条件，要求非空 Crew/division/base/ac_type 精确范围匹配。
6. 删除/改写快照测试，补 record-only、resolver 和真实 PostgreSQL 契约验证。
7. 同步 lifecycle、QA 与 canonical SQL 注释，执行聚焦测试、build、Playwright 和影响扫描。

不新增 migration，不提交 Git。
