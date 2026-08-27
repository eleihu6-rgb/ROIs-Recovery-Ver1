# 开发上下文（2026-05-29）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-29 10:02:53 CST
- Wing：`pbs`
- Topic：`favorite-configured-snapshot-cleanup`
- Title：favorite-configured-snapshot-cleanup
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Favorite 配置快照语义统一与旧模板收藏清理。

用户确认的产品语义：
- FAVORITED PROPERTIES 收藏的是“已配置规则快照”，不是 property 模板。
- Line / Pairing 新收藏必须包含 propertyCode + bid + tiers；Pairing 还包含 action + quantifier。
- DaysOff 已经正确，本轮不改 DaysOff。

实现范围：
- Line 前端 `401-405` 收藏从 propertyCode 模板收藏改为保存完整 RuleBidAvailableProperty 快照，写入 `POST /line-bids/current/favorites`。
- RuleBidRightPanel 的 `onFavoriteProperty` 改为传完整 property，而不是只传 propertyCode。
- Line 后端停止读取/写入 `pbs_bid_property_favorite` 中的 `bid_type='Line'` rows，只读写 `pbs_bid_line_favorite`。
- Line legacy route `PUT /line-bids/current/favorites/:propertyCode` 已移除，contracts 中 `favoriteByCode` 和旧 request type 已移除。
- Pairing 搜索页收藏从 legacy `favoriteProperty(propertyCode)` 改为 `saveConfiguredFavoriteProperty(item, draftMeta)`，保存搜索条件当前 action/quantifier/bid/tiers。
- Pairing 前后端移除 legacy `PUT /pairing-bids/current/favorites/:propertyCode`、`saveFavoriteProperty`、`PbsLegacySavePairingFavoritePropertyRequest`，运行时不再读写 `pbs_bid_pairing_favorite`。
- 保留旧表结构与 model export，不 drop 表；runtime 不再使用。

数据库：
- 新增 migration：`sql/migration/2026-05-29-pbs-favorite-configured-snapshot-cleanup.sql`。
- migration 将旧 Line 模板收藏按 Line catalog 默认 bid + `['T1']` 迁移到 `pbs_bid_line_favorite`。
- migration 将旧 Pairing 模板收藏按 Pairing catalog 默认 action/quantifier/bid + `['T1']` 迁移到 `pbs_bid_pairing_configured_favorite`。
- 已在本地 PBS DB 执行成功：
  - before: line_template_count=2, pairing_template_count=3, line_configured_count=0, pairing_configured_count=3
  - after: line_template_count=0, pairing_template_count=0, line_configured_count=2, pairing_configured_count=6
- 第一次执行 migration 因 `comment on table` 权限不足 rollback；已移除注释语句后重新执行成功。

验证：
- `pnpm --dir pbs-portal exec tsc --noEmit` 通过。
- `pnpm --dir pbs-server exec tsc --noEmit` 通过。
- `pnpm --dir pbs-portal exec vitest run src/features/line/pages/line-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx src/shared/services/pairing-service.test.ts` 通过，37 tests passed。
- `DATABASE_URL=... PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 node --import tsx --test src/routes/line-bids.test.ts src/routes/pairing-bids.test.ts src/app.test.ts` 在 pbs-server 下通过，91 tests passed。
- `pnpm --dir pbs-portal build` 通过；Vite 仍有既有 chunk size warning。
- `pnpm --dir pbs-server build` 通过。

注意：
- `pbs_bid_property_favorite` 仍供 DaysOff 或历史用途存在；Line runtime 不再使用。
- `pbs_bid_pairing_favorite` 旧表已清空；Pairing runtime 不再使用。
- 后续若要完全 drop 旧表，需要单独做 schema cleanup spec。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-line-bids.js
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/line/pages/line-page.test.tsx
 M pbs-portal/src/features/line/pages/line-page.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/src/shared/services/line-service.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-server/src/app.test.ts
 M pbs-server/src/routes/line-bids.test.ts
 M pbs-server/src/routes/line-bids.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/routes/pairing-bids.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/line/line-draft-property-helpers.ts
 M pbs-server/src/services/line/types.ts
 M pbs-server/src/services/pairing/pairing-bid-normalization.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/types.ts
?? docs/dev-context/2026-05-28-pbs-line-favorite-semantics.md
?? docs/superpowers/specs/2026-05-29-pbs-favorite-configured-snapshot-cleanup-design.md
?? sql/migration/2026-05-29-pbs-favorite-configured-snapshot-cleanup.sql
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-line-bids.js
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/src/shared/services/line-service.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/src/app.test.ts
pbs-server/src/routes/line-bids.test.ts
pbs-server/src/routes/line-bids.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/routes/pairing-bids.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/line/line-draft-property-helpers.ts
pbs-server/src/services/line/types.ts
pbs-server/src/services/pairing/pairing-bid-normalization.ts
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
2. 本文件：`docs/dev-context/2026-05-29-pbs-favorite-configured-snapshot-cleanup.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
