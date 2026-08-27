# 开发上下文（2026-07-29）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-29 08:06:35 UTC
- Wing：`gantt`
- Topic：`data-maintenance-inline-save`
- Title：data-maintenance-inline-save
- Git branch：`main`

## 本轮对话上下文

本轮完成 Gantt Data tab 的 Basic + Crew 统一即时单元格编辑修复：
- 用户指出 Assignment 只是例子，Data 下 Basic 和 Crew 都要统一校验和正确更新。
- 决策：去掉 Data 顶部 Undo/Redo/Validate/Save/Discard 草稿按钮，改成单元格双击编辑 + 即时保存；Add/Copy dialog 保留用于创建/复制行。
- 前端：DataColumnConfig 增加 inputKind/min/max/step/placeholder/helpText/pattern/nullable；data-entity-registry 为 Assignment 比例、时间、整数、颜色、布尔字段补元数据，并对所有 Basic/Crew 表按字段类型推断输入类型。
- 前端：data-validation 增加 parse/format 统一入口，支持 required/maxLength/integer/decimal/percentRatio 0..1/time HH:mm/date/datetime/colorHex/boolean。Assignment Credit % 输入 33 会在保存前提示 Use 0.33 for 33%。
- 前端：DataGrid 支持双击单元格内联编辑，Enter/勾保存，Esc/X 取消，保存前校验；BasicTablePage 和 CrewMasterView 通过 onCellCommit 发送单字段 DataChange：before/after 只包含被改字段。
- 前端：DataEditDialog 的 Add/Copy 也复用相同 parse/validation，避免创建/复制时产生非法值。
- 后端：data-validation-service 增加 Assignment 比例字段 0..1 安全网；data-save-service 将 crew_base/rank/fleet/qualification/team 的 crewId required 校验限定在 create 分支，使 Crew 子表单字段 update 不要求重发 crewId。
- E2E：更新 Data 相关 Playwright，覆盖顶部按钮移除、Assignment 比例输入前校验、Assignment 保存回滚、Crew Team 单字段保存载荷，以及旧 row Edit 测试改为验证无 Edit 按钮和内联编辑入口。
- 验证：gantt Vitest 3 files/7 tests PASS；live-server Vitest 4 files/12 tests PASS；live-server build PASS；gantt build PASS；npm run check:ui PASS，0 hard violations，123 pre-existing warnings；Data E2E 25 tests PASS。
- 注意：GitNexus impact/detect_changes 在当前 Codex 工具集中不可用，未能执行；工作树存在大量无关 dirty files（live-server websocket/bullmq/worker/redis/metrics、engine 等），本任务没有回滚它们。

## 当前工作树快照

### git status --short

