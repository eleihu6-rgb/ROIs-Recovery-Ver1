# Simulated Crew Portal 安全 Token 传递设计

## 背景

当前 `Simulated Crew Portal` 的登录链路会生成一个模拟登录 token，并把它拼到 PBS Portal 登录地址上：

```text
/pbs/login?simulateToken=<jwt>&redirect=/bid
```

这在安全审计上不可接受。`simulateToken` 是认证凭证，放在 URL 会暴露在：

- 浏览器地址栏和截图。
- 浏览器历史记录。
- 反向代理、网关、CDN、访问日志。
- Referer 头。
- 监控和审计扫描。

SIT 当前还暴露出另一个问题：远端 PBS Portal 静态 bundle 不是最新 simulated login 版本，页面没有消费 `simulateToken`，所以 token 会一直留在地址栏。但即使部署了最新前端，URL token 仍会短暂出现在地址栏，仍然不符合审计要求。

## 目标

- 模拟登录 token 不得出现在 URL、前端 JS 状态、DOM、localStorage/sessionStorage 或 Playwright mock URL 中。
- Admin 点击 `Simulate` 后仍打开 PBS Portal，并自动以指定 crew 身份进入 crew portal。
- token 通过服务端设置的 `HttpOnly` cookie 传递，PBS Portal 前端只触发消费动作，不读取 token。
- token cookie 短 TTL、`Secure`、`SameSite=Lax`，消费成功或失败后都清除。
- 登录成功后进入 `/bid`。
- 不执行数据库 migration。

## 非目标

- 不改普通 PBS Portal user/password 登录。
- 不改 PBS Portal SSO 登录。
- 不改 Altair/Gantt 管理员登录。
- 不把 live-server 与 pbs-server 合并。
- 不新增长期会话表。
- 不兼容继续生成 `simulateToken=` URL 的旧模拟登录入口。

## 当前链路

当前代码中的核心链路：

1. Gantt Admin 页面调用 live-server：
   `POST /api/admin/simulated-crew-portal/sessions`
2. live-server 调 pbs-server internal API：
   `POST /api/internal/simulated-crew-portal/sessions`
3. pbs-server 生成 JWT token。
4. pbs-server 返回：
   `https://.../pbs/login?simulateToken=<jwt>&redirect=/bid`
5. Gantt 前端 `window.open(url)`。
6. PBS Portal 登录页读取 `simulateToken` query，调用：
   `POST /api/auth/simulated-session`
7. pbs-server 验证 token 后返回正常 PBS Portal JWT。

问题在第 4、5、6 步：认证 token 进入 URL 和前端可读状态。

## 设计方案

### 1. 使用 HttpOnly Cookie 做 token handoff

新的链路：

1. Gantt Admin 页面调用 live-server：
   `POST /api/admin/simulated-crew-portal/sessions`
2. live-server 调 pbs-server internal API：
   `POST /api/internal/simulated-crew-portal/sessions`
3. pbs-server 仍生成短 TTL simulated token。
4. pbs-server internal API 返回 server-to-server-only 数据：

```ts
type SimulatedCrewPortalInternalSessionResponse = {
  token: string;
  cleanUrl: string;
  expiresAt: string;
  maxAgeSeconds: number;
};
```

其中：

- `token` 只允许从 pbs-server 返回给 live-server。
- live-server 只能把 `token` 写入 `Set-Cookie`，不得把它放进 JSON response、URL、日志或前端状态。
- `cleanUrl` 只能包含非敏感 query，例如 `simulate=1&redirect=%2Fbid`。
- pbs-server route/service 测试必须断言 `cleanUrl` 不包含 `simulateToken`。

5. live-server 在返回给浏览器时设置 cookie：

```text
Set-Cookie: __Secure-pbs-simulated-login=<token>;
  Max-Age=<ttl>;
  Path=<simulated-session-browser-path>;
  HttpOnly;
  Secure;
  SameSite=Lax
```

6. live-server 返回给 Gantt 的 URL 是干净 URL：

```text
https://crew-f8-usva-sit.roiscloud.com/pbs/login?simulate=1&redirect=%2Fbid
```

7. Gantt 前端只 `window.open(cleanUrl)`，不会拿到 token。
8. PBS Portal 登录页看到 `simulate=1` 后，立即把 URL replace 成不含 `simulate` 的安全地址，然后调用：

```text
POST /api/auth/simulated-session
```

注意：这里的 `/api/auth/simulated-session` 是 pbs-portal 代码中的 API base 相对路径；浏览器实际发出的路径可能是 `/pbs/api/auth/simulated-session`（SIT/UAT/生产同源代理）或本地 Vite 的 `/api/auth/simulated-session`。

