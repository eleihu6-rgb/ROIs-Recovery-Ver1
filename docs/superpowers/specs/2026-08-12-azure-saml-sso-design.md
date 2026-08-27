# Azure Entra ID SAML SSO 登录设计

> 状态：已确认，待实施
> 日期：2026-08-12
> 涉及模块：gantt / pbs-portal / live-server / pbs-server / packages/saml（新建）

> **已实现：2026-08-12**（分支 `feat/auth/azure-saml-sso`，实现计划 `docs/superpowers/plans/2026-08-12-azure-saml-sso.md`）。与本文档的小偏差：
> - `packages/saml` 编译产物为 **CJS（`module: Node16` + `type: commonjs`）**，`dist/` 提交进 git（新 TS 移除 `moduleResolution: node10`，Node16 规避 `ERR_REQUIRE_ESM`）。
> - pbs-server 测试沿用项目既有 **node:test + tsx**（非 vitest）；ACS happy path 用 Node `mock.module`（`--experimental-test-module-mocks`，无 flag 时该用例 skip）。
> - `@fastify/formbody@^9.0.0`（两后端）用于解析 SAML POST。
> - gantt `SSO_LOGIN_URL` 定义在 `src/config/api-paths.ts`（非 env.ts），`VITE_SSO_LOGIN_URL` 可覆盖。
> - pbs `PbsAuthService.loginViaSso` 接口为可选（`createPbsAuthService` 恒提供），避免破坏既有测试 mock。
> - 后端集成冒烟（§6.2 的 curl 验证）与真实 Azure 联调留到 UAT 部署后人工验证。

## 1. 背景与目标

系统对接微软 Azure Entra ID 的 SSO 登录，采用 **SAML 2.0** 协议：

- Gantt（排班管理端，走 live-server）与 pbs-portal（机组申请端，走 pbs-server）**两个模块**都支持 Azure SSO 登录。
- Azure SSO 验证通过后，从 SAML 断言中提取 email / 工号，到各自 User 表（`users` / `pbs_user`）中找到对应账号，**签发系统自己的 JWT** 完成登录。
- 与现有账号密码登录**并存**：登录页保留密码登录，新增「SSO Login」按钮。

**交付物**：Azure 企业应用所需的三个接口地址（Identifier / Reply URL / Logout URL），以及两个后端 + 两个前端的 SSO 实现。

## 2. 需求决策记录

| # | 决策 | 结论 |
|---|------|------|
| D1 | Azure 企业应用结构 | **两个独立应用**（ROIS-Gantt / ROIS-PBS），各自 Entity ID / Reply URL / Logout URL / 证书 |
| D2 | 本地联调方式 | **直接在 UAT 服务器上开发**，Azure 直连 UAT，不需要 ngrok；三个 URL 指向 `crew-f8-usva-uat.roiscloud.com` |
| D3 | 用户匹配字段 | **email 优先，工号/user_code 兜底**；email 匹配不区分大小写，user_code 精确匹配 |
| D4 | 未匹配处理 | **拒绝登录**（401「账号未关联」），不做任何 DB 写入 |
| D5 | SSO 访问门槛 | 查 `status` + `portalAccess` + 生效期，**不要求 `passwordAccess`**（SSO 是认证方式本身） |
| D6 | 与密码登录关系 | 并存 |
| D7 | SAML 实现方案 | 各后端内嵌 SAML SP（`@node-saml/node-saml`），**共享 helper 抽到 `packages/saml/`** |
| D8 | live 侧 `users.email` 空数据 | 代码按 email→user_code 兜底实现，**email 回填后续单独排期**（当前 `f8_uat_live.users` 21 账号 email 全空） |

## 3. 现状分析（已核实的基线）

### 3.1 用户表

