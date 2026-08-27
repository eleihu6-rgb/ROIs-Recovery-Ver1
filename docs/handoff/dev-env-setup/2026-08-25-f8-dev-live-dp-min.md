# f8_dev_live dp_min Migration Run (2026-08-25)

## 背景

UAT 2026-08-24 17:51:42 批量删除失败，dev worktree 的 live-server
(PID 3515691) 抢到 BullMQ 任务，跑 `f8_dev_live.roster_flight` 时
抛 `column rf.dp_min does not exist`。

根因：`f8_dev_live` schema 还没跑 `sql/migration/2026-08-19-roster-dp-min.sql`
这个 migration；UAT schema 已跑，dev schema 没跑——这是 dev/UAT 隔离
缺失的次生问题（redis key 隔离主因由 `REDIS_KEY_PREFIX` 任务修，dp_min
是这个任务附带补的 dev 落后）。

## 跑过的 SQL

```bash
PGPASSWORD='Pier2026AI123' psql -h localhost -U postgres -d rois -c \
  "SET search_path TO f8_dev_live; \
   ALTER TABLE roster_flight ADD COLUMN IF NOT EXISTS dp_min integer; \
   ALTER TABLE roster_publish ADD COLUMN IF NOT EXISTS dp_min integer;"
```

输出：
```
SET
ALTER TABLE
ALTER TABLE
```

## 验证

```sql
SELECT column_name, data_type, ordinal_position
FROM information_schema.columns
WHERE table_schema='f8_dev_live'
  AND table_name='roster_flight'
  AND column_name='dp_min';
```
→ `dp_min | integer | 76`

```sql
-- 同理 roster_publish
```
→ `dp_min | integer | 112`

## 注意事项

- 用 `postgres`（Pier2026AI123）账号跑，不是 `f8_dev_live`——后者没 ALTER 权限。
- `f8_dev_live` 账号的 `search_path` 默认是 `"$user", public`，恰好解析到 `f8_dev_live` schema，但 `f8_dev_live` 账号本身没 DDL 权限。
- 不直接 `psql -f` migration 文件的原因：文件没带 schema 前缀，default search_path 在不同账号下行为不同；用 `SET search_path TO f8_dev_live;` 显式锁死。
- 这是 dev schema 的补救；UAT schema 早已有 dp_min（2026-08-19 当天）。

## 关联

- Spec: `docs/superpowers/specs/2026-08-25-redis-key-prefix-isolation.md`
- Plan: `docs/superpowers/plans/2026-08-25-redis-key-prefix-isolation.md` Task 9
- Migration file: `sql/migration/2026-08-19-roster-dp-min.sql`
