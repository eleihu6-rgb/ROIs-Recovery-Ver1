# Azure Entra ID SAML SSO 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 gantt 与 pbs-portal 通过 Microsoft Azure Entra ID 的 SAML 2.0 SSO 登录，验证通过后按 email/工号匹配本地 User 表并签发系统自己的 JWT。

**Architecture:** 两个后端（live-server / pbs-server）各自内嵌 SAML SP，共享 `@node-saml/node-saml` 的封装放 `packages/saml/`（CJS 编译产物，镜像 `packages/contracts` 的相对路径引用模式）。新增 `/api/auth/sso/*` 路由：login（302 到 Azure）、acs（验 SAMLResponse→匹配用户→发 JWT→302 回跳 `?token=`）、callback（换会话）、metadata（SP 元数据）、logout。复用两后端现有 JWT 签发链路。

**Tech Stack:** `@node-saml/node-saml@5.1.0`（MIT）、`@fastify/formbody`、Fastify、Drizzle、Zod、Vitest、Playwright。

## Global Constraints

- 共享包产物为 **CJS**（`module: CommonJS`，`type: commonjs`）——不能 `type: module`，否则后端 CJS `require()` 会抛 `ERR_REQUIRE_ESM`。
- `@node-saml/node-saml@5.1.0` 需安装到**根** node_modules（helper 运行时从 `packages/saml/dist/` 向上解析），并声明进 live-server / pbs-server 的 package.json（`npm audit` 覆盖）。
- SSO 匹配：**email 不区分大小写**（`lower(email) = lower($1)`）优先，未命中再按 `user_code` 精确匹配。
- SSO 门槛：`status===0` + `portalAccess` 开启 + 生效期内，**不要求 passwordAccess**。
- 未匹配 → 拒绝登录（401/403），不做 DB 写入。
- 密码登录与 SSO 登录并存；登录页按钮文案英文。
- SSO 环境变量全部走 env（`.env.example` 补充），密钥/证书不进代码与文档。
- `SSO_ENABLED=false` 时 SSO 路由不注册（访问返回 404）。
- 所有数据库对象小写；禁止硬编码业务常量。
- 测试纪律：每任务先写失败测试再实现；UI 变更必须带 Playwright 测试（§Playwright-Required）。
- 禁止自动 commit/push；每个任务结束提示用户等待 commit 命令（或按用户明确指示提交）。

---

### Task 1: `packages/saml` 共享包（CJS，含测试与构建）

**Files:**
- Create: `packages/saml/package.json`
- Create: `packages/saml/tsconfig.json`
- Create: `packages/saml/src/index.ts`
- Create: `packages/saml/src/index.test.ts`
- Modify: `package.json`（根，加 `build:saml` 脚本 + `@node-saml/node-saml` 依赖）
- Modify: `live-server/package.json`、`pbs-server/package.json`（加 `@node-saml/node-saml` 依赖）

**Interfaces:**
- Produces（后续 Task 3 / Task 5 的 sso 路由依赖）:
  - `createSamlSp(config: SamlSpConfig): SAML`
  - `getAuthorizeUrl(saml: SAML, relayState?: string): Promise<string>`
  - `validatePostResponse(saml: SAML, samlResponse: string): Promise<{ profile: Profile | null; loggedOut: boolean }>`
  - `generateMetadata(saml: SAML): string`
  - `extractIdentity(profile: Profile, attrMap: { emailAttrs: string[]; userCodeAttrs: string[] }): SamlIdentity`
  - `type SamlSpConfig = { callbackUrl; entryPoint; issuer; idpCert; privateKey?; publicCert?; wantAssertionsSigned; acceptedClockSkewMs; validateInResponseTo }`
  - `type SamlIdentity = { email?: string; userCode?: string }`
- 消费：`@node-saml/node-saml@5.1.0`（CJS，从根 node_modules 解析）

- [ ] **Step 1: 安装依赖并加根脚本**

```bash
# 在仓库根目录（worktree）
npm i @node-saml/node-saml@5.1.0
```

在根 `package.json` scripts 加：
```json
"build:saml": "tsc -p packages/saml/tsconfig.json"
```
在 `live-server/package.json` 与 `pbs-server/package.json` 的 `dependencies` 各加：
```json
"@node-saml/node-saml": "^5.1.0"
```

- [ ] **Step 2: 建 `packages/saml/package.json`**

```json
{
  "name": "@rois/saml",
  "private": true,
  "version": "0.0.0",
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: 建 `packages/saml/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: 写 `packages/saml/src/index.ts`**

```ts
import * as nodeSaml from "@node-saml/node-saml";

export type SamlSpConfig = {
  callbackUrl: string;          // 绝对 ACS URL（Azure Reply URL，必须一致）
  entryPoint: string;           // Azure SSO endpoint：https://login.microsoftonline.com/<tenant-id>/saml2
  issuer: string;               // SP Entity ID：urn:rois:gantt-sso / urn:rois:pbs-sso
  idpCert: string;              // Azure SAML 签名证书（base64）
  privateKey?: string;          // SP 私钥 PEM（签名 AuthnRequest）
  publicCert?: string;          // SP 证书 PEM（metadata / 签名校验）
  wantAssertionsSigned: boolean;
  acceptedClockSkewMs: number;
  validateInResponseTo: "always" | "never" | "ifPresent";
};

export type SamlIdentity = {
  email?: string;
  userCode?: string;
};

export type SamlProfile = nodeSaml.Profile;

export function createSamlSp(config: SamlSpConfig): nodeSaml.SAML {
  return new nodeSaml.SAML({
    callbackUrl: config.callbackUrl,
    entryPoint: config.entryPoint,
    issuer: config.issuer,
    idpCert: config.idpCert,
    privateKey: config.privateKey,
    publicCert: config.publicCert,
    wantAssertionsSigned: config.wantAssertionsSigned,
    acceptedClockSkewMs: config.acceptedClockSkewMs,
    validateInResponseTo: config.validateInResponseTo,
    signatureAlgorithm: "sha256",
  });
}

export async function getAuthorizeUrl(saml: nodeSaml.SAML, relayState?: string): Promise<string> {
  return saml.getAuthorizeUrlAsync(relayState ?? "", undefined, {});
}

export async function validatePostResponse(
  saml: nodeSaml.SAML,
  samlResponse: string,
): Promise<{ profile: nodeSaml.Profile | null; loggedOut: boolean }> {
  return saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
}

export function generateMetadata(saml: nodeSaml.SAML): string {
  return saml.generateServiceProviderMetadata(null, saml.options.publicCert ?? null);
}

export function extractIdentity(
  profile: SamlProfile,
  attrMap: { emailAttrs: string[]; userCodeAttrs: string[] },
): SamlIdentity {
  const pick = (attrs: string[]): string | undefined => {
    for (const attr of attrs) {
      const value = profile[attr];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return undefined;
  };
  const email = pick([...attrMap.emailAttrs, "email", "mail"]);
  const userCode = pick(attrMap.userCodeAttrs);
  return { email, userCode };
}
```

- [ ] **Step 5: 编译 + 冒烟测试（验证 CJS 互操作，防 `ERR_REQUIRE_ESM`）**

```bash
npm run build:saml
node -e "const m = require('./packages/saml/dist/index.js'); if (typeof m.createSamlSp !== 'function') process.exit(1); console.log('saml helper CJS OK:', Object.keys(m))"
```
Expected: 打印 `saml helper CJS OK: [...]`，exit 0。

- [ ] **Step 6: 写测试 `packages/saml/src/index.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { extractIdentity, createSamlSp } from "./index.js";

describe("extractIdentity", () => {
  const profile = {
    nameID: "ryan@flyflair.com",
    email: "Ryan@FlyFlair.com",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "ryan@flyflair.com",
    employeeId: "1001",
  };

  it("优先取第一个命中的 email 属性（含内置 email/mail 兜底）", () => {
    const id = extractIdentity(profile as never, {
      emailAttrs: ["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],
      userCodeAttrs: [],
    });
    expect(id.email).toBe("ryan@flyflair.com");
    expect(id.userCode).toBeUndefined();
  });

  it("email 属性缺失时兜底取内置 email/mail，并 trim", () => {
    const id = extractIdentity({ ...profile, email: "  a@b.com  " } as never, {
      emailAttrs: ["urn:missing"],
      userCodeAttrs: [],
    });
    expect(id.email).toBe("a@b.com");
  });

  it("提取工号属性（自定义 URI）", () => {
    const id = extractIdentity(profile as never, {
      emailAttrs: [],
      userCodeAttrs: ["employeeId"],
    });
    expect(id.userCode).toBe("1001");
  });

  it("非字符串属性值被忽略", () => {
    const id = extractIdentity({ email: 123 } as never, { emailAttrs: [], userCodeAttrs: [] });
    expect(id.email).toBeUndefined();
  });
});

describe("createSamlSp", () => {
  it("构造 SAML 实例不抛错", () => {
    const saml = createSamlSp({
      callbackUrl: "https://example.com/api/auth/sso/acs",
      entryPoint: "https://login.microsoftonline.com/t/saml2",
      issuer: "urn:rois:test",
      idpCert: "MII...",
      wantAssertionsSigned: true,
      acceptedClockSkewMs: 30000,
      validateInResponseTo: "ifPresent",
    });
    expect(saml).toBeDefined();
  });
});
```

