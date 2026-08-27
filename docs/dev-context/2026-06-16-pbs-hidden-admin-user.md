# 开发上下文（2026-06-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-16 14:01:23 CST
- Wing：`pbs`
- Topic：`hidden-admin-user`
- Title：PBS 隐藏管理员账号
- Git branch：`main`

## 本轮对话上下文

本轮处理 PBS 管理接口调用身份问题。用户指出当前为了调用 `/api/admin/*`，把真实 crew 账号 900 设置成管理员不合理；组员不应该是管理员，应有单独真正管理员账号调用 crew bid import 和 algorithm export 等接口。

已确认并实现的最小方案：
- 不新增复杂 RBAC，也不新增独立管理员表。
- 在 `pbs_user` 内创建隐藏账号 `user_code='admin'`，保留 `crew_id='__admin__'`，`is_admin=1`。
- 真实 crew 账号全部保持普通用户，migration 会把非 `admin` 的 `is_admin=1` 清成 0。
- `/api/admin/*` 仍沿用现有 `request.authUser?.isAdmin === true` 判断。
- Apifox 用 `POST /api/auth/session` 登录 `admin` 后取 token 调用 admin 接口。

主要文件：
- 新增 spec：`docs/superpowers/specs/2026-06-16-pbs-hidden-admin-user-design.md`
- 新增 migration：`sql/migration/2026-06-16-pbs-hidden-admin-user.sql`
- 修改同步脚本：`pbs-server/src/scripts/sync-pbs-users.ts` 和 `sync-pbs-users-core.ts`，跳过 `admin`，避免 live users 同步覆盖/停用隐藏管理员。
- 补测试：`pbs-server/src/services/auth/auth-service.test.ts`、`pbs-server/src/scripts/sync-pbs-users.test.ts`
- 补人工测试文档：crew bid import 和 algorithm export 文档都说明使用隐藏 `admin`，不要把真实 crew 设为 admin。

验证结果：
- 定向测试：`DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/auth/auth-service.test.ts src/scripts/sync-pbs-users.test.ts` 通过，12 tests pass。
- `npm run build` 通过。
- `npm test` 通过，418 tests pass。
- `git diff --check` 通过。

本地数据库状态：尝试应用 migration 到 `localhost:5432` 的 f8_pbs，但本机没有 `psql`，改用 Node pg 连接时发现 PostgreSQL 未监听，错误为 ECONNREFUSED。因此 migration 文件已准备好，但没有实际应用到本机 DB。后续数据库启动后执行 `sql/migration/2026-06-16-pbs-hidden-admin-user.sql` 即可。

## 当前工作树快照

### git status --short

```text
 M docs/test-cases/pbs/algorithm-export/2026-06-01-days-off-export.md
 M docs/test-cases/pbs/import/2026-06-16-crew-bid-txt-import.md
 M pbs-server/src/scripts/sync-pbs-users-core.ts
 M pbs-server/src/scripts/sync-pbs-users.test.ts
 M pbs-server/src/scripts/sync-pbs-users.ts
 M pbs-server/src/services/auth/auth-service.test.ts
?? docs/superpowers/specs/2026-06-16-pbs-hidden-admin-user-design.md
?? sql/migration/2026-06-16-pbs-hidden-admin-user.sql
```

### unstaged changed files

```text
docs/test-cases/pbs/algorithm-export/2026-06-01-days-off-export.md
docs/test-cases/pbs/import/2026-06-16-crew-bid-txt-import.md
pbs-server/src/scripts/sync-pbs-users-core.ts
pbs-server/src/scripts/sync-pbs-users.test.ts
pbs-server/src/scripts/sync-pbs-users.ts
pbs-server/src/services/auth/auth-service.test.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-16-pbs-hidden-admin-user.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
