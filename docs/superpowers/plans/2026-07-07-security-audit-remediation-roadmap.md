# ROIS-AI 安全审计修复总路线

日期：2026-07-07
范围：`live-server`、`pbs-server`、`pbs-portal`、`gantt`、依赖治理、部署配置、导入导出安全

## 背景

本路线基于一次静态代码审计和依赖审计，参考 PT-311 常见检查项。审计没有改代码，主要发现集中在：

- WebSocket 鉴权和客户端身份信任。
- JWT 无服务端撤销能力。
- 生产依赖漏洞。
- 前端 token 暴露面和 SSO URL token 风险。
- 文件上传、CSV 导出、静态托管和 iframe 配置安全。

本文件是总修复路线，不直接替代后续每个阶段的详细 spec。后续每个阶段进入实现前仍需单独写阶段 spec / plan，并按项目规则补测试和验证。

## 总体判断

### 当前做得较好的点

- `pbs-server` 和 `live-server` 均使用 JWT Bearer token，业务状态主要在 DB 中，多实例基础可运行。
- `live-server` 已有 Redis 缓存、锁、广播能力，多实例基础比 `pbs-server` 更完整。
- `pbs-server` 登录失败信息已统一，并已检查账号状态、`portalAccess`、`passwordAccess`。
- `live-server` 已有 Helmet / frameguard / nosniff / no-referrer 等基础安全头。
- 多数 admin route 已有 `isAdmin` 检查。

### 当前主要缺口

- `live-server` WebSocket 跳过 HTTP auth，并信任客户端上报的 `schema/userId/groupCode`。
- `pbs-server` / `live-server` JWT 无服务端 session 撤销能力，logout 和禁用账号不能即时使 token 失效。
- `pbs-portal` / `pbs-server` 生产依赖存在已知漏洞，需要升级和回归。
- 前端 token 存在 JS-readable storage，一旦 XSS 可被读取。
- PBS SSO token 经 URL 传递，存在浏览器历史、日志、Referer 暴露风险。
- 上传和 CSV 导出缺少更完整的内容安全校验。
- `gantt` dev/preview host 配置和系统工具 iframe URL 需要收紧。

## 非目标

- 本路线不直接改代码。
- 不一次性重构全部认证体系到 HttpOnly Cookie + CSRF。
- 不把所有中低风险项混入第一阶段。
- 不修改业务模型、数据库 schema 或部署域名，除非某个阶段 spec 单独确认。
- 不在文档里写入密码、token、生产连接串或其他敏感信息。

## 分阶段修复路线

### P0：高风险快速修复

目标：优先处理审计中最容易被直接利用、最容易影响过审的高风险项。

#### P0-1 live-server WebSocket 鉴权

问题：

- `live-server/src/plugins/auth.ts` 对 `upgrade: websocket` 请求直接跳过。
- `live-server/src/plugins/websocket.ts` 允许客户端自行提交 `schema/userId/groupCode`。

修复方向：

- WebSocket 握手或首条认证消息必须携带 JWT。
- 服务端 verify JWT 后，从 token 派生 `schema/userId/isAdmin/group`。
- 禁止使用客户端自报身份覆盖服务端身份。
- `set_rule_group` / `change_rule_group` 必须校验用户是否有订阅对应 group 的权限。
- 未认证或认证失败连接应立即关闭，使用明确 close code。

验收：

- 未携带 token 的 WebSocket 连接无法订阅。
- 伪造 `schema/userId/groupCode` 不生效。
- 合法用户仍能收到 lock / violation / roster update。
- 增加 WebSocket 鉴权单元或集成测试。

#### P0-2 移除 gantt 登录页明文测试密码

问题：

- `gantt` 登录页显示测试密码文案；如果 dev/preview 经公网或 tunnel 暴露，属于凭据泄露。

修复方向：

- 生产构建产物不得包含明文测试密码。
- 如确需本地提示，只允许 `import.meta.env.DEV` 且默认关闭。
- 最好直接移除 UI 明文提示，测试账号交由安全文档或环境配置管理。

验收：

- `gantt` build 产物中不包含测试密码文案。
- 登录页视觉和登录流程不受影响。

#### P0-3 生产依赖漏洞升级

问题：

- `pbs-portal` 生产依赖存在多项漏洞，涉及 `axios`、`react-router`、`form-data`、`js-cookie` 等链路。
- `pbs-server` `drizzle-orm` 版本低于修复线，存在 SQL identifier injection advisory 风险。

修复方向：

- 先在当前 lockfile 基础上复现 `audit:prod`。
- `pbs-server` 升级 `drizzle-orm` 到修复线，并确认 `drizzle-kit` 兼容性。
- `pbs-portal` 升级受影响直接依赖或通过 overrides / lockfile 解析修复传递依赖。
- 每个模块升级后跑最小测试、build、关键 E2E。

验收：

- `pbs-server npm run audit:prod` 通过或只剩明确接受的非生产风险。
- `pbs-portal npm run audit:prod` 通过或只剩明确接受的非生产风险。
- `pbs-server npm test` / `npm run build` 通过。
- `pbs-portal npm test` / `npm run lint` / `npm run build` 通过。