- [ ] **Step 7: 跑测试**

```bash
cd packages/saml && npx vitest run
```
Expected: 全部 PASS（`createSamlSp` 测试若因缺合法 cert 抛错，则改断言为 `expect(() => createSamlSp(...)).not.toThrow()` 并在构造参数里用假 cert 字符串——node-saml 构造时不做格式强校验，正常应通过）。

- [ ] **Step 8: 提交（提示用户，等命令）**

```bash
git add packages/saml package.json live-server/package.json pbs-server/package.json
git commit -m "feat(saml): add shared packages/saml SP helper (@node-saml/node-saml CJS)"
```

---

### Task 2: live-server — session-auth 加 authMode + 抽取登录响应函数

**Files:**
- Modify: `live-server/src/services/auth/session-auth.ts`
- Create: `live-server/src/services/auth/login-response.ts`
- Modify: `live-server/src/routes/auth/auth.ts:92-109`（login 路由改用共享函数）

**Interfaces:**
- Consumes: 现有 `buildAuthPayload` / `hasLivePortalAccess`（`session-auth.ts`）
- Produces:
  - `AuthPayload.authMode?: "password" | "sso"`（可选字段，兼容存量 token）
  - `buildAuthPayload(user, permVersion = 1, authMode: "password" | "sso" = "password")`
  - `hasSsoPortalAccess(user, now): boolean`（不含 passwordAccess）
  - `buildLoginResponse(fastify, user, authMode, existingToken?): Promise<LoginResponseShape>`（`login-response.ts`）
  - `type LoginResponseShape = { token; userCode; userName; schema; isAdmin; menus; ctrls; dataScope }`

- [ ] **Step 1: 写失败测试 `live-server/src/services/auth/session-auth.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildAuthPayload, hasSsoPortalAccess } from "./session-auth.js";

describe("buildAuthPayload authMode", () => {
  const user = {
    userCode: "Ryan", userName: "Ryan", schema: "f8", isAdmin: 0,
    tokenVersion: 0, effDt: new Date(0), expDt: null, status: 0,
    passwordAccess: "N", portalAccess: "Y",
  } as never;

  it("默认 authMode=password（兼容存量调用）", () => {
    const p = buildAuthPayload(user);
    expect(p.authMode).toBe("password");
  });

  it("可指定 authMode=sso", () => {
    const p = buildAuthPayload(user, 1, "sso");
    expect(p.authMode).toBe("sso");
  });
});

describe("hasSsoPortalAccess", () => {
  const base = { status: 0, passwordAccess: "N", portalAccess: "Y", effDt: new Date(Date.now() - 1000), expDt: null };
  it("不要求 passwordAccess", () => {
    expect(hasSsoPortalAccess(base as never, new Date())).toBe(true);
  });
  it("portalAccess 关闭则拒绝", () => {
    expect(hasSsoPortalAccess({ ...base, portalAccess: "N" } as never, new Date())).toBe(false);
  });
  it("生效期外拒绝", () => {
    expect(hasSsoPortalAccess({ ...base, effDt: new Date(Date.now() + 10000) } as never, new Date())).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd live-server && npx vitest run src/services/auth/session-auth.test.ts
```
Expected: FAIL（`authMode` / `hasSsoPortalAccess` 不存在）。

- [ ] **Step 3: 实现 `session-auth.ts` 修改**

在 `AuthPayload` 接口加可选字段：
```ts
export interface AuthPayload {
  userCode: string
  userName: string
  schema: string
  isAdmin: number
  tokenVersion: number
  /** 权限版本号；登录时写入，权限变更后递增。旧 JWT 缺失时为 undefined（跳过陈旧校验） */
  permVersion?: number
  /** 登录方式；SSO 登录签发时为 "sso"，存量 token 缺省视为 "password" */
  authMode?: 'password' | 'sso'
}
```

`buildAuthPayload` 增加第三参数（保持向后兼容）：
```ts
export const buildAuthPayload = (
  user: UserRow,
  permVersion = 1,
  authMode: 'password' | 'sso' = 'password',
): AuthPayload => ({
  userCode: user.userCode,
  userName: user.userName,
  schema: LIVE_AUTH_SCHEMA,
  isAdmin: user.isAdmin,
  tokenVersion: user.tokenVersion,
  permVersion,
  authMode,
})
```

新增 SSO 门槛（跳过 passwordAccess）：
```ts
/** SSO 门槛：不要求 passwordAccess（SSO 是认证方式本身），其余与密码登录一致 */
export const hasSsoPortalAccess = (user: UserRow, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.portalAccess)
  && user.effDt <= now
  && (user.expDt === null || user.expDt > now)
```

`validateAuthPayload` 重建 payload 时保留原 authMode（否则 SSO token 校验后 authMode 被重置为 password）：
```ts
  // 保留原 JWT 的 permVersion 与 authMode，重建其余字段
  return buildAuthPayload(user, payload.permVersion, payload.authMode ?? 'password')
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd live-server && npx vitest run src/services/auth/session-auth.test.ts
```
Expected: PASS。

- [ ] **Step 5: 实现 `login-response.ts`（抽取登录响应构造，login 与 sso 复用）**

```ts
import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../../config/index.js'
import {
  buildAuthPayload,
  LIVE_AUTH_SCHEMA,
  type AuthPayload,
} from './session-auth.js'
import {
  getPermissionVersion,
  permissionKey,
  resolvePermissionContext,
  storePermissionContext,
} from '../permission/permission-service.js'
import { PERMISSION_CACHE_TTL_SEC } from '../../types/permission.js'
import type { users } from '../../models/system/users.js'

export type LoginResponseShape = {
  token: string
  userCode: string
  userName: string
  schema: string
  isAdmin: number
  menus: string[]
  ctrls: Record<string, string[]>
  dataScope: {
    FILIALE: string[]
    DIVISION: string[]
    CREW_DEPARTMENT: string[]
    RANK: string[]
    FLEET: string[]
  }
}

/**
 * 构造登录成功响应：解析权限上下文 + 签发（或复用已有）JWT。
 * 密码登录与 SSO login/ACS 共用；existingToken 供 callback 回显同一 token，避免重复签发。
 */
export async function buildLoginResponse(
  fastify: FastifyInstance,
  user: typeof users.$inferSelect,
  authMode: AuthPayload['authMode'] = 'password',
  existingToken?: string,
): Promise<LoginResponseShape> {
  const permVersion = await getPermissionVersion(fastify.redis, LIVE_AUTH_SCHEMA)
  const ctx = await resolvePermissionContext(fastify.db, user.userCode, permVersion)
  await storePermissionContext(
    fastify.redis,
    permissionKey(LIVE_AUTH_SCHEMA, user.userCode),
    ctx,
    PERMISSION_CACHE_TTL_SEC,
  )

  const token = existingToken
    ?? jwt.sign(buildAuthPayload(user, permVersion, authMode), env.JWT_SECRET, { expiresIn: '24h' })

  return {
    token,
    userCode: user.userCode,
    userName: user.userName,
    schema: LIVE_AUTH_SCHEMA,
    isAdmin: user.isAdmin,
    menus: ctx.menus,
    ctrls: ctx.ctrls,
    dataScope: ctx.dataScope,
  }
}
```

- [ ] **Step 6: 重构 `routes/auth/auth.ts` login 路由使用共享函数**

