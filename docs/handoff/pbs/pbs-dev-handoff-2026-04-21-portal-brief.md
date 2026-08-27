# PBS 简版交接（2026-04-21）

> 这份文档放在 `pbs` wing 下，方便 `wakeup pbs` 时更容易命中。
> 更完整的版本见仓库根：`docs/handoff/pbs/pbs-dev-handoff-2026-04-21.md`。

## 当前主线

- PBS 当前主线是 `pbs-portal + pbs-server` 联动开发。
- 两边都是长期维护项目，已经补了：
  - `pbs-portal/AGENTS.md`
  - `pbs-server/AGENTS.md`
  - `docs/pbs-regression-checklist.md`
  - `npm run verify:pbs`
  - `npm run verify:pbs:e2e`

## 认证链路

- 认证模式已经统一到 `JWT + Bearer`。
- `pbs-server` 当前 auth session 路由：
  - `POST /api/auth/session`
  - `GET /api/auth/session`
  - `DELETE /api/auth/session`
- 旧的 `POST /api/auth/login` 还保留兼容入口。
- `pbs-portal` 已实现：
  - 登录后保存 token
  - request 自动带 `Authorization`
  - 初始化恢复 session
  - 登出清 token

## 数据库 / pbs_user 决策

- `pbs_user` 不是独立乱起字段的一张表，而是：
  - 尽量和 `live-server.users` 共享字段同名对齐
  - 保留 PBS 独有安全字段
- `users -> pbs_user` 的同步逻辑已落地，继续维护时不要重新发明字段别名。

## Portal 状态

- `Pairing` 页面已经完成前端交互版。
- 左侧继续复用共享 `BIDDING CALENDAR`。
- `BIDDING CALENDAR` layer 显示已统一改成“逐行 label 对逐行格子”。
- 选中态已经修成不影响盒模型的高亮，并保留 `1px` 内间距。
- 当前仍指向 `/404` 的导航项：
  - `Line`
  - `Standing Bid`

## 回归与测试

- `pbs-server` 已补：
  - sync env zod 校验
  - sync/schema 回归测试
- `pbs-portal` 已补 Playwright 主流程：
  - 游客跳登录
  - 密码登录
  - token 存储
  - session 恢复
  - 登出清 token
- 当前继续开发 PBS 相关内容后，优先跑：
  - `npm run verify:pbs`
  - 如改动主流程，再跑 `npm run verify:pbs:e2e`