| 表 | schema | 关键字段 | 备注 |
|----|--------|---------|------|
| `users`（live） | `f8_uat_live`（UAT） | `user_code`(唯一)、`user_name`、`email`、`password_hash`、`token_version`、`is_admin`、`status`、`password_access`、`portal_access`、`eff_dt`、`exp_dt` | **无工号字段**；email 当前全空（21 账号） |
| `pbs_user`（pbs） | `f8_uat_pbs`（UAT） | `crew_id`(工号)、`user_code`(唯一)、`user_name`、`email`、`password_hash`、`token_version`、`is_admin`、`status`、`password_access`、`portal_access`、`eff_dt`、`exp_dt`、`last_login_at`、`failed_login_count` | email 已完整填充（825/826，均为 `@flyflair.com`） |

### 3.2 现有认证

- **live-server**：`POST /api/auth/login`（明文密码 → bcrypt）。JWT stateless，payload `{ userCode, userName, schema, isAdmin, tokenVersion, permVersion? }`，`env.JWT_SECRET` 签名、硬编码 24h。公开路由白名单 `PUBLIC_PATHS`（`src/plugins/auth.ts`）。复用点：`buildAuthPayload` / `hasLivePortalAccess`（`src/services/auth/session-auth.ts`）。**改造点**：live payload 无 `authMode` 字段，SSO 需要给 `AuthPayload` 增加可选 `authMode?: "password" | "sso"`（缺省视为 password，兼容存量 token），`buildAuthPayload` 增加入参。
- **pbs-server**：`POST /auth/session`（RSA-OAEP-256 前端加密）。`PbsAuthService.login()` 签发 JWT，payload 含 `authMode`、`tokenVersion`，`env.JWT_EXPIRES_IN` 可配。复用点：`createPbsAuthService`（`src/services/auth/auth-service.ts`）。
- **pbs-portal 前端已预留完整 SSO 流程**：`SSO Login` 按钮 → `window.location.assign(ssoLoginUrl)`（默认 `${apiBaseUrl}/auth/sso/login`）→ Azure → 回跳 `?token=` → `POST /auth/sso/callback {token}` → `completeSsoFromToken` 写 sessionStorage。`PbsAuthMode` 已含 `"sso"`。**后端 `/auth/sso/*` 路由完全缺失，是本设计的主要补齐点。**
- **gantt 前端无任何 SSO 痕迹**：登录页 `src/components/auth/login-page.tsx` 仅密码表单；token 存 sessionStorage `rois-auth`；`src/stores/auth-store.ts` 的 `login()` 调 `/api/auth/login`。

### 3.3 已确认的关键机制

- **跨包共享模式**：`packages/contracts` 是「编译产物 .js + .d.ts、后端相对路径 `../../../packages/contracts/*.js` 直接引用」的模式（ESM 语法，Node 对 CJS `require` 会重解析，已有运行先例）。`packages/saml` 照搬该模式。
- **nginx 路由（UAT，`deploy/nginx/conf.d/f8-uat.conf`）**：`location ^~ /live/ → 10.15.12.3:3000/`、`location ^~ /pbs/api/ → 10.15.12.3:3002/api/`。SSO 端点透传无需改 nginx。

## 4. 架构与登录时序

```
用户点「SSO Login」
  │ 前端 302 到 <apiBase>/auth/sso/login
  ▼
后端构造 SAML AuthnRequest → 302 到 Azure Entra ID (entryPoint)
  │ 用户在 Azure 登录
  ▼
Azure POST SAMLResponse → Reply URL (ACS)
  ▼
后端 validatePostResponseAsync → profile
  │ 提取 email（→ users/pbs_user.email，不区分大小写）
  │ 未命中 → 提取工号（→ users.user_code / pbs_user.user_code）
  │ 命中 → 过 SSO 门槛（status+portalAccess+生效期，不含 passwordAccess）
  ▼
签发系统 JWT（authMode="sso"）→ 302 到 <redirectBase>/login?token=<jwt>
  ▼
前端 POST /auth/sso/callback {token} → 后端校验 → 返回会话 → 写入 sessionStorage
```

## 5. 共享 helper：`packages/saml/`

