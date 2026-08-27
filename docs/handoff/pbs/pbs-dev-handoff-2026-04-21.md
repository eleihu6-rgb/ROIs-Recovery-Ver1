# PBS 开发交接上下文（2026-04-21）

> 这份文档用于给后续新窗口的 AI / 开发者提供 PBS 当前状态和关键决策。
> 只记录开发侧上下文，不写数据库密码、明文账号密码或其他运行时敏感信息。

## 本次工作主线

- 当前 PBS 开发主线是：
  - `pbs-portal`：员工侧门户前端
  - `pbs-server`：PBS 独立后端
- 这两个项目是长期维护项目，已经开始补齐模块级 `AGENTS.md`、回归清单、统一校验脚本和共享接口约束。
- 当前工作区里存在较多 **未提交** 的 PBS 相关改动；继续开发前先看 `git status`，不要误回滚。

## PBS Portal 当前状态

- `pbs-portal` 已从旧的 `AGENT.md` 标准化到 `AGENTS.md`。
- `AGENTS.md` 现在只保留长期稳定的协作规则；容易过期的页面状态被迁到：
  - `pbs-portal/docs/current-state.md`
- 现有已落地页面：
  - `/login`
  - `/dashboard`
  - `/days-off`
  - `/pairing`
  - `/reserve`
  - `/layer`
  - `/award`
- 当前仍指向 `/404` 的导航项：
  - `Line`
  - `Standing Bid`

## Pairing 页面实现结论

- 参考项目是 `/Users/lei/Codehub/Royce-Flair/`，但只参考功能和交互结构。
- `Pairing` 页面 UI 以当前 `pbs-portal` 项目为主，不直接照搬参考项目视觉。
- 左侧继续复用当前项目共享的 `BIDDING CALENDAR` 体系。
- 右侧 `Pairing` 工作台已完成前端交互版：
  - `Existing Pairing Properties`
  - `Add More Properties`
  - `All / Favorited`
  - `Search Pairings` 弹窗
  - 本地 mock 交互
- 顶部已有属性卡里的 `Bid` 当前是 **只读展示**，不允许直接改。
- 数字输入控件已去掉左右加减按钮。
- `BIDDING CALENDAR` 左侧 layer 显示已统一调整成“逐行 layer 标签对应逐行格子”。
- layer 选中态已经改成不影响布局的高亮方案，并在边框内保留了 `1px` 内间距，避免视觉偏移。
- 当前 `Pairing` 页面入口和基础交互已真实落地，不再指向 `/404`。
- 当前 `Pairing` 首版仍以本地 mock 驱动，后续接真实接口时应保持：
  - 左侧继续复用共享 `BIDDING CALENDAR`
  - 右侧继续沿用现有 feature 内部组件边界
  - 不要重新推翻已经确认的页面结构和交互分层

## 本地联调链路结论

- `pbs-server` 本地开发默认端口是 `3002`。
- `pbs-portal` 本地开发默认端口是 `3030`。
- `pbs-portal` 现在已经补了本地 `.env`，开发态通过 Vite 代理把 `/api` 转发到 `http://localhost:3002`。
- 当前本地联调链路是：
  - 浏览器访问 `http://localhost:3030`
  - 前端请求 `/api/...`
  - Vite 代理到 `http://localhost:3002/api/...`
- `pbs-server` 启动时会主动连接数据库，成功后日志里会出现 `PBS database connected`。
- `pbs-server` 当前运行时查的是 `rois` 库下的 `f8_pbs.pbs_user`，不是直接查 `live-server` 的 `f8.users`。

## PBS 用户同步结论

- `users -> pbs_user` 的同步链路已经可用且验证过。
- 当前 `f8.users` 与 `f8_pbs.pbs_user` 已经同步，不是空表。
- 继续做 PBS 登录、权限或用户字段相关开发时：
  - 不要绕开既有同步脚本直接发散做第二套用户落库逻辑
  - 优先沿用 `sync-pbs-users` 这条链路
- 之前为了手测本地密码登录，已经存在一个临时测试账号；明文密码不应写进仓库文档，若后续需要手测账号，请直接查当前数据库状态或重新设置临时密码。

## 开发态 UI Inspector 结论

- `pbs-portal` 登录后的主业务页已经接入开发态 UI Inspector。
- 入口在顶栏右上角放大镜，只在开发环境渲染，正式环境不显示。
- 当前确认后的行为不是“显示类名 / test id”，而是：
  - tooltip 只显示 `data-uiid`
  - 高亮命中鼠标下的最小 DOM
  - 如果最小 DOM 本身没有 `data-uiid`，则向上找最近祖先的 `data-uiid`
  - 若整条祖先链都没有 `data-uiid`，则不显示 tooltip
