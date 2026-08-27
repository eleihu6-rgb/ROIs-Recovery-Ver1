# ROIS-AI 安全审计第一阶段修复设计

日期：2026-07-07
阶段：Phase 1 / P0 高风险快速修复
范围：`live-server`、`gantt`、`pbs-server`、`pbs-portal`、依赖治理
总路线参考：`docs/superpowers/plans/2026-07-07-security-audit-remediation-roadmap.md`

## 背景

安全审计指出多个模块存在安全风险。为避免一次性大改影响认证、实时推送、依赖锁和前端部署，本项目按阶段修复。

第一阶段只处理高风险且边界相对清晰的三类问题：

1. `live-server` WebSocket 未鉴权，且信任客户端自报身份。
2. `gantt` 登录页展示测试密码。
3. `pbs-server` / `pbs-portal` 生产依赖存在已知漏洞。

本阶段目标是先关闭最容易被直接利用、最容易影响审计通过的缺口。JWT session 撤销、HttpOnly Cookie、上传/CSV/iframe/Vite allowlist 等问题放到后续阶段，不混入第一阶段。

## 目标

1. `live-server` WebSocket 连接必须经过 JWT 鉴权。
2. WebSocket 服务端身份必须来自已验证 token，不再信任客户端提交的 `schema/userId/groupCode`。
3. `gantt` 登录页和生产构建产物不再出现明文测试密码。
4. `pbs-server` 与 `pbs-portal` 生产依赖 audit 达到可交付状态。
5. 每一项修复都有对应自动化测试或明确验证命令。
6. 保持现有业务行为：合法用户仍能登录、订阅实时消息、使用 PBS Portal 和 Gantt。

## 非目标

- 不实现 `token_version/session_version`。
- 不改变 JWT 载荷结构，除非 WebSocket 鉴权复用当前已有字段时必须补类型。
- 不把 token 从 `sessionStorage` 迁移到 HttpOnly Cookie。
- 不改 SSO URL token 流程。
- 不改 crew bid import、CSV 导出、crew search 权限、iframe allowlist 或 Vite allowedHosts。
- 不修改业务表结构。
- 不解决所有 devDependencies audit warning；第一阶段优先 `production dependencies`。

## 当前问题确认

### 1. live-server WebSocket 未鉴权

当前事实：

- `live-server/src/plugins/auth.ts` 对 `upgrade: websocket` 请求直接跳过。
- `live-server/src/plugins/websocket.ts` 中 `subscribe` 消息允许客户端提交 `schema` 和 `userId`。
- `set_rule_group` / `change_rule_group` 允许客户端提交 `groupCode`。

风险：

- 未登录用户可能连接 `/ws/locks` 并订阅元数据。
- 恶意客户端可伪造 `userId`，影响 broadcast exclude 行为。
- 恶意客户端可伪造 `schema/groupCode`，订阅不应看到的 violation update。

### 2. gantt 登录页展示测试密码

当前事实：

- `gantt` 登录页存在测试密码展示文案。

风险：

- dev / preview 通过公网或 tunnel 暴露时，测试密码进入页面和构建产物。
- 审计视角会将其视为凭据泄露。

### 3. 生产依赖漏洞

当前事实：

- `pbs-server` 使用 `drizzle-orm` 旧版本，低于审计建议修复线。
- `pbs-portal` 依赖链存在已知漏洞，涉及 `axios`、`react-router`、`form-data`、`js-cookie` 等。

风险：

- 已知 CVE / advisory 会被安全扫描直接命中。
- 依赖升级可能影响 API client、router、build、测试环境和 lockfile，需要独立验证。

## 修复设计

### A. live-server WebSocket 鉴权

#### A1. 鉴权入口

推荐做法：WebSocket 首条消息鉴权。

原因：

- 现有前端 WebSocket 客户端更容易通过首条消息发送 token。
- 避免将 token 放在 query string 中，降低日志和浏览器历史暴露风险。
- Fastify WebSocket route 可在连接建立后立即要求 auth 消息，未通过则关闭。

客户端连接流程：

1. 建立 `/ws/locks` 连接。
2. 第一条消息发送：

```json
{
  "type": "authenticate",
  "token": "<jwt>"
}
```

3. 服务端 verify JWT。
4. 服务端从 token 派生 `schema`、`userCode` / `userId`、`isAdmin`。
5. 鉴权成功后返回：

```json
{
  "type": "authenticated"
}
```

6. 之后客户端才允许发送 `subscribe` / `set_rule_group` / `change_rule_group`。

#### A2. 服务端身份来源

服务端维护 `WsClient` 状态：

- `authenticated: boolean`
- `schema: string`
- `userId: string`
- `isAdmin: number`
- `groupCode: string`

