# PBS Portal 登录密码加密传输设计 Spec

日期：2026-07-03
模块：`pbs-portal`、`pbs-server`、`packages/contracts`
背景：审计反馈 PBS Portal 登录页面密码存在明文传输风险，需要改为加密传输。

## 目标

- PBS Portal 登录请求的 HTTP payload 中不再出现明文密码。
- PBS Server 只接受加密后的密码字段，不再兼容 `{ password: "..." }` 明文字段。
- 后端解密后继续复用现有 bcrypt 校验逻辑，不改变密码存储方式。
- 兼容现有登录入口：`/api/auth/session` 与 legacy `/api/auth/login` 都必须使用同一套加密契约。
- 补齐后端、前端、E2E 与人工 QA 验收，保证审计可复查。

## 非目标

- 不修改 `password_hash` / bcrypt 存储机制。
- 不重做 JWT、Bearer Token、refresh/session 体系。
- 不新增 MFA、SSO、密码重置、密码轮换功能。
- 不为生产引入不必要的新依赖；优先使用 Node `crypto` 与浏览器 WebCrypto。
- 不把私钥、测试账号密码、Token 或数据库连接信息写入代码或文档。

## 推荐方案

采用 RSA-OAEP + SHA-256：

1. PBS Server 从环境变量加载 RSA 私钥和 `keyId`。
2. PBS Server 提供无认证 public key 查询接口。
3. PBS Portal 登录前获取 public key。
4. 浏览器使用 WebCrypto 将用户输入的密码加密成 base64 ciphertext。
5. 登录请求只发送 `encryptedPassword` 和加密元数据。
6. PBS Server 用私钥解密后，将解密出的密码传给现有 `authService.login(userCode, password, context)`。
7. 明文字段 `password` 一律拒绝，返回 400，且不调用认证服务。

### 为什么选 RSA-OAEP

- 满足“密码不得明文出现在传输 payload”的审计要求。
- 浏览器原生支持 `crypto.subtle`，不需要新增前端加密依赖。
- Node 原生 `crypto.privateDecrypt` 支持 RSA-OAEP-SHA256。
- 公钥可以安全暴露，私钥只留在 PBS Server 环境变量中。
- 相比前端 hash/base64/固定 AES key，RSA-OAEP 不把可逆密钥放在客户端，也更容易通过安全审计。

## API 契约

### Public Key 接口

新增 route：

```text
GET /api/auth/password-public-key
```

建议在 `packages/contracts/pbs-auth` 中新增：

```ts
pbsAuthRoutes.passwordPublicKey = "/auth/password-public-key"
```

响应：

```ts
export type PbsPasswordPublicKeyResponse = {
  keyId: string;
  algorithm: "RSA-OAEP-256";
  publicKeyPem: string;
};
```

约束：

- `publicKeyPem` 使用 SPKI PEM 格式。
- 接口不需要登录态。
- 建议返回 `Cache-Control: no-store`，避免 key rotation 时客户端长期缓存旧 key。
- 只返回公钥，绝不返回私钥。

### 登录请求

将 `PbsLoginRequest` 改为加密形态：

```ts
export type PbsLoginRequest = {
  userCode: string;
  encryptedPassword: string;
  encryption: {
    algorithm: "RSA-OAEP-256";
    keyId: string;
  };
};
```

请求示例：

```json
{
  "userCode": "10001",
  "encryptedPassword": "base64-rsa-oaep-ciphertext",
  "encryption": {
    "algorithm": "RSA-OAEP-256",
    "keyId": "pbs-login-2026-07"
  }
}
```

拒绝规则：

- 请求体包含 `password` 字段：400。
- 缺少 `encryptedPassword`：400。
- `encryption.algorithm` 不是 `RSA-OAEP-256`：400。
- `encryption.keyId` 与服务端当前 key 不匹配：400。
- `encryptedPassword` 不是合法 base64 或长度异常：400。
- 解密失败：400。

错误响应使用现有 PBS Server 错误格式，错误文案保持通用，不暴露“key 是否正确”“解密哪一步失败”等细节。

## 后端设计

### 环境变量

新增 PBS Server 环境变量：

```text
PBS_AUTH_RSA_PRIVATE_KEY
PBS_AUTH_RSA_KEY_ID
```

要求：