### P1：认证与会话一致性

目标：解决 token 撤销、禁用账号即时生效、logout 无效、登录策略不一致等问题。

#### P1-1 JWT session_version / token_version

问题：

- `pbs-server` 和 `live-server` 只 verify JWT，不查 DB 当前状态。
- logout 是 no-op 或仅清前端存储。
- token 默认 24h，有效期内用户禁用、改密、强制下线不会即时生效。

修复方向：

- 用户表增加或复用 `token_version/session_version` 字段。
- 登录时把 version 写入 JWT。
- auth hook 校验用户状态、访问权限和 version。
- logout、改密、禁用账号、重置密码时递增 version。
- 可用短 TTL 缓存减少每次请求 DB 压力，但权限相关缓存需支持版本失效。

验收：

- logout 后旧 token 不能继续访问受保护接口。
- 禁用账号后旧 token 在设计窗口内失效。
- 改密后旧 token 失效。
- 多实例下行为一致。

#### P1-2 live-server 登录策略补齐

问题：

- 用户不存在和密码错误返回不同信息，有用户名枚举风险。
- 登录未完整校验账号状态、访问权限、过期时间等字段。

修复方向：

- 登录失败统一返回 `Invalid user code or password.`。
- 内部日志可记录真实原因，但不得向前端暴露枚举信息。
- 补齐账号启停、访问权限、过期时间校验。
- 与 `pbs-server` 已有策略对齐。

验收：

- 用户不存在和密码错误返回同样响应。
- 禁用、过期、无访问权限账号无法登录。
- 管理员和普通用户登录行为不回归。

#### P1-3 PBS SSO URL token 降级风险治理

问题：

- `pbs-portal` 从 `?token=` 读取 SSO token。
- legacy callback 会继续转发 token 到登录页。
- URL token 可能进入浏览器历史、日志和 Referer。

修复方向：

- 中期改为一次性 authorization code，前端拿 code，后端交换 token。
- 短期最小缓解：登录页读取 token 后立即 `replaceState` 清理 URL。
- legacy redirect 也应尽快迁移到 code 模式。

验收：

- SSO 登录后浏览器地址栏不保留 token。
- 浏览器历史中不出现 token。
- callback / redirect 流程仍能回到目标页面。

### P2：输入输出安全

目标：降低导入、导出、搜索接口的数据泄漏和内容注入风险。

#### P2-1 crew bid import 文件安全

问题：

- `pbs-server` 和 `live-server` crew bid import 仅限制大小，直接 `toBuffer().toString("utf8")`。
- 缺少扩展名、MIME、编码、恶意内容和格式前置校验。

修复方向：

- 限制允许的文件扩展名和 MIME 类型。
- 使用 `TextDecoder` fatal 模式或等价机制校验 UTF-8。
- 增加格式 precheck，拒绝明显无效内容。
- 大文件后续改 streaming parse，避免一次性读入内存。
- 如部署环境要求，接入 AV / EICAR 扫描或隔离队列。

验收：

- 非允许扩展名被拒绝。
- 非 UTF-8 文件被拒绝。
- 超大文件仍返回明确错误。
- 合法 crew bid 文件导入不回归。

#### P2-2 CSV / Excel 公式注入防护

问题：

- CSV escape 只处理引号、逗号和换行。
- 以 `= + - @` 开头的单元格被 Excel 打开时可能作为公式执行。

修复方向：

- 建立统一安全 CSV escape util。
- 对导出给 Excel 打开的 CSV 单元格，如果以公式前缀开头，增加 `'` 或等价安全前缀。
- 替换现有导出路径中的局部 escape 实现。

验收：

- `=cmd|...`、`+1+1`、`-1+1`、`@SUM(...)` 导出后不被 Excel 当公式执行。
- 现有算法导出和 scenario 导出字段顺序不变。

#### P2-3 pbs-server crew search 权限收敛

问题：

- 任意认证用户可搜索全员并返回 `crewId/userCode/userName/base/rank/division`。

修复方向：

- 先确认业务是否允许普通 crew 搜索全员。
- 如果不允许，按本人、同 base、同 division 或 admin role 限制。
- Pairing employee number autocomplete 如确有全员搜索需求，需要产品确认并记录理由。

验收：

- 普通用户无法横向枚举不应看到的人员。
- admin 或明确授权角色仍可搜索必要范围。
- Pairing / bidding autocomplete 不回归。

### P3：前端部署与长期治理

目标：收紧前端运行环境与长期安全边界。

#### P3-1 gantt Vite host allowlist

问题：

- `gantt/vite.config.ts` 中 dev/preview `host: true`、`allowedHosts: true`。
- 如果经公网或 tunnel 暴露，存在 Host header / dev proxy 滥用风险。

修复方向：

- 默认仅允许 localhost / 127.0.0.1。
- 公网或 tunnel 环境通过显式环境变量配置 allowlist。
- preview 和 dev 分别处理。

验收：

- 本地开发仍可启动。
- 未配置 allowlist 时公网 Host 不被接受。
- 已配置合法域名可访问。

