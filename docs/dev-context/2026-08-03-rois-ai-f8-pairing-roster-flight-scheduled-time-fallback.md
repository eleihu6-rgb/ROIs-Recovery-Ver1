# 开发上下文（2026-08-03）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-08-03 07:04:37 UTC
- Wing：`rois-ai`
- Topic：`f8-pairing-roster-flight-scheduled-time-fallback`
- Title：f8-pairing-roster-flight-scheduled-time-fallback
- Git branch：`main`

## 本轮对话上下文

本轮修复 F8 导入中 scheduled time 被 actual time 污染的问题。

背景：SIT 上 pairing_id=12676 的 pairing_segment sch_str_dt_utc/sch_end_dt_utc 与 act_str_dt_utc/act_end_dt_utc 一致，但 flight.id=11857 中计划时间正确。用户要求 connector-server pairing 导入在 API JSON 没有计划时间时关联 flight 并取 flight 计划时间；随后追问 roster_flight 是否也有类似问题。

设计/spec：docs/superpowers/specs/2026-08-03-f8-pairing-segment-scheduled-time-fallback.md

代码改动：
- connector-server/src/transform/f8/db/transform-pairing.ts：segment sch* 优先 schStrDtUtc/sch_str_dt_utc/stdUtc、schEndDtUtc/sch_end_dt_utc/staUtc；最后才 fallback act* / duty act，保持 NOT NULL 和 OBDO/合成 flight 兼容。
- live-server/src/workers/pairing-inbound-worker.ts：flight lookup map 从 id 扩展为 id + sch_dep_dt_utc/sch_arv_dt_utc；pairing_segment INSERT 在 flt_id 解析成功时写 flight scheduled time，fallback segment sch*。
- live-server/src/workers/roster-inbound-worker.ts：读取 pairing_segment 时 LEFT JOIN flight，roster_flight INSERT 在 linked flight schedule 存在时写 flight.sch_dep_dt_utc/sch_arv_dt_utc，fallback pairing_segment sch*；act* 保持来自 pairing_segment。

测试：
- connector-server: npm test -- --run src/__tests__/unit/transform-pairing-db.test.ts PASS (13 tests)
- connector-server: npm run build PASS
- live-server: npm test -- --run src/__tests__/unit/pairing-inbound-worker.test.ts PASS (8 tests)
- live-server: npm test -- --run src/__tests__/unit/roster-inbound-worker.test.ts PASS (9 tests)
- live-server: npm test -- --run src/__tests__/unit/pairing-inbound-worker.test.ts src/__tests__/unit/roster-inbound-worker.test.ts PASS (17 tests)
- live-server: npm run build PASS
- git diff --check PASS
- GitNexus impact for transformF8Pairings/processPairingImportJob/processRosterImportJob all LOW.
- GitNexus detect-changes on whole dirty worktree reports HIGH because unrelated existing/concurrent scenario/deploy/submodule modifications are present; do not attribute those to this fix.

No SIT data repair was executed. Existing bad rows such as pairing_id=12676 / flight.id=11857 still need a one-off DB backfill or re-import after deployment if the team wants current SIT data corrected.

## 当前工作树快照

### git status --short

```text
 M connector-server/src/__tests__/unit/transform-pairing-db.test.ts
 M connector-server/src/transform/f8/db/transform-pairing.ts
 M deploy/sit/CONFIG.md
 M deploy/sit/auto-deploy.sh
 M deploy/sit/deploy.sh
 M deploy/sit/env/engine-server.env.example
 M live-server/src/__tests__/services/scenario/scenario-result-service.test.ts
 M live-server/src/__tests__/unit/pairing-inbound-worker.test.ts
 M live-server/src/__tests__/unit/roster-inbound-worker.test.ts
 M live-server/src/routes/scenario/scenario.ts
 M live-server/src/services/scenario/scenario-result-service.ts
 M live-server/src/workers/pairing-inbound-worker.ts
 M live-server/src/workers/roster-inbound-worker.ts
 M pbs-engine
 M rule-engine-rs
?? docs/superpowers/specs/2026-08-03-f8-pairing-segment-scheduled-time-fallback.md
```

### unstaged changed files

```text
connector-server/src/__tests__/unit/transform-pairing-db.test.ts
connector-server/src/transform/f8/db/transform-pairing.ts
deploy/sit/CONFIG.md
deploy/sit/auto-deploy.sh
deploy/sit/deploy.sh
deploy/sit/env/engine-server.env.example
live-server/src/__tests__/services/scenario/scenario-result-service.test.ts
live-server/src/__tests__/unit/pairing-inbound-worker.test.ts
live-server/src/__tests__/unit/roster-inbound-worker.test.ts
live-server/src/routes/scenario/scenario.ts
live-server/src/services/scenario/scenario-result-service.ts
live-server/src/workers/pairing-inbound-worker.ts
live-server/src/workers/roster-inbound-worker.ts
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
2. 本文件：`docs/dev-context/2026-08-03-rois-ai-f8-pairing-roster-flight-scheduled-time-fallback.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