替换第 92-108 行（`const permVersion = ...` 到 `return ok(reply, {...})`）为：
```ts
    const response = await buildLoginResponse(fastify, user)
    return ok(reply, response)
```
并在文件头部 import `buildLoginResponse`：
```ts
import { buildLoginResponse } from '../../services/auth/login-response.js'
```
删除登录路由不再使用的 import：`buildAuthPayload`、`getPermissionVersion`、`permissionKey`、`resolvePermissionContext`、`storePermissionContext`、`PERMISSION_CACHE_TTL_SEC`、`types/permission.js` 里的 `PermissionContext`。**保留 `jwt`**（`/me` 路由的 `getValidatedPayload` 仍在用）、保留 `getOrResolvePermissionContext` / `buildAdminContext`（`/me` 用）。

- [ ] **Step 7: 跑 live-server 现有 auth 测试确认无回归**

```bash
cd live-server && npx vitest run src/routes/auth/auth.test.ts src/services/auth/session-auth.test.ts
```
Expected: PASS。

- [ ] **Step 8: 提交（提示用户，等命令）**

```bash
git add live-server/src/services/auth/session-auth.ts live-server/src/services/auth/login-response.ts live-server/src/routes/auth/auth.ts
git commit -m "feat(live): AuthPayload authMode + shared buildLoginResponse; SSO access gate"
```

---

### Task 3: live-server — SSO env + formbody + 路由 + 白名单 + 测试

**Files:**
- Modify: `live-server/src/config/env.ts`
- Modify: `live-server/src/plugins/auth.ts`（PUBLIC_PATHS）
- Modify: `live-server/src/index.ts`（注册 formbody + ssoRoutes）
- Modify: `live-server/.env.example`
- Create: `live-server/src/routes/auth/sso.ts`
- Create: `live-server/src/routes/auth/sso.test.ts`
- Modify: `live-server/package.json`（`@fastify/formbody`）

**Interfaces:**
- Consumes: `createSamlSp` / `getAuthorizeUrl` / `validatePostResponse` / `generateMetadata` / `extractIdentity`（packages/saml）；`buildLoginResponse` / `hasSsoPortalAccess` / `validateAuthPayload` / `LIVE_AUTH_SCHEMA` / `buildAuthPayload`
- Produces: `GET /api/auth/sso/login`、`POST /api/auth/sso/acs`、`GET /api/auth/sso/metadata`、`POST /api/auth/sso/callback`、`GET|POST /api/auth/sso/logout`

- [ ] **Step 1: 加 `@fastify/formbody` 依赖**

```bash
cd live-server && npm i @fastify/formbody
```

- [ ] **Step 2: `env.ts` 加 SSO 配置**

在 `envSchema` object 加字段：
```ts
    SSO_ENABLED: boolFromEnv(false),
    SSO_ENTITY_ID: optionalNonBlankString(),
    SSO_CALLBACK_URL: optionalNonBlankString(),
    SSO_IDP_ENTRY_POINT: optionalNonBlankString(),
    SSO_IDP_CERT: optionalNonBlankString(),
    SSO_PRIVATE_KEY: optionalNonBlankString(),
    SSO_PUBLIC_CERT: optionalNonBlankString(),
    SSO_REDIRECT_BASE: optionalNonBlankString(),
    SSO_EMAIL_ATTRS: optionalNonBlankString(),
    SSO_USERCODE_ATTRS: optionalNonBlankString(),
```
在 superRefine 里加（prod-like 且启用时强制关键配置）：
```ts
    if (val.SSO_ENABLED) {
      for (const key of ['SSO_ENTITY_ID', 'SSO_CALLBACK_URL', 'SSO_IDP_ENTRY_POINT', 'SSO_IDP_CERT', 'SSO_REDIRECT_BASE'] as const) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SSO_ENABLED=true.`,
          })
        }
      }
    }
```

- [ ] **Step 3: `plugins/auth.ts` PUBLIC_PATHS 增加**

```ts
  '/api/auth/sso/login',
  '/api/auth/sso/acs',
  '/api/auth/sso/metadata',
  '/api/auth/sso/callback',
  '/api/auth/sso/logout',
```

- [ ] **Step 4: 写失败测试 `routes/auth/sso.test.ts`**

mock saml helper、config、permission-service；用真实 Fastify 实例挂 `fastify.db` / `fastify.redis` 的轻 mock。

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'

const h = vi.hoisted(() => ({
  authorizeUrl: 'https://login.microsoftonline.com/t/saml2?SAMLRequest=abc',
  profile: { nameID: '1001', email: 'ryan@flyflair.com', employeeId: '1001' },
  user: {
    userCode: 'Ryan', userName: 'Ryan', schema: 'f8', isAdmin: 0, tokenVersion: 0,
    passwordHash: 'x', status: 0, passwordAccess: 'N', portalAccess: 'Y',
    effDt: new Date(0), expDt: null, email: 'ryan@flyflair.com',
  },
  acsResult: { profile: null as never, loggedOut: false },
  /** 最近一次 drizzle sql 查询里捕获的字符串值（lower(email)=lower($1) 的 $1） */
  lastQueriedValue: undefined as string | undefined,
}))

// 用 drizzle `sql` proxy 捕获 where 条件里的插值，供 db mock 模拟 lower() 比较
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  const originalSql = actual.sql as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => unknown
  return {
    ...actual,
    sql: new Proxy(originalSql, {
      apply(target, thisArg, args) {
        const values = args.slice(1)
        const strVal = values.find((v) => typeof v === 'string')
        if (strVal !== undefined) h.lastQueriedValue = strVal as string
        return Reflect.apply(target, thisArg, args)
      },
    }),
  }
})

vi.mock('../../../../packages/saml/dist/index.js', () => ({
  createSamlSp: vi.fn(() => ({})),
  getAuthorizeUrl: vi.fn(async () => h.authorizeUrl),
  validatePostResponse: vi.fn(async () => h.acsResult),
  generateMetadata: vi.fn(() => '<md:EntityDescriptor entityID="urn:rois:gantt-sso"/>'),
  extractIdentity: vi.fn((profile) => ({ email: profile.email, userCode: profile.employeeId })),
}))

vi.mock('../../../config/index.js', () => ({
  env: {
    JWT_SECRET: 'test-secret', LIVE_SCHEMA: 'f8',
    SSO_ENABLED: true, SSO_ENTITY_ID: 'urn:rois:gantt-sso',
    SSO_CALLBACK_URL: 'https://host/live/api/auth/sso/acs',
    SSO_IDP_ENTRY_POINT: 'https://login.microsoftonline.com/t/saml2',
    SSO_IDP_CERT: 'cert', SSO_REDIRECT_BASE: 'https://host/altair',
    SSO_EMAIL_ATTRS: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    SSO_USERCODE_ATTRS: 'employeeId',
  },
}))

const perm = vi.hoisted(() => ({
  ctx: { menus: ['LIVE'], ctrls: { LIVE: ['LIVE_SAVE'] }, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] }, permVersion: 1 },
  resolvePermissionContext: vi.fn(async () => perm.ctx),
  storePermissionContext: vi.fn(async () => undefined),
  getPermissionVersion: vi.fn(async () => 1),
}))
vi.mock('../../../services/permission/permission-service.js', () => ({
  permissionKey: (schema: string, userCode: string) => `perm:${schema}:${userCode}`,
  resolvePermissionContext: perm.resolvePermissionContext,
  storePermissionContext: perm.storePermissionContext,
  getPermissionVersion: perm.getPermissionVersion,
}))

import { validatePostResponse, extractIdentity } from '../../../../packages/saml/dist/index.js'
import ssoRoutes from './sso.js'

/**
 * db mock 模拟 `lower(email) = lower($value)` / `user_code = $value` 的查询语义：
 * 仅当最近捕获的查询值（大小写不敏感地）等于 h.user.email 或精确等于 userCode 时命中。
 * 这样「大小写不敏感」测试真的验证了路由用了 email 去查（而不是假通过）。
 */
const buildApp = async () => {
  const app = Fastify()
  await app.register(import('@fastify/formbody'))
  app.decorate('db', {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const v = h.lastQueriedValue
            if (v && h.user.email.toLowerCase() === v.toLowerCase()) return [h.user]
            if (v && h.user.userCode === v) return [h.user]
            return []
          },
        }),
      }),
    }),
  })
  app.decorate('redis', {})
  await app.register(ssoRoutes, { prefix: '/api/auth' })
  return app
}

beforeEach(() => {
  h.acsResult = { profile: null, loggedOut: false }
  h.lastQueriedValue = undefined
  vi.mocked(validatePostResponse).mockReset()
  vi.mocked(extractIdentity).mockReset()
})

describe('GET /api/auth/sso/login', () => {
  it('302 到 Azure entryPoint', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/sso/login' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('https://login.microsoftonline.com')
  })
})

describe('POST /api/auth/sso/acs', () => {
  it('验签成功 → 匹配用户 → 302 带 token', async () => {
    h.acsResult = { profile: h.profile, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'ryan@flyflair.com', userCode: '1001' })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
    const loc = res.headers.location as string
    expect(loc).toMatch(/^https:\/\/host\/altair\?token=/)
    const token = new URL(loc).searchParams.get('token')!
    const decoded = jwt.verify(token, 'test-secret') as { authMode: string; userCode: string }
    expect(decoded.authMode).toBe('sso')
    expect(decoded.userCode).toBe('Ryan')
  })

  it('email 不区分大小写匹配（lower 查询命中）', async () => {
    // h.user 的 email 为 'ryan@flyflair.com'，profile.email 大写 'RYAN@FLYAIR.COM'
    h.acsResult = { profile: { ...h.profile, email: 'RYAN@FLYAIR.COM' }, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'RYAN@FLYAIR.COM', userCode: undefined })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
  })

  it('匹配不到用户 → 302 sso_error', async () => {
    h.acsResult = { profile: { ...h.profile, email: 'nobody@flyflair.com' }, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'nobody@flyflair.com', userCode: undefined })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('sso_error')
  })
})

describe('POST /api/auth/sso/callback', () => {
  it('有效 sso token → 返回会话（含 menus）', async () => {
    const app = await buildApp()
    const token = jwt.sign(
      { userCode: 'Ryan', userName: 'Ryan', schema: 'f8', isAdmin: 0, tokenVersion: 0, authMode: 'sso' },
      'test-secret',
    )
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/callback', payload: { token },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.token).toBe(token)
    expect(body.data.userCode).toBe('Ryan')
    expect(body.data.authMode).toBeUndefined() // live 登录响应不含 authMode（保持现状）
    expect(body.data.menus).toEqual(['LIVE'])
  })

  it('authMode 非 sso 的 token → 401', async () => {
    const app = await buildApp()
    const token = jwt.sign(
      { userCode: 'Ryan', userName: 'Ryan', schema: 'f8', isAdmin: 0, tokenVersion: 0, authMode: 'password' },
      'test-secret',
    )
    const res = await app.inject({ method: 'POST', url: '/api/auth/sso/callback', payload: { token } })
    expect(res.statusCode).toBe(401)
  })
})
```