### 5.1 包形态

- 目录 `packages/saml/`：`src/`（TS 源码）+ `dist/`（编译产物 `.js` + `.d.ts`）+ `package.json`（`name: "@rois/saml"`，`private: true`，`type: module`）+ `tsconfig.json`。
- 编译：包内 `tsc`（或根脚本 `build:saml`），产物提交进 git（镜像 `packages/contracts`）。
- 消费：两后端相对路径 `../../../packages/saml/dist/index.js`；Node16 解析沿用 contracts 现有行为。

### 5.2 内容（纯函数封装 `@node-saml/node-saml`）

```ts
// packages/saml/src/index.ts
export type SamlSpConfig = {
  callbackUrl: string      // 绝对 ACS URL（Azure 侧必须一致）
  entryPoint: string       // Azure SSO endpoint（login.microsoftonline.com/<tenant>/saml2）
  issuer: string           // 本 SP Entity ID（urn:rois:gantt-sso / urn:rois:pbs-sso）
  idpCert: string          // Azure SAML 签名证书（base64）
  privateKey?: string      // SP 私钥（PEM，用于签名 AuthnRequest）
  publicCert?: string      // SP 证书（PEM，用于 metadata 与签名校验）
  wantAssertionsSigned: boolean
  acceptedClockSkewMs: number
  validateInResponseTo: 'always' | 'never' | 'ifPresent'
}

export type SamlIdentity = { email?: string; userCode?: string }

export function createSamlSp(config: SamlSpConfig): SAML
export function getAuthorizeUrl(saml: SAML, relayState?: string): Promise<string>
export function validatePostResponse(saml: SAML, samlResponse: string): Promise<{ profile: Profile | null; loggedOut: boolean }>
export function generateMetadata(saml: SAML): string
export function extractIdentity(profile: Profile, attrMap: {
  emailAttr: string[];   // 候选 attribute URI/名称
  userCodeAttr: string[];// 候选 attribute URI/名称（工号）
}): SamlIdentity
```

- `extractIdentity`：从 profile 里按 env 配置的 attribute 候选列表取 email / 工号。Azure claims URI 很长（如 `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`），`@node-saml/node-saml` 已把常见 claims 归一化到 `profile.email` / `profile.mail`，自定义属性按完整 URI 读取——候选列表必须可配置，不硬编码。

### 5.3 依赖

- `@node-saml/node-saml@5.1.0`（MIT，纯 JS 依赖，2025-07 仍维护）。
- 安装到**根** `node_modules`（helper 从 `packages/saml/dist/` 向上解析到根），并同步声明进 live-server / pbs-server 的 `package.json`（保证各自 `npm audit` 覆盖；与 pg 在根+子项目重复声明的现状一致）。版本钉死一致。

## 6. 后端路由（两后端各一套）

路径前缀：live-server 最终为 `/api/auth/sso/*`（`index.ts` 统一加 `/api`）；pbs-server 为 `/auth/sso/*`。

| 端点 | 方法 | 作用 |
|------|------|------|
| `/sso/login` | GET | 构造 AuthnRequest → 302 到 Azure entryPoint |
| `/sso/acs` | POST | 验 SAMLResponse → 匹配用户 → 发 JWT → 302 `<redirectBase>?token=<jwt>`；失败 → 302 `<redirectBase>?sso_error=<msg>` |

> `redirectBase` = `SSO_REDIRECT_BASE`，**已含模块登录入口路径**（gantt=`.../altair`，LoginPage 在 App 根；pbs=`.../pbs/login`），后端统一追加 `?token=` / `?sso_error=`。
| `/sso/metadata` | GET | SP metadata XML（`Content-Type: application/xml`），供 Azure「使用 app 元数据 URL」导入 |
| `/sso/callback` | POST | body `{ token }` → 校验 JWT 且 `authMode === "sso"` → 返回会话对象 |
| `/sso/logout` | GET/POST | IdP-initiated logout 回跳目标 → 302 到 `<redirectBase>/login` |

