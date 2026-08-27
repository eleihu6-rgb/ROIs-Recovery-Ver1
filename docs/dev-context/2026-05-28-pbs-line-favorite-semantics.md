# 开发上下文（2026-05-28）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-28 22:27:39 CST
- Wing：`pbs`
- Topic：`line-favorite-semantics`
- Title：PBS Line/Reserve/收藏语义上下文
- Git branch：`main`

## 本轮对话上下文

本轮主要围绕 PBS Portal / PBS Server 的 Reserve、Line 条件和 favorite 语义继续开发。用户准备新开一个上下文并行开发，所以这里保存当前状态和不要重复推翻的结论。

## 已恢复和遵守的规则

- 新窗口恢复入口仍是 `NEXT_CONTEXT.md`。
- 用户-facing 文档和总结默认中文。
- 任何新功能/行为变更需先写 spec 并经用户确认；本轮 Line 混合添加和显示规则已写入并持续更新：
  - `docs/superpowers/specs/2026-05-28-pbs-line-mixed-add-and-configured-favorites-design.md`
  - `docs/superpowers/specs/2026-05-28-pbs-line-commuter-pattern-design.md`
- 用户明确希望后续收藏语义继续在当前窗口讨论，新窗口可并行开发其它部分。

## Reserve 已完成上下文

之前已完成 Reserve 主要交互：
- `Legacy Reserve` / `AA Prefer Off` 双模式。
- Legacy 模式：`301 Short Call Type`、`302 Reserve Day On`。
- AA 模式：`311 Reserve Prefer Off`。
- 去掉旧通用 `ADD RESERVE BID`。
- 日历点击弹窗选择 Tx；Legacy 添加 `302`，AA 添加 `311`。
- `301 Short Call Type` 单独 Legacy-only 弹窗添加。
- 日期类 Reserve bid 同 property + 同 active Tx 自动合并到已有行，走 patch。
- Existing Reserve bid 值只读，点 edit icon 弹窗修改；tier 可 inline 改。
- 多处 cursor-pointer / cursor-not-allowed 已修。

## Line 已完成上下文

已新增并验证 Line 条件：
- `408 Commuter Pattern`，属于 Line，不属于 DaysOff/Pairing。
- 支持 `days-off-on-pattern`：`minDaysOn/maxDaysOn/minDaysOff`，默认 `4-5 on / 4 off`。
- Migration 已执行到真实 PBS schema `f8_pbs.pbs_bid_property`，确认 `408 | Line | Commuter Pattern | is_visible_in_portal=1 | is_active=1`。
- 如页面看不到 catalog，可重启 `pbs-server` 清 catalog cache。

Line 混合添加模式已实现：
- `401-405` 固定 flag 条件：点 `+` 直接添加，点心形直接普通收藏。
- `406 Forget Line`、`407 Min Base Layover`、`408 Commuter Pattern`：点 `+` 弹窗配置后添加。
- 配置型条件在弹窗里可以 `SAVE FAVORITE` 保存 configured favorite。
- Favorited 中已配置项：点 `+` 直接添加，不再弹窗。
- 新增 Line 专用弹窗：`pbs-portal/src/features/line/components/line-bid-dialog.tsx`。
- 共享 `RuleBidRightPanel` 增加了行级/动作级配置能力，Line 通过 predicate 控制哪些条件弹窗、哪些列显示。

Line 最新视觉/交互规则：
- `ADD LINE PROPERTIES / ALL PROPERTIES` 中 `BID` 列统一显示 `--`，不直接显示可编辑 bid 控件。
- `401-405`：显示 `TIERS`，因为这些条件不弹窗，用户需要在列表里选 Tx 后直接添加；爱心保留。
- `406/407/408`：隐藏 `TIERS`，隐藏爱心；点击 `+` 进入弹窗，在弹窗里配置 bid + Tx。
- `FAVORITED PROPERTIES`：不显示爱心；普通 favorite 和 configured favorite 都显示删除 icon，删除确认弹窗对齐 DaysOff；`TIERS` 只读展示，不允许在收藏列表里改；configured favorite 显示保存过的 bid。

## Line 后端/API/DB 已完成上下文

新增/修改：
- `packages/contracts/pbs-line-bids.js/.d.ts`
  - 增加 `currentFavorites: "/line-bids/current/favorites"`。
  - 增加 configured favorite request/response 类型。
- `pbs-server/src/models/pbs/pbs-bid-line-favorite.ts`
  - 新增 `pbs_bid_line_favorite` Drizzle model。
- `sql/migration/2026-05-28-pbs-line-configured-favorites.sql`
  - 新增 `pbs_bid_line_favorite` 表。
- `pbs-server/src/routes/line-bids.ts`
  - 新增 `POST /line-bids/current/favorites`。
  - `DELETE /line-bids/current/favorites/by-key/:favoriteKey` 支持 `line-configured-<id>` key。
- `pbs-server/src/services/line/line-bid-service.ts`
  - 读取 Line favorite 时目前混读两类：旧 `pbs_bid_property_favorite` 中 `bid_type='Line'` 的模板收藏 + 新 `pbs_bid_line_favorite` 的 configured favorite。
  - 保存 configured favorite 使用 `pbs_bid_line_favorite`。
  - 保存普通 favorite 目前仍使用 `pbs_bid_property_favorite`。