#### P3-2 系统工具 iframe URL allowlist

问题：

- `gantt` 系统工具 URL 来自 env 或默认值，直接 iframe 渲染。

修复方向：

- 只允许同源 `/fpqe/...`、`/altair/...` 或固定可信域名。
- 不合法 URL 显示错误状态，不渲染 iframe。
- Grafana / Prometheus / Windmill 自身必须有独立鉴权，不依赖 Gantt 外壳。

验收：

- 非 allowlist URL 不会进入 iframe。
- 合法系统工具仍能打开。

#### P3-3 dangerouslySetInnerHTML 治理

问题：

- Release note 使用本地受控 HTML，当前风险较低，但长期不宜扩散。

修复方向：

- 优先改为结构化 rich text 数据。
- 如短期不能改，增加严格 allowlist sanitizer，只允许必要标签。

验收：

- Release note 展示不回归。
- 不允许脚本、事件属性、危险 URL 注入。

#### P3-4 前端 token 存储长期改造

问题：

- `pbs-portal` 和 `gantt` token 存在 `sessionStorage`，XSS 下可被读取。

修复方向：

- 短期依靠 P1 的 token_version、缩短 token 生命周期和 XSS 面收敛。
- 中期单独设计 HttpOnly Secure SameSite Cookie + CSRF token。
- 该项影响登录、API client、E2E、反向代理配置，必须单独 spec，不混入 P0/P1。

验收：

- Cookie 模式下前端 JS 不可直接读取 access token。
- CSRF 防护覆盖写接口。
- SSO、logout、refresh、跨路径部署都正常。

## 建议拆分文档与实施顺序

后续建议拆成以下阶段文档和提交：

1. `SEC-1 live-server websocket auth hardening`
   - 范围：`live-server` WebSocket 鉴权、客户端身份信任修复、测试。
2. `SEC-2 dependency audit remediation`
   - 范围：`pbs-server` / `pbs-portal` 生产依赖升级、lockfile、audit、回归。
3. `SEC-3 JWT session revocation and live login policy`
   - 范围：`pbs-server` / `live-server` token_version、logout、账号状态校验、登录枚举修复。
4. `SEC-4 import export and frontend hosting hardening`
   - 范围：上传校验、CSV 公式注入、crew search 权限、Vite allowlist、iframe allowlist。
5. `SEC-5 HttpOnly cookie auth migration`
   - 范围：长期 token 存储重构，单独排期。

## 验证总要求

每个阶段至少满足：

- 只改阶段 spec 批准过的模块和文件。
- 补对应自动化测试；安全 bug 修复必须有回归测试。
- UI / 登录 / WebSocket 相关改动需要 Playwright 或等效真实路径验证。
- 后端 route / service / auth hook 改动需要单元或集成测试。
- 依赖升级必须跑 `audit:prod`、`build` 和相关测试。
- 最终报告明确列出 PASS / FAIL 和未覆盖风险。

建议命令按阶段选择：

```bash
cd live-server && npm test && npm run build && npm run audit:prod
cd pbs-server && npm test && npm run build && npm run audit:prod
cd pbs-portal && npm test && npm run lint && npm run build && npm run audit:prod
cd gantt && npm test && npm run build
```

涉及真实 UI 的阶段还需运行对应 Playwright spec。

## 多实例部署治理结论

`pbs-server` 当前多实例可运行，但不是完全安全无状态：

- 核心业务状态在 DB，JWT 为 Bearer token，多实例基本可工作。
- 进程内短 TTL 缓存会产生最多约 60s 不一致。
- token 撤销、禁用账号即时生效、强制下线做不到。

建议：

- 权限 / 会话相关状态优先 DB 或 Redis 统一。
- 纯展示或非权限缓存可保留短 TTL，但要记录不一致窗口。
- P1 完成前，不要声称 `pbs-server` 已具备完整强制下线能力。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 修复跨多个模块，且安全项可按模块和风险拆分；并行能缩短排期。
- Suggested split:
  - Agent A：`live-server` WebSocket 鉴权。
  - Agent B：`pbs-server` / `pbs-portal` 依赖升级与 audit。
  - Agent C：JWT session_version / logout / live 登录策略。
  - Agent D：上传、CSV、Vite allowlist、iframe allowlist。
- Write boundaries:
  - 每个 agent 只写对应模块和测试。
  - 版本号、lockfile、最终集成由主 agent 统一处理。
- Conflict risk: Medium
  - 认证、版本号、依赖 lockfile 容易冲突。
  - 需要主 agent 明确分支和 staging 边界。
- Execution gate:
  - 本总路线确认后，每个阶段先写阶段 spec。
  - 用户批准阶段 spec 后再实现。

## 当前决策建议

推荐立即启动 P0：

1. 写 `SEC-1 live-server websocket auth hardening` spec。
2. 写 `SEC-2 dependency audit remediation` spec。
3. 两个阶段可并行准备，但依赖升级的提交应谨慎处理 lockfile 和跨模块构建。

P1 以后再排，因为会涉及认证状态模型、数据库字段、logout 行为和多实例一致性，影响面明显大于 P0。

