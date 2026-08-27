# PBS Portal

`pbs-portal` 是 ROIS-AI 里的员工侧 PBS 门户前端。当前项目已经从通用 foundation 壳层切到以 `/Users/lei/Codehub/flair-crew-portal` 为参考源的 React 重建路线，目标是做出 1:1 的 React 版门户，而不是继续维护旧的 `/portal/*` 通用后台结构。

## 当前状态

- 已完成 React 基础工程、认证基线、懒加载路由和测试基线
- 已迁移并落地页面：
  - `Login`
  - `Dashboard`
  - `Days Off`
  - `Reserve`
  - `Layer`
  - `Award`
- 已接入品牌素材：
  - `login-background.png`
  - `login-logo.png`
  - `login-topbar.png`
  - `avatar.png`
- 当前阶段以 reference UI 和前端交互还原为主，部分页面继续使用本地 mock

## 技术栈

- `React`
- `TypeScript`
- `Vite`
- `Tailwind CSS`
- `Heroicons`
- `TanStack Query`
- `Zustand`
- `ahooks`
- `lodash-es`
- `dayjs`
- `React Router`
- `Vitest`
- `Playwright`

## 路由结构

当前正式路由：

- `/login`
- `/dashboard`
- `/days-off`
- `/reserve`
- `/layer`
- `/award`
- `/403`
- `/404`
- `/500`

兼容行为：

- `/` 自动跳转 `/dashboard`
- 旧 `/portal/*` 路由会被重定向到新的页面路由
- `/auth/callback` 作为兼容入口保留，实际 SSO 收口走 `/login?token=...`

## 本地 UI 规则

- UI 以 `flair-crew-portal` 为唯一参考源，默认按 1:1 还原。
- 实现必须是 React，不允许混入 Vue 依赖或 Vue 组件。
- 顶部导航顺序固定为：
  `Dashboard / Days Off / Pairing / Line / Reserve / Layer / Award / Standing Bid`
- `Pairing / Line / Standing Bid` 当前作为导航入口保留，点击进入 `/404`。
- 顶部导航要保持 reference 的 `1920 x 80` 缩放、overflow 和 active 行为。
- 各业务页按 reference 的页面画布缩放方式实现，不走手机 H5 断点重排思路。
- 当前阶段修 UI 时，优先保持 reference 的 mock 行为和结构；真实数据接入属于下一阶段。

更完整的协作约束见 [AGENT.md](/Users/lei/Codehub/rois-ai/pbs-portal/AGENT.md)。

## 目录结构

```text
src
├── app
│   ├── layout
│   ├── pages
│   └── router
├── assets
│   └── images
├── features
│   ├── auth
│   ├── award
│   ├── dashboard
│   ├── days-off
│   ├── layer
│   └── reserve
└── shared
    └── components
```

## 开发命令

在 `/Users/lei/Codehub/rois-ai/pbs-portal` 目录下执行：

```bash
npm install
npm run dev
```

验证命令：

```bash
npm test
npm run lint
npm run build
cd ../e2e && npm run test:pbs-portal -- --no-deps tests/pbs-portal/portal-smoke.spec.ts
```

## 测试策略

- `Vitest + React Testing Library`
  用于页面结构、交互行为、共享组件和回归断言
- `Playwright`
  使用仓库共享的 `/e2e` 测试体系，覆盖关键路由、登录链路和 smoke 回归

当前迁移中，修 UI 时默认需要同步考虑测试落点，避免 reference 行为被后续改动带偏。

## 后续方向

- 将页面从本地 mock 逐步切到 `service + TanStack Query`
- 统一各页面的月份和时间语义
- 继续补强 `Playwright` 覆盖面
- 在不破坏 1:1 UI 的前提下继续推进真实业务接入

## 参考文档

- [PBS Portal UI 迁移设计文档](../docs/superpowers/specs/2026-04-20-pbs-portal-ui-migration-design.md)
- [PBS Portal UI 迁移一期计划](../docs/superpowers/plans/2026-04-20-pbs-portal-ui-migration-phase1.md)
