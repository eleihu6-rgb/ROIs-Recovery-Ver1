# 开发上下文（2026-07-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-22 14:17:40 UTC
- Wing：`live-server`
- Topic：`scheduler-admin`
- Title：scheduler-admin
- Git branch：`main`

## 本轮对话上下文

本轮完成 live-server 轻量 XXL-JOB 风格 scheduler admin 第一版：
- 新增 spec: docs/superpowers/specs/2026-07-22-live-server-scheduler-admin.md。
- 新增 migration: sql/migration/2026-07-22-live-server-scheduler-admin.sql，并同步 sql/schema/live/06-connector.sql。
- 三个远端 schema f8 / f8_sit_live / f8_uat_live 已执行 migration，创建 scheduler_job / scheduler_job_run，并 seed 三条默认任务：roster_publish_outbound、partition_manager、scenario_legality_sweep。
- 新增 live-server/src/services/scheduler/scheduler-service.ts：默认任务 ensure、list、enable/disable、updateSchedule、manual run、due tick、run history、简单 cron/fixed_delay next_run_at 计算、运行锁防重入。
- 新增 Admin API live-server/src/routes/admin/scheduler.ts：
  GET /api/admin/scheduler/jobs
  POST /api/admin/scheduler/jobs/:jobCode/enable
  POST /api/admin/scheduler/jobs/:jobCode/disable
  PATCH /api/admin/scheduler/jobs/:jobCode/schedule
  POST /api/admin/scheduler/jobs/:jobCode/run
  GET /api/admin/scheduler/jobs/:jobCode/runs
- 修改 live-server/src/index.ts：创建 schedulerService 并 decorate；把 roster_publish_outbound 接入 scheduler；partition_manager/scenario_legality_sweep 改为 scheduler 触发 BullMQ queue；启动时清理旧 BullMQ repeat jobs，避免重复触发。
- 删除旧 live-server/src/workers/roster-publish-outbound-worker.ts，避免双入口。
验证：
- npm test -- --run src/__tests__/services/scheduler/scheduler-service.test.ts src/routes/admin/scheduler.test.ts src/__tests__/services/roster/roster-publish-outbound-service.test.ts PASS。
- npm run build (live-server) PASS。
- git diff --check PASS。
- 远端 DB 校验：三个 schema 都有三条默认 scheduler_job。
注意：未 commit；rule-engine-rs submodule 仍是用户已有改动，未触碰。

## 当前工作树快照

### git status --short

```text
 M live-server/src/config/env.ts
 M live-server/src/index.ts
 D live-server/src/workers/roster-publish-outbound-worker.ts
 M rule-engine-rs
 M sql/schema/live/06-connector.sql
?? docs/superpowers/specs/2026-07-22-live-server-scheduler-admin.md
?? live-server/src/__tests__/services/scheduler/
?? live-server/src/routes/admin/scheduler.test.ts
?? live-server/src/routes/admin/scheduler.ts
?? live-server/src/services/scheduler/
?? sql/migration/2026-07-22-live-server-scheduler-admin.sql
```

### unstaged changed files

```text
live-server/src/config/env.ts
live-server/src/index.ts
live-server/src/workers/roster-publish-outbound-worker.ts
rule-engine-rs
sql/schema/live/06-connector.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-22-live-server-scheduler-admin.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