### 6.1 公开路由白名单

- **live-server** `src/plugins/auth.ts` `PUBLIC_PATHS` 增加：`/api/auth/sso/login`、`/api/auth/sso/acs`、`/api/auth/sso/metadata`、`/api/auth/sso/callback`、`/api/auth/sso/logout`。
- **pbs-server** `src/plugins/auth.ts` 公开路由列表增加：`/auth/sso/login`、`/auth/sso/acs`、`/auth/sso/metadata`、`/auth/sso/callback`、`/auth/sso/logout`。

### 6.2 live-server 集成（新文件 `src/routes/auth/sso.ts`）

- 复用 `buildAuthPayload`（加 `authMode: "sso"`）+ `jwt.sign`（`env.JWT_SECRET`，24h）。
- SSO 登录响应与 `POST /api/auth/login` **同构**：`{ token, userCode, userName, schema, isAdmin, menus, ctrls, dataScope }`（gantt auth-store 直接复用）。
- SSO 成功同样走 `resolvePermissionContext` / `storePermissionContext`，权限链路与密码登录一致。

### 6.3 pbs-server 集成（`auth-service` 扩展）

- `PbsAuthService` 增加 `loginViaSso(identity: { email?: string; userCode?: string }, context): Promise<AuthenticatedLoginResponse>`：
  - 匹配 `pbs_user`：`lower(email) = lower($email)` 优先，未命中 `user_code = $userCode`。
  - 门槛：`status === 0` + `portalAccess` 开启 + 生效期（**不含 passwordAccess**）。
  - 成功：`updateSuccessfulLogin`（`lastLoginAt` / `failedLoginCount` 复位 / `lockedUntil` 清空）。
  - `buildPayload` 支持 `authMode: "sso"`（当前写死 `"password"`，需参数化）。
  - 签发 JWT + `writeCachedPayload`。
- 路由 `src/routes/auth.ts` 增加 `/auth/sso/login`、`/auth/sso/acs`、`/auth/sso/callback`、`/auth/sso/metadata`、`/auth/sso/logout`。

### 6.4 `/sso/callback` 语义（两后端一致）

- body `{ token: string }`。
- 校验：JWT 签名 + `authMode === "sso"`（live 新增的可选 payload 字段 / pbs 已有）+ 用户仍有效（`validatePayload` / `validateAuthPayload`）。
- 通过 → 返回与各自登录接口同构的会话对象。
- 不通过 → 401。

## 7. 用户匹配规则（两后端一致）

1. **email 优先，不区分大小写**：`WHERE lower(email) = lower($1)`（pbs_user 实测存在大小写混存）。
2. 未命中 → **user_code 精确匹配**（与现有登录的 case-sensitive 语义一致）。
3. 命中后过 SSO 门槛：`status===0` + `portalAccess` 开启 + `effDt<=now && (expDt is null || expDt>now)`。**不查 passwordAccess**。
4. 未匹配或门槛不过 → 401 / 403，log 带 `sso_identity` 便于排查。

## 8. 前端

### 8.1 gantt（新增）

- `src/components/auth/login-page.tsx`：密码表单下方新增「SSO Login」按钮（复用现有按钮形态与样式标准，UI 英文）。
- SSO URL：`src/config/env.ts` 增加 `ssoLoginUrl`，默认 `${LIVE_API_BASE}/api/auth/sso/login`，`VITE_SSO_LOGIN_URL` 可覆盖。点击 → `window.location.assign(ssoLoginUrl)`。
- login-page 处理 `?token=` / `?sso_error=`：有 token → 调 `completeSso(token)`；有 sso_error → 展示错误；成功后清除 URL 参数。
- `src/stores/auth-store.ts` 增加 `completeSso(token)`：`POST /api/auth/sso/callback {token}` → 结果写入 sessionStorage `rois-auth`（与 `login()` 同构）。
- `src/services/api.ts` / http-client：无需改动（回调后由 store 写 header）。

