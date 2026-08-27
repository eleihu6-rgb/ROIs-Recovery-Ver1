# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 07:49:36 UTC
- Wing：`gantt`
- Topic：`import-pbs-material-progress-history`
- Title：import-pbs-material-progress-history
- Git branch：`main`

## 本轮对话上下文

本轮修复 Import PBS Material 进度条晚订阅/快照恢复问题。

用户反馈：SIT 重新导入 Crew 后进度条仍看不到正确变化，之前重启服务未解决；现有 Playwright 没有抓住真实问题。

根因结论：
- Import PBS Material 的进度事件跨两个进程发布：connector-server 发布 fetch/transform/enqueue，live-server worker 发布 write。
- 之前 Redis `import:state:<id>` 只保存最后一条事件；SSE 晚订阅时只能拿到单个 snapshot，前端 reducer 无法还原已完成的 fetch/transform/enqueue 阶段，进度条会卡住或直接跳到完成。
- 组件测试只 mock `progress` prop，不能证明真实 UI 入口、SSE、Redis snapshot 链路正确。

代码改动：
- connector-server 和 live-server 的 `types/import-progress.ts` 新增 `importProgressHistoryKey()` 与 `IMPORT_PROGRESS_HISTORY_MAX_EVENTS=200`。
- connector-server 和 live-server 的 `utils/import-progress-bus.ts` 在 publish 时保留原 `import:state:<id>` last-event 兼容，同时向 Redis list `import:history:<id>` RPUSH 事件、LTRIM 到 200、设置 TTL；started 事件会清空旧 history。
- live-server `routes/scenario/import-pbs-material.ts` 的 SSE events endpoint 新连接时先重放完整 cached history，若最后事件是 complete/error 则直接结束，否则继续订阅 live channel。
- 新增/更新单测：live-server SSE late subscription 重放多条事件；gantt reducer 根据重放 history 恢复到 write 进度；progress key 测试覆盖 history key。
- 新增 Playwright：`Scen-2451 — Import PBS Material replays progress history for a late SSE subscription`，从真实 Import PBS Material dialog 点击 Confirm，走 SSE body，断言进度进入 Writing database 且 progress bar >80。
- 更新 `docs/modules/gantt/live-scenario-gantt-playbook.md` gotcha：Import PBS Material progress 是跨进程 SSE history，回归必须测真实 dialog + SSE endpoint，不只测 mock progress prop。

验证：
- GitNexus analyze 已重建索引；impact：publish/read progress 和 reducer 均 LOW。
- `npm --prefix live-server test -- --run src/__tests__/unit/import-progress-bus.test.ts src/__tests__/unit/scenario-import-pbs-material-route.test.ts` PASS 7/7。
- `npm --prefix gantt test -- --run src/services/__tests__/import-pbs-progress.test.ts src/components/scenario/__tests__/import-pbs-dialog.test.tsx` PASS 15/15。
- `npm --prefix connector-server test -- --run src/__tests__/unit/f8-import-progress.test.ts` PASS 3/3。
- Playwright root invocation failed due dual @playwright/test package; rerun from `e2e/` succeeded: `npx playwright test --config=config/playwright.config.ts --project=gantt tests/gantt/scenario-import-pbs-material-progress.spec.ts --reporter=list` PASS 3/3 including setup.
- `npm --prefix connector-server run build` PASS.
- `npm --prefix live-server run build` PASS.
- `npm --prefix gantt run build` PASS, only existing Vite chunk/dynamic-import warnings.
- `npm run check:ui` PASS, 0 hard violations, 132 existing warnings.
- `git diff --check` PASS.
- `node .gitnexus/run.cjs detect-changes --scope all` risk LOW, 0 affected processes.

Notes:
- Current worktree still shows pre-existing dirty `e2e/test-results/.last-run.json`, untracked e2e test result dirs, and modified `pbs-engine` submodule; do not treat them as this feature's source changes.
- Crew full-load single-call behavior was discussed but not implemented in this turn; this turn focused on the progress bar root cause and true coverage.

## 当前工作树快照

### git status --short

```text
 M connector-server/src/types/import-progress.ts
 M connector-server/src/utils/import-progress-bus.ts
 M docs/modules/gantt/live-scenario-gantt-playbook.md
 M e2e/test-results/.last-run.json
 M e2e/tests/gantt/scenario-import-pbs-material-progress.spec.ts
 M gantt/src/services/__tests__/import-pbs-progress.test.ts
 M live-server/src/__tests__/unit/import-progress-bus.test.ts
 M live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
 M live-server/src/routes/scenario/import-pbs-material.ts
 M live-server/src/types/import-progress.ts
 M live-server/src/utils/import-progress-bus.ts
 m pbs-engine
?? e2e/test-results/tests-gantt-scenario-po-ba-21116--Division-has-no-All-option/
?? e2e/test-results/tests-gantt-scenario-po-ba-742d3-lt-P-and-Bases-multi-select/
?? e2e/test-results/tests-gantt-scenario-po-ba-d9dbd-sist-after-Save-and-re-open/
```

### unstaged changed files

```text
connector-server/src/types/import-progress.ts
connector-server/src/utils/import-progress-bus.ts
docs/modules/gantt/live-scenario-gantt-playbook.md
e2e/test-results/.last-run.json
e2e/tests/gantt/scenario-import-pbs-material-progress.spec.ts
gantt/src/services/__tests__/import-pbs-progress.test.ts
live-server/src/__tests__/unit/import-progress-bus.test.ts
live-server/src/__tests__/unit/scenario-import-pbs-material-route.test.ts
live-server/src/routes/scenario/import-pbs-material.ts
live-server/src/types/import-progress.ts
live-server/src/utils/import-progress-bus.ts
pbs-engine
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-16-gantt-import-pbs-material-progress-history.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
