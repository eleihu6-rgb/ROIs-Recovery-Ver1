# 开发上下文（2026-05-21）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-21 12:05:27 CST
- Wing：`pbs`
- Topic：`days-off-configured-favorites`
- Title：days-off-configured-favorites
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Days Off 配置化收藏语义调整。

用户确认的业务语义：
- Days Off 收藏不是收藏 property 模板，而是收藏用户已经配置好的 bid。
- 新增/配置弹窗底部增加 SAVE FAVORITE，位置在 CANCEL 和 ADD BID 中间。
- 点击 SAVE FAVORITE 只保存收藏，不新增 Existing。
- 外部 ADD DAYS OFF PROPERTIES 行上的红心入口移除。
- FAVORITED PROPERTIES 展示已配置收藏，点击收藏项直接新增 Existing，不再打开配置弹窗。
- 当前开发环境未上线，历史 DaysOff 模板收藏可以删除。

关键实现：
- Contract 新增 currentFavorites = /days-off-bids/current/favorites。
- Days Off favorite POST 请求保存完整 propertyCode/bid/tiers/allOrNothing/minimumN。
- 后端新增 POST /days-off-bids/current/favorites，删除仍按 favoriteKey。
- 前端 DaysOff 弹窗新增 SAVE FAVORITE，并把当前弹窗配置传给 service。
- 共享 RuleBidRightPanel 支持 source='favorite' 的 configured favorite row；收藏 tab 点击这类 row 直接 add，不走弹窗。
- All Properties 对 Days Off 不展示外部红心，并过滤 configured favorite rows。
- FAVORITED PROPERTIES 中配置收藏来自完整快照，而不是 favoritePropertyCodes 模板星标。

数据库决策：
- 初版曾考虑扩展 pbs_bid_property_favorite 并删除其唯一索引，但实际开发库中该旧表和唯一索引 owner 是 f8，PBS 连接用户 f8_pbs 无权 ALTER/DROP。
- 最终改为新增 PBS Days Off 专用表 pbs_bid_days_off_favorite 保存完整配置快照。
- 旧 pbs_bid_property_favorite 保留给 Line 等模板收藏语义，保留原 (bid_id,bid_type,property_id) 唯一约束，不再误伤其他模块。
- migration sql/migration/2026-05-21-configured-days-off-favorites.sql 会清理旧通用表 bid_type='DaysOff' 的模板收藏，并创建 pbs_bid_days_off_favorite 与索引。
- 已在当前 f8_pbs 开发库执行 migration：旧 DaysOff 模板收藏从 4 条清为 0，新表与 idx_pbs_bid_days_off_favorite_bid、idx_pbs_bid_days_off_favorite_bid_property 已创建。
- migration 已重复执行验证通过，具备幂等性。

文档：
- Spec: docs/superpowers/specs/2026-05-21-pbs-days-off-configured-favorites-design.md
- 人工回归测试用例: docs/test-cases/pbs/days-off/2026-05-21-configured-favorites-regression.md

验证：
- pnpm --dir pbs-server test：190 tests passed。
- pnpm --dir pbs-server build：通过。
- pnpm --dir pbs-portal test：51 files / 324 tests passed。
- pnpm --dir pbs-portal lint：通过。
- pnpm --dir pbs-portal build：通过；仅 Vite chunk size warning。
- git diff --check：通过。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-days-off-bids.js
 M pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
 M pbs-portal/src/features/rule-bids/rule-bid-page-cache.test.ts
 M pbs-portal/src/features/rule-bids/rule-bid-page-cache.ts
 M pbs-portal/src/features/rule-bids/types.ts
 M pbs-portal/src/features/rule-bids/utils.test.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-portal/src/shared/services/days-off-service.test.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-server/src/models/index.ts
 M pbs-server/src/routes/days-off-bids.test.ts
 M pbs-server/src/routes/days-off-bids.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.ts
 M pbs-server/src/services/days-off/days-off-draft-queries.ts
 M pbs-server/src/services/days-off/days-off-mutation-response.test.ts
 M pbs-server/src/services/days-off/types.ts
?? docs/superpowers/specs/2026-05-21-pbs-days-off-configured-favorites-design.md
?? docs/test-cases/pbs/days-off/2026-05-21-configured-favorites-regression.md
?? pbs-portal/src/features/days-off/days-off-draft-mappers.test.ts
?? pbs-server/src/models/pbs/pbs-bid-days-off-favorite.ts
?? sql/migration/2026-05-21-configured-days-off-favorites.sql
```

### unstaged changed files

```text
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-days-off-bids.js
pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
pbs-portal/src/features/rule-bids/rule-bid-page-cache.test.ts
pbs-portal/src/features/rule-bids/rule-bid-page-cache.ts
pbs-portal/src/features/rule-bids/types.ts
pbs-portal/src/features/rule-bids/utils.test.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-portal/src/shared/services/days-off-service.test.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-server/src/models/index.ts
pbs-server/src/routes/days-off-bids.test.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
pbs-server/src/services/days-off/days-off-draft-mappers.ts
pbs-server/src/services/days-off/days-off-draft-queries.ts
pbs-server/src/services/days-off/days-off-mutation-response.test.ts
pbs-server/src/services/days-off/types.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-21-pbs-days-off-configured-favorites.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