### 8.2 pbs-portal（基本不改）

- 现有 SSO 流程直接对接后端新路由。仅确认/配置 `SSO_REDIRECT_BASE` 指向 `/pbs/login`（ACS 后 302 目标）。

## 9. 配置（env，全部参数化）

两后端各一组（`.env.example` 补充，生产走 `.env` 注入）：

| 变量 | 说明 |
|------|------|
| `SSO_ENABLED` | `true`/`false`，false 时 SSO 端点统一返回 404（与 AI 后端未部署的既有处理一致） |
| `SSO_ENTITY_ID` | `urn:rois:gantt-sso` / `urn:rois:pbs-sso` |
| `SSO_CALLBACK_URL` | 绝对 ACS URL（三个地址里的 Reply URL） |
| `SSO_IDP_ENTRY_POINT` | `https://login.microsoftonline.com/<tenant-id>/saml2` |
| `SSO_IDP_CERT` | Azure SAML 签名证书（base64） |
| `SSO_PRIVATE_KEY` | SP 私钥 PEM（base64 或路径） |
| `SSO_PUBLIC_CERT` | SP 证书 PEM |
| `SSO_REDIRECT_BASE` | ACS 成功后前端回跳的**登录入口页**（含路径）：gantt=`https://crew-f8-usva-uat.roiscloud.com/altair`（LoginPage 在 App 根），pbs=`https://crew-f8-usva-uat.roiscloud.com/pbs/login`；后端追加 `?token=` / `?sso_error=` |
| `SSO_EMAIL_ATTRS` | email 属性候选（逗号分隔 URI/名称） |
| `SSO_USERCODE_ATTRS` | 工号属性候选（逗号分隔 URI/名称） |

## 10. 三个接口地址（交付 Azure 侧）

### ROIS-Gantt 企业应用

| 配置项 | 值 |
|--------|----|
| **Identifier (Entity ID)** | `urn:rois:gantt-sso` |
| **Reply URL — UAT** | `https://crew-f8-usva-uat.roiscloud.com/live/api/auth/sso/acs` |
| **Reply URL — SIT**（同 app 追加） | `https://crew-f8-usva-sit.roiscloud.com/live/api/auth/sso/acs` |
| **Logout URL** | `https://crew-f8-usva-uat.roiscloud.com/live/api/auth/sso/logout` |

### ROIS-PBS 企业应用

| 配置项 | 值 |
|--------|----|
| **Identifier (Entity ID)** | `urn:rois:pbs-sso` |
| **Reply URL — UAT** | `https://crew-f8-usva-uat.roiscloud.com/pbs/api/auth/sso/acs` |
| **Reply URL — SIT**（同 app 追加） | `https://crew-f8-usva-sit.roiscloud.com/pbs/api/auth/sso/acs` |
| **Logout URL** | `https://crew-f8-usva-uat.roiscloud.com/pbs/api/auth/sso/logout` |

- Entity ID 用稳定 URN（不含 host），SIT/UAT 共用；会出现在 AuthnRequest / metadata 中，不要求真实可解析。
- Azure 的 Logout URL 是**单值**字段（一个 app 只能填一个），先填 UAT，SIT 联调时再切。应用内登出依赖 JWT `token_version` 撤销，不依赖该 URL。
- 上线后可把 `/api/auth/sso/metadata` 填进 Azure「使用 app 元数据 URL」，自动同步 Identifier/Reply URL。

### 10.1 Azure IdP 联调参数（已从 Azure 门户获取，2026-08-12）

两个企业应用共用同一 tenant（`52477d13-d470-49c8-b184-45cdb3857fab`）：