Migration 已通过 Node/pg 直接执行到当前 PBS DB，确认 `pbs_bid_line_favorite exists`。

## 已验证命令

已通过：
- `pnpm --dir pbs-server build`
- `pnpm --dir pbs-portal build`
- `pnpm --dir pbs-portal exec vitest run src/features/line/pages/line-page.test.tsx src/features/line/line-draft-mappers.test.ts src/features/rule-bids/rule-bid-page-cache.test.ts`
- `pnpm --dir pbs-server test -- line-bids.test.ts`（该脚本实际跑了全量 node test，全部通过）

前端 build 只有既有 Vite chunk size warning，不影响运行。

## 当前关于 favorite 语义的最新结论（还未实施最终统一）

用户提出关键问题：DaysOff 之前已把 `FAVORITED PROPERTIES` 语义改为“收藏已经设置好的规则条件”，不是收藏 property 模板；需要检查 Pairing 和 Line 是否一致。

已排查结论：
- DaysOff：语义正确。
  - 表：`pbs_bid_days_off_favorite`
  - 存：`property_code + bid_payload + tiers + all_or_nothing + minimum_n`
  - 这是“配置快照收藏”。
- Pairing：主流程正确，但有 legacy 残留。
  - 主表：`pbs_bid_pairing_configured_favorite`
  - 存：`property_code + action + quantifier + bid_payload + tiers`
  - 主 PBS Pairing 页面保存 configured favorite 用这个表。
  - 但旧表 `pbs_bid_pairing_favorite` 和 legacy `PUT /pairing-bids/current/favorites/:propertyCode` 仍存在，数据库当前有 3 条旧语义数据。
  - 搜索页 `search-pairings-page.tsx` 仍可能调用 `pairingService.favoriteProperty`，需确认是否还需要 legacy 语义。
- Line：当前是混合语义，尚未完全符合用户希望。
  - `406-408` configured favorite 存新表 `pbs_bid_line_favorite`，方向正确。
  - `401-405` 普通 favorite 仍存 `pbs_bid_property_favorite`，只保存 `property_code`，不保存用户选的 tiers。
  - 用户指出 `Max Credit Window` 这类虽然 bid 是 flag，但也需要用户在外面选择 tiers，所以 favorite 也应保存 `property + bid + selected tiers` 快照。

当前数据库查询结果：
- `pbs_bid_days_off_favorite`: 1
- `pbs_bid_pairing_configured_favorite`: 3
- `pbs_bid_pairing_favorite`: 3
- `pbs_bid_line_favorite`: 0
- `pbs_bid_property_favorite`: 2，且都是 `Line`

推荐后续实现方向（需在本窗口继续确认/开发）：
- Line 应统一为“配置快照收藏”：所有 Line favorite 都写 `pbs_bid_line_favorite`。
- `401-405` 点爱心时，也保存当前 `bid + selected tiers`，不再只保存 `property_code`。
- Line 不再写 `pbs_bid_property_favorite`。
- Line 读取 favorite 时不再混读 `pbs_bid_property_favorite`，或先迁移旧数据后停用混读。
- 清理/迁移当前 `pbs_bid_property_favorite where bid_type='Line'` 的旧数据。
- Pairing 后续要确认搜索页是否还依赖 legacy favorite；如果不依赖，应停用/迁移 `pbs_bid_pairing_favorite`，让 Pairing 也只保留 configured favorite 语义。

## 当前重要文件

Line/RuleBid 前端：
- `pbs-portal/src/features/line/pages/line-page.tsx`
- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/line/pages/line-page.test.tsx`
- `pbs-portal/src/shared/services/line-service.ts`
- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`
- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`

Line 后端：
- `pbs-server/src/services/line/line-bid-service.ts`
- `pbs-server/src/services/line/line-draft-property-helpers.ts`
- `pbs-server/src/routes/line-bids.ts`
- `pbs-server/src/routes/line-bids.test.ts`
- `pbs-server/src/models/pbs/pbs-bid-line-favorite.ts`
- `sql/migration/2026-05-28-pbs-line-configured-favorites.sql`

Pairing favorite 参考：
- `pbs-server/src/services/pairing/pairing-bid-service.ts`
- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`

DaysOff 正确语义参考：
- `pbs-server/src/models/pbs/pbs-bid-days-off-favorite.ts`
- `pbs-server/src/services/days-off/days-off-bid-service.ts`
- `pbs-server/src/services/days-off/days-off-draft-queries.ts`
- `pbs-portal/src/shared/services/days-off-service.ts`

## 注意事项

- `pbs-server/.env` 里有真实数据库连接信息，不要在用户可见输出里泄露。
- 工作树当前包含大量未提交改动，很多是本轮 Reserve/Line 开发产生的，不要 revert。
- `pbs-portal/tsconfig.tsbuildinfo` 是 build 产生的改动，注意不要误当业务改动。
- 新窗口如果只是恢复上下文，先不要改代码；如果要改收藏语义，按 AGENTS.md 先写/更新 spec 并经用户确认。

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
2. 本文件：`docs/dev-context/2026-05-28-pbs-line-favorite-semantics.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
