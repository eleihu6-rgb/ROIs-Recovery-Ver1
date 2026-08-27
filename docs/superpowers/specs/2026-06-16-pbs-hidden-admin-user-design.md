# PBS 隐藏管理员账号设计

## 背景

当前 PBS 管理接口统一依赖 JWT payload 中的 `isAdmin`。这个标记来自 `pbs_user.is_admin`。为了临时调用 `/api/admin/*`，曾把真实 crew 账号（例如 900）设为管理员，这会污染业务身份：组员不应拥有管理员权限。

## 目标

- 在 `pbs_user` 中创建专用隐藏账号 `admin`。
- `admin.is_admin = 1`，用于 Apifox 和批量导入、算法导出等管理接口。
- 真实 crew 账号恢复普通用户，`is_admin = 0`。
- 不新增登录接口，仍通过 `POST /api/auth/session` 获取 JWT。
- 不引入复杂 RBAC；本次只做最小安全修正。

## 设计

- 新增幂等 migration：`sql/migration/2026-06-16-pbs-hidden-admin-user.sql`。
- `admin` 使用保留 `crew_id = '__admin__'`，明确不是客户 crew id。
- `admin` 使用 `password_access='1'`、`portal_access='1'`、`app_access='0'`，满足现有 PBS 登录校验。
- migration 会把除 `admin` 之外的 `pbs_user.is_admin=1` 清为 `0`。
- PBS 用户同步脚本跳过 `user_code='admin'`，并且不把该账号停用，避免后续同步覆盖隐藏 admin 的密码和权限。

## 接口影响

- `/api/admin/*` 继续使用现有 `request.authUser?.isAdmin === true`。
- Apifox 应使用 `admin` 登录获取 token，再调用导入/导出接口。
- 900 等真实 crew token 调用 `/api/admin/*` 应继续返回 `403`。

## 验收标准

- `admin` 登录成功后 JWT 中 `isAdmin=true`。
- 普通 crew 登录后 JWT 中 `isAdmin=false`。
- 用户同步不会覆盖或停用隐藏 `admin`。
- `POST /api/admin/crew-bid-imports/dry-run` 等接口继续只允许 admin token。
- migration 可重复执行。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 migration、PBS auth 测试和同步脚本保护，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `sql/migration`、`pbs-server/src/services/auth`、`pbs-server/src/scripts`、相关测试和文档。
- Conflict risk: 低。
- Execution gate: 用户已确认采用 `pbs_user` 中隐藏 `admin` 的最小方案。
