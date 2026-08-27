# NPBS Default Bid 导入 Standing Bid 实施计划

1. 更新共享导入 contract 与幂等 migration：增加明确的 Current/Standing 导入选项、目标
   context 审计字段，以及按目标 context 区分的 backup 唯一键。
2. 重构 live-server block 选择与准备流程：同一员工同时保留 Current 和 Default；Default
   按 bidType 拆成 StandingLineholder / StandingReserve，保留源 Tier。
3. 增加 Standing 日期裁剪与校验：移除附加绝对日期、跳过 date-only/具体 Pairing/On Date，
   使用数据库 context visibility 和 Standing canonical payload 规则。
4. 扩展写入、快照、run 明细和 rollback：三个目标 context 独立覆盖，员工级原子写入和恢复。
5. 停用 pbs-server 旧导入写入口并返回 410，避免旧的 Current-over-Default 语义继续生效。
6. 更新 Gantt Crew Bid Import 管理界面：使用新选项并展示 source→target context、日期裁剪和
   skipped/blocker 结果。
7. 补充 mapper/service/route/Playwright/QA 测试，运行远端 PostgreSQL 只读 SQL 验证、
   module build/lint/test、UI gate 与完整导入回归。
