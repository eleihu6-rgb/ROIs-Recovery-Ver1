# 开发上下文（2026-05-20）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-20 17:41:21 CST
- Wing：`pbs`
- Topic：`prefer-off-overlap-calendar-consistency-fix`
- Title：prefer-off-overlap-calendar-consistency-fix
- Git branch：`main`

## 本轮对话上下文

本轮任务：修复 PBS Days Off / Pairing / Dashboard 左侧共享 BIDDING CALENDAR 中 Prefer Off 重叠导致的双层 Off、页面间显示不一致，并将 bidding-calendar 的 Prefer Off 事件类型从 day_off_bid 收敛为 prefer_off_bid。

用户关键要求：
- 旧 calendar-days-off / pbs_bid_day_off 链路已经弃用，不要重新使用旧表作为左侧日历来源。
- 左侧共享小日历应统一以 Days Off Prefer Off 规则生成结果为来源，不同页面强刷后不能显示不同。
- 同一 tier 下 Prefer Off 具体日期列表与 Between 范围重叠时，添加/编辑阶段就要防呆阻止。
- 错误提示走统一 message，不要右侧面板 DOM 中重复红色错误块。
- 如果不麻烦，一并把 day_off_bid 改名为 prefer_off_bid，避免误解为旧 day_off_bid 表/旧链路。
- 必须有对应单元测试、回归测试、人工测试案例文档。

已完成实现：
- 新增/更新 spec：docs/superpowers/specs/2026-05-20-pbs-prefer-off-overlap-calendar-consistency-fix-design.md，状态改为“已确认实施”。
- 后端 pbs-server：
  - packages/contracts/pbs-bidding-calendar.d.ts 事件类型改为 prefer_off_bid。
  - prefer-off-calendar-events.ts 输出 type: prefer_off_bid，并按 tier+date 去重，历史重复数据不再输出重复 Off event。
  - days-off-validation.ts 增加 Prefer Off 日期展开与 overlap 校验，支持 ISO 日期、Between 范围、Weekends、weekday；同 tier 同日期冲突返回 400。
  - days-off-draft-mappers.ts、days-off-bid-service.ts 在 full save/add/patch 时带 periodCode 调用校验。
- 前端 pbs-portal：
  - dashboard-calendar-state.ts、bidding-calendar-mappers.ts 等改用 prefer_off_bid。
  - mapper 对 Prefer Off segment 增加 overlap/duplicate 合并，防止历史脏数据造成双层 Off。
  - DashboardSchedulePanel 区分 editableCalendarDraft 与 displayCalendarDraft，非 Days Off 页面不再吃 Days Off page-data cache；Days Off 初始显示以 bidding-calendar 为基线，只在本地日历编辑保存后使用本地 draft overlay。
  - DaysOffPage add/update 前用 getPreferOffOverlapErrors 预检 Prefer Off 重叠，命中时抛 Error 给 RuleBidRightPanel 的 message.error，不设置持久 saveError panel；add/update/delete 后 invalidate bidding-calendar 与 tier 查询。
- 测试：
  - 后端 days-off-validation.test.ts 增加同 tier overlap 拒绝、不同 tier 允许、weekday 展开冲突。
  - 后端 prefer-off-calendar-events.test.ts 覆盖 tier+date 去重与 prefer_off_bid。
  - 前端 days-off-validation.test.ts 覆盖 overlap 前端校验。
  - 前端 bidding-calendar-mappers.test.ts 覆盖重复/重叠 Prefer Off 只出一条视觉 bar。
  - 前端 days-off-page.test.tsx 覆盖添加重叠 Prefer Off 前端阻止、无 role alert 面板、不调用 service。
  - 前端 shared-bidding-workbench-layout.test.tsx 覆盖共享小日历显示使用 bidding-calendar 而不是 cached Days Off page data。
  - 更新相关 fixture/test 从 day_off_bid 到 prefer_off_bid。
- 人工测试案例：docs/test-cases/pbs/days-off/2026-05-20-prefer-off-overlap-calendar-consistency.md。

已跑验证：
- pnpm --dir pbs-server test -- src/services/days-off/days-off-validation.test.ts src/services/calendar/prefer-off-calendar-events.test.ts src/routes/bidding-calendar.test.ts：实际跑完整 pbs-server 测试，188 pass。
- pnpm --dir pbs-portal test -- src/features/days-off/days-off-validation.test.ts src/features/dashboard/bidding-calendar-mappers.test.ts src/features/days-off/pages/days-off-page.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/dashboard/dashboard-calendar-state.test.ts：实际跑完整 pbs-portal 测试，311 pass。
- pnpm --dir pbs-server build：通过。
- pnpm --dir pbs-portal lint：通过。
- pnpm --dir pbs-portal build：通过，只有既有 Vite chunk size warning。
- git diff --check：通过。
- npm run verify:pbs：pbs-server npm test 和 pbs-server build 通过，但停在 pbs-server sync:pbs-users -- --dry-run，原因是本地 DB 用户 f8_pbs 密码认证失败。
- Browser 打开 http://localhost:3030/fpqe/pbs/days-off 被重定向到登录页，in-app browser 无登录态，未硬塞账号密码；页面级行为已由自动化测试覆盖。

注意事项：
- pbs-portal/tsconfig.tsbuildinfo 因 pbs-portal build 和新增 test file 被更新，当前仍在 git diff 中。
- 运行时代码中 rg day_off_bid packages/contracts pbs-server/src pbs-portal/src 已无命中；历史 spec 中保留 day_off_bid 说明是历史语义引用。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-bidding-calendar.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
 M pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/days-off/days-off-validation.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/routes/bidding-calendar.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/prefer-off-calendar-events.test.ts
 M pbs-server/src/services/calendar/prefer-off-calendar-events.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.ts
 M pbs-server/src/services/days-off/days-off-validation.test.ts
 M pbs-server/src/services/days-off/days-off-validation.ts
?? docs/superpowers/specs/2026-05-20-pbs-prefer-off-overlap-calendar-consistency-fix-design.md
?? docs/test-cases/pbs/days-off/2026-05-20-prefer-off-overlap-calendar-consistency.md
?? pbs-portal/src/features/days-off/days-off-validation.test.ts
```

### unstaged changed files

```text
packages/contracts/pbs-bidding-calendar.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/days-off/days-off-validation.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/routes/bidding-calendar.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/prefer-off-calendar-events.test.ts
pbs-server/src/services/calendar/prefer-off-calendar-events.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/days-off/days-off-draft-mappers.ts
pbs-server/src/services/days-off/days-off-validation.test.ts
pbs-server/src/services/days-off/days-off-validation.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-20-pbs-prefer-off-overlap-calendar-consistency-fix.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
