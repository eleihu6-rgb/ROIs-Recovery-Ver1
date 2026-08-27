# 开发上下文（2026-08-05）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-08-05 03:17:37 UTC
- Wing：`live-server`
- Topic：`import-material-exclusive-mutations`
- Title：Import PBS Material and bulk-delete exclusive mutations
- Git branch：`main`

## 本轮对话上下文

本轮完成 Import PBS Material 与 Live roster 批量删除的跨进程互斥治理：

- 新增 live-server/src/services/lock/mutation-exclusive-service.ts，按 schema 使用 Redis SET NX EX 租约；续租和释放都校验随机 token，锁值不保存 bearer token。
- Import PBS Material 在创建 importId / 后台任务前获取锁；冲突立即返回 HTTP 409，说明当前操作和 owner，并要求用户完成后手动重试。已接受的后台导入通过 heartbeat 持锁到 complete/error，再释放。
- Live roster bulk-delete 在创建 BullMQ job 前获取同一把 schema 级锁；冲突不创建 job、不排队。job 携带非敏感 lease token，worker 在删除、recheck、manday、broadcasting 生命周期内续租并 finally 释放。
- 两个功能共用同一 Redis key，因此会互相阻塞；行为是立即提醒，不是等待或自动执行。
- Import PBS Material 结果详情不再 slice 前三条；errors/warnings 全量渲染在 bounded overflow-y-auto 区域，用户可在关闭弹窗前查看全部信息。
- 前端将 HTTP 409 显示为 warning，保留导入/批量删除对话框，不显示未创建任务的进度条。

验证：
- live-server focused Vitest：4 files / 16 tests passed。
- gantt Import dialog Vitest：1 file / 10 tests passed。
- Playwright focused：scenario-import-pbs-material-progress.spec.ts 与 roster-bulk-delete-async.spec.ts 共 6 tests passed。
- npm run build：live-server passed；gantt passed，只有已有 chunk/dynamic-import warnings。
- npm run check:ui：PASS，0 hard violations，已有 122 warnings。
- git diff --check：passed。

不要把用户工作树中已有的 AGENTS.md、CLAUDE.md、pbs-engine、rule-engine-rs 改动回滚；没有创建 commit。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M e2e/tests/gantt/roster-bulk-delete-async.spec.ts
 M e2e/tests/gantt/scenario-import-pbs-material-progress.spec.ts
 M gantt/src/components/roster/roster-bulk-delete-dialog.tsx
 M gantt/src/components/scenario/__tests__/import-pbs-dialog.test.tsx
 M gantt/src/components/scenario/import-pbs-dialog.tsx
 M gantt/src/components/scenario/scenario-list-panel.tsx
 M live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
 M live-server/src/routes/roster/roster-manday-bulk-delete.test.ts
 M live-server/src/routes/roster/roster.ts
 M live-server/src/routes/scenario/import-pbs-material.ts
 M live-server/src/workers/roster-bulk-delete-worker.test.ts
 M live-server/src/workers/roster-bulk-delete-worker.ts
 M pbs-engine
 M rule-engine-rs
?? docs/superpowers/specs/2026-08-05-import-material-details-and-exclusive-mutations-design.md
?? live-server/src/services/lock/mutation-exclusive-service.test.ts
?? live-server/src/services/lock/mutation-exclusive-service.ts
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
e2e/tests/gantt/roster-bulk-delete-async.spec.ts
e2e/tests/gantt/scenario-import-pbs-material-progress.spec.ts
gantt/src/components/roster/roster-bulk-delete-dialog.tsx
gantt/src/components/scenario/__tests__/import-pbs-dialog.test.tsx
gantt/src/components/scenario/import-pbs-dialog.tsx
gantt/src/components/scenario/scenario-list-panel.tsx
live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
live-server/src/routes/roster/roster-manday-bulk-delete.test.ts
live-server/src/routes/roster/roster.ts
live-server/src/routes/scenario/import-pbs-material.ts
live-server/src/workers/roster-bulk-delete-worker.test.ts
live-server/src/workers/roster-bulk-delete-worker.ts
pbs-engine
rule-engine-rs
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-08-05-live-server-import-material-exclusive-mutations.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