9. 浏览器自动带上 `HttpOnly` cookie。
10. pbs-server 从 cookie 读取 token，验证后清除 cookie，并返回正常 PBS Portal session JWT。
11. PBS Portal 写入正常登录 session，跳转到 `/bid`。

### 2. Cookie 命名和作用域

建议 cookie 名：

```text
__Secure-pbs-simulated-login
```

原因：

- `__Secure-` 要求 cookie 在 HTTPS 下设置 `Secure`，符合部署安全要求。
- 不用 `__Host-`，因为 `__Host-` 必须 `Path=/`，会让 cookie 发往整站路径；本场景应尽量限制到 `/pbs/api/auth/simulated-session`。
- cookie `Path` 必须等于浏览器实际请求 simulated-session 接口的路径，确保 cookie 只在消费接口请求时发送，不发给普通页面、Altair API 或 PBS 其他 API。

路径策略：

- SIT/UAT/生产当前同源代理路径为：
  `Path=/pbs/api/auth/simulated-session`
- 本地 pbs-portal Vite 默认请求路径为：
  `Path=/api/auth/simulated-session`
- 实现时应由 `portalPublicUrl` 或明确 helper 推导 cookie path，设置和清除 cookie 必须使用同一个 path。
- 如果未来 `VITE_API_BASE_URL` 指向独立 origin，则必须重新评估 CORS 和 cookie domain/path；本 spec 只覆盖当前同源 `/pbs` 部署模式。

`__Secure-` 与本地开发：

- SIT/UAT/生产必须使用 `__Secure-pbs-simulated-login` + `Secure`。
- 如果本地 HTTP 无法接收 `Secure` cookie，本地只能使用 dev-only cookie 名，例如 `pbs-simulated-login-dev`，且只能在 localhost 环境启用。
- 测试必须分别覆盖 production cookie attributes 和 local dev cookie path/name 策略，避免把 dev-only 策略带到 SIT/UAT。

### 3. pbs-server simulated-session 合同调整

当前合同：

```ts
type PbsSimulatedLoginRequest = {
  simulateToken: string;
};
```

应调整为不携带 token：

```ts
type PbsSimulatedLoginRequest = Record<string, never>;
```

或移除 body 依赖，让 `authService.handleSimulatedLogin()` 不再接收 token 参数。

pbs-server route 行为：

- 从 `Cookie` header 读取 `__Secure-pbs-simulated-login`。
- token 缺失：返回 `401 Simulated login token is missing or expired.`
- token 无效/过期：返回 `401 Simulated login token is invalid or expired.`
- token 有效：换取正常 PBS Portal JWT，并在响应里清除 cookie。
- 无论成功或失败，都设置过期 cookie 清理值。

### 4. 一次性消费

当前 token payload 已包含 `jti`，但没有持久化消费状态，所以同一个 token 在 TTL 内理论上可重复使用。

建议在本次安全修复中一起补上一次性消费，使用 Redis，不需要数据库 migration：

```text
SET pbs:simulated-login:used:<jti> 1 NX EX <remaining_ttl_seconds>
```

行为：

- 第一次消费成功：`SET NX` 成功，继续登录。
- 第二次消费同一 token：`SET NX` 失败，返回 `401 Simulated login token is invalid or expired.`
- Redis TTL 与 token 剩余有效期一致或略长，自动清理。

实现细节：

- `verifySimulatedCrewPortalToken()` 需要保留 JWT 标准 claim `exp`。
- 计算 `remaining_ttl_seconds = max(1, exp - now_epoch_seconds)`。
- 在 `authService.loginViaSimulation` 内部执行 replay guard，避免 route 层绕过。
- Redis key 不保存 token 原文，只保存 `jti`：

```text
pbs:simulated-login:used:<jti>
```

- Redis 不可用或 `SET NX EX` 失败原因不明确时必须 fail closed，返回模拟登录失败，不允许降级成可重放 token。

如果实现时 Redis 依赖接入 auth service 的改动过大，至少要保证 URL token 移除作为第一阶段完成；一次性消费不可被遗忘，应保留在同一个 spec 的验收项或明确拆成后续安全任务。

推荐本次一次完成，因为 `jti` 已存在，且不需要 schema。

### 5. 旧 URL token 的处理

新代码不再生成 `simulateToken=` URL。

PBS Portal 登录页如果收到旧链接：

```text
/login?simulateToken=<value>
```