> db mock 通过 drizzle `sql` proxy 捕获路由真正下发的查询值（email 或 user_code），并按 `lower()` 语义决定是否命中——因此「email 大小写不敏感」与「未匹配」两个测试是真实断言，不是恒通过的假测试。

- [ ] **Step 5: 跑测试确认失败**

```bash
cd live-server && npx vitest run src/routes/auth/sso.test.ts
```
Expected: FAIL（sso.ts 不存在）。

- [ ] **Step 6: 实现 `routes/auth/sso.ts`**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { sql, eq } from 'drizzle-orm'
import { env } from '../../config/index.js'
import { users } from '../../models/system/users.js'
import {
  createSamlSp,
  extractIdentity,
  generateMetadata,
  getAuthorizeUrl,
  validatePostResponse,
  type SamlIdentity,
  type SamlProfile,
  type SamlSpConfig,
} from '../../../../packages/saml/dist/index.js'
import {
  hasSsoPortalAccess,
  TOKEN_INVALID_MESSAGE,
  validateAuthPayload,
  type AuthPayload,
} from '../../services/auth/session-auth.js'
import { buildLoginResponse } from '../../services/auth/login-response.js'

// 相对路径：src/routes/auth/sso.ts → 上 4 层（../→routes, ../../→src, ../../../→live-server, ../../../../→根）→ packages/saml/dist/index.js

const samlConfig = (): SamlSpConfig => ({
  callbackUrl: env.SSO_CALLBACK_URL!,
  entryPoint: env.SSO_IDP_ENTRY_POINT!,
  issuer: env.SSO_ENTITY_ID!,
  idpCert: env.SSO_IDP_CERT!,
  privateKey: env.SSO_PRIVATE_KEY,
  publicCert: env.SSO_PUBLIC_CERT,
  wantAssertionsSigned: true,
  acceptedClockSkewMs: 30_000,
  validateInResponseTo: 'ifPresent',
})