```text
A  docs/modules/live-server/redis-resilience-and-alerting.md
 M e2e/tests/gantt/crew-master-multi-id.spec.ts
 M e2e/tests/gantt/data-assignment-edit.spec.ts
 M e2e/tests/gantt/data-tab-integrity.spec.ts
 M e2e/tests/gantt/data-tab-navigation.spec.ts
 M e2e/tests/gantt/data-tab-undo-redo.spec.ts
 M gantt/src/components/data/__tests__/data-edit-dialog-copy.test.tsx
 M gantt/src/components/data/__tests__/data-grid-actions.test.tsx
 M gantt/src/components/data/basic-table-page.tsx
 M gantt/src/components/data/crew-master-view.tsx
 M gantt/src/components/data/data-edit-dialog.tsx
 M gantt/src/components/data/data-grid.tsx
 M gantt/src/components/data/data-toolbar.tsx
 M gantt/src/config/data-entity-registry.ts
 M gantt/src/types/data-maintenance.ts
 M gantt/src/utils/data-validation.ts
A  live-server/src/__tests__/plugins/bullmq.test.ts
A  live-server/src/__tests__/plugins/redis.test.ts
M  live-server/src/__tests__/plugins/websocket-auth.test.ts
 M live-server/src/__tests__/services/data/data-save-service-assignment.test.ts
 M live-server/src/__tests__/services/data/data-save-service-crew-team.test.ts
M  live-server/src/__tests__/services/roster/roster-publish-outbound-service.test.ts
M  live-server/src/__tests__/unit/roster-inbound-worker.test.ts
M  live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
M  live-server/src/plugins/bullmq.ts
M  live-server/src/plugins/redis.ts
M  live-server/src/plugins/websocket.ts
M  live-server/src/routes/scenario/import-pbs-material.ts
 M live-server/src/services/data/data-save-service.ts
 M live-server/src/services/data/data-validation-service.ts
M  live-server/src/services/roster/roster-publish-outbound-service.ts
M  live-server/src/utils/bullmq-redis.ts
M  live-server/src/utils/metrics.ts
M  live-server/src/workers/crew-inbound-worker.ts
M  live-server/src/workers/flight-inbound-worker.ts
M  live-server/src/workers/manday-inbound-worker.ts
M  live-server/src/workers/pairing-inbound-worker.ts
M  live-server/src/workers/partition-manager-worker.ts
M  live-server/src/workers/roster-ground-inbound-worker.ts
M  live-server/src/workers/roster-inbound-worker.ts
M  live-server/src/workers/scenario-legality-sweep.ts
M  live-server/src/workers/violations-init-worker.ts
?? docs/superpowers/specs/2026-07-29-gantt-data-assignment-save-fix.md
?? gantt/src/components/data/__tests__/data-toolbar.test.tsx
?? live-server/src/__tests__/services/data/data-save-service-crew-partial.test.ts
?? live-server/src/__tests__/services/data/data-validation-service-assignment.test.ts
```

### unstaged changed files

```text
e2e/tests/gantt/crew-master-multi-id.spec.ts
e2e/tests/gantt/data-assignment-edit.spec.ts
e2e/tests/gantt/data-tab-integrity.spec.ts
e2e/tests/gantt/data-tab-navigation.spec.ts
e2e/tests/gantt/data-tab-undo-redo.spec.ts
gantt/src/components/data/__tests__/data-edit-dialog-copy.test.tsx
gantt/src/components/data/__tests__/data-grid-actions.test.tsx
gantt/src/components/data/basic-table-page.tsx
gantt/src/components/data/crew-master-view.tsx
gantt/src/components/data/data-edit-dialog.tsx
gantt/src/components/data/data-grid.tsx
gantt/src/components/data/data-toolbar.tsx
gantt/src/config/data-entity-registry.ts
gantt/src/types/data-maintenance.ts
gantt/src/utils/data-validation.ts
live-server/src/__tests__/services/data/data-save-service-assignment.test.ts
live-server/src/__tests__/services/data/data-save-service-crew-team.test.ts
live-server/src/services/data/data-save-service.ts
live-server/src/services/data/data-validation-service.ts
```

### staged files

```text
docs/modules/live-server/redis-resilience-and-alerting.md
live-server/src/__tests__/plugins/bullmq.test.ts
live-server/src/__tests__/plugins/redis.test.ts
live-server/src/__tests__/plugins/websocket-auth.test.ts
live-server/src/__tests__/services/roster/roster-publish-outbound-service.test.ts
live-server/src/__tests__/unit/roster-inbound-worker.test.ts
live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
live-server/src/plugins/bullmq.ts
live-server/src/plugins/redis.ts
live-server/src/plugins/websocket.ts
live-server/src/routes/scenario/import-pbs-material.ts
live-server/src/services/roster/roster-publish-outbound-service.ts
live-server/src/utils/bullmq-redis.ts
live-server/src/utils/metrics.ts
live-server/src/workers/crew-inbound-worker.ts
live-server/src/workers/flight-inbound-worker.ts
live-server/src/workers/manday-inbound-worker.ts
live-server/src/workers/pairing-inbound-worker.ts
live-server/src/workers/partition-manager-worker.ts
live-server/src/workers/roster-ground-inbound-worker.ts
live-server/src/workers/roster-inbound-worker.ts
live-server/src/workers/scenario-legality-sweep.ts
live-server/src/workers/violations-init-worker.ts
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-29-gantt-data-maintenance-inline-save.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