- 相关实现和文档位置：
  - `pbs-portal/src/shared/hooks/use-ui-inspector.ts`
  - `pbs-portal/src/shared/components/dev/ui-inspector-overlay.tsx`
  - `docs/superpowers/specs/2026-04-21-pbs-portal-ui-inspector-design.md`

## PBS Server / PBS User / 数据库决策

- `pbs-server` 与 `live-server` 不共享运行时，但 `pbs_user` 会与 `live-server.users` 的共享字段尽量对齐。
- 当前决定不是“让 `pbs_user` 和 `users` 完全一样”，而是：
  - `users` 里已有的共享字段，`pbs_user` 尽量同名对齐
  - PBS 自己需要的安全运行态字段继续保留
- 当前 `pbs_user` 可以理解为：
  - `users` 对齐字段
  - 加上 PBS 独有字段，如：
    - `crew_id`
    - `last_login_at`
    - `last_login_ip`
    - `failed_login_count`
    - `locked_until`
    - `password_changed_at`
    - `token_version`
- 已经执行过一次真实表收敛和同步：
  - 远端 `f8_pbs.pbs_user` 已按这个方向对齐
  - `users -> pbs_user` 的同步链路已经可用

## PBS 认证链路当前状态

- 当前 PBS 认证已经改成和 `live-server` 一样的核心思路：
  - `JWT + Bearer`
- 共享 auth contract 已落在：
  - `packages/contracts/pbs-auth.js`
  - `packages/contracts/pbs-auth.d.ts`
- `pbs-server` 当前使用 REST 语义的会话接口：
  - `POST /api/auth/session`：登录
  - `GET /api/auth/session`：获取当前会话
  - `DELETE /api/auth/session`：登出
- 旧的 `POST /api/auth/login` 目前仍保留为兼容入口。
- `pbs-portal` 已切到真实 token 模式：
  - 登录成功后保存 token
  - request 层自动注入 `Authorization: Bearer <token>`
  - 初始化时通过 `/auth/session` 恢复会话
  - 登出时清 token

## AGENTS / 护栏建设结论

- 当前 PBS 两侧都已经有模块级规则：
  - `pbs-portal/AGENTS.md`
  - `pbs-server/AGENTS.md`
- 规则文件现在遵循这个边界：
  - `AGENTS.md` 放长期稳定的项目规则
  - 当前页面状态、阶段性策略、临时路由状态放到状态文档里
- 已新增 PBS 回归清单：
  - `docs/pbs-regression-checklist.md`
- 已新增统一校验入口：
  - `npm run verify:pbs`
  - `npm run verify:pbs:e2e`
- 对 PBS 继续开发时，默认应优先跑 `verify:pbs`；认证、路由、同步等链路改动后优先跑 `verify:pbs:e2e`。

## 本轮补齐过的回归缺口

- `pbs-server` 同步脚本环境变量已通过 zod 统一校验，不再散落直读 `process.env`
  - `pbs-server/src/config/sync-env.ts`
- `pbs-server` 已补 sync / schema 自动化回归：
  - `pbs-server/src/scripts/sync-pbs-users-core.ts`
  - `pbs-server/src/scripts/sync-pbs-users.test.ts`
- `pbs-portal` 已补 Playwright 认证主流程：
  - 游客跳登录页
  - 密码登录成功
  - token 存储
  - 会话恢复
  - 登出清 token
  - 文件：`pbs-portal/e2e/portal-smoke.spec.ts`

## 当前默认验证方式

- PBS 跨模块改动后，优先执行：
  - `npm run verify:pbs`
- 如果改动涉及登录、路由守卫、会话恢复、关键页面主流程，再执行：
  - `npm run verify:pbs:e2e`
- 2026-04-21 这轮补齐后，`npm run verify:pbs:e2e` 已经通过。

## 后续继续开发时的建议顺序

1. 先读：
   - `pbs-portal/AGENTS.md`
   - `pbs-server/AGENTS.md`
   - `pbs-portal/docs/current-state.md`
   - 本文档
   - 如果要继续做 Pairing，再读：
     - `docs/superpowers/specs/2026-04-20-pbs-portal-pairing-design.md`
     - `docs/handoff/pbs/pbs-pairing-dev-handoff-2026-04-21.md`
2. 再看当前 `git status`，确认哪些 PBS 改动尚未提交。
3. 如果涉及认证、同步、路由或共享字段，优先沿用已有 contract、service 和验证脚本，不要另起一套实现。
4. 如果涉及新页面或新流程，先确认是否应该进入 `AGENTS.md`，还是只该进入状态文档 / spec。