应立即 `replace` 清除 query 中的 token，并显示错误：

```text
This simulated login link is no longer supported. Please generate a new one from Admin.
```

不要继续兼容旧 query token 登录。原因是兼容会保留审计风险，并让旧入口继续存在。

注意：旧链接第一次打开时，token 已经进入了浏览器地址栏和可能的代理日志。客户端清理只能减少后续暴露，不能消除首次 URL 暴露。因此旧链接必须视为已泄露入口，只做清理和拒绝，不声明“安全消费旧 token”。

### 6. Error Handling

用户可见错误：

- cookie 缺失或过期：
  `Simulated login token is missing or expired. Please generate a new link from Admin.`
- token 无效或已消费：
  `Simulated login token is invalid or expired. Please generate a new link from Admin.`
- pbs-server 失败：
  `Simulated login failed. Please try again.`

这些错误显示在 PBS Portal 登录页当前 `submissionError` 位置即可，不新增单独弹窗。

内部日志：

- 不记录 token。
- 可以记录 `jti`、admin user、crew code、result、request id。
- 不把 cookie/header 原文写入日志。

## 影响范围

### live-server

文件：

- `live-server/src/routes/admin/pbs-simulated-crew-portal.ts`
- `live-server/src/routes/admin/pbs-simulated-crew-portal.test.ts`

改动：

- 从 pbs-server internal API 拿到 token 后，设置 `Set-Cookie`。
- 增加 cookie helper，统一生成 cookie name、path、flags、clear header。
- cookie path 必须从 clean URL / portal public URL 推导出浏览器实际 simulated-session path。
- 返回 URL 改为 clean URL：只允许 `simulate=1`、`redirect=/bid` 等非敏感参数。
- 返回 JSON 只允许包含 `url` / `expiresAt` 等非敏感字段，不允许包含 `token`。
- 测试断言返回 URL 不含 `simulateToken`，response body 不含 token，响应 header 含安全 cookie attributes。

### pbs-server

文件：

- `pbs-server/src/routes/auth.ts`
- `pbs-server/src/services/auth/auth-service.ts`
- `pbs-server/src/services/auth/types.ts`
- `pbs-server/src/services/simulated-crew-portal/simulated-crew-portal-token.ts`
- `pbs-server/src/services/simulated-crew-portal/simulated-crew-portal-service.ts`
- `pbs-server/src/services/simulated-crew-portal/simulated-crew-portal-service.test.ts`
- `pbs-server/src/routes/auth-simulated-session.test.ts`
- `pbs-server/src/services/auth/auth-service.test.ts`
- `packages/contracts/pbs-auth.*`

改动：

- internal session response 改为 `{ token, cleanUrl, expiresAt, maxAgeSeconds }`，只供 live-server 使用。
- `POST /auth/simulated-session` 从 cookie 读 token，不再从 body 读。
- 成功/失败都清理 simulated cookie。
- 使用 `jti` 做 Redis 一次性消费。
- `verifySimulatedCrewPortalToken()` 返回 `exp`，用于计算 Redis replay guard TTL。
- Redis 不可用时 fail closed。
- 合同移除 `simulateToken` body。

### pbs-portal

文件：

- `pbs-portal/src/features/auth/pages/login-page.tsx`
- `pbs-portal/src/features/auth/store/use-auth-session-store.ts`
- `pbs-portal/src/shared/services/auth-service.ts`
- `pbs-portal/src/app/app.tsx`
- `pbs-portal/src/app/router/app-routes.test.tsx`
- `pbs-portal/src/features/auth/store/use-auth-session-store.test.ts`
- `pbs-portal/src/shared/services/auth-service.test.ts`

改动：

- 登录页检测 `simulate=1`，不是 `simulateToken`。
- 检测后立刻 `replace` 清理 URL。
- `completeSimulatedFromToken(token)` 改为 `completeSimulatedLogin()`。
- `authService.handleSimulatedLogin()` 不传 token body。
- 旧 `simulateToken` query 被清理并报错，不消费。

### e2e

文件：

- `e2e/tests/gantt/pbs-simulated-crew-portal.spec.ts`
- 新增或更新 `e2e/tests/pbs-portal/...` simulated login 回归。

改动：

- Gantt 点击 `Simulate` 后打开的 URL 不含 token。
- PBS Portal simulated login 流程成功后进入 `/bid`。
- Playwright 断言浏览器地址栏从未包含 `simulateToken=`。

## 验收标准

