# ROIS-AI 安全审计第二阶段修复设计

日期：2026-07-07
阶段：Phase 2 / P1 认证与会话一致性
范围：`live-server`、`gantt`、`pbs-server`、`pbs-portal`、认证契约、会话撤销、PBS SSO URL token 缓解
总路线参考：`docs/superpowers/plans/2026-07-07-security-audit-remediation-roadmap.md`
上一阶段参考：`docs/superpowers/specs/2026-07-07-security-audit-phase-1-hardening-design.md`

## 背景

第一阶段已经关闭了高风险快速项：

1. `live-server` WebSocket 已要求 JWT 首帧鉴权，不再信任客户端自报 `schema/userId`。
2. `gantt` 登录页已移除明文测试密码。
3. `pbs-server` / `pbs-portal` 生产依赖审计已清零。

第二阶段处理认证与会话一致性问题。当前主要缺口是：JWT 一旦签发，在过期前主要只靠签名和过期时间判断有效；logout、禁用账号、改密、权限收回不能稳定让旧 token 立即失效。另一个风险是 PBS SSO 仍通过 URL token 完成登录，token 可能短暂出现在地址栏、浏览器历史、代理日志或 Referer 中。

本阶段目标是先在当前 `JWT + Bearer` 架构下补齐服务端可撤销能力和登录策略一致性，不直接把前端 token 存储整体迁到 HttpOnly Cookie。

## 目标

1. `pbs-server` 已有 `pbs_user.token_version` 字段，必须真正用于 JWT 签发、auth hook 校验和 logout 撤销。
2. `live-server` 为 `users` 增加同等的 `token_version` 能力，支持 logout / 禁用 / 改密后的旧 token 失效。
3. `pbs-server` 和 `live-server` 的受保护接口不能只验证 JWT 签名，还必须验证用户当前状态、访问权限、生效期和 token version。
4. `live-server` 登录失败信息统一，避免用户名枚举。
5. PBS SSO URL token 做短期缓解：读取后立即清理地址栏和 history entry，失败态也不继续保留 token。
6. 保持现有用户登录、会话恢复、登出、PBS Portal、Gantt 主流程可用。
7. 补齐后端 auth 测试、前端认证流程测试和必要的 QA 人工测试案例。

## 非目标

- 不在本阶段迁移到 HttpOnly Cookie + CSRF 双提交或 SameSite 会话体系。
- 不引入 OAuth/OIDC 完整 authorization code + PKCE 流程；只为后续迁移预留设计说明。
- 不改变现有 PBS / Gantt 页面权限模型，只修认证有效性和会话失效。
- 不引入新认证依赖或第三方 SSO SDK。
- 不改业务数据权限，例如 crew search 可见范围；这属于后续输入输出安全阶段。
- 不在文档或测试中写入真实密码、生产 token、数据库连接串。

## 当前问题确认

### 1. pbs-server token_version 没有生效

当前事实：

- `sql/schema/pbs/01-pbs.sql` 和 `pbs-server/src/models/pbs/pbs-user.ts` 已有 `token_version`。
- `pbs-server/src/services/auth/auth-service.ts` 登录签发 JWT 时没有写入 `tokenVersion`。
- `pbs-server/src/plugins/auth.ts` 只 `jwt.verify`，没有查询当前 `pbs_user` 状态，也没有比较 `token_version`。
- `pbs-server/src/services/auth/auth-service.ts` 的 `logout` 当前是 no-op。

风险：

- logout 后旧 token 仍可继续访问接口，直到 JWT 过期。
- 管理员禁用账号、撤销 portal/password access、改密或强制下线后，旧 token 仍可继续访问接口。
- 多实例部署下只靠前端清 token，无法形成服务端一致行为。

### 2. live-server 登录和 auth hook 缺少当前状态校验

当前事实：

- `live-server/src/routes/auth/auth.ts` 用户不存在和密码错误返回不同消息。
- 登录时未完整校验 `users.status`、`eff_dt`、`exp_dt`、`password_access`、`portal_access`。
- `live-server/src/plugins/auth.ts` 只 verify JWT，不查 DB 当前状态。
- `live-server` 的 `users` 表当前没有 `token_version`。

风险：

- 登录接口可被用于用户名枚举。
- 已禁用、过期、无访问权限账号可能仍可登录或继续使用旧 token。
- Gantt / live-server 受保护 API 无法支持服务端 logout、改密失效和强制下线。

### 3. PBS SSO URL token 暴露面