规则：

- `schema` 只能来自 JWT payload。
- `userId` 只能来自 JWT payload 的用户字段。
- 客户端后续 `subscribe` 不再允许设置 `schema/userId`。
- 如果保留旧 `subscribe` 消息结构，也必须忽略其中 `schema/userId`。

#### A3. rule group 权限

第一阶段先做最小权限控制：

- 未鉴权客户端不能设置 group。
- `groupCode` 必须是非空、安全长度内的字符串。
- `groupCode` 中不允许控制字符。
- 如果已有服务能判断用户可访问 group，则调用现有服务校验。
- 如果当前还没有 group 权限模型，第一阶段至少保证 group 订阅只能发生在已认证用户的 `schema` 下，并在 P1/P2 继续补细粒度权限。

#### A4. 兼容策略

本阶段不保留未鉴权兼容模式。

原因：

- 审计问题本质是未鉴权。
- 保留兼容会让风险继续存在。

如果前端尚未发送 WebSocket token，本阶段必须同步修改 Gantt WebSocket 客户端。

#### A5. 错误处理

- 第一条非 `authenticate` 消息：关闭连接。
- token 缺失或无效：关闭连接。
- 鉴权后收到 malformed message：保持现有“忽略 malformed”策略，但记录 debug 级别日志。
- 未鉴权状态下收到任何订阅消息：关闭连接。

建议 close code：

- `1008 Policy Violation`：认证失败或未授权。
- `1003 Unsupported Data`：消息类型不支持。

### B. gantt 登录页移除测试密码

#### B1. UI 行为

默认做法：直接移除登录页上显示的测试密码文案。

保留内容：

- 用户名输入。
- 密码输入。
- 登录按钮。
- 错误提示。
- 现有 idle / restore / login 行为。

不保留内容：

- 任何硬编码测试密码。
- 任何在生产构建中可被搜索到的测试密码字符串。

#### B2. 本地开发说明

如果团队仍需要测试账号提示：

- 不放在产品 UI。
- 可放在本地不提交 memo 或受权限控制的内部文档。
- 不写入构建产物。

### C. 生产依赖漏洞修复

#### C1. pbs-server

修复方向：

- 升级 `drizzle-orm` 到审计建议修复线或当前兼容稳定线。
- 检查 `drizzle-kit` 是否需要同步升级。
- 搜索项目中是否存在动态 schema/table/identifier 拼接路径。
- 对 pbs-server 的 DB route / service 跑测试。

注意：

- 不修改 SQL schema。
- 不改变 Drizzle model 字段语义。
- 如果升级导致类型破坏，优先做最小兼容修复，不做重构。

#### C2. pbs-portal

修复方向：

- 优先升级直接依赖：
  - `axios`
  - `react-router-dom`
  - 其他 audit 指出的直接依赖。
- 对传递依赖如 `form-data`、`js-cookie`，优先通过直接依赖升级解决。
- 如 direct upgrade 不足，再考虑 package manager overrides。

注意：

- React Router 升级可能影响 route、redirect、loader 行为；必须跑 route / auth 相关测试。
- Axios 升级可能影响 error message、interceptor、request body；必须跑 auth service 和 API client 相关测试。

#### C3. lockfile 策略

- 如果模块使用独立 lockfile，按模块更新。
- 如果根 workspace lockfile 是实际来源，则统一在根更新。
- 不手写 lockfile。
- 不提交无关 package 格式化或依赖排序。

## 实施顺序

推荐顺序：

1. `live-server` WebSocket 鉴权与客户端同步。
2. `gantt` 登录页测试密码移除。
3. `pbs-server` 依赖升级和 audit。
4. `pbs-portal` 依赖升级和 audit。
5. 汇总验证和风险说明。

原因：

- WebSocket 鉴权是最高风险，且会影响实时功能，需要先稳定。
- 登录页密码移除改动小，可以快速完成。
- 依赖升级可能引出锁文件和测试修复，适合放在后面单独处理。

## 测试计划

### live-server

自动化测试建议：

- 无 token 连接 `/ws/locks` 后发送 `subscribe`，连接应关闭。
- 无效 token 发送 `authenticate`，连接应关闭。
- 有效 token 发送 `authenticate`，收到 `authenticated`。
- 鉴权后订阅 schema，服务端使用 token schema，不使用客户端伪造 schema。
- 伪造 userId 不影响 `excludeUserId`。
- 鉴权后合法 group 订阅仍能收到 `violations.updated`。

验证命令：

```bash
cd live-server
npm test
npm run build
npm run audit:prod
```

### gantt

自动化测试建议：

- 登录页不再渲染测试密码文案。
- build 产物不包含测试密码字符串。
- 现有登录 flow 测试仍通过。

