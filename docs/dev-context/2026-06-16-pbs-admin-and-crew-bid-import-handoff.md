# 开发上下文（2026-06-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-16 16:08:38 CST
- Wing：`pbs`
- Topic：`admin-and-crew-bid-import-handoff`
- Title：PBS 管理员账号与 Crew Bid 导入接口上下文
- Git branch：`main`

## 本轮对话上下文

本轮主要完成 PBS 管理接口调用身份、隐藏管理员账号、crew bid TXT 导入接口，以及 live/gantt 管理端登录账号准备。

关键背景：
- 用户要把客户正式 crew bid TXT 文件导入 PBS，目标月份 `Jun 2026`，先用 YEG 小范围跑，再准备更大范围。
- Crew bid 导入接口已统一为文件上传，不再支持 JSON `sourceText`。
- 用户要求 `/api/admin/*` 不要再用真实 crew（例如 900）临时设为 admin，而是使用专门管理员账号。
- 用户随后要进入 Gantt 管理端，需要在 live schema `f8.users` 里新增 `lei` 账号，密码 `admin`。

已实现/确认的 PBS crew bid 导入接口：
- 登录 PBS 管理员：`POST /api/auth/session`，使用 `admin / 123456`。
- Dry-run：`POST /api/admin/crew-bid-imports/dry-run`，`multipart/form-data`。
- 正式导入：`POST /api/admin/crew-bid-imports`，同样 `multipart/form-data`，额外 `confirm=true`。
- 文件字段名必须是 `file`。
- 常用字段：`periodCode=Jun 2026`、`sourcePeriodCode=December 2025`、`scopeBase=YEG`、`scopeCrewIds=["247","274"]` 等 JSON 字符串数组、`options` 为 JSON 字符串对象。
- 用户已实际 dry-run 成功：返回 `code=200`、`mode=dry_run`、`status=completed_with_warnings`、`selectedCrew=87`、`readyCrew=87`、`importablePreferenceCount=553`。这说明接口/解析/YEG 范围链路成功，但有 warning：`skippedPreferenceCount=222`、`failedPreferenceCount=86`、`unmatchedPairingCount=67`。

隐藏 PBS admin 账号：
- 新增 migration：`sql/migration/2026-06-16-pbs-hidden-admin-user.sql`。
- 对运行库 `f8_pbs.pbs_user` 已实际执行，创建 `user_code='admin'`、`crew_id='__admin__'`、`is_admin=1`，密码 `123456` 校验通过。
- 同时非 `admin` 的 `pbs_user.is_admin` 已清为 0，避免 900 等真实 crew 继续拥有 admin 权限。
- `pbs-server/src/scripts/sync-pbs-users.ts` 已保护隐藏 `admin`，同步时跳过并且不会停用它。

live/gantt 管理端账号：
- 用户要求在截图对应的 `f8.users` 表中创建账号 `lei`，密码 `admin`。
- 已使用可写连接 `postgresql://f8:...@47.253.173.207:55432/rois?search_path=f8` 写入 `f8.users`，没有改 `f8.crew`。
- `lei` 已存在，`id=21`，`user_code='lei'`，密码 hash 对应明文 `admin`，bcrypt 校验通过。
- 用户随后要求除 `id / user_code / password_hash` 外，其它字段都要和 `admin` 一样。
- 已把 `lei` 的其它字段按 `admin` 对齐，包括：`created_by=system`、`created_at=admin 一样`、`updated_by=system`、`updated_at=admin 一样`、`user_name=System Administrator`、`branch_code=HQ`、`py_abbr=ADMIN`、`gender=M`、`status=0`、`is_admin=1`、`password_access=Y`、`portal_access=Y`、`is_first_login=Y` 等。
- 已同步 `f8.user_profile`，让 `lei` 和 `admin` 一样绑定 `Administrator` profile（profile id 1，`filiale=CCA`、`division=P`）。

重要环境发现：
- `pbs-server` 本机运行在 3002，连接的是 `pbs-server/.env` 的远程 `f8_pbs` 数据库，不是 localhost:5432。
- `live-server/.env` 的 DATABASE_URL 连接曾出现 `Connection terminated unexpectedly`，但 `pbs-server/.env` 的 `SOURCE_DATABASE_URL` 可读 `f8.users`，用 `f8_pbs` 用户读无写权限。
- 真正可写 `f8.users` 的连接是 `f8` 用户到 `47.253.173.207:55432`。
- 本机 `live-server` 3000 当前未启动，所以 live 登录接口没有直接验证，但数据库侧已验证 `lei/admin` 密码 hash。

已运行验证：
- PBS 隐藏 admin 相关：`npm run build` 通过；auth/sync 定向测试 12 个通过；`npm test` 全量 418 个通过；`git diff --check` 通过。
- PBS admin 登录接口实际验证：`POST http://localhost:3002/api/auth/session` 用 `admin/123456` 返回 200，有 token；用 token 调 `/api/admin/algorithm-export` 返回 400 `periodCode is required`，说明认证和 admin 权限已通过。

后续新窗口建议：
1. 先读 `NEXT_CONTEXT.md`。
2. 再读本上下文和 `docs/dev-context/LATEST.md`。
3. 如果继续做 Gantt 管理端，先检查 `gantt`、`live-server`、管理端路由和登录 API。
4. 不要再把真实 crew 账号设置成 admin。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-16-pbs-admin-and-crew-bid-import-handoff.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
