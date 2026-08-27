# 开发上下文（2026-05-01）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-01 15:52:35 CST
- Wing：`pbs`
- Topic：`pairing-number-occurrence-bid`
- Title：pairing-number-occurrence-bid
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing Number occurrence bid 第一阶段闭环。

业务结论：
- Pairing Number / Pairing ID 使用旧库 propertyCode=102。
- 添加 Pairing Number 时需要区分 Entire Month 与 Specific Date。
- Entire Month 语义：同一个 pairing number 在当前 bid period 内所有运行 occurrence 都加入 bid，并在左侧 BIDDING CALENDAR 显示全部 occurrence。
- Specific Date 语义：只加入用户选中的 originDate 那一次 occurrence，并在左侧日历只显示这一趟。
- 运行日期由 pbs-server 从 live pairing / pairing_segment 查询，前端不猜日期。
- 本轮不做 Days Off 过滤 pairing pool、day off override、planned absence 禁用、左侧日历 pairing 编辑删除、最终 Award/DO 计算。

设计文档：
- docs/superpowers/specs/2026-05-01-pbs-pairing-number-occurrence-bid-design.md

接口与后端：
- packages/contracts/pbs-search-pairings.js/.d.ts 增加 /pairing-search/pairing-occurrences。
- pbs-server 增加 pairing occurrence 查询 helper：src/services/pairing-search/pairing-occurrence-query.ts。
- pbs-server pairing-search route/service 增加 searchPairingOccurrences。
- pairing preview 条件支持 propertyCode=102 的 tag-list-date，只匹配 selected origin date。
- pairing bid 草稿反序列化时，propertyCode=102 且 paramB 是 ISO date 会恢复为 tag-list-date。
- bidding-calendar-service 改为批量 loadPairingOccurrences，Entire Month 展开全部 occurrence，Specific Date 按 paramB originDate 过滤，event metadata 写入 occurrenceMode / pairingNumber / pairingId / originDate。

前端：
- 新增 PairingOccurrenceBidDialog 组件：src/features/pairing/components/pairing-occurrence-bid-dialog.tsx。
- 新增 Pairing Number occurrence helper：src/features/pairing/pairing-number-occurrences.ts。
- Search Pairings 的 BID THESE PROPERTIES 如果包含 Pairing Number，会打开 occurrence dialog，选择 Entire Month / Specific Date 和 Tier 后保存。
- Pairing 主页面 ADD PAIRING PROPERTIES 的 Pairing Number 加号也会打开同一个 occurrence dialog；主页面沿用该 row 已选 tiers。
- 保存后继续走 pairingService.addCurrentDraftProperty，并刷新 Pairing/Tier/左侧 BIDDING CALENDAR query。

测试与验证：
- 新增/更新前端测试覆盖 Search Pairings Specific Date 保存、Pairing 主页面 Entire Month 加号保存。
- 新增后端日历单测覆盖 Entire Month 展开多次 occurrence、Specific Date 只保留选中 occurrence。
- npm run verify:pbs 已通过：pbs-server test/build/sync dry-run、pbs-portal test/lint/build 全部成功。

注意：
- verify/build 会改动 pbs-portal/tsconfig.tsbuildinfo，本轮已恢复该缓存文件，避免提交无关 metadata。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-search-pairings.d.ts
 M packages/contracts/pbs-search-pairings.js
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/shared/i18n/locales/en.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-server/src/app.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/superpowers/specs/2026-05-01-pbs-pairing-number-occurrence-bid-design.md
?? pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx
?? pbs-portal/src/features/pairing/pairing-number-occurrences.ts
?? pbs-server/src/services/calendar/bidding-calendar-service.test.ts
?? pbs-server/src/services/pairing-search/pairing-occurrence-query.ts
```

### unstaged changed files

```text
packages/contracts/pbs-search-pairings.d.ts
packages/contracts/pbs-search-pairings.js
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/shared/i18n/locales/en.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/src/app.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-01-pbs-pairing-number-occurrence-bid.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