当前事实：

- `pbs-portal/src/features/auth/pages/login-page.tsx` 读取 `/login?token=...` 并调用 SSO callback。
- legacy `/auth/callback?token=...` 会重定向到 `/login?token=...`。
- 测试当前还断言失败时 `window.location.search` 仍为 `?token=err`。

风险：

- token 可能短暂保留在地址栏、浏览器历史、截图、代理访问日志或 Referer 中。
- SSO 失败时 token 继续留在 URL，暴露时间更长。

### 4. 前端 token 仍是 JS-readable storage

当前事实：

- `gantt` 使用 `sessionStorage` 保存 `rois-auth`。
- `pbs-portal` 使用 `sessionStorage` 保存 `pbs-portal.auth.token`。

风险：

- 一旦存在 XSS，token 可被读取。

本阶段处理策略：

- 不直接迁移存储介质。
- 先通过服务端 token version、logout 撤销、短有效期、URL token 清理降低 token 被盗后的有效窗口。
- HttpOnly Cookie + CSRF 作为后续单独阶段评估。

## 方案比较

### 方案 A：只缩短 JWT TTL

做法：

- 将 JWT 有效期从当前配置缩短。
- logout 仍只清前端 token。

优点：

- 改动最小。
- 不涉及 schema 或 DB 查询。

缺点：

- logout 仍无法服务端撤销。
- 禁用账号、改密、强制下线仍不能即时生效。
- 审计问题没有被实质关闭。

结论：不推荐。

### 方案 B：Redis JWT denylist / jti 黑名单

做法：

- JWT 中加入 `jti`。
- logout 时把 `jti` 写入 Redis denylist，TTL 到 JWT 过期。
- auth hook 校验 `jti` 是否被撤销。

优点：

- 可以做到单 token logout。
- 不一定需要改用户表。

缺点：

- 禁用账号、改密、权限收回仍需要额外 DB 状态校验。
- 多实例依赖 Redis；Redis 丢失时撤销状态可能丢失。
- 需要管理 per-token 记录，复杂度高于当前需求。

结论：可作为后续“单设备/单会话 logout”增强，不作为第二阶段主方案。

### 方案 C：用户级 token_version / session_version（推荐）

做法：

- JWT payload 带当前 `tokenVersion`。
- 每次 auth hook 校验 JWT 后，从 DB/Redis auth snapshot 读取用户当前 `token_version`、状态、权限、生效期。
- payload version 与 DB version 不一致则拒绝。
- logout、改密、禁用账号、强制下线时递增 `token_version`，让旧 token 失效。

优点：

- 与 PBS schema 和模块规范一致。
- 多实例下以 DB 为权威，Redis 只做性能缓存。
- 能同时覆盖 logout、禁用、改密、强制下线。
- 实现和测试都比较直接。

缺点：

- 默认是“用户级撤销”：logout 会让该用户所有旧 token 失效，不是单设备 logout。
- `live-server` 需要 schema / migration / Drizzle model 变更。
- auth hook 需要 DB/Redis 读取，必须注意性能和缓存失效。

结论：第二阶段采用方案 C。单 token `jti` denylist 和 HttpOnly Cookie 迁移留到后续阶段。

## 修复设计

### A. 统一 token_version 机制

#### A1. JWT payload 扩展

`pbs-server` 和 `live-server` 的 JWT payload 增加：

```ts
tokenVersion: number
```

规则：

- 登录成功时从当前用户行读取 `token_version`。
- 签发 JWT 时写入 payload。
- `request.authUser` 中保留 `tokenVersion`，方便 route / service 需要时使用。
- 旧 token 缺少 `tokenVersion` 时一律视为无效，要求重新登录。

#### A2. pbs-server 使用现有字段

`pbs_user.token_version` 已存在，不新增 PBS schema 字段。

需要改动：

- `pbs-server/src/services/auth/types.ts`：`AuthPayload` 增加 `tokenVersion`。
- `pbs-server/src/services/auth/auth-service.ts`：
  - `buildPayload` 写入 `user.tokenVersion`。
  - `logout(payload)` 按 user id 或 userCode 递增 `token_version`。
  - 登录时继续检查 `status`、`passwordAccess`、`portalAccess`、`lockedUntil`。
  - 补充 `effDt <= now`、`expDt is null or expDt > now` 校验。
