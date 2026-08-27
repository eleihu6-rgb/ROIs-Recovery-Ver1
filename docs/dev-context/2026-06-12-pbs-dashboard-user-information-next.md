# 开发上下文（2026-06-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-12 15:23:50 CST
- Wing：`pbs`
- Topic：`dashboard-user-information-next`
- Title：dashboard-user-information-next
- Git branch：`main`

## 本轮对话上下文

本轮准备开新窗口前保存上下文。

当前工作树重要状态：
- 上一轮已完成 `/fpqe/pbs/pairing` Existing Pairing Properties 的 COUNT 语义修正，但尚未提交。
- 行级 `COUNT` 语义：每一行永远表示“这一条 property/condition 单独筛出的 pairing 数”，不跟随左侧当前 Tx/tier。
- 顶部 summary 语义：跟随左侧 Bidding Calendar 当前 Tx/tier，显示当前 Tx active rules 数量和这些 active rules 合并筛出的 pairing 数。
- 顶部 `REFRESH` 会重新请求 `countCurrentRules`，后端现在会同时重新算顶部 summary 和每一行 `rows[].rule`，所以 pairing 数据变化后刷新会更新行级 COUNT。
- 切 Tx 时前端保留已有 row count，只让顶部进入 `Refreshing / Calculating...`，避免行级 COUNT 闪空。

Pairing 已改文件（未提交）：
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`（包含之前用户要求的 COUNT 数字/单位对齐和 skeleton 相关 UI）
- `pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `docs/superpowers/specs/2026-06-12-pbs-pairing-count-loading-skeleton-design.md`
- `docs/superpowers/specs/2026-06-12-pbs-pairing-count-tier-independent-rows-design.md`
- `docs/dev-context/LATEST.md`
- `docs/dev-context/2026-06-12-pbs-pairing-count-tier-independent-rows.md`

Pairing 验证结果：
- `npm test -- src/services/pairing-search/pairing-search-service.test.ts` in `pbs-server` 实际跑了全量 pbs-server tests，390 passed。
- `npm test -- src/features/pairing/pages/pairing-page.test.tsx` in `pbs-portal`，50 passed。
- `npm run build` in `pbs-server` passed。
- `npm run build` in `pbs-portal` passed；Vite 有既有 chunk size warning。
- `npm run lint` in `pbs-portal`：0 errors，6 warnings，都是既有 fast-refresh warnings。
- 本地浏览器打开 `http://127.0.0.1:3030/fpqe/pbs/pairing` 被登录页拦截，测试账号返回 401，因此未做真实页面视觉冒烟。

刚刚用户提出：Dashboard 页面 `USER INFORMATION` 相关信息应该完善，现在好像都是写死的。只做了调查，没有改代码。

Dashboard 调查结论：
- `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx` 已经从 `useAuthSessionStore` 取登录用户，但只覆盖了左侧头像下方的 `name`，并用 `formatPortalEmail(name)` 拼了一个假的 `@rois-tech.com` 邮箱。
- `pbs-portal/src/features/dashboard/mock.ts` 的 `dashboardUserPanelData` 仍写死：`BASE / POSITION / LANGUAGE / SENIORITY / STATUS / FLEET / EXISTING CREDIT / TRAINING MONTH` 等。
- `DashboardLeftPanel` 只是渲染传入的 `DashboardUserPanelData`，没有自己取真实数据。
- 后端 auth session contract 目前 `packages/contracts/pbs-auth.d.ts` 只暴露 `id / name / employeeNo`。
- `pbs-server/src/services/auth/auth-service.ts` 的 `mapUserToSessionUser` 也只返回 `id/name/employeeNo`。
- 但 `pbs_user` 表已经有真实可用字段：`email / base / rank / division`，见 `sql/schema/pbs/01-pbs.sql`。
- `sync-pbs-users.ts` 已经会从 live `crew / crew_base / crew_rank` 回填 `pbs_user.division/base/rank`。
- live schema 还可提供更完整字段：`crew.seniority_num/status`、`crew_fleet`、`crew_language`、`crew_rank`。

建议的新任务方向：
- 不建议只在前端继续 mock 或拼 email。
- 建议做 Dashboard 专用 user profile/view model，或至少先扩展 session/profile 数据，使 Dashboard USER INFORMATION 使用真实字段。
- 推荐分两步：
  1. 先接稳定字段：姓名、工号、真实 email、base、rank、division。
  2. 再接 live crew profile：seniority、fleet、language、status/training month 等。
- 这属于前后端行为变更，下一窗口必须按 `AGENTS.md` 先走 brainstorming/spec，写入 `docs/superpowers/specs/`，用户确认后再实现。

下一窗口恢复建议：
1. 先读 `NEXT_CONTEXT.md`、`docs/dev-context/LATEST.md`。
2. 查看当前 `git status --short`，注意不要回滚 pairing 未提交改动。
3. 若继续 Dashboard USER INFORMATION，先写 spec，确认数据来源和字段映射，再改代码。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-12-pbs-dashboard-user-information-next.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
