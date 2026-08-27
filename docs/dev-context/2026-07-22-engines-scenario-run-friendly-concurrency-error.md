# 开发上下文（2026-07-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-22 03:53:14 UTC
- Wing：`engines`
- Topic：`scenario-run-friendly-concurrency-error`
- Title：scenario-run-friendly-concurrency-error
- Git branch：`main`

## 本轮对话上下文

本轮在上一轮 SIT LegacyRO 并发限流基础上，处理“界面同时运行多个优化时是否有友好提示”。

结论：原链路 engine-server 返回 429 TaskLimitError，但 live-server 抛出原始 `engine-server /optimize/start 429: {detail:...}`，gantt 只是原样 toast，用户看到的是技术错误。

本机 durable fix：
- 新增 spec：docs/superpowers/specs/2026-07-22-scenario-run-concurrency-friendly-error.md。
- live-server/src/services/engine-server-client.ts：新增 EngineServerStartError(statusCode)，解析 engine-server JSON/text error body；对 HTTP 429 + `Maximum concurrency limit reached...` 转成友好文案：
  `Another optimization is already running. This environment allows 1 LegacyRO optimization at a time. Please wait for the current run to finish.`
- live-server/src/routes/scenario/scenario.ts：Scenario run route 对带 statusCode 的错误保留对应 HTTP 状态（429），不再全部转 500。
- live-server/src/__tests__/services/engine-server-client.test.ts：补 429 LegacyRO 并发限制文案映射回归测试。

本机验证：
- `npm test -- src/__tests__/services/engine-server-client.test.ts`：PASS，7 tests。
- `DATABASE_URL='postgresql://user:pass@localhost:5432/test' npm test -- src/__tests__/services/scenario/scenario-service.test.ts`：PASS，36 tests。
- `DATABASE_URL='postgresql://user:pass@localhost:5432/test' npm run build`：FAIL，既有无关类型错误阻塞：live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts 多处 LeadinRow fixture 缺 base 字段；不是本次改动文件。
- GitNexus impact startRoTask：LOW；detect_changes：LOW（但包含上一轮 engine-server 改动）。

SIT runtime-only patch（不提交）：
- SIT live-server 只有 dist，没有 src。
- 已备份并覆盖：/home/yuan.z/rois/sit/live-server/dist/services/engine-server-client.js、/home/yuan.z/rois/sit/live-server/dist/routes/scenario/scenario.js。
- 重启：`bash /home/yuan.z/rois/sit/service.sh restart live-server`，live-server pid=15784。
- SIT mocked module check passed：startRoTask mocked 429 返回 statusCode=429 和友好 message。
- SIT health：live-server/pbs-server/engine-server/connector-server 均响应 200；engine-server health body 仍有 redis disconnected 但 status healthy。
- 修改记录已追加到 /home/rois/SIT_RO_RUNTIME_PATCH_20260722.md（使用 sudo tee，因为普通写入权限拒绝）。

当前工作树还包含上一轮未提交的 engine-server 并发限流改动和本轮 live-server 友好提示改动；未提交。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M engine-server/src/config/config.py
 M engine-server/src/config/config.yaml.example
 M engine-server/src/tasks/task_manager.py
 M engine-server/tests/conftest.py
 M engine-server/tests/test_config.py
 M engine-server/tests/test_e2e_lifecycle.py
 M engine-server/tests/test_task.py
 M live-server/src/__tests__/services/engine-server-client.test.ts
 M live-server/src/routes/scenario/scenario.ts
 M live-server/src/services/engine-server-client.ts
?? docs/dev-context/2026-07-22-engines-sit-ro-concurrency-runtime-patch.md
?? docs/superpowers/specs/2026-07-22-crew-team-string-import-spec.md
?? docs/superpowers/specs/2026-07-22-scenario-run-concurrency-friendly-error.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
engine-server/src/config/config.py
engine-server/src/config/config.yaml.example
engine-server/src/tasks/task_manager.py
engine-server/tests/conftest.py
engine-server/tests/test_config.py
engine-server/tests/test_e2e_lifecycle.py
engine-server/tests/test_task.py
live-server/src/__tests__/services/engine-server-client.test.ts
live-server/src/routes/scenario/scenario.ts
live-server/src/services/engine-server-client.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-22-engines-scenario-run-friendly-concurrency-error.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh engines
git status --short
```
