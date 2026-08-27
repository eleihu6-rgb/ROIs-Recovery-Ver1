# PBS / Live Session Revocation 回归用例

日期：2026-07-07

## 背景

第二阶段安全修复将 JWT 绑定到用户表 `token_version`：

- PBS Portal 使用 `pbs_user.token_version`。
- Live Gantt 使用 `users.token_version`。
- 用户 logout 后后端递增 `token_version`，旧 token 应立即失效。
- PBS Portal SSO callback URL 中的 `token` 应在前端读取后立即从地址栏清除。

## 自动化覆盖

- `pbs-server/src/services/auth/auth-service.test.ts`
- `pbs-server/src/app.test.ts`
- `pbs-portal/src/app/router/app-routes.test.tsx`
- `pbs-portal/src/features/auth/store/use-auth-session-store.test.ts`
- `live-server/src/routes/auth/auth.test.ts`
- `live-server/src/__tests__/plugins/websocket-auth.test.ts`
- `gantt/src/stores/__tests__/auth-store.test.ts`

## 手工 QA

### 1. PBS Portal 正常登录与 logout 撤销

1. 打开 PBS Portal 登录页。
2. 使用有效账号密码登录。
3. 确认可进入 Dashboard / Pairing / Award 等受保护页面。
4. 打开浏览器 DevTools，记录当前 `Authorization: Bearer ...` token。
5. 点击页面 logout。
6. 用第 4 步记录的旧 token 手工请求 `GET /api/auth/session`。

期望结果：

- logout 后页面回到未登录状态。
- `GET /api/auth/session` 返回 `401`，消息为 token 过期或无效。
- 重新登录后可正常访问。

### 2. PBS Portal SSO callback token 不残留

1. 访问 `/auth/callback?token=test-token&redirect=%2Freserve`。
2. 保持 SSO callback 请求 pending 或模拟失败。
3. 观察浏览器地址栏。

期望结果：

- 地址栏被替换为 `/login?redirect=%2Freserve`。
- 地址栏不再包含 `token=test-token`。
- SSO 失败时错误提示仍显示在登录页，但 URL 不泄漏 token。

### 3. Live Gantt logout 撤销

1. 打开 Gantt，使用有效账号密码登录。
2. 访问一个受保护接口，例如 `GET /api/auth/me`，确认返回当前用户。
3. 点击 Gantt logout。
4. 用 logout 前的旧 token 再请求 `GET /api/auth/me`。

期望结果：

- logout 后前端本地 session 被清空。
- 旧 token 请求返回 `401`。
- 重新登录后新 token 可正常访问。

### 4. 禁用 / 过期账号拒绝

准备一个 `status != 0`、`password_access != 'Y'`、`portal_access != 'Y'` 或已超出 `eff_dt/exp_dt` 窗口的测试账号。

期望结果：

- PBS Portal / Live Gantt 登录均被拒绝。
- 失败账号不会得到可用 JWT。

## 风险提示

- logout 是用户级撤销：同一用户在其他浏览器或设备上的旧 token 也会失效。
- 已建立的 WebSocket 连接会在新认证时校验 `token_version`；已连接客户端若无后续认证消息，仍依赖前端 logout / 连接关闭完成本地清理。