const emailAttrs = (): string[] =>
  (env.SSO_EMAIL_ATTRS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const userCodeAttrs = (): string[] =>
  (env.SSO_USERCODE_ATTRS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const ok = (reply: FastifyReply, data: unknown) =>
  reply.send({ code: 200, data, message: 'ok' })

const fail = (reply: FastifyReply, code: number, message: string) =>
  reply.status(code).send({ code, data: null, message })

const callbackSchema = z.object({ token: z.string().min(1) })

async function resolveUser(
  fastify: FastifyInstance,
  identity: SamlIdentity,
): Promise<typeof users.$inferSelect | undefined> {
  if (identity.email) {
    const r = await fastify.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${identity.email})`)
      .limit(1)
    if (r[0]) return r[0]
  }
  if (identity.userCode) {
    const r = await fastify.db
      .select()
      .from(users)
      .where(eq(users.userCode, identity.userCode))
      .limit(1)
    return r[0]
  }
  return undefined
}

export default async function ssoRoutes(fastify: FastifyInstance) {
  fastify.get('/sso/login', async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = createSamlSp(samlConfig())
    const url = await getAuthorizeUrl(saml)
    return reply.redirect(url)
  })

  fastify.post('/sso/acs', async (request: FastifyRequest, reply: FastifyReply) => {
    const redirectBase = env.SSO_REDIRECT_BASE!
    const errorRedirect = () => reply.redirect(`${redirectBase}?sso_error=authentication_failed`)
    try {
      const body = request.body as { SAMLResponse?: string }
      if (!body?.SAMLResponse) return errorRedirect()
      const saml = createSamlSp(samlConfig())
      const { profile } = await validatePostResponse(saml, body.SAMLResponse)
      if (!profile) return errorRedirect()

      const identity = extractIdentity(profile as SamlProfile, { emailAttrs: emailAttrs(), userCodeAttrs: userCodeAttrs() })
      const user = await resolveUser(fastify, identity)
      if (!user) {
        request.log.warn({ sso_identity: identity }, 'SSO identity matched no live user')
        return reply.redirect(`${redirectBase}?sso_error=user_not_found`)
      }
      if (!hasSsoPortalAccess(user, new Date())) {
        return reply.redirect(`${redirectBase}?sso_error=access_denied`)
      }

      const response = await buildLoginResponse(fastify, user, 'sso')
      return reply.redirect(`${redirectBase}?token=${encodeURIComponent(response.token)}`)
    } catch (error) {
      request.log.error({ error }, 'SAML ACS validation failed')
      return errorRedirect()
    }
  })

  fastify.get('/sso/metadata', async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = createSamlSp(samlConfig())
    reply.type('application/xml').send(generateMetadata(saml))
  })

  fastify.post('/sso/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = callbackSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, 400, 'token is required')

    const payload = jwt.verify(parsed.data.token, env.JWT_SECRET) as AuthPayload
    if (payload.authMode !== 'sso') return fail(reply, 401, TOKEN_INVALID_MESSAGE)

    const validated = await validateAuthPayload(fastify.db, payload)
    const result = await fastify.db
      .select()
      .from(users)
      .where(eq(users.userCode, validated.userCode))
      .limit(1)
    const user = result[0]
    if (!user) return fail(reply, 401, TOKEN_INVALID_MESSAGE)

    const response = await buildLoginResponse(fastify, user, 'sso', parsed.data.token)
    return ok(reply, response)
  })

  fastify.get('/sso/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect(env.SSO_REDIRECT_BASE!)
  })
  fastify.post('/sso/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect(env.SSO_REDIRECT_BASE!)
  })
}
```

- [ ] **Step 7: `index.ts` 注册 formbody + ssoRoutes（SSO_ENABLED 时）**

```ts
import formbody from '@fastify/formbody'
import ssoRoutes from './routes/auth/sso.js'
```
在 `server.register(multipart, {...})` 之后：
```ts
    await server.register(formbody)
```
在 `await server.register(authRoutes, { prefix: '/api/auth' })` 之后：
```ts
    if (env.SSO_ENABLED) {
      await server.register(ssoRoutes, { prefix: '/api/auth' })
    }
```

- [ ] **Step 8: `.env.example` 补 SSO 段**

```bash
# ── Azure SAML SSO ───────────────────────────────────────────────
SSO_ENABLED=false
SSO_ENTITY_ID=urn:rois:gantt-sso
SSO_CALLBACK_URL=https://crew-f8-usva-uat.roiscloud.com/live/api/auth/sso/acs
SSO_IDP_ENTRY_POINT=https://login.microsoftonline.com/<tenant-id>/saml2
SSO_IDP_CERT=
SSO_PRIVATE_KEY=
SSO_PUBLIC_CERT=
SSO_REDIRECT_BASE=https://crew-f8-usva-uat.roiscloud.com/altair
SSO_EMAIL_ATTRS=http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
SSO_USERCODE_ATTRS=employeeId
```

- [ ] **Step 9: 跑测试 + 类型检查**

```bash
cd live-server && npx vitest run src/routes/auth/sso.test.ts src/services/auth/session-auth.test.ts src/routes/auth/auth.test.ts
npx tsc --noEmit
```
Expected: 全部 PASS，tsc 0 error。

- [ ] **Step 10: 集成冒烟（真实后端 + 本地 formbody，SSO_ENABLED=false 时 404）**

```bash
cd live-server && npm run dev
curl -i http://localhost:3000/api/auth/sso/login   # SSO_ENABLED 未开启时预期 404
```
Expected: 404（未启用）。确认启用后 302 到 Azure（人工在 UAT 验证）。

- [ ] **Step 11: 提交（提示用户，等命令）**

```bash
git add live-server/src/config/env.ts live-server/src/plugins/auth.ts live-server/src/index.ts live-server/src/routes/auth/sso.ts live-server/src/routes/auth/sso.test.ts live-server/.env.example live-server/package.json
git commit -m "feat(live): Azure SAML SSO routes (login/acs/callback/metadata/logout)"
```

---

### Task 4: pbs-server — auth-service 加 loginViaSso + authMode + 测试

**Files:**
- Modify: `pbs-server/src/services/auth/types.ts`
- Modify: `pbs-server/src/services/auth/auth-service.ts`
- Create: `pbs-server/src/services/auth/auth-service-sso.test.ts`

**Interfaces:**
- Consumes: 现有 `pbsUser` / `updateSuccessfulLogin` / `buildPayload` / `writeCachedPayload` / `jwt.sign`
- Produces:
  - `AuthMode = "password" | "sso"`（types.ts）
  - `buildPayload(user, authMode: AuthMode = "password")`
  - `hasSsoPortalLoginAccess(user, now): boolean`
  - `PbsAuthService.loginViaSso(identity: { email?: string; userCode?: string }, context: LoginRequestContext): Promise<AuthenticatedLoginResponse>`

- [ ] **Step 1: 写失败测试 `auth-service-sso.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const h = vi.hoisted(() => ({
  user: {
    id: 1, userCode: '0227', userName: 'Taylor Brown', crewId: '0227',
    email: 'taylor.brown@flyflair.com', passwordHash: 'x', status: 0,
    passwordAccess: 'N', portalAccess: '1', effDt: new Date(0), expDt: null,
    tokenVersion: 0, isAdmin: 0, failedLoginCount: 0, lastLoginAt: null,
    lastLoginIp: null, lockedUntil: null, updatedAt: new Date(),
  },
  queriedEmail: undefined as string | undefined,
}))

vi.mock('../../models/index.js', () => ({
  pbsUser: { id: 'id', userCode: 'userCode', email: 'email', portalAccess: 'portalAccess', passwordAccess: 'passwordAccess', status: 'status', effDt: 'effDt', expDt: 'expDt', crewId: 'crewId', failedLoginCount: 'failedLoginCount', lastLoginAt: 'lastLoginAt', lastLoginIp: 'lastLoginIp', lockedUntil: 'lockedUntil', tokenVersion: 'tokenVersion', isAdmin: 'isAdmin' },
}))

vi.mock('../../config/index.js', () => ({ env: { JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '24h' } }))

import { createPbsAuthService } from './auth-service.js'

const makeDb = () => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({ where: vi.fn((cond: unknown) => {
      // 捕获 sql 模板字面量里的字符串值用于断言
      return { limit: vi.fn(async () => [h.user]) }
    }) })),
  })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
})

beforeEach(() => { h.queriedEmail = undefined })

describe('loginViaSso', () => {
  it('按 email 匹配并签发 authMode=sso 的 JWT', async () => {
    const db = makeDb() as never
    const svc = createPbsAuthService({ db })
    const res = await svc.loginViaSso({ email: 'taylor.brown@flyflair.com' }, { ipAddress: null, userAgent: null })
    expect(res.authMode).toBe('sso')
    const decoded = jwt.verify(res.token, 'test-secret') as { authMode: string; userCode: string }
    expect(decoded.authMode).toBe('sso')
    expect(decoded.userCode).toBe('0227')
  })

  it('email 不匹配时按 userCode 兜底', async () => {
    // 第一次 email 查询返回空，第二次 userCode 查询命中
    let calls = 0
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => (++calls === 1 ? [] : [h.user]) }) }) }),
    } as never
    const svc = createPbsAuthService({ db })
    const res = await svc.loginViaSso({ email: 'x@x.com', userCode: '0227' }, { ipAddress: null, userAgent: null })
    expect(res.user.employeeNo).toBe('0227')
  })

  it('未匹配 → 401', async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as never
    const svc = createPbsAuthService({ db })
    await expect(svc.loginViaSso({ email: 'nobody@flyflair.com' }, { ipAddress: null, userAgent: null }))
      .rejects.toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd pbs-server && npx vitest run src/services/auth/auth-service-sso.test.ts
```
Expected: FAIL（`loginViaSso` 不存在）。

- [ ] **Step 3: 实现 types.ts**

```ts
export type AuthMode = "password" | "sso";
```
接口增加：
```ts
export interface PbsAuthService {
  login: ...
  loginViaSso: (identity: { email?: string; userCode?: string }, context: LoginRequestContext) => Promise<AuthenticatedLoginResponse>;
  ...
}
```

- [ ] **Step 4: 实现 auth-service.ts**

`buildPayload` 增加 authMode 参数（保持向后兼容）：
```ts
const buildPayload = (
  user: typeof pbsUser.$inferSelect,
  authMode: AuthMode = "password",
): AuthPayload => ({
  ...mapUserToSessionUser(user),
  userCode: user.userCode,
  userName: user.userName,
  authMode,
  isAdmin: user.isAdmin === 1,
  tokenVersion: user.tokenVersion,
})
```

新增 SSO 门槛：
```ts
const hasSsoPortalLoginAccess = (user: typeof pbsUser.$inferSelect, now: Date): boolean =>
  user.status === 0
  && hasEnabledAccess(user.portalAccess)
  && isWithinEffectiveWindow(user, now);
```

`validatePayload` 保留原 authMode：
```ts
      const validatedPayload = buildPayload(user, payload.authMode);
```

新增 `loginViaSso`（在返回对象里，`login` 之后）：
```ts
    async loginViaSso(identity, context): Promise<AuthenticatedLoginResponse> {
      let user: typeof pbsUser.$inferSelect | undefined;

      if (identity.email) {
        const r = await db
          .select()
          .from(pbsUser)
          .where(sql`lower(${pbsUser.email}) = lower(${identity.email})`)
          .limit(1);
        user = r[0];
      }

      if (!user && identity.userCode) {
        const r = await db
          .select()
          .from(pbsUser)
          .where(sql`${pbsUser.userCode} = ${identity.userCode}`)
          .limit(1);
        user = r[0];
      }

      if (!user) {
        throw new AuthServiceError(401, "No PBS account matches the SSO identity. Contact administrator.");
      }

      if (!hasSsoPortalLoginAccess(user, new Date())) {
        throw new AuthServiceError(403, "This PBS account cannot access the portal.");
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AuthServiceError(423, "This PBS account is locked.");
      }

      await updateSuccessfulLogin(db, user.id, context.ipAddress);

      const payload = buildPayload(user, "sso");
      const token = jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      });
      writeCachedPayload(
        buildTokenValidationCacheKey(user.id, payload.tokenVersion),
        payload,
        Date.now(),
      );

      return { token, ...buildSession(payload) };
    },
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd pbs-server && npx vitest run src/services/auth/auth-service-sso.test.ts src/services/auth/auth-service.test.ts
```
Expected: PASS（既有 auth-service.test.ts 无回归）。

- [ ] **Step 6: 提交（提示用户，等命令）**

```bash
git add pbs-server/src/services/auth/types.ts pbs-server/src/services/auth/auth-service.ts pbs-server/src/services/auth/auth-service-sso.test.ts
git commit -m "feat(pbs): auth-service loginViaSso + authMode sso"
```

---

### Task 5: pbs-server — SSO env + formbody + 路由 + 白名单 + 测试

**Files:**
- Modify: `pbs-server/src/config/env.ts`
- Modify: `pbs-server/src/plugins/auth.ts`（PUBLIC_ROUTES）
- Modify: `pbs-server/src/app.ts`（注册 formbody + ssoRoutes）
- Modify: `pbs-server/.env.example`
- Create: `pbs-server/src/routes/sso.ts`
- Create: `pbs-server/src/routes/sso.test.ts`
- Modify: `pbs-server/package.json`（`@fastify/formbody`）

**Interfaces:**
- Consumes: `createSamlSp` 等（packages/saml）；`fastify.authService.loginViaSso` / `validatePayload` / `getSessionFromPayload`
- Produces: `GET /api/auth/sso/login`、`POST /api/auth/sso/acs`、`GET /api/auth/sso/metadata`、`POST /api/auth/sso/callback`、`GET|POST /api/auth/sso/logout`

- [ ] **Step 1: 加 `@fastify/formbody` 依赖**

```bash
cd pbs-server && npm i @fastify/formbody
```

- [ ] **Step 2: `env.ts` 加 SSO 配置**

字段（与 live 一致，用 zod preprocess 的 optional string——pbs env.ts 无 `optionalNonBlankString`，可内联 `z.string().optional()`）：
```ts
    SSO_ENABLED: boolFromEnv(false),
    SSO_ENTITY_ID: z.string().optional(),
    SSO_CALLBACK_URL: z.string().optional(),
    SSO_IDP_ENTRY_POINT: z.string().optional(),
    SSO_IDP_CERT: z.string().optional(),
    SSO_PRIVATE_KEY: z.string().optional(),
    SSO_PUBLIC_CERT: z.string().optional(),
    SSO_REDIRECT_BASE: z.string().optional(),
    SSO_EMAIL_ATTRS: z.string().optional(),
    SSO_USERCODE_ATTRS: z.string().optional(),
```
superRefine 加：`if (val.SSO_ENABLED)` 时要求 `SSO_ENTITY_ID/SSO_CALLBACK_URL/SSO_IDP_ENTRY_POINT/SSO_IDP_CERT/SSO_REDIRECT_BASE` 非空。

- [ ] **Step 3: `plugins/auth.ts` PUBLIC_ROUTES 增加**

```ts
  { method: "GET", path: "/api/auth/sso/login" },
  { method: "POST", path: "/api/auth/sso/acs" },
  { method: "GET", path: "/api/auth/sso/metadata" },
  { method: "POST", path: "/api/auth/sso/callback" },
  { method: "GET", path: "/api/auth/sso/logout" },
  { method: "POST", path: "/api/auth/sso/logout" },
```

- [ ] **Step 4: 写失败测试 `routes/sso.test.ts`**（结构同 Task 3 Step 4，mock packages/saml + config，app 挂 authService mock）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import jwt from 'jsonwebtoken'

const h = vi.hoisted(() => ({
  authorizeUrl: 'https://login.microsoftonline.com/t/saml2?SAMLRequest=abc',
  profile: { nameID: '0227', email: 'taylor.brown@flyflair.com', employeeId: '0227' },
  acsResult: { profile: null as never, loggedOut: false },
}))

vi.mock('../../../packages/saml/dist/index.js', () => ({
  createSamlSp: vi.fn(() => ({})),
  getAuthorizeUrl: vi.fn(async () => h.authorizeUrl),
  validatePostResponse: vi.fn(async () => h.acsResult),
  generateMetadata: vi.fn(() => '<md:EntityDescriptor entityID="urn:rois:pbs-sso"/>'),
  extractIdentity: vi.fn((profile) => ({ email: profile.email, userCode: profile.employeeId })),
}))

vi.mock('../config/index.js', () => ({
  env: {
    JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '24h', PBS_SCHEMA: 'f8_pbs',
    SSO_ENABLED: true, SSO_ENTITY_ID: 'urn:rois:pbs-sso',
    SSO_CALLBACK_URL: 'https://host/pbs/api/auth/sso/acs',
    SSO_IDP_ENTRY_POINT: 'https://login.microsoftonline.com/t/saml2',
    SSO_IDP_CERT: 'cert', SSO_REDIRECT_BASE: 'https://host/pbs/login',
    SSO_EMAIL_ATTRS: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    SSO_USERCODE_ATTRS: 'employeeId',
  },
}))

import { validatePostResponse, extractIdentity } from '../../../packages/saml/dist/index.js'
import ssoRoutes from './sso.js'
import { AuthServiceError } from '../services/auth/auth-service.js'

const session = { user: { id: '1', name: 'Taylor Brown', employeeNo: '0227' }, authMode: 'sso' }

const buildApp = (overrides: Record<string, unknown> = {}) => {
  const app = Fastify()
  app.decorate('authService', {
    loginViaSso: vi.fn(async () => ({ token: 'sso-jwt', ...session })),
    validatePayload: vi.fn(async (p: { authMode?: string }) => {
      if (p.authMode !== 'sso') throw new AuthServiceError(401, 'bad')
      return p as never
    }),
    getSessionFromPayload: vi.fn(() => session),
    ...overrides,
  })
  return app
}

beforeEach(() => {
  h.acsResult = { profile: null, loggedOut: false }
  vi.mocked(validatePostResponse).mockReset()
  vi.mocked(extractIdentity).mockReset()
})

describe('POST /api/auth/sso/acs', () => {
  it('验签成功 → loginViaSso → 302 带 token', async () => {
    h.acsResult = { profile: h.profile, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'taylor.brown@flyflair.com', userCode: '0227' })
    const app = buildApp()
    await app.register(import('@fastify/formbody'))
    await app.register(ssoRoutes, { prefix: '/api' })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
    expect((res.headers.location as string)).toContain('token=sso-jwt')
  })

  it('未匹配 → 302 sso_error', async () => {
    h.acsResult = { profile: h.profile, loggedOut: false }
    vi.mocked(validatePostResponse).mockResolvedValue(h.acsResult as never)
    vi.mocked(extractIdentity).mockReturnValue({ email: 'nobody@flyflair.com', userCode: undefined })
    const app = buildApp()
    await app.register(import('@fastify/formbody'))
    await app.register(ssoRoutes, { prefix: '/api' })
    const res = await app.inject({
      method: 'POST', url: '/api/auth/sso/acs',
      payload: 'SAMLResponse=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.statusCode).toBe(302)
    expect((res.headers.location as string)).toContain('sso_error')
  })
})

describe('POST /api/auth/sso/callback', () => {
  it('有效 sso token → 返回会话', async () => {
    const app = buildApp()
    await app.register(ssoRoutes, { prefix: '/api' })
    const token = jwt.sign({ id: '1', userCode: '0227', userName: 'Taylor Brown', authMode: 'sso', tokenVersion: 0, isAdmin: false }, 'test-secret')
    const res = await app.inject({ method: 'POST', url: '/api/auth/sso/callback', payload: { token } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.token).toBe(token)
    expect(body.data.authMode).toBe('sso')
  })

  it('非 sso token → 401', async () => {
    const app = buildApp()
    await app.register(ssoRoutes, { prefix: '/api' })
    const token = jwt.sign({ id: '1', userCode: '0227', userName: 'Taylor Brown', authMode: 'password', tokenVersion: 0, isAdmin: false }, 'test-secret')
    const res = await app.inject({ method: 'POST', url: '/api/auth/sso/callback', payload: { token } })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 5: 跑测试确认失败**

```bash
cd pbs-server && npx vitest run src/routes/sso.test.ts
```
Expected: FAIL（sso.ts 不存在）。

- [ ] **Step 6: 实现 `routes/sso.ts`**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { env } from "../config/index.js";
import {
  createSamlSp,
  extractIdentity,
  generateMetadata,
  getAuthorizeUrl,
  validatePostResponse,
  type SamlIdentity,
  type SamlProfile,
  type SamlSpConfig,
} from "../../../packages/saml/dist/index.js";
import { AuthServiceError, TOKEN_INVALID_MESSAGE } from "../services/auth/auth-service.js";
import type { AuthPayload } from "../services/auth/types.js";
import { success } from "../utils/response.js";

const samlConfig = (): SamlSpConfig => ({
  callbackUrl: env.SSO_CALLBACK_URL!,
  entryPoint: env.SSO_IDP_ENTRY_POINT!,
  issuer: env.SSO_ENTITY_ID!,
  idpCert: env.SSO_IDP_CERT!,
  privateKey: env.SSO_PRIVATE_KEY,
  publicCert: env.SSO_PUBLIC_CERT,
  wantAssertionsSigned: true,
  acceptedClockSkewMs: 30_000,
  validateInResponseTo: "ifPresent",
});

const attrList = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const callbackSchema = z.object({ token: z.string().min(1) });

export default async function ssoRoutes(fastify: FastifyInstance) {
  fastify.get("/auth/sso/login", async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = createSamlSp(samlConfig());
    const url = await getAuthorizeUrl(saml);
    return reply.redirect(url);
  });

  fastify.post("/auth/sso/acs", async (request: FastifyRequest, reply: FastifyReply) => {
    const redirectBase = env.SSO_REDIRECT_BASE!;
    const errorRedirect = () => reply.redirect(`${redirectBase}?sso_error=authentication_failed`);
    try {
      const body = request.body as { SAMLResponse?: string };
      if (!body?.SAMLResponse) return errorRedirect();

      const saml = createSamlSp(samlConfig());
      const { profile } = await validatePostResponse(saml, body.SAMLResponse);
      if (!profile) return errorRedirect();

      const identity = extractIdentity(profile as SamlProfile, {
        emailAttrs: attrList(env.SSO_EMAIL_ATTRS),
        userCodeAttrs: attrList(env.SSO_USERCODE_ATTRS),
      });

      const result = await fastify.authService.loginViaSso(identity, {
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });
      return reply.redirect(`${redirectBase}?token=${encodeURIComponent(result.token)}`);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return reply.redirect(`${redirectBase}?sso_error=${error.statusCode === 401 ? "user_not_found" : "access_denied"}`);
      }
      request.log.error({ error }, "SAML ACS validation failed");
      return errorRedirect();
    }
  });

  fastify.get("/auth/sso/metadata", async (_request: FastifyRequest, reply: FastifyReply) => {
    const saml = createSamlSp(samlConfig());
    reply.type("application/xml").send(generateMetadata(saml));
  });

  fastify.post("/auth/sso/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = callbackSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: 400, data: null, message: "token is required" });

    const payload = jwt.verify(parsed.data.token, env.JWT_SECRET) as AuthPayload;
    if (payload.authMode !== "sso") {
      return reply.code(401).send({ code: 401, data: null, message: TOKEN_INVALID_MESSAGE });
    }
    try {
      const validated = await fastify.authService.validatePayload!(payload);
      return success(reply, {
        token: parsed.data.token,
        ...fastify.authService.getSessionFromPayload(validated),
      });
    } catch (error) {
      if (error instanceof AuthServiceError) return reply.code(error.statusCode).send({ code: error.statusCode, data: null, message: error.message });
      return reply.code(401).send({ code: 401, data: null, message: TOKEN_INVALID_MESSAGE });
    }
  });

  fastify.get("/auth/sso/logout", async (_request: FastifyRequest, reply: FastifyReply) => reply.redirect(env.SSO_REDIRECT_BASE!));
  fastify.post("/auth/sso/logout", async (_request: FastifyRequest, reply: FastifyReply) => reply.redirect(env.SSO_REDIRECT_BASE!));
}
```

> 相对路径核对：`pbs-server/src/routes/sso.ts` → `../../..` = `pbs-server` → `packages/saml/dist/index.js`。所以 `../../../packages/saml/dist/index.js`。与 `routes/auth.ts` 引用 contracts 的 `../../../packages/contracts/pbs-auth.js` 一致。

- [ ] **Step 7: `app.ts` 注册 formbody + ssoRoutes（SSO_ENABLED 时）**

```ts
import formbody from "@fastify/formbody";
import ssoRoutes from "./routes/sso.js";
```
在 multipart 注册后：
```ts
  await server.register(formbody);
```
在 authRoutes 注册后：
```ts
  if (env.SSO_ENABLED) {
    await server.register(ssoRoutes, { prefix: "/api" });
  }
```
`env` 已在 app.ts 顶部导入（检查 `../config/index.js` 的 env 导入是否已在）。

- [ ] **Step 8: `.env.example` 补 SSO 段**（同 Task 3 Step 8，entity/callback 换成 pbs 值）

- [ ] **Step 9: 跑测试 + 类型检查**

```bash
cd pbs-server && npx vitest run src/routes/sso.test.ts src/services/auth/auth-service-sso.test.ts
npx tsc --noEmit
```
Expected: PASS，tsc 0 error。

- [ ] **Step 10: 提交（提示用户，等命令）**

```bash
git add pbs-server/src/config/env.ts pbs-server/src/plugins/auth.ts pbs-server/src/app.ts pbs-server/src/routes/sso.ts pbs-server/src/routes/sso.test.ts pbs-server/.env.example pbs-server/package.json
git commit -m "feat(pbs): Azure SAML SSO routes (login/acs/callback/metadata/logout)"
```

---

### Task 6: gantt 前端 — SSO 按钮 + completeSso + env

**Files:**
- Modify: `gantt/src/config/api-paths.ts`（`SSO_LOGIN_URL`）
- Modify: `gantt/src/stores/auth-store.ts`（`completeSso`）
- Modify: `gantt/src/components/auth/login-page.tsx`（SSO 按钮 + token/sso_error 处理）
- Create: `gantt/src/stores/__tests__/auth-store-sso.test.ts`
- Modify: `gantt/.env.example`（`VITE_SSO_LOGIN_URL`）

**Interfaces:**
- Consumes: 后端 `POST /api/auth/sso/callback`（返回 live 登录同构响应）
- Produces: `authStore.completeSso(token): Promise<boolean>`；`SSO_LOGIN_URL` 常量

- [ ] **Step 1: 写失败测试 `auth-store-sso.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const api = {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  return { api };
});

vi.mock("@/services/api", () => ({
  api: h.api,
  getLastActivityAt: () => 0,
  resetActivity: vi.fn(),
  setOnUnauthorized: vi.fn(),
}));

import { useAuthStore } from "../auth-store";

const loginShape = {
  token: "jwt-1", userCode: "Ryan", userName: "Ryan", schema: "f8", isAdmin: 0,
  menus: ["LIVE"], ctrls: {}, dataScope: { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
};

beforeEach(() => { useAuthStore.setState({ user: null, token: null, permissions: null, loading: false, error: null }); h.api.post.mockReset(); });

describe("completeSso", () => {
  it("POST /api/auth/sso/callback 并写入会话", async () => {
    h.api.post.mockResolvedValue(loginShape);
    const ok = await useAuthStore.getState().completeSso("url-token");
    expect(ok).toBe(true);
    expect(h.api.post).toHaveBeenCalledWith("/api/auth/sso/callback", { token: "url-token" });
    const s = useAuthStore.getState();
    expect(s.user?.userCode).toBe("Ryan");
    expect(s.token).toBe("jwt-1");
    expect(s.permissions?.menus).toEqual(["LIVE"]);
    expect(sessionStorage.getItem("rois-auth")).toContain("jwt-1");
  });

  it("失败 → 返回 false 并设 error", async () => {
    h.api.post.mockRejectedValue(new Error("SSO login failed"));
    const ok = await useAuthStore.getState().completeSso("bad");
    expect(ok).toBe(false);
    expect(useAuthStore.getState().error).toBe("SSO login failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd gantt && npx vitest run src/stores/__tests__/auth-store-sso.test.ts
```
Expected: FAIL（`completeSso` 不存在）。

- [ ] **Step 3: 实现 `api-paths.ts`**

```ts
/** Azure SSO 登录入口；可用 VITE_SSO_LOGIN_URL 覆盖 */
export const SSO_LOGIN_URL =
  import.meta.env.VITE_SSO_LOGIN_URL ?? `${LIVE_API_BASE}/api/auth/sso/login`
```

- [ ] **Step 4: 实现 `auth-store.ts`**

在 `AuthStore` 接口加方法声明：
```ts
  /** 完成 Azure SSO 登录：用回跳 token 换取会话 */
  completeSso: (token: string) => Promise<boolean>
```
在 `login` 之后实现 `completeSso`（结构镜像 `login`）：
```ts
  completeSso: async (token) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post('/api/auth/sso/callback', { token })
      const data = res as unknown as {
        token: string
        userCode: string
        userName: string
        schema: string
        isAdmin: number
        menus?: string[]
        ctrls?: Record<string, string[]>
        dataScope?: PermissionInfo['dataScope']
      }
      const user: AuthUser = { userCode: data.userCode, userName: data.userName, schema: data.schema, isAdmin: data.isAdmin ?? 0 }
      const permissions: PermissionInfo = {
        menus: data.menus ?? [],
        ctrls: data.ctrls ?? {},
        dataScope: data.dataScope ?? { FILIALE: [], DIVISION: [], CREW_DEPARTMENT: [], RANK: [], FLEET: [] },
      }

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token: data.token }))
      api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
      resetActivity()

      set({ user, token: data.token, permissions, loading: false, error: null })
      get().startIdleMonitor()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SSO login failed'
      set({ loading: false, error: message })
      return false
    }
  },
```

- [ ] **Step 5: 实现 `login-page.tsx`**

在文件顶部 import `SSO_LOGIN_URL`：
```ts
import { LIVE_API_BASE, SSO_LOGIN_URL } from '@/config/api-paths'
```
组件内加状态与副作用（在现有 `handleSubmit` 附近）：
```ts
  const completeSso = useAuthStore((s) => s.completeSso)
  const [ssoSubmitting, setSsoSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const ssoError = params.get('sso_error')
    if (ssoError) setDisplayError(ssoError === 'user_not_found'
      ? 'This account is not linked. Contact your administrator.'
      : 'SSO sign-in failed. Please try again.')
    if (token && !useAuthStore.getState().token) {
      setSsoSubmitting(true)
      void completeSso(token).finally(() => setSsoSubmitting(false))
      // 清理 URL 中的 token，避免留在浏览器历史
      history.replaceState({}, '', window.location.pathname)
    }
  }, [completeSso])

  const handleSsoSubmit = () => {
    if (ssoSubmitting) return
    window.location.assign(SSO_LOGIN_URL)
  }
```

在 Sign In 按钮后加 SSO 按钮（沿用卡片内全宽按钮形态）：
```tsx
            <button
              type="button"
              onClick={handleSsoSubmit}
              disabled={ssoSubmitting}
              data-testid="login-sso"
              className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/25 text-sm font-semibold text-white transition-colors hover:border-white/50 disabled:pointer-events-none disabled:opacity-40"
            >
              {ssoSubmitting ? 'Connecting...' : 'SSO Login'}
            </button>
```
在 `handleSsoSubmit` 中把 `setDisplayError` 前置清空（与现有表单行为一致）。

- [ ] **Step 6: `.env.example` 补**

```bash
# Azure SSO 登录入口；留空自动拼 {LIVE_API_BASE}/api/auth/sso/login
VITE_SSO_LOGIN_URL=
```

- [ ] **Step 7: 跑测试 + 类型检查 + UI 门禁**

```bash
cd gantt && npx vitest run src/stores/__tests__/auth-store-sso.test.ts
npx tsc --noEmit
cd /home/yuan.z/rois/rois-ai && npm run check:ui
```
Expected: PASS；tsc 0 error；check:ui 硬违规 0。

- [ ] **Step 8: 提交（提示用户，等命令）**

```bash
git add gantt/src/config/api-paths.ts gantt/src/stores/auth-store.ts gantt/src/components/auth/login-page.tsx gantt/src/stores/__tests__/auth-store-sso.test.ts gantt/.env.example
git commit -m "feat(gantt): Azure SSO login button + completeSso flow"
```

---

### Task 7: Playwright E2E（gantt + pbs-portal SSO 入口与错误路径）

**Files:**
- Create: `e2e/gantt/auth/sso-login.spec.ts`
- Create: `e2e/pbs-portal/auth/sso-login.spec.ts`

> 说明：真实 Azure 联调无法在自动化环境完成（需要真实 IdP + 凭证），自动化覆盖 UI 入口、跳转触发、`sso_error` 渲染；ACS 验签/匹配的 happy path 由后端 Vitest（mock node-saml）覆盖。真实 Azure 全链路由人工在 UAT 验证。

- [ ] **Step 1: gantt E2E `e2e/gantt/auth/sso-login.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Gantt Azure SSO login', () => {
  test('登录页展示 SSO 按钮，点击跳转 sso/login', async ({ page }) => {
    await page.goto('/altair/')
    await expect(page.getByTestId('login-user-code')).toBeVisible()
    const ssoBtn = page.getByTestId('login-sso')
    await expect(ssoBtn).toBeVisible()

    const reqPromise = page.waitForRequest((r) => r.url().includes('/api/auth/sso/login'))
    await ssoBtn.click()
    const req = await reqPromise
    expect(req.method()).toBe('GET')
  })

  test('sso_error 参数渲染错误提示', async ({ page }) => {
    await page.goto('/altair/?sso_error=user_not_found')
    await expect(page.getByTestId('login-error')).toContainText('account is not linked')
  })
})
```

- [ ] **Step 2: pbs-portal E2E `e2e/pbs-portal/auth/sso-login.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('PBS Portal Azure SSO login', () => {
  test('SSO 按钮点击跳转 sso/login', async ({ page }) => {
    await page.goto('/pbs/login')
    const ssoBtn = page.getByRole('button', { name: 'SSO Login' })
    await expect(ssoBtn).toBeVisible()

    const reqPromise = page.waitForRequest((r) => r.url().includes('/auth/sso/login'))
    await ssoBtn.click()
    const req = await reqPromise
    expect(req.method()).toBe('GET')
  })
})
```

- [ ] **Step 3: 跑 gantt E2E**

```bash
cd e2e && npx playwright test gantt/auth/sso-login.spec.ts --reporter=list
```
Expected: PASS（按 memory「gantt E2E from worktree setup」配置：dev 端口 5566、临时 config 关 webServer 或用既有 dev server）。

- [ ] **Step 4: 跑 pbs-portal E2E**

```bash
cd e2e && npx playwright test pbs-portal/auth/sso-login.spec.ts --reporter=list
```
Expected: PASS。

- [ ] **Step 5: 提交（提示用户，等命令）**

```bash
git add e2e/gantt/auth/sso-login.spec.ts e2e/pbs-portal/auth/sso-login.spec.ts
git commit -m "test(e2e): Azure SSO login UI entry + error path"
```

---

### Task 8: 收尾 — 文档核对 + 全量回归

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-azure-saml-sso-design.md`（若有实现偏差，回填「已实现」注记）

- [ ] **Step 1: 全量测试**

```bash
cd live-server && npx vitest run
cd pbs-server && npx vitest run
cd gantt && npx vitest run
cd /home/yuan.z/rois/rois-ai && npm run check:ui
```
Expected: 新增测试全 PASS；既有测试保持基线（已知长期失败项不受影响，见 memory「Pre-existing test failures」）。

- [ ] **Step 2: 核对 spec 与实现偏差并回填**

逐条对照 spec 的 §5/§6/§7/§8/§9，确认实现一致；若有偏差（如属性名、env 变量名），更新 spec 的对应小节并在文件头加一行 `> 已实现：2026-08-12`。

- [ ] **Step 3: 提示用户提交**

```bash
git add docs/superpowers/specs/2026-08-12-azure-saml-sso-design.md
git commit -m "docs(sso): mark Azure SAML SSO spec as implemented"
```
（等用户命令再 commit。）

---

## 执行顺序与依赖

```
Task 1 (packages/saml) ──► Task 3 (live 后端) ──► Task 6 (gantt 前端) ──► Task 7 (E2E)
        └───────────────► Task 4/5 (pbs 后端) ──► (pbs-portal 前端无需改) ──► Task 7 (E2E)
Task 2 (live session-auth) 在 Task 3 前完成；Task 8 最后。
```

## 风险与已知取舍

- **真实 Azure 联调**：自动化只能覆盖 UI 入口与错误路径；ACS 验签 happy path 依赖后端 Vitest（mock node-saml）。真实 Azure 全链路必须人工在 UAT 验证（Azure 证书、entryPoint、Reply URL 均需真实值）。
- **`?token=<JWT>` 暴露在 URL**：pbs-portal 既有契约，保留；后续可演进为一次性 code（spec §11 已记录）。
- **replay 防护**：`validateInResponseTo: 'ifPresent'`（多实例下 in-memory cache 无效），spec §11 已记录。
- **live `users.email` 空数据**：SSO 会落到 user_code 兜底；email 回填为后续任务（spec D8）。