验证命令：

```bash
cd gantt
npm test
npm run build
```

如涉及真实 UI：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts --project gantt <login-related-spec>
```

### pbs-server

自动化测试建议：

- 现有 pbs-server route / service 测试全量通过。
- 重点关注 Drizzle 查询、schema interpolation、migration tooling。

验证命令：

```bash
cd pbs-server
npm run audit:prod
npm test
npm run build
```

### pbs-portal

自动化测试建议：

- `auth-service` 测试。
- `app-routes` 登录 / redirect 测试。
- 关键页面 API client 测试。
- 现有 Playwright smoke 视情况跑最小集。

验证命令：

```bash
cd pbs-portal
npm run audit:prod
npm test
npm run lint
npm run build
```

## 验收标准

第一阶段完成时必须满足：

- 未认证 WebSocket 不能订阅任何实时频道。
- WebSocket 连接身份来自 JWT，不来自客户端自报字段。
- 合法用户实时推送不回归。
- `gantt` 生产构建中不包含测试密码文案。
- `pbs-server` 生产依赖 audit 达到可交付状态。
- `pbs-portal` 生产依赖 audit 达到可交付状态。
- 所有受影响模块 build 通过。
- 相关测试通过，最终交付说明列出命令和 PASS / FAIL。

## 风险与缓解

### 风险 1：WebSocket 客户端未同步导致实时功能断开

缓解：

- 服务端和 Gantt WebSocket client 同一阶段修改。
- 增加 Playwright 或集成测试覆盖真实订阅路径。

### 风险 2：JWT payload 字段不足

缓解：

- 优先复用当前 payload 的 `userCode/schema/isAdmin`。
- 如需要 `userId`，只做最小映射，不新增 DB schema。
- 缺失 group 权限模型时，第一阶段只做认证和 schema 绑定，细粒度 group 权限在后续阶段补齐。

### 风险 3：依赖升级带来行为变化

缓解：

- 逐模块升级。
- 每次升级后立即跑模块测试和 build。
- 遇到破坏性 major 行为变化时，优先选择安全修复线中最小可用版本。

### 风险 4：audit 无法完全清零

缓解：

- 记录剩余 advisory、来源、是否 production reachable。
- 如果需要 override，说明原因和验证命令。
- 不把无法清零的低风险 dev-only 问题混入 P0 阻塞。

## 版本号与提交边界

本阶段涉及运行代码改动，版本号规则：

- `live-server` / `pbs-server` 后端改动：递增 `gantt/src/version.ts` 的 `BACKEND_VERSION`。
- `gantt` / `pbs-portal` 前端改动：递增 `FRONTEND_VERSION`。
- PBS 专属改动同时同步 `PBS_BACKEND_VERSION` / `PBS_FRONTEND_VERSION`。
- 依赖和 lockfile 变更按实际影响模块说明。

提交建议：

1. WebSocket 鉴权单独提交。
2. 登录页密码移除单独提交。
3. `pbs-server` 依赖升级单独提交。
4. `pbs-portal` 依赖升级单独提交。

如用户要求合并提交，也必须在 commit message 中列出四类变更。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 第一阶段包含三个相对独立域：WebSocket 鉴权、登录页明文移除、依赖升级。拆分后能并行验证，且写边界清晰。
- Suggested split:
  - Agent A：`live-server` WebSocket 鉴权 + Gantt WebSocket client 同步。
  - Agent B：`gantt` 登录页明文测试密码移除。
  - Agent C：`pbs-server` / `pbs-portal` 依赖 audit 和升级。
- Write boundaries:
  - Agent A 只写 `live-server` WebSocket/auth 相关文件、Gantt WebSocket client、对应测试。
  - Agent B 只写 Gantt 登录页和登录页测试。
  - Agent C 只写 package manifests、lockfile、依赖升级必要的兼容修复和相关测试。
- Conflict risk: Medium
  - 版本号文件、lockfile、Gantt 登录测试可能冲突。
  - 主 agent 需要统一版本号和最终 staged 范围。
- Execution gate:
  - 用户确认本第一阶段 spec 后，再进入实现。
  - 实现前先再次检查当前工作区，避免覆盖用户未提交改动。

## 后续阶段关系

第一阶段完成后，仍需继续处理：

- P1：JWT session_version / logout / 禁用账号即时失效。
- P1：live-server 登录枚举和账号状态校验。
- P1：PBS SSO URL token 降级风险。
- P2：crew bid import 文件安全。
- P2：CSV 公式注入防护。
- P2：crew search 权限收敛。
- P3：Vite allowedHosts、iframe allowlist、dangerouslySetInnerHTML、HttpOnly Cookie 迁移。

这些内容不应在第一阶段临时夹带实现。