- Admin 点击 `Simulate` 后打开的新页面 URL 不含 token。
- 任意代码返回给浏览器的 URL 不包含 `simulateToken`。
- PBS Portal 地址栏、history current URL、Playwright opened URL 都不包含 JWT。
- `POST /pbs/api/auth/simulated-session` 不需要 body token。
- pbs-server 从 `HttpOnly` cookie 完成模拟登录。
- simulated cookie 成功或失败后都会被清除。
- 同一个 simulated token 第二次消费失败。
- SIT/UAT/生产按同源 `/pbs/api` 代理部署；如果配置成跨 origin API，需要另行补 CORS credentials 和 cookie domain 设计。
- 普通 password login、SSO login、已有 session restore 不受影响。
- 不需要数据库 migration。

## 测试计划

### 单元 / 集成测试

live-server：

- pbs-server internal response mock 包含 token，但 live-server 返回 body 不含 token。
- `POST /api/admin/simulated-crew-portal/sessions` 返回 clean URL。
- clean URL 包含 `simulate=1` 和安全 redirect。
- URL 不包含 `simulateToken`。
- body 不包含 token。
- `Set-Cookie` 包含：
  - cookie name
  - `HttpOnly`
  - `SameSite=Lax`
  - `Path=/pbs/api/auth/simulated-session` 或本地对应 `/api/auth/simulated-session`
  - SIT/UAT/production 下 `Secure`
  - `Max-Age`

pbs-server：

- cookie token 可换正常 session。
- 无 cookie 返回 401。
- 无效 token 返回 401。
- 成功后返回清除 cookie header。
- 失败后也返回清除 cookie header。
- 同一 `jti` 第二次消费失败。
- Redis replay guard 报错时 fail closed。
- internal session response 的 `cleanUrl` 不包含 `simulateToken`，`token` 不进入 clean URL。

pbs-portal：

- `/login?simulate=1&redirect=%2Fbid` 调用 simulated login，不传 token。
- URL 先被 replace 清理，再完成登录。
- `/login?simulateToken=abc` 不调用 simulated login，清理 URL，并显示不支持旧链接错误。
- StrictMode 下只调用一次 simulated login。

### Playwright

Gantt：

- mock session API 返回 clean URL。
- 点击 `Simulate` 后 `window.open` 的 URL 不含 `simulateToken`。

PBS Portal：

- 以 cookie mock 或后端 mock 模拟 `POST /api/auth/simulated-session` 成功。
- 访问 `/pbs/login?simulate=1&redirect=%2Fbid`。
- 断言最终进入 `/bid`。
- 断言当前 URL 和所有 captured URL 不包含 `simulateToken`。

SIT 手工验证：

- 从 Altair Admin Tools 点击 `Simulate`。
- 新 tab 地址栏不出现 JWT。
- 自动进入 PBS Portal `/bid`。
- DevTools Network 中页面 URL 和 Referer 不出现 token。
- `Set-Cookie` 有 `HttpOnly`、`Secure`、`SameSite=Lax`，Path 匹配 `/pbs/api/auth/simulated-session`。

## 安全说明

本方案仍然会创建短 TTL 的模拟登录 token，但 token 只存在于：

- pbs-server 内部生成逻辑。
- live-server response 的 `Set-Cookie` header。
- 浏览器 cookie jar 的 `HttpOnly` cookie。
- pbs-server simulated-session 请求的 Cookie header。

token 不进入：

- URL。
- DOM。
- 前端 JS variable。
- localStorage/sessionStorage。
- Gantt `window.open()` URL。
- 普通应用日志。

## 风险与注意事项

- `Set-Cookie` 的 Path 必须与部署后的 PBS API 真实路径一致。SIT 当前是 `/pbs/api/auth/simulated-session`。
- 如果将来 PBS Portal 部署路径改变，admin config 或常量需要同步调整 cookie path。
- 如果浏览器阻止非 HTTPS Secure cookie，本地开发需要 dev-only cookie 名或本地 HTTPS；SIT/UAT/生产不得关闭 Secure，也不得使用 dev-only cookie 名。
- 如果 Redis 不可用，一次性消费能力会受影响；实现时应让 simulated login 失败，而不是降级成可重放 token。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是认证凭证传递链路，跨三个模块但合同紧密；拆多人容易造成 contract 不一致或安全遗漏。
- Suggested split: 不拆。
- Write boundaries: 单人按 live-server -> pbs-server contract/service -> pbs-portal -> tests 顺序修改。
- Conflict risk: Medium，主要集中在 auth route、auth store、登录页和 shared contract。
- Execution gate: 用户确认本 spec 后再进入实现；实现前需要做 GitNexus impact analysis。