- `pbs-server/src/plugins/auth.ts`：
  - verify JWT 后调用统一的 auth snapshot 校验函数。
  - 比较 payload `tokenVersion` 与当前 DB `token_version`。
  - 校验 `status=0`、`portal_access='1'`、生效期。
  - 对 password-only 权限：登录时需要 `password_access='1'`；已登录 API 校验重点是 `portal_access='1'`。

#### A3. live-server 增加字段

`users` 当前没有 `token_version`。第二阶段需要补齐：

- `sql/schema/live/01-base.sql` 增加 `token_version integer not null default 0`。
- 新增幂等 migration，为现有 `users` 表添加 `token_version`。
- `live-server/src/models/system/users.ts` 增加 `tokenVersion`。

需要改动：

- `live-server/src/plugins/auth.ts`：`AuthPayload` 增加 `tokenVersion`，auth hook 校验当前用户状态/version。
- `live-server/src/routes/auth/auth.ts`：
  - 登录成功 payload 写入 `tokenVersion`。
  - 登录失败统一返回相同 message。
  - 登录前校验 `status=0`、`password_access='Y'`、`portal_access='Y'`、`eff_dt <= now`、`exp_dt is null or exp_dt > now`。
  - 新增 `DELETE /api/auth/session` 或 `POST /api/auth/logout`，递增当前用户 `token_version`。
- `gantt/src/stores/auth-store.ts`：
  - logout 时尽力调用服务端 logout，再清本地 token。
  - 401 时保持现有强制清理。

说明：

- `password_access` 是密码登录开关。
- `portal_access` 在 live `users` 注释中是 Portal 页面访问开关；本阶段默认将 Gantt 登录也视为需要页面访问权限。如果产品确认 Gantt 应使用不同字段，应在实现前调整 spec。

### B. Auth snapshot 与性能设计

直接每个请求查 DB 可以最准确，但可能放大高频接口压力。推荐统一做轻量 auth snapshot。

#### B1. Snapshot 内容

缓存值只放非敏感字段：

```ts
type AuthUserSnapshot = {
  userCode: string
  userName: string
  schema: string
  isAdmin: number | boolean
  tokenVersion: number
  status: number
  portalAccess: string | null
  passwordAccess: string | null
  effDt: string
  expDt: string | null
}
```

不得缓存：

- `password_hash`
- 原始 JWT
- SSO token
- 数据库连接信息

#### B2. Cache key

建议：

- `live-server`：`auth:user:${schema}:${userCode}`
- `pbs-server`：`pbs:auth:user:${id}` 或 `pbs:auth:user:${userCode}`

注意：

- PBS 与 live-server 使用独立 Redis，不共享 key。
- key 不能包含原始 token。

#### B3. TTL 与失效

建议：

- TTL：30 到 60 秒。
- login 可以不预热。
- logout / 改密 / 禁用 / 强制下线后必须删除对应 auth snapshot key。
- 如果删除失败，TTL 兜底，最终一致。

安全语义：

- logout 递增 `token_version` 后，应优先删除缓存，保证旧 token 立即失效。
- 如果 Redis 删除失败，最坏在 TTL 后生效；最终交付说明必须报告这个窗口。
- 如要做到严格立即失效，可在 auth hook 对 payload `iat` 或 version mismatch 路径强制 DB 查询；本阶段先按 Cache-Aside + 短 TTL 实现。

### C. live-server 登录枚举防护

#### C1. 响应策略

用户不存在和密码错误统一返回：

```text
Invalid user code or password.
```

建议状态码：

- `401`：用户不存在或密码错误。
- `403`：账号存在但禁用、过期、无 portal/password access。
- `423`：账号被锁定，如果后续 live-server 实现登录锁定。

说明：

- `403` 会暴露“账号存在但无权限”的差异，但它只在密码已正确或账号状态明确时返回。若实现简单阶段无法区分安全边界，可统一返回 `401` 并在后台日志记录真实原因。
- 审计重点是不要区分“用户不存在”和“密码错误”。

#### C2. 日志策略

前端响应不暴露真实原因；服务端日志可记录：

- `userCode` 的规范化值。
- 失败原因枚举，例如 `not_found`、`bad_password`、`disabled`、`expired`、`no_password_access`。
- IP / user-agent 可记录，但不得记录密码、JWT、SSO token。

### D. PBS SSO URL token 短期缓解

#### D1. 登录页同步清理 URL

当 `/login?token=...` 出现时：

