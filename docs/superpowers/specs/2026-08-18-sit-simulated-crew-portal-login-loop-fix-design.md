# SIT Simulated Crew Portal 登录循环修复设计

## 背景

SIT 环境访问 `https://crew-f8-usva-sit.roiscloud.com/altair/pbs` 后，普通 Altair 登录本身可以成功；但登录后点击 PBS 菜单下的 `Simulated Crew Portal`，页面会重新回到登录页，用户感知为“登录循环”。

已验证现象：

- `POST /live/api/auth/login` 使用有效账号可返回 `200` 和 JWT。
- 同一个 JWT 调用 `GET /live/api/auth/me` 返回 `200`。
- 同一个 JWT 调用旧管理接口 `GET /live/api/admin/pbs-business-time?...` 返回 `200`。
- 但点击 `Simulated Crew Portal` 时，前端请求 `GET /live/api/admin/simulated-crew-portal/config`，最终返回 `401 Authentication required. Please login first.`
- 前端共享 HTTP client 对任何 `401` 都会触发全局 `logout()`，所以当前用户被踢回登录页。

## 根因判断

当前问题不是普通登录坏，也不是数据库配置脏数据。

真正链路是：

1. Gantt 前端已登录。
2. 前端打开 `Simulated Crew Portal` 页面。
3. live-server 接收 `/api/admin/simulated-crew-portal/config`。
4. live-server 带 `X-Internal-Secret` 调 pbs-server：
   `/api/internal/simulated-crew-portal/config`
5. SIT pbs-server 返回 `401 Authentication required. Please login first.`
6. live-server 原样把 401 返回给浏览器。
7. Gantt 全局 HTTP client 看到 401，执行 logout，页面回登录页。

本地 `main` 代码中，pbs-server 的 `PUBLIC_ROUTES` 已包含这些 internal routes：

- `POST /api/internal/simulated-crew-portal/sessions`
- `GET /api/internal/simulated-crew-portal/config`
- `PUT /api/internal/simulated-crew-portal/config`
- `GET /api/internal/simulated-crew-portal/logs`

因此 SIT 线上仍返回 auth plugin 的 401，说明线上 pbs-server 运行代码大概率没有更新/没有重启到包含该白名单的版本。若只是 `PBS_INTERNAL_API_SECRET` 不匹配，应该进入 route 后返回 `403 Internal access required.`，而不是 auth plugin 返回的 `401 Authentication required...`。

## 目标

- 修复点击 `Simulated Crew Portal` 后被踢回登录页的问题。
- 确保 pbs-server internal routes 由 `X-Internal-Secret` 鉴权，而不是普通用户 Bearer JWT。
- 确保 live-server 下游 internal 调用失败时，不把 pbs-server 的 `401/403` 原样返回给 Gantt 浏览器，避免误触发全局 logout。
- 补齐回归测试，防止 internal route 白名单缺失或下游 401 再次把用户踢下线。

## 非目标

- 不修改普通 Altair 登录逻辑。
- 不修改 PBS Portal 普通 crew 登录逻辑。
- 不改数据库数据。
- 不改变 `PBS_INTERNAL_API_SECRET` 的设计：它仍然是 live-server 与 pbs-server 的服务间密钥。
- 不把 internal routes 暴露给普通浏览器直接访问。

## 可选方案

### 方案 A：只重新部署/重启 SIT pbs-server

做法：

- 确认 SIT pbs-server 运行代码包含当前 `main` 的 `pbs-server/src/plugins/auth.ts` 白名单。
- 重新部署或重启 pbs-server。
- 验证 `/pbs/api/internal/simulated-crew-portal/config`：
  - 无 `X-Internal-Secret`：返回 `403 Internal access required.`
  - 正确 `X-Internal-Secret`：返回 `200`

优点：

- 止血最快。
- 不需要代码变更。

缺点：

- 只解决这次部署状态不一致。
- 如果将来 pbs-server internal route、secret、代理配置异常，live-server 仍可能把下游 `401` 原样透给前端，继续触发全局 logout。

### 方案 B：只改前端，对该接口 401 不登出

做法：

- 在 Gantt HTTP client 或该页面调用里对 `/api/admin/simulated-crew-portal/*` 的 `401` 做例外，不触发 logout。

优点：

- 能避免当前页面踢用户下线。

缺点：

- 破坏共享认证语义。
- 前端需要知道某个后端代理接口的内部实现细节。
- 不能修复 live-server 把下游 internal 错误当成用户认证错误的问题。

不推荐。

### 方案 C：部署修正 + live-server 错误映射防护

做法：

- 先让 SIT pbs-server 跑到包含 internal route 白名单的版本，解决直接根因。
- 同时修改 live-server `requestPbsInternal` 的错误映射：
  - pbs-server internal 调用返回 `401/403` 时，live-server 不向浏览器返回 `401`。
  - 映射为 `502` 或 `503`，message 使用产品化文案，例如 `PBS internal service is not authorized. Check simulated portal configuration.`
  - 保留 server log 中的 sanitized 下游状态码和 message，便于排查。
- 前端保持现有全局 `401 -> logout` 语义不变。

优点：

- 既修复当前 SIT，又堵住同类回归。
- 保持前端认证规则简单一致。
- 下游服务间鉴权错误不会再误伤用户登录态。

缺点：

- 需要一次小范围代码修复和测试。

推荐采用方案 C。

## 设计方案

