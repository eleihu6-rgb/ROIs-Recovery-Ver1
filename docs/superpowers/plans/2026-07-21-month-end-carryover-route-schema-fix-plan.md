# Month-End Carryover 路由校验修复实施计划

1. 在 pairing route schemas 中增加严格的 Month-End Carryover Zod schema，并加入共享 union。
2. 增加 schema、Current property、PREVIEW 和 Standing Bid 回归测试。
3. 运行聚焦测试与 `pbs-server` build；检查实际变更影响范围。

约束：不修改前端 payload、共享 contract、业务校验器或数据库；不执行 Git 提交。
