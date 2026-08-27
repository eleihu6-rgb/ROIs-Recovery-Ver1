# 开发上下文（2026-04-30）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-04-30 14:42:30 CST
- Wing：`pbs`
- Topic：`property-catalog-visibility`
- Title：property-catalog-visibility
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Property Catalog 展示规则统一并跑通验证。

关键业务结论：
- PBS Portal 展示 bid property 默认以旧库 crew_bids_reference 规则为准。
- AA 文档 property 继续入库/保留在 contract 中，但默认不展示，由 pbs_bid_property.is_visible_in_portal 控制。
- pbs_bid_property 增加 source_type、is_visible_in_portal、display_order。
- Pairing Number / Pairing ID 统一使用旧库 property_code=102。
- property_code=128 已恢复为 Deadhead Day，不再作为 Pairing ID。
- Pairing 主页面、Search Pairings、calendar pairing bid 展示共享同一套 stable property 语义，前端不再硬注入 search-only Pairing ID。
- 显示 property/rule 名称的表头统一从 PRIORITY 改为 PROPERTY；真正排序/award priority 语义不改。

落地范围：
- 更新 pbs-server Drizzle model、schema、migration、seed、catalog service、pairing search condition、calendar pairing 展示和性能 baseline 脚本。
- 更新 pbs-portal mapper、Search Pairings picker、Pairing ID autocomplete、mock、相关 UI 表头和测试。
- 更新 pbs-portal/AGENTS.md 与 pbs-server/AGENTS.md，记录 Property Catalog 规范和 102/128 语义。
- 新增 spec 文档 docs/superpowers/specs/2026-04-30-pbs-property-catalog-visibility-design.md。

数据库状态：
- 已用 Node pg 脚本在实际数据库跑过 migration + seed（本机无 psql）。
- 验证过 102 Pairing Number legacy visible=1，128 Deadhead Day legacy visible=1，201/206 DaysOff legacy visible=1，211/217 AA visible=0。

本次最后收尾：
- 修复 pbs-portal pairing-page.test.tsx，让测试按当前 available property fixture 自动跳到目标 property 所在分页，不再依赖 102 加入前的固定页码/固定 32 条。
- 修复 pbs-portal app-routes.test.tsx，让 BrowserRouter 测试匹配 Vite base /fpqe/pbs/，但断言仍使用业务路径。

验证结果：
- npm test -- pairing-page.test.tsx --reporter=dot 通过。
- npm test -- app-routes.test.tsx --reporter=dot 通过。
- npm run verify:pbs 通过：pbs-server test/build/sync dry-run、pbs-portal test/lint/build 全部成功。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/AGENTS.md
 M pbs-portal/src/app/router/app-routes.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-draft-mappers.ts
 M pbs-portal/src/features/pairing/pairing-id-autocomplete.ts
 M pbs-portal/src/features/pairing/pairing-search-criteria.test.ts
 M pbs-portal/src/features/pairing/pairing-search-criteria.ts
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.tsx
 M pbs-portal/tsconfig.node.tsbuildinfo
 M pbs-server/AGENTS.md
 M pbs-server/src/models/pbs/pbs-bid-property.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/scripts/pbs-performance-baseline-core.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/days-off/days-off-property-catalog.test.ts
 M pbs-server/src/services/days-off/days-off-property-catalog.ts
 M pbs-server/src/services/line/line-property-catalog.ts
 M pbs-server/src/services/lineholder/shared.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts
 M pbs-server/src/services/pairing/pairing-property-catalog.test.ts
 M pbs-server/src/services/pairing/pairing-property-catalog.ts
 M sql/schema/03-pbs_pg.sql
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-04-30-pbs-property-catalog-visibility-design.md
?? sql/migration/2026-04-30-pbs-property-catalog-visibility.sql
```

### unstaged changed files

```text
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
packages/contracts/pbs-pairing-bids.js
pbs-portal/AGENTS.md
pbs-portal/src/app/router/app-routes.test.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pairing-draft-mappers.ts
pbs-portal/src/features/pairing/pairing-id-autocomplete.ts
pbs-portal/src/features/pairing/pairing-search-criteria.test.ts
pbs-portal/src/features/pairing/pairing-search-criteria.ts
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-portal/src/features/tier/components/tier-right-panel.tsx
pbs-portal/tsconfig.node.tsbuildinfo
pbs-server/AGENTS.md
pbs-server/src/models/pbs/pbs-bid-property.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/scripts/pbs-performance-baseline-core.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/days-off/days-off-property-catalog.test.ts
pbs-server/src/services/days-off/days-off-property-catalog.ts
pbs-server/src/services/line/line-property-catalog.ts
pbs-server/src/services/lineholder/shared.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts
pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts
pbs-server/src/services/pairing/pairing-property-catalog.test.ts
pbs-server/src/services/pairing/pairing-property-catalog.ts
sql/schema/03-pbs_pg.sql
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-04-30-pbs-property-catalog-visibility.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