### 1. pbs-server internal route 行为

pbs-server internal routes 应在全局 auth plugin 白名单内，由 route 自己校验 `X-Internal-Secret`：

- 无 secret 或 secret 错误：`403 Internal access required.`
- secret 正确：进入对应业务逻辑。
- 该类接口不接受普通用户 Bearer token 作为鉴权依据。

这部分当前 `main` 代码已经具备，SIT 需要部署/重启到该版本。实现时仍应补一个集成测试，使用完整 `buildServer()` 或注册 `authPlugin + simulatedCrewPortalRoutes`，覆盖“auth plugin 不应拦 internal route”。

### 2. live-server 下游错误映射

`live-server/src/routes/admin/pbs-simulated-crew-portal.ts` 中 `requestPbsInternal` 当前会把下游状态码透传：

- 下游 401 -> 浏览器 401 -> Gantt logout。

应改为：

- 下游 `401/403`：返回给浏览器 `502`，message 表示 PBS internal authorization failed。
- 下游 envelope 非法：继续 `502 PBS server returned an invalid response.`
- 下游其他 4xx/5xx：按现有逻辑处理，但避免使用 `401` 作为浏览器响应。

建议保留一个很小的映射函数：

```text
mapPbsInternalStatus(status, code):
- if status/code is 401 or 403 -> 502
- otherwise use existing status/code fallback
```

### 3. Gantt 前端错误表现

Gantt 前端不需要新增特殊鉴权分支。

原因：

- 用户登录态没有失效。
- 这是服务间配置/部署错误，不是用户 JWT 过期。
- live-server 映射后，前端会收到普通业务错误，不会触发 logout。

页面可以沿用当前错误展示；如果现有页面没有友好错误态，本次最多补局部 error 文案，不应新增全局弹窗或改共享 HTTP client。

### 4. SIT 运维验证

部署后需要验证：

1. `GET /pbs/api/internal/simulated-crew-portal/config` 不带 secret 返回 `403`，不是 `401`。
2. 正确 secret 返回 `200`。
3. 登录 Altair 后点击 `Simulated Crew Portal` 不回登录页。
4. 如果故意让 live-server 和 pbs-server secret 不一致，页面显示配置错误/加载失败，但用户仍保持登录。

## 影响范围

- `pbs-server/src/plugins/auth.ts`
  - 主要确认和补测试，不一定需要逻辑改动。
- `pbs-server/src/routes/simulated-crew-portal.test.ts`
  - 增加 auth plugin 集成覆盖。
- `live-server/src/routes/admin/pbs-simulated-crew-portal.ts`
  - 增加下游 internal auth 错误映射。
- `live-server/src/routes/admin/pbs-simulated-crew-portal.test.ts`
  - 覆盖下游 401/403 不向浏览器返回 401。
- `e2e/tests/gantt/pbs-simulated-crew-portal.spec.ts`
  - 增加页面遇到下游 internal auth 失败时不 logout 的回归。

## 验收标准

- 已登录 Altair 用户打开 `PBS -> Simulated Crew Portal` 不会被踢回登录页。
- pbs-server internal routes 未带 internal secret 时返回 `403`，不是全局 auth 的 `401`。
- live-server 调 pbs-server internal 接口遇到下游 `401/403` 时，对浏览器返回非 401 错误。
- Gantt 全局 `401 -> logout` 行为保持不变。
- 普通 Altair 登录、SSO Login、PBS Portal 登录不受影响。

## 测试计划

开发侧测试：

- pbs-server focused test：
  - internal route 穿过 auth plugin。
  - 无 secret 返回 403。
  - 正确 secret 返回 200。
- live-server focused test：
  - PBS internal API 返回 401 时，admin route 返回 502，不返回 401。
  - PBS internal API 返回 403 时，admin route 返回 502，不返回 403/401。
  - 正常返回仍为 200。
- Gantt Playwright：
  - 预置登录态。
  - mock `/altair/live/api/admin/simulated-crew-portal/config` 返回 502。
  - 点击 `Simulated Crew Portal` 后仍停留在应用内，不回登录页。

SIT 手工验证：

- 使用管理员账号登录 `https://crew-f8-usva-sit.roiscloud.com/altair/pbs`。
- 点击 `Simulated Crew Portal`。
- 预期页面显示模拟登录配置表单或局部错误，不回登录页。
- 再刷新页面，登录态仍可恢复。

## 风险与回滚

风险：

- 如果 SIT pbs-server 没重启到最新代码，仅改 live-server 只能避免踢用户，但功能仍加载失败。
- 如果 live-server 与 pbs-server 的 `PBS_INTERNAL_API_SECRET` 不一致，页面仍无法加载配置，但不会退出登录。

回滚：

- 代码层可回滚 live-server 错误映射，但不建议，因为原行为会误触发 logout。
- 运维层可立即重启/重新部署 pbs-server 到当前 `main`，这是首要止血动作。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复范围小，关键在一条前后端 internal 调用链，拆给多个 agent 会增加集成成本。
- Suggested split: 不建议拆分；由一个 agent 完成 pbs-server 测试、live-server 错误映射、Gantt 回归。
- Write boundaries: 单人修改 `pbs-server`、`live-server`、`e2e` 相关少量文件。
- Conflict risk: 低，但这些文件刚被新功能提交改过，需要基于当前 `main` 细读后再改。
- Execution gate: 用户确认本 spec 后再开始实现。