1. 立即把 `token` 读入局部变量。
2. 调用 `window.history.replaceState` 或 React Router `navigate(..., { replace: true })`，把地址替换成不含 token 的 URL。
3. 保留安全的 `redirect` 参数或已归一化的 return-to。
4. 再调用 `completeSsoFromToken(token)`。
5. 成功或失败后，地址栏都不得恢复 token。

失败态：

- 显示错误信息。
- 不保留 token。
- 允许用户重新点击 SSO Login 或用账号密码登录。

#### D2. legacy callback

`/auth/callback?token=...` 当前重定向到 `/login?token=...`。短期处理：

- 保留兼容入口。
- 仍使用 `replace`，避免 callback URL 留在 history。
- 进入 LoginPage 后立即清理 token。
- 测试必须从“search 仍包含 token”改为“token 被清理”。

#### D3. 中期方案：authorization code

后续阶段应改为：

1. SSO 回调只带一次性 `code`。
2. `pbs-server` 用 code 与上游 IdP / SSO 服务交换用户身份。
3. code 单次使用、短 TTL、服务端存储或可验证签名。
4. 前端只接收 PBS 自己签发的 JWT，不接收上游 token。

本阶段不实现完整 code exchange，只在文档中保留迁移方向。

### E. 前端 token 存储策略

本阶段保持：

- `gantt`：`sessionStorage`。
- `pbs-portal`：`sessionStorage`。

理由：

- 现有 API client、E2E、跨服务代理均按 Bearer token 工作。
- 迁移到 Cookie 需要同时设计 CSRF、防跨站请求、SameSite、CORS、开发代理、移动端兼容和 Playwright 登录辅助。
- 本阶段核心风险可先通过服务端撤销和 URL 清理收敛。

阶段后建议：

- 单独写 Phase 4 spec 评估 HttpOnly Secure SameSite Cookie + CSRF token。
- 评估是否只对 PBS Portal 做 Cookie，Gantt 继续 Bearer，或全栈统一。

## API / Contract 变更

### pbs-server

外部 HTTP contract 尽量不变：

- `POST /api/auth/session` 返回结构不变。
- `GET /api/auth/session` 返回结构不变。
- `DELETE /api/auth/session` 返回 `{ loggedOut: true }` 不变。

内部 JWT payload 增加：

- `tokenVersion`

### live-server

新增或规范化：

- `DELETE /api/auth/session`：当前用户 logout，递增 `users.token_version`。

现有：

- `POST /api/auth/login` 返回结构不变，可继续返回 `{ token, userCode, userName, schema, isAdmin }`。
- `GET /api/auth/me` 返回结构不变，但应复用 auth hook 校验后的用户身份，避免只读 JWT。

内部 JWT payload 增加：

- `tokenVersion`

### pbs-portal / gantt

- 对页面和 service 层外部 contract 不做业务字段变更。
- logout store 需要等待或尽力调用服务端 logout；失败时仍清理本地状态，但要记录失败，不能阻断用户离开。

## 数据库与迁移

### pbs-server

不新增字段。需确认：

- `pbs_user.token_version` 已存在。
- 如历史库缺字段，补一条幂等验证脚本或 migration 说明。

### live-server

需要新增字段：

```sql
alter table users
  add column if not exists token_version integer not null default 0;
```

同时更新：

- `sql/schema/live/01-base.sql`
- `sql/migration/...` 新增增量脚本
- `live-server/src/models/system/users.ts`

注意：

- 不修改已确认历史建表脚本的语义，增量脚本必须幂等。
- 新字段 default 0，不需要回填复杂逻辑。

## 测试计划

### pbs-server 自动化测试

需要新增或更新：

- 登录成功的 JWT payload 包含 `tokenVersion`。
- `GET /api/auth/session`：
  - token version 匹配时通过。
  - token version 小于 DB 当前值时返回 401。
  - `status != 0` 返回 401/403。
  - `portal_access != '1'` 返回 401/403。
  - `eff_dt > now` 或 `exp_dt <= now` 返回 401/403。
- `DELETE /api/auth/session`：
  - 成功递增当前用户 `token_version`。
  - 旧 token 随后访问受保护接口失败。
- logout 后 Redis auth snapshot 被删除；删除失败时不影响 DB version 递增。
- 改密或禁用账号的 service / route 如果本阶段触达，必须覆盖 token_version 递增。

验证命令：

```bash
cd pbs-server
npm test
npm run build
npm run audit:prod
```

如果改动涉及用户同步：

```bash
cd pbs-server
npm run sync:pbs-users -- --dry-run
```

