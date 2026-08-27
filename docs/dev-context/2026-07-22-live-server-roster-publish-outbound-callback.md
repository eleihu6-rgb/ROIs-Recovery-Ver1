# 开发上下文（2026-07-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-22 11:43:23 UTC
- Wing：`live-server`
- Topic：`roster-publish-outbound-callback`
- Title：roster-publish-outbound-callback
- Git branch：`main`

## 本轮对话上下文

本轮继续完成 Publish Roster outbound callback：
- 在 roster_publish_adjust 新增 rp_start、rp_end、old_pair_interface_id、new_pair_interface_id；三个远端 schema f8 / f8_sit_live / f8_uat_live 已执行 sql/migration/2026-07-22-roster-publish-adjust-outbound-fields.sql，校验每边 60 列且新四列存在。
- 更新初始 redesign migration 和 sql/schema/live/02-crew-roster.sql，使从零建表也包含新字段。
- applyDiff 写 adjust 时从 roster_period.rp_start/rp_end 记录 RP 窗口；old/new pairing interface id 分别从 old roster_publish.pairing_id / new roster_flight.pairing_id join pairing.interface_id 取得。
- 新增 live-server/src/services/roster/roster-publish-outbound-service.ts：每批 claim published=0 为 2，按 batch_id 组装 callback payload，POST 到 ROSTER_PUBLISH_OUTBOUND_URL，成功置 1，失败重置 0。
- Payload 规则：requestId=batch_id；rpStart/rpEnd=rp_start/rp_end 日期；飞行任务用 action 对应 old/new pair_interface_id，按 crew+interface id 去重；地面任务逐条按 action 使用 old/new base/start/end/assignment 字段。
- 新增 live-server/src/workers/roster-publish-outbound-worker.ts，并在 live-server/src/index.ts 启动，interval 默认 300000ms，可通过 ROSTER_PUBLISH_OUTBOUND_INTERVAL_MS 配置。
- 新增 env 默认 ROSTER_PUBLISH_OUTBOUND_URL 为用户提供的 AWS endpoint。
验证：
- npm test -- --run src/__tests__/services/roster/roster-publish-service.test.ts src/__tests__/services/roster/roster-publish-outbound-service.test.ts PASS。
- 远端 f8 publish SQL smoke PASS，事务 rollback，无测试数据落库。
- npm run build (live-server) PASS。
- git diff --check PASS。
- GitNexus detect_changes: medium，新增 env/start worker，发布链路影响集中在 RosterPublishRoutes。
注意：rule-engine-rs submodule 仍是用户已有改动，未触碰。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M live-server/src/__tests__/services/roster/roster-publish-service.test.ts
 M live-server/src/config/env.ts
 M live-server/src/index.ts
 M live-server/src/models/roster/roster-publish-adjust.ts
 M live-server/src/services/roster/roster-publish-service.ts
 M rule-engine-rs
 M sql/schema/live/02-crew-roster.sql
?? docs/dev-context/2026-07-22-live-server-roster-publish-adjust-audit.md
?? docs/superpowers/specs/2026-07-22-roster-publish-adjust-audit.md
?? live-server/src/__tests__/services/roster/roster-publish-outbound-service.test.ts
?? live-server/src/services/roster/roster-publish-outbound-service.ts
?? live-server/src/workers/roster-publish-outbound-worker.ts
?? sql/migration/2026-07-22-roster-publish-adjust-outbound-fields.sql
?? sql/migration/2026-07-22-roster-publish-adjust-redesign.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
live-server/src/__tests__/services/roster/roster-publish-service.test.ts
live-server/src/config/env.ts
live-server/src/index.ts
live-server/src/models/roster/roster-publish-adjust.ts
live-server/src/services/roster/roster-publish-service.ts
rule-engine-rs
sql/schema/live/02-crew-roster.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-22-live-server-roster-publish-outbound-callback.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
