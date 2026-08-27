# 开发上下文（2026-05-06）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-06 17:23:33 CST
- Wing：`pbs`
- Topic：`days-off-pairing-local-patch-mutations`
- Title：PBS Days Off / Pairing 局部草稿写入优化
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Days Off / Pairing 高频写入优化，用户已确认实施。

背景：Days Off / Pairing 页面此前部分交互仍会提交整份 draft，存在传输大、全量重写、并发覆盖和后续维护边界混乱的问题。用户要求彻底改成 id/唯一键定位的局部增删改查，同时功能不能坏、接口不能更慢、代码要符合当前项目风格。

已产出 spec：docs/superpowers/specs/2026-05-06-pbs-local-patch-draft-mutation-design.md，状态已更新为“已确认，已实施”。

核心决策：
1. Pairing property 使用 propertyGroupKey 做 PATCH/DELETE 定位，新增和删除都要求 draftVersion；PATCH tiers=[] 表示删除该 property。
2. Days Off property 使用 propertyGroupKey 做 PATCH/DELETE 定位，新增和删除都要求 draftVersion；PATCH tiers=[] 不作为删除，仍按 Days Off property 至少一个 Tier 校验拒绝。
3. Calendar Days Off 日期使用 PATCH /calendar-days-off/current/dates，以 (date, tier, selected) 做局部变更，不再保存整份 calendar draft。
4. 所有局部写入都携带 draftVersion，版本过期返回 409，避免旧快照覆盖新数据。
5. 旧 PUT saveCurrentDraft 保留兼容，但 Days Off / Pairing / Dashboard 日历的高频路径已切到局部 PATCH/POST/DELETE。
6. 本轮不改数据库 schema，因此没有 sql/migration。

主要实现：
- packages/contracts 新增 Calendar Days Off date patch 类型和 route；Pairing/Days Off add request 补 bidId/draftVersion；新增 property patch request/response。
- pbs-server 新增 PATCH routes：/pairing-bids/current/properties/:propertyGroupKey、/days-off-bids/current/properties/:propertyGroupKey、/calendar-days-off/current/dates。
- pbs-server Pairing service：add/delete/patch 都做 versioned current draft mutation；patch 只重写目标 propertyGroupKey 对应 groups/conditions；specific-date pairing 与 day off 冲突校验保留；same pairing/date merge 保留。
- pbs-server Days Off service：add/delete/patch 都做 versioned mutation；patch 只重写目标 property；Days Off 规则校验保留。
- pbs-server Calendar Days Off service：dates patch 只新增/删除目标 pbs_bid_day_off 记录；新增 day off 前继续校验 same-tier pairing 冲突；no-op patch 只检查版本，不创建 draft、不递增 draftVersion。
- pbs-portal request service 新增 patch 方法；pairing/days-off/calendar services 新增局部 mutation 调用并补 draftVersion。
- pbs-portal Dashboard 日历 Days Off 保存由整份 draft debounce 改为确认后局部 PATCH，并加 saving disabled/message；只发送实际变化的 date/tier。
- pbs-portal Pairing 日历详情保存 Tx 改为 property PATCH；空 Tx 由后端删除。
- pbs-portal Pairing right panel Existing Tx toggle/delete/add 使用局部 mutation，取消整份 autosave；pending 时禁用相关操作并显示 message。
- pbs-portal Days Off page 通过 RuleBidRightPanel 的 onUpdateProperty 走单 property PATCH，取消该页面 existing property 整份 autosave。
- metrics 插件改成幂等注册，避免重复 buildServer/test 时 prom-client 默认指标重复注册；metrics test 改为 node:test，符合 pbs-server 当前测试栈。

验证已通过：
- pbs-server：DATABASE_URL=postgresql://test:test@localhost:5432/rois PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 npm test，160 tests pass。
- pbs-server：npm run build 通过。
- pbs-portal：npm test，218 tests pass。
- pbs-portal：npm run lint 通过。
- pbs-portal：npm run build 通过。
- 仓库根目录：git diff --check 通过。
- rg 检查 pbs-portal/src/features/dashboard、pairing、days-off 的非测试高频路径无 saveCurrentDraft 残留。

注意：pbs-portal/tsconfig.tsbuildinfo 会被 tsc -b 刷新，已恢复，不属于本轮改动。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-calendar-days-off.d.ts
 M packages/contracts/pbs-calendar-days-off.js
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/shared/services/calendar-days-off-service.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-portal/src/shared/services/request.ts
 M pbs-server/src/__tests__/plugins/metrics.test.ts
 M pbs-server/src/app.test.ts
 M pbs-server/src/plugins/metrics.ts
 M pbs-server/src/routes/calendar-days-off.test.ts
 M pbs-server/src/routes/calendar-days-off.ts
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/days-off-bids.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-validation.ts
 M pbs-server/src/services/calendar/types.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.ts
 M pbs-server/src/services/days-off/types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/types.ts
?? docs/superpowers/specs/2026-05-06-pbs-local-patch-draft-mutation-design.md
```

### unstaged changed files

```text
packages/contracts/pbs-calendar-days-off.d.ts
packages/contracts/pbs-calendar-days-off.js
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-pairing-bids.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/shared/services/calendar-days-off-service.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-portal/src/shared/services/request.ts
pbs-server/src/__tests__/plugins/metrics.test.ts
pbs-server/src/app.test.ts
pbs-server/src/plugins/metrics.ts
pbs-server/src/routes/calendar-days-off.test.ts
pbs-server/src/routes/calendar-days-off.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/calendar/calendar-days-off-validation.ts
pbs-server/src/services/calendar/types.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
pbs-server/src/services/days-off/days-off-draft-mappers.ts
pbs-server/src/services/days-off/types.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/types.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-06-pbs-days-off-pairing-local-patch-mutations.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