### live-server 自动化测试

需要新增或更新：

- `POST /api/auth/login`：
  - 用户不存在和密码错误返回相同 message。
  - `status != 0` 拒绝。
  - `password_access != 'Y'` 拒绝。
  - `portal_access != 'Y'` 拒绝。
  - `eff_dt > now` 或 `exp_dt <= now` 拒绝。
  - 成功 JWT payload 包含 `tokenVersion`。
- `GET /api/auth/me`：
  - token version 匹配时通过。
  - token version 过期时拒绝。
- `DELETE /api/auth/session`：
  - 递增 `users.token_version`。
  - 旧 token 随后访问受保护 route 失败。
- auth snapshot cache：
  - miss 时查 DB 并回填 TTL。
  - logout 后删除 cache。
  - cache 中 version 不匹配时拒绝。

验证命令：

```bash
cd live-server
npm test -- src/routes/auth/auth.test.ts
npm run build
```

如 auth hook 被多个 route 共享，建议加跑关键 route 认证测试。

### pbs-portal 自动化测试

需要新增或更新：

- logout 调用 `DELETE /auth/session`，无论服务端成功失败都会清本地 token。
- `/login?token=abc`：
  - 会调用 SSO callback。
  - 读取后立即清理 URL 中的 token。
  - 成功后跳到 return-to。
  - 失败后显示错误，URL 仍不含 token。
- `/auth/callback?token=abc` legacy 入口最终不在 history/search 中保留 token。
- session restore 遇到 401 时清 token。

验证命令：

```bash
cd pbs-portal
npm test
npm run lint
npm run build
```

### gantt 自动化测试

需要新增或更新：

- logout 会尽力调用 `DELETE /api/auth/session`。
- 服务端 logout 失败时仍清理本地 session。
- 401 强制清理行为保持不变。
- 如果 auth-store 测试不存在，应补最小 store/service mock 单测。

验证命令：

```bash
cd gantt
npm test -- <auth-store相关测试>
npm run build
```

### E2E / QA 测试案例

PBS 认证改动影响用户主流程，需要新增 QA 文档：

- `docs/test-cases/pbs/auth/2026-07-07-session-revocation.md`

建议覆盖：

1. PBS Portal 登录后 logout，再用旧 token 调 API 应失败。
2. 管理员禁用 PBS 用户后，旧 token 在设计窗口内失效。
3. SSO 登录成功后地址栏和 history 不含 token。
4. SSO 失败后地址栏不含 token，用户可重新登录。
5. 密码登录、session restore、普通页面加载不回归。

如实现触达 Gantt logout，也应在 Gantt 现有 E2E 登录/退出 smoke 中补一条最小路径，或说明为何本阶段用单测覆盖足够。

## 实施顺序

推荐顺序：

1. `pbs-server`：先用现有 `token_version` 打通 payload、auth hook、logout、测试。
2. `pbs-portal`：适配 logout / session restore / SSO URL cleanup，并更新测试。
3. `live-server`：补 `users.token_version` migration、auth hook、登录策略、logout。
4. `gantt`：适配服务端 logout，补 auth-store 测试。
5. 补 QA 测试案例，跑验证命令。

理由：

- PBS 已有 `token_version` 字段，先实现风险最低，可作为 live-server 的参考实现。
- PBS SSO URL 风险在 Portal 前端即可先缓解。
- live-server 涉及 schema/migration，应在 PBS 模式稳定后再做。

## 兼容性与迁移策略

### 已登录用户

实现后，旧 JWT 因缺少 `tokenVersion` 将被拒绝。用户需要重新登录一次。

这是可接受行为，但上线说明需要明确：

- 发布后活跃用户可能被要求重新登录。
- 前端遇到 401 应清本地 token 并回登录页。

### 多实例部署

权威状态在 DB。

Redis 用途：

- 缓存 auth snapshot，降低每请求 DB 查询。
- logout / 禁用 / 改密时删除对应缓存。

如果某实例缓存删除失败：

- DB version 已递增。
- 最坏 TTL 后失效。
- 若上线要求“严格立即失效”，需要在 auth hook 增加 version-sensitive DB recheck 或后续引入 Redis pub/sub 失效广播。

### 旧 SSO token URL

上线后：

- 旧 `/auth/callback?token=...` 仍可进入登录处理。
- 地址栏会被清理。
- 测试断言需要同步更新，不再期待 token 留在 search。

## 风险与取舍

### 用户级 logout