| 参数 | 值 | 后端 env |
|------|----|---------|
| Tenant ID | `52477d13-d470-49c8-b184-45cdb3857fab` | — |
| IdP login URL（entryPoint） | `https://login.microsoftonline.com/52477d13-d470-49c8-b184-45cdb3857fab/saml2` | `SSO_IDP_ENTRY_POINT` |
| IdP Entra Identifier（断言 Issuer） | `https://sts.windows.net/52477d13-d470-49c8-b184-45cdb3857fab/` | `idpIssuer`（node-saml 校验断言签发者，增强安全性） |
| SP Entity ID — Gantt | `urn:rois:gantt-sso` | `SSO_ENTITY_ID` |
| SP Entity ID — PBS | `urn:rois:pbs-sso` | `SSO_ENTITY_ID` |

**待补充**：每个企业应用的 SAML 签名证书（base64）→ `SSO_IDP_CERT`（Gantt 与 PBS 各自一张，不共用）。

## 11. 安全考虑

- `wantAssertionsSigned: true`、`signatureAlgorithm: 'sha256'`、`acceptedClockSkewMs` 收紧（如 30s~60s）、`validateInResponseTo: 'ifPresent'`。
  - 取舍：多实例（pbs 2-4 实例）下 node-saml 的 in-memory replay cache 跨实例无效，`'always'` 需要共享 cacheProvider（本轮不做），先 `'ifPresent'`，记为已知取舍。
- SP 私钥、Azure 证书仅存 env，禁止写入文档/代码/日志。
- **已知取舍**：`?token=<JWT>` 会出现在浏览器历史/URL。这是 pbs-portal 既有契约，为最小改动保留；后续可演进为「一次性 code 换取 JWT」（本轮范围外）。
- `SSO_ENABLED=false` 时 SSO 端点不可用，避免误暴露。

## 12. 测试策略

### 12.1 后端 Vitest

- `packages/saml`：metadata 生成、`extractIdentity` 属性提取（含大小写、候选顺序）。
- live-server：mock `@node-saml/node-saml`；测
  - `/api/auth/sso/login` → 302 到 Azure（带 SAMLRequest）；
  - `/api/auth/sso/acs` → 验签成功 → 匹配 → 发 JWT → 302 `?token=`；
  - email 大小写不敏感匹配、未匹配 → 401、门槛不过 → 403；
  - `/api/auth/sso/callback` → 有效 sso token 返回会话、伪造/密码 token → 401。
- pbs-server：`loginViaSso` 单测 + 路由集成测试同上。

### 12.2 Playwright E2E（UI 门禁，§Playwright-Required）

- gantt：登录页出现「SSO Login」按钮 → 点击跳转到 `/live/api/auth/sso/login`；route interception 注入假 SAML 流（或 stub Azure 302 后直接回跳 `?token=`）→ 断言登录成功进入系统；`?sso_error=` 路径断言错误文案。
- pbs-portal：SSO Login 按钮 → 跳转 → 回跳 token → 登录成功（沿用现有 `login-page` E2E 风格）。
- 真实 Azure 联调不在 Playwright 自动化内（需要真实 IdP + 凭证），由人工在 UAT 验证。

## 13. 部署 / 影响面

- **nginx**：无需改动（`/live/`、`/pbs/api/` 已透传）。
- **live-server / pbs-server**：新增依赖 `@node-saml/node-saml`（根 + 各后端）；新增 `routes/auth/sso` 与 auth-service 扩展；公开路由白名单补充。
- **gantt**：login-page + auth-store + env 变更。
- **pbs-portal**：无代码变更（或仅确认 redirect base）。
- **Azure 侧**：建两个企业应用，填 §10 的三个地址；导出 IdP metadata / 签名证书到后端 env；配置属性映射（email、工号）。
- **数据前提**：`users.email` 回填为后续独立任务（D8）。

## 14. 范围外 / 后续

- `users.email` 回填。
- 一次性 code 换取 JWT（替代 URL 里直接暴露 JWT）。
- SAML replay 防护升级（共享 cacheProvider，`validateInResponseTo: 'always'`）。
- IdP 发起的完整 SLO（SP 侧退出）流程精化。
- 自动建号（D4 已定本轮拒绝登录）。
