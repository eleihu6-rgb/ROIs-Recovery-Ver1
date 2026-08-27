# PBS Pairing 开发交接上下文（2026-04-21）

> 这份文档只服务于 `pbs-portal` 的 `Pairing` 后续开发。
> 目标不是重复整个 PBS 背景，而是让后续上下文快速知道：
> 现在已经做到了哪里、哪些决定已经定了、下一步应该从哪里接。

## 先读顺序

继续开发 `Pairing` 前，建议按这个顺序读：

1. `pbs-portal/AGENTS.md`
2. `pbs-server/AGENTS.md`
3. `pbs-portal/docs/current-state.md`
4. `docs/handoff/pbs/pbs-dev-handoff-2026-04-21.md`
5. `docs/superpowers/specs/2026-04-20-pbs-portal-pairing-design.md`
6. 本文档

## 当前结论

- `Pairing` 已经是真实页面：
  - 路由：`/pairing`
  - 顶部导航可进入，不再是 `/404`
- 页面结构已经固定为：
  - 左侧共享 `BIDDING CALENDAR`
  - 右侧 `PairingRightPanel`
- 第一阶段是前端交互版，不接真实接口，当前仍使用本地 mock。
- 不要重新推翻这几个已经确认的边界：
  - 不照搬 `Royce-Flair` 的视觉
  - 左侧不新做一套日历
  - 右侧不提前抽象成跨 feature 的万能属性引擎
  - 认证、`pbs_user` 对齐、PBS verify 方案都沿用已有实现

## 代码入口

后续开发最常看的入口文件：

- 页面装配：
  - `pbs-portal/src/features/pairing/pages/pairing-page.tsx`
- 右侧主工作台：
  - `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- Pairing mock 数据与工厂：
  - `pbs-portal/src/features/pairing/mock`
- Pairing 类型：
  - `pbs-portal/src/features/pairing/types.ts`
- 页面测试：
  - `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`

## 当前 Pairing 页面已落地内容

- 左侧共享 `DashboardSchedulePanel` 已接入 Pairing 页面实例。
- 右侧 `PairingRightPanel` 已具备首版交互：
  - `Existing Pairing Properties`
  - `Add More Properties`
  - `All / Favorited`
  - 关键字过滤
  - `Search Pairings` 弹窗
  - `Reset All`
  - 预览卡片开关
  - 本地 layer 切换
- 顶部已有属性卡中的 `Bid` 当前是只读展示，不允许直接改。
- 数字输入控件已去掉左右加减按钮。
- 页面和右侧壳层已经补了 `data-uiid`，可以配合开发态 UI Inspector 使用：
  - `pairing-page-layout`
  - `pairing-right-panel`

## 当前 Pairing 页面测试覆盖

- 已有页面级测试覆盖以下主线：
  - 页面结构正常渲染
  - available pairing properties 的 tab 和搜索过滤
  - 搜索弹窗打开、提交、关闭
  - preview 卡片开关
  - existing / available 列表的本地交互
- 主要文件：
  - `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`

## 最近这轮新增的开发辅助

- 登录后主业务页现在有开发态 UI Inspector：
  - 顶栏右上角放大镜开关
  - 只在开发环境显示
  - tooltip 只显示 `data-uiid`
  - 高亮命中鼠标下的最小 DOM
- 做 Pairing 壳层或细粒度交互开发时，建议继续补稳定的 `data-uiid`，不要依赖类名或 `data-testid` 做人工定位。

## 本地联调与运行边界

- `pbs-server` 本地端口：`3002`
- `pbs-portal` 本地端口：`3030`
- `pbs-portal` 本地开发通过 `/api -> http://localhost:3002` 代理访问后端
- `Pairing` 当前是前端 mock 页面，所以继续开发 UI 时一般不需要先扩后端接口
- 只有当需求明确进入真实数据接入时，才扩 `pbs-server`

## 继续开发 Pairing 时的建议顺序

1. 先看当前 `git status`，不要覆盖这轮尚未提交的 PBS 改动。
2. 先判断需求属于哪一类：
   - 纯 UI / 交互完善
   - mock 数据结构调整
   - 真实接口接入
3. 如果只是 UI / 交互完善：
   - 优先改 `pairing-right-panel.tsx`
   - 尽量保持当前 feature 内边界
   - 需要定位 DOM 时优先补 `data-uiid`
4. 如果开始接真实接口：
   - 先确认 `pbs-server` 是否已有对应 contract
   - 没有的话先补 contract，再补 service / route
   - 不要绕开已确认的 JWT + session 接口体系
5. 改完后按影响面执行：
   - 默认：`npm run verify:pbs`
   - 如果涉及登录态、主流程或页面联动：`npm run verify:pbs:e2e`

## 不要重复推翻的结论

- 不要推翻 PBS 认证现状：
  - `POST /api/auth/session`
  - `GET /api/auth/session`
  - `DELETE /api/auth/session`
- 不要推翻 `pbs_user` 与 `users` 的对齐方向。
- 不要把阶段性页面状态继续堆进 `AGENTS.md`，应写到状态文档或 handoff 文档。
- 不要把开发态 UI Inspector 又改回显示类名 / `data-testid`。

## 给下一个上下文的最短说明

如果只是要让另一个上下文快速接手 `Pairing`，可以直接告诉它：

- 这是 `rois-ai` 里的 `pbs-portal`
- PBS 认证、`pbs_user` 对齐、AGENTS 护栏和 `verify:pbs` 方案都已确认，不要重做
- `Pairing` 已经是真实页面，当前是 mock 驱动的前端交互版
- 继续开发请先读：
  - `pbs-portal/AGENTS.md`
  - `pbs-server/AGENTS.md`
  - `pbs-portal/docs/current-state.md`
  - `docs/handoff/pbs/pbs-dev-handoff-2026-04-21.md`
  - `docs/handoff/pbs/pbs-pairing-dev-handoff-2026-04-21.md`
  - `docs/superpowers/specs/2026-04-20-pbs-portal-pairing-design.md`