- `PBS_AUTH_RSA_PRIVATE_KEY` 为 PEM 私钥，可支持 `.env` 中转义换行 `\n`，启动时归一化。
- `PBS_AUTH_RSA_KEY_ID` 为当前密钥版本，例如 `pbs-login-2026-07`。
- 生产环境缺少或解析失败时应 fail fast。
- 生产环境必须显式配置私钥；开发 / 测试环境允许使用测试 fixture key 或进程内临时 key，不使用生产密钥。

### 主要改动点

- `pbs-server/src/config`：校验并加载 RSA 私钥配置。
- `pbs-server/src/routes/auth.ts`：新增 public key route；登录 schema 改为加密 payload；禁止明文 `password`。
- `pbs-server/src/services/auth` 或相邻 util：新增 password decrypt helper。
- `packages/contracts/pbs-auth.*`：同步 route 与类型契约。
- 保持 `authService.login(userCode, password, context)` 内部语义不变，bcrypt 校验逻辑不动。

### 解密逻辑

后端使用 Node `crypto`：

```ts
privateDecrypt(
  {
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  Buffer.from(encryptedPassword, "base64"),
)
```

安全要求：

- 解密前做 base64 与长度校验。
- 不记录明文密码。
- 不记录完整 ciphertext。
- 认证失败、解密失败、字段错误使用通用错误信息。
- 私钥只存在服务端环境变量，不提交到仓库。

## 前端设计

### 主要改动点

- `pbs-portal/src/shared/services/auth-service.ts`：登录时先取 public key，再加密密码，再 POST 加密 payload。
- 可新增 `pbs-portal/src/shared/services/password-encryption.ts` 或同级 helper，封装 WebCrypto 逻辑。
- `pbs-portal/src/features/auth/store/use-auth-session-store.ts` 可以继续接受 `{ userCode, password }`，避免 UI 层大范围改动。
- `login-page.tsx` 继续使用密码输入框，但网络请求体不得包含 `password` 字段或原始密码值。

### 加密流程

1. 用户提交登录表单。
2. `authService.login({ userCode, password })` 调用 `GET /api/auth/password-public-key`。
3. 将 SPKI PEM 转为 `ArrayBuffer`。
4. `crypto.subtle.importKey("spki", ..., { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"])`。
5. `crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, utf8Password)`。
6. 将 ciphertext 转 base64。
7. POST `/api/auth/session`，body 使用 `encryptedPassword` 和 `encryption`。
8. 登录完成后尽快清理局部 password 变量引用。

缓存策略：

- 推荐每次登录提交前拉取 public key，减少 key rotation 兼容复杂度。
- 不把 public key 存入 `localStorage` / `sessionStorage`。

## 兼容性与迁移策略

推荐决策：不保留明文 fallback。

理由：

- 审计问题的核心是“密码明文传输”，保留 fallback 会使问题继续存在。
- 登录入口数量有限，前后端可以同步上线。
- legacy `/api/auth/login` 也应使用相同加密契约，避免旧入口绕过。

上线前置条件：

- 所有 PBS Server 运行环境配置 `PBS_AUTH_RSA_PRIVATE_KEY` 与 `PBS_AUTH_RSA_KEY_ID`。
- 前端与后端版本一起部署。
- 生产 / UAT / staging 环境准备正式 RSA key；开发 / 自动化测试可使用测试 fixture key 或进程内临时 key。

如果业务强制要求灰度兼容，需要单独改 spec，并明确审计风险；当前 spec 不推荐该路径。

## 测试与验收

### 后端自动化测试

更新或新增 `pbs-server` 测试：

- `GET /api/auth/password-public-key` 返回 `keyId`、`RSA-OAEP-256`、SPKI PEM。
- `/api/auth/session` 使用 encrypted payload 登录成功，并确认传给 auth service 的是解密后的密码。
- `/api/auth/login` legacy 入口同样只接受 encrypted payload。
- `{ userCode, password }` 明文 payload 返回 400，且不调用 auth service。
- `keyId` 不匹配返回 400。
- 非 base64 / 超长 ciphertext 返回 400。
- 解密失败返回 400，错误信息不泄露内部细节。

### 前端自动化测试

更新或新增 `pbs-portal` 测试：

