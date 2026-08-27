# 开发上下文（2026-04-30）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-30 17:28:51 CST
- Wing：`pbs`
- Topic：`carry-out-pairing-property`
- Title：carry-out-pairing-property
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 跨月 pairing 控制方案调整：撤回 Days Off 日历下月占位表达，改为 Pairing property。

关键业务结论：
- 不在左侧 BIDDING CALENDAR 显示 C/O Off，不再把下个月日期作为 Days Off placeholder。
- 新增 Pairing property：property_code/propertyCode=163，名称 Carry-Out Days。
- 默认语义是 Avoid Carry-Out Days > 0：只要 pairing 跨出当前 bid month 就排除；> N 表示允许跨月 N 天以内。
- Carry-Out Days 属于 Pairing/Search Pairings 过滤条件，不属于 Off/DO/Days Off 业务数据。
- Search Pairings preview 现在会传 periodCode，后端用当前 bid period 月末计算 carry-out days，禁止硬编码月份。

代码落地：
- packages/contracts/pbs-pairing-bids.js/.d.ts：新增 163、single usage、defaultAction avoid、stepper 默认值。
- packages/contracts/pbs-search-pairings.d.ts：preview request 增加可选 periodCode。
- pbs-server pairing-search：新增 PairingSearchConditionContext，163 条件使用 periodCode 月末和 buildCompareClause 生成 SQL，缺少/非法 periodCode 返回 400。
- pbs-portal pairing：Search Pairings 从 draftMeta/当前 pairing page data 取 periodCode 并透传 preview；available property preview 也带 draftMeta。
- sql/seed/10-pbs-bid-property.sql 和 sql/migration/2026-04-30-pbs-carry-out-days-property.sql：新增 163 可见 legacy property。
- pbs-portal/AGENTS.md、pbs-server/AGENTS.md 记录 163 规范，避免以后把它做回日历占位。

数据库状态：
- 本地/当前 PBS 数据库执行了 2026-04-30-pbs-carry-out-days-property.sql。
- 初次执行时保护逻辑发现 5 行上一版废弃 CARRY_OUT_PLACEHOLDER，于是先停止。
- 已明确只删除这 5 行废弃 placeholder，正常 DAY_OFF 未删除。
- 重跑 migration 后，pbs_bid_property 163 = Carry-Out Days，source_type=legacy，is_visible_in_portal=1，display_order=163。
- pbs_bid_day_off.request_type 已恢复为 varchar(20)，当前只剩 DAY_OFF 行。

验证：
- 针对性后端测试：pairing-search-condition-builder.test.ts、pairing-property-catalog.test.ts 通过。
- 针对性前端测试：pairing-search-criteria.test.ts、pairing-page.test.tsx、search-pairings-page.test.tsx 通过。
- npm run verify:pbs 通过：pbs-server test/build/sync dry-run、pbs-portal test/lint/build 全部成功。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M packages/contracts/pbs-search-pairings.d.ts
 M pbs-portal/AGENTS.md
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/features/pairing/pairing-draft-mappers.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
 M pbs-portal/src/features/pairing/pairing-search-criteria.test.ts
 M pbs-portal/src/features/pairing/pairing-search-criteria.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-server/AGENTS.md
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing/pairing-property-catalog.test.ts
 M pbs-server/src/services/pairing/pairing-property-catalog.ts
 M sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-04-30-pbs-carry-out-pairing-property-design.md
?? pbs-server/src/services/pairing-search/pairing-search-condition-context.ts
?? sql/migration/2026-04-30-pbs-carry-out-days-property.sql
```

### unstaged changed files

```text
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/AGENTS.md
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/features/pairing/pairing-search-criteria.test.ts
pbs-portal/src/features/pairing/pairing-search-criteria.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/AGENTS.md
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing/pairing-property-catalog.test.ts
pbs-server/src/services/pairing/pairing-property-catalog.ts
sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-30-pbs-carry-out-pairing-property.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
