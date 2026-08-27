# 开发上下文（2026-07-22）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-22 09:36:58 UTC
- Wing：`live-server`
- Topic：`roster-publish-adjust-audit`
- Title：roster-publish-adjust-audit
- Git branch：`main`

## 本轮对话上下文

本轮完成 Publish Roster adjust audit 改造：
- 用户要求 roster_publish_adjust 旧表可直接删除，三个 live schema 为 f8 / f8_sit_live / f8_uat_live。
- 新增 migration: sql/migration/2026-07-22-roster-publish-adjust-redesign.sql，按用户给定新结构 drop/recreate 表，新增 batch/published/crew 索引。
- 已在远端 rois 库三个 schema 执行 migration；执行前旧表 row count 均为 0；执行后每个 schema roster_publish_adjust 为 56 列、4 个索引（含 pkey）。
- 同步更新 sql/schema/live/02-crew-roster.sql 和 Drizzle model live-server/src/models/roster/roster-publish-adjust.ts。
- live-server/src/services/roster/roster-publish-service.ts 的 applyDiff 现在生成单次 apply 共享 batchId，并在同一事务内先写 roster_publish_adjust old/new 快照，再执行原 roster_publish delete/insert；新 adjust 行 published=0，action_type=ADD/UPDATE/DELETE。
- DELETE 通过 publishIds 记录 old snapshot；ADD 只记录 new snapshot；UPDATE 按 roster_id full join old publish/new roster snapshot。
- roster_publish 缺失的旧字段（如 old_base、old actual times）保持 null，不从当前 roster 伪造旧值。
- 保留旧 adjust create/list 接口兼容性，list 排序改为 created_at desc。
验证：
- npm test -- --run src/__tests__/services/roster/roster-publish-service.test.ts PASS。
- 远端 f8 事务 smoke PASS：用不存在测试 key 执行 ADD/UPDATE/DELETE SQL，commit 被拦截为 rollback，无测试数据落库。
- npm run build (live-server) PASS。
- git diff --check PASS。
- GitNexus detect_changes: medium，影响集中在 RosterPublishRoutes 发布流程。
注意：工作树中 rule-engine-rs submodule 仍有用户已有改动，未触碰。

## 当前工作树快照

### git status --short

```text
 M live-server/src/__tests__/services/roster/roster-publish-service.test.ts
 M live-server/src/models/roster/roster-publish-adjust.ts
 M live-server/src/services/roster/roster-publish-service.ts
 M rule-engine-rs
 M sql/schema/live/02-crew-roster.sql
?? docs/superpowers/specs/2026-07-22-roster-publish-adjust-audit.md
?? sql/migration/2026-07-22-roster-publish-adjust-redesign.sql
```

### unstaged changed files

```text
live-server/src/__tests__/services/roster/roster-publish-service.test.ts
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
2. 本文件：`docs/dev-context/2026-07-22-live-server-roster-publish-adjust-audit.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh live-server
git status --short
```