- `authService.login` 会先请求 public key，再发送 encrypted login body。
- 发送 body 中不存在 `password` 字段。
- 发送 body 中不包含用户输入的原始密码字符串。
- public key 拉取失败时，登录失败路径能展示现有错误态。
- 更新现有 LoginPage / auth store 测试预期，避免继续断言明文 payload。

### Playwright / E2E

新增或更新 PBS Portal 登录 E2E：

- 在真实页面输入密码并提交。
- 拦截登录请求，断言 request body：
  - 不包含 `password` 字段。
  - 不包含输入的明文密码。
  - 包含 `encryptedPassword`。
  - 包含 `encryption.algorithm = "RSA-OAEP-256"`。
  - 包含 `encryption.keyId`。
- 使用测试 key 完成一次真实登录 happy path。

### 人工 QA

新增 QA 文档：

```text
docs/test-cases/pbs/auth/2026-07-03-rsa-password-login.md
```

覆盖：

- Chrome/Safari DevTools Network 检查登录 payload。
- 确认 payload 中没有明文密码。
- 确认错误密码仍显示正常登录失败。
- 确认 `/api/auth/login` 旧入口不能接受明文密码。
- 确认服务端日志不出现明文密码。

### 预期验证命令

实施完成后至少运行：

```bash
npm --prefix pbs-server test
npm --prefix pbs-server run build
npm --prefix pbs-portal test
npm --prefix pbs-portal run build
```

如涉及 UI 或登录 E2E：

```bash
npm --prefix pbs-portal run lint
npm run check:ui
```

并运行对应 Playwright 登录测试。若完整命令过慢，可以先跑最小相关 case，但最终交付必须说明 PASS / FAIL 与未跑测试的风险。

## 版本与发布

这是跨前后端行为变更：

- 更新 PBS shared contracts。
- 更新 PBS Server 登录 API。
- 更新 PBS Portal 登录请求逻辑。
- 按项目规则 bump `gantt/src/version.ts` 中 frontend/backend 版本，具体 bump 范围在实施时按实际触达确认。
- 发布顺序建议后端与前端同批发布，避免新前端找不到 public key route，或新后端拒绝旧前端明文 payload。

## 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 环境未配置私钥 | 登录不可用 | 启动 fail fast，部署前检查 env |
| 前后端不同步上线 | 登录失败 | 同批发布，发布清单加入 public key endpoint 检查 |
| RSA key rotation | 旧 key 导致解密失败 | 每次登录前取 public key，`Cache-Control: no-store` |
| 浏览器 WebCrypto 兼容 | 旧浏览器无法登录 | PBS Portal 目标浏览器为现代 Chrome/Safari，应支持；测试覆盖 Safari |
| 日志泄露敏感信息 | 审计失败 | 禁止记录 password/ciphertext，错误信息通用 |
| 明文 fallback 残留 | 审计不通过 | schema 明确拒绝 `password` 字段，测试覆盖 |

## Multi-Agent Parallelism Assessment

- Recommendation: Yes, limited parallelism after spec approval.
- Rationale: 任务横跨 contracts、PBS Server、PBS Portal、E2E/QA 文档，可在契约确定后拆分，但共享 contract 需要主 agent 控制。
- Suggested split:
  - Agent A：`packages/contracts` + `pbs-server` route/config/decrypt/tests。
  - Agent B：`pbs-portal` auth service/WebCrypto/tests。
  - Agent C：Playwright 登录断言 + QA manual test doc。
  - Main agent：统一 contract、集成、版本 bump、最终验证。
- Write boundaries:
  - Agent A 不改 `pbs-portal`。
  - Agent B 不改 `pbs-server`。
  - Agent C 只改 E2E 与 `docs/test-cases/pbs/auth`。
  - Main agent 负责 shared contract 与冲突整合，或先落 contract 后分派。
- Conflict risk: Medium. `packages/contracts/pbs-auth.*` 是共享边界，必须先固定或由主 agent 独占。
- Execution gate: 必须等本 spec 经用户确认后，才开始实现或启动多 agent。

## 待确认

默认采用以下决策：

- 不保留明文登录兼容。
- 使用 RSA-OAEP-SHA256。
- public key endpoint 为 `/api/auth/password-public-key`。
- 私钥通过 `PBS_AUTH_RSA_PRIVATE_KEY` 注入，key id 通过 `PBS_AUTH_RSA_KEY_ID` 注入。

以上是当前建议 spec。确认后进入实现阶段。