本阶段采用 `token_version`，logout 会让该用户所有已签发旧 token 失效。

影响：

- 同一用户多个浏览器 tab / 设备可能一起被登出。
- 这比单 token logout 更强，但实现简单、审计效果明确。

后续如需要单设备 logout，再引入 `jti` session table / Redis denylist。

### Auth hook 性能

风险：

- 每请求查 DB 会影响高频接口。

控制：

- 使用短 TTL auth snapshot。
- 缓存只保存非敏感字段。
- 登出和权限变更主动删缓存。
- 先跑最小 route 测试和 build，再视影响补 route-level 性能观察。

### live-server access 字段语义

风险：

- `portal_access` 是否应该控制 Gantt 登录需要业务确认。

默认：

- 按 schema 注释理解，Gantt 属于需要页面访问权限的前端入口，默认要求 `portal_access='Y'`。

如果产品确认 Gantt 使用另一字段，实施前更新本 spec。

### SSO URL 只能短期缓解

清理 URL 不能改变“token 曾经作为 URL 参数传入浏览器”的事实。

本阶段价值：

- 降低 token 在地址栏、history、失败页面中的停留时间。
- 让失败态不继续泄露 token。

彻底方案：

- 后续改 authorization code exchange。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 本阶段可拆成 PBS 后端、PBS Portal 前端、Live/Gantt 认证链路、测试/QA 文档四个边界清晰的工作包。
- Suggested split:
  - Agent A：`pbs-server` token_version、auth hook、logout、后端测试。
  - Agent B：`pbs-portal` logout、SSO URL cleanup、前端测试。
  - Agent C：`live-server` users token_version migration、登录策略、auth hook、后端测试。
  - Agent D：`gantt` logout 适配、QA 测试文档、最终验证清单。
- Write boundaries:
  - Agent A 只写 `pbs-server/**` 和必要 contract 类型。
  - Agent B 只写 `pbs-portal/**`。
  - Agent C 只写 `live-server/**`、`sql/schema/live/**`、`sql/migration/**`。
  - Agent D 只写 `gantt/**`、`docs/test-cases/**`。
- Conflict risk: 中等。JWT payload 类型、auth contract 和版本号文件可能产生交叉，需要主 agent 最后整合。
- Execution gate: 必须在用户确认本 spec 后再开始实现；并且实现前重新检查当前工作树，避免覆盖用户改动。

## 验收标准

第二阶段完成时必须满足：

1. `pbs-server` logout 后旧 token 无法访问受保护接口。
2. `pbs-server` 禁用、无 portal access、未生效、已过期账号的旧 token 被拒绝。
3. `live-server` 用户不存在和密码错误返回相同登录错误。
4. `live-server` 禁用、无 password/portal access、未生效、已过期账号不能登录。
5. `live-server` logout 后旧 token 无法访问受保护接口。
6. PBS SSO `/login?token=...` 读取后地址栏和失败态都不保留 token。
7. 旧 `/auth/callback?token=...` 兼容入口仍可工作，但不在 history/search 中保留 token。
8. `gantt` 和 `pbs-portal` logout 都会尽力通知服务端，并在任何结果下清理本地 session。
9. 生产 UI 不新增任何明文密码、token、真实账号凭据。
10. 版本号按项目规则递增：后端改动递增 `BACKEND_VERSION`，前端改动递增 `FRONTEND_VERSION`，PBS 改动同步递增 PBS 专属版本号。

## 最小验证命令

实施完成后至少运行：

```bash
cd pbs-server && npm test && npm run build && npm run audit:prod
cd pbs-portal && npm test && npm run lint && npm run build && npm run audit:prod
cd live-server && npm test -- src/routes/auth/auth.test.ts && npm run build
cd gantt && npm run build
git diff --check
node .gitnexus/run.cjs detect_changes --scope compare --base-ref main
```

如改动触达 PBS 跨模块主流程，建议补跑：

```bash
npm run verify:pbs
```

## 待确认问题

1. `live-server` 的 Gantt 登录是否明确要求 `users.portal_access='Y'`？本设计默认需要。
2. logout 是否接受“用户级撤销所有旧 token”？本设计默认接受。若产品要求只登出当前设备，需要改用 `jti` session 表或 Redis denylist。
3. PBS SSO 的上游是否支持 authorization code 或一次性 code？本阶段不依赖该能力，但后续彻底修复需要确认。

以上是第二阶段修复设计。用户确认后，才能进入实现计划和代码修改。
