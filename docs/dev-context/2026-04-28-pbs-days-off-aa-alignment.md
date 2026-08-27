# 开发上下文（2026-04-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-28 15:29:25 CST
- Wing：`pbs`
- Topic：`days-off-aa-alignment`
- Title：days-off-aa-alignment
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS /days-off 页面 AA Days Off Tab 第一步对齐：
- 保留 legacy DaysOff 201-206，不覆盖旧含义；AA 新目录使用 211-217。
- 新增 AA Days Off 属性：Minimum Days Off Between Work Blocks、Maximize Weekend/Total/Block Days Off、String Starting/Ending on Date、Waive Minimum Days Off。
- 新增通用 bid value：flag 和 date，并补齐前后端序列化、反序列化、展示与控件。
- /days-off 右侧 RuleBid 面板挂 Days Off 本地校验；冲突时显示错误并阻止保存。
- 后端 Days Off 保存增加基础校验：unsupported code、L1-L7、211 范围 1-12、flag/date 类型、同层 maximize/string 互斥、211/215/216 单层唯一、215/216 同层互斥。
- calendar days off 保存增加 L1-L7、YYYY-MM-DD 有效日期、日期在 period 内、去重排序校验。
- 左侧共享 BIDDING CALENDAR 改为仅 /days-off 可编辑；/pairing、/line、/layer 等共享页面只读展示。
- /days-off 日期点击不再直接 toggle，而是弹出 ADD BID / DELETE BID 确认；weekday header 支持 ADD ALL <WEEKDAY> BIDS 批量添加。
- 新增 migration：sql/migration/2026-04-28-add-aa-days-off-properties.sql，插入 211-217，幂等 on conflict，不修改 201-206。
- 已使用当前 pbs-server/.env 指向的数据库执行该 migration；执行前 211-217 不存在，执行后已存在 211,212,213,214,215,216,217。
- 本轮未实现第二步：Waive Minimum Days Off persistent 语义、Minimum Days Off restrictive 跨 layer 规则、Clear Bids、all_or_nothing/minimum_n、Layer 页面展示。
验证：npm run verify:pbs 通过；其中包含 pbs-server test/build/sync dry-run 和 pbs-portal test/lint/build。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-pairing-bids.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/days-off/days-off-draft-mappers.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/lineholder-route-utils.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
?? docs/dev-context/2026-04-28-pbs-days-off-aa-alignment.md
?? docs/superpowers/specs/2026-04-28-pbs-days-off-aa-alignment-design.md
?? pbs-portal/src/features/days-off/days-off-validation.ts
?? pbs-server/src/services/calendar/calendar-days-off-validation.test.ts
?? pbs-server/src/services/calendar/calendar-days-off-validation.ts
?? pbs-server/src/services/days-off/days-off-validation.test.ts
?? pbs-server/src/services/days-off/days-off-validation.ts
?? pbs-server/src/services/lineholder/date-utils.ts
?? sql/migration/2026-04-28-add-aa-days-off-properties.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-pairing-bids.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/days-off/days-off-draft-mappers.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/lineholder-route-utils.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-28-pbs-days-off-aa-alignment.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
