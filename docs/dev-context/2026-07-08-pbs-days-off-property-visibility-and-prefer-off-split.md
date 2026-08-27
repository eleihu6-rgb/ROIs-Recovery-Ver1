# 开发上下文（2026-07-08）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-08 13:19:47 CST
- Wing：`pbs`
- Topic：`days-off-property-visibility-and-prefer-off-split`
- Title：days-off-property-visibility-and-prefer-off-split
- Git branch：`main`

## 本轮对话上下文

本轮主要围绕 PBS Portal Days Off 条件精简、Prefer Off 拆分入口、以及 property visibility 控制方式做了开发和纠偏。

关键产品结论：
- Jenife 反馈后，Days Off 当前决定只保留 Prefer Off 能力，但前端 Add Properties 里把 Prefer Off 拆成三个更清晰入口：Dates、Days of Week、Date Range。
- Weekends 不再作为单独入口；可由 Days of Week 覆盖。
- Prefer Off 的 modifiers / time window / all-or-nothing / minimum N 不再在 Days Off 配置 UI 里展示。
- 203 Min Consecutive Days Off 先隐藏，不作为当前用户可选条件展示。
- 隐藏条件应该由数据库 `pbs_bid_property.is_visible_in_portal` + pbs-server property catalog 控制，不应在 pbs-portal 前端硬编码过滤。

已确认的真实代码链路：
- DB 字段：`pbs_bid_property.is_visible_in_portal`，1=展示，0=隐藏。
- pbs-server 过滤位置：`pbs-server/src/services/lineholder/property-catalog.ts`，`catalog` 只返回 `isVisibleInPortal === 1` 且 contract 支持的 property。
- Days Off 服务：`pbs-server/src/services/days-off/days-off-bid-service.ts` 调用 `resolveLineholderPropertyCatalog`，并缓存 `cache.key("days-off", "property-catalog", "v1")`，Redis key 形如 `pbs:<schema>:days-off:property-catalog:v1`。
- `catalogByCode` 应保留所有 active supported property，用于历史草稿/已有 bid 反序列化；不要用隐藏字段删除或破坏已有历史 bid。
- `pbs-server/src/services/days-off/days-off-property-catalog.ts` 的 `filterVisibleDaysOffPropertyCatalog` 当前只是返回 catalog，原因是上游 catalog 已经按 DB visibility 过滤。

重要纠偏：
- 曾在 `pbs-portal/src/features/days-off/days-off-draft-mappers.ts` 中加入 `properties.filter(property => property.propertyCode === 201)` 前端兜底过滤，这是过度处理。
- 已按用户要求改回：mapper 现在保留后端返回的所有 available property，只对 catalog source 且 `propertyCode=201` 的 Prefer Off 展开为 Dates / Days of Week / Date Range。
- 对应测试改为验证：如果后端返回 203，mapper 会保留 203；隐藏职责归 DB + pbs-server catalog。

当前数据库状态检查结果：
- 使用 `pbs-server/.env` 指向的当前 PBS schema 查询并更新过 `pbs_bid_property` DaysOff：
  - 201 Prefer Off visible=1
  - 202 Max Consecutive Days On visible=0
  - 203 Min Consecutive Days Off visible=0
  - 204 Min Consecutive Days Off In Window visible=0
  - 205 Days Off / Days On Pattern visible=0
  - 206 Employee Schedule Preference visible=0
- 已执行 DB update 把 203 的 `is_visible_in_portal` 改成 0，并尝试清理 Redis catalog key；当时 key 不存在或已过期（delete count 0）。
- 如果 UI 仍显示 203，优先刷新页面；若 pbs-server 仍有 in-memory catalog cache，则等 TTL 或重启 pbs-server。
- 不要在聊天/文档中写出数据库连接串、Redis 密码或其它 secret。

当前代码/文件状态提醒：
- 工作树仍有多处未提交改动，下一窗口必须先 `git status --short` 和按需 `git diff`，不要误提交/覆盖用户改动。
- 已知 modified 包括：
  - `pbs-portal/src/features/days-off/days-off-draft-mappers.ts`
  - `pbs-portal/src/features/days-off/days-off-draft-mappers.test.ts`
  - `pbs-portal/src/features/days-off/pages/days-off-page.tsx`
  - `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
  - `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
  - `pbs-portal/src/features/help/topics/days-off/days-off-add.tsx`
  - `e2e/pages/pbs-portal/bid-workbench-page.ts`
  - `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
  - `docs/test-cases/pbs/days-off/2026-07-07-days-off-visible-property-pruning.md`
  - `sql/seed/10-pbs-bid-property.sql`
- 已知 untracked 包括：
  - `docs/superpowers/specs/2026-07-07-pbs-pairing-visible-property-pruning-from-jenife-feedback-design.md`
  - `docs/superpowers/specs/2026-07-08-pbs-days-off-prefer-off-entry-simplification-design.md`
  - `docs/test-cases/pbs/days-off/2026-07-08-days-off-prefer-off-entry-simplification.md`
  - `sql/migration/2026-07-08-pbs-days-off-hide-consecutive-days-off.sql`

本轮已完成/保留的代码行为：
- Existing Days Off row 的 BID 显示已恢复为只读展示，不再显示 chip 删除按钮；编辑应通过 dialog。
- 实现方式：`pbs-portal/src/features/days-off/pages/days-off-page.tsx` 给 `RuleBidRightPanel` 传入 `existingBidEditMode="dialog"`。
- Prefer Off 拆分入口逻辑在 `pbs-portal/src/features/days-off/days-off-draft-mappers.ts`：
  - catalog 里的 201 展开为 Dates / Days of Week / Date Range。
  - existing/favorite 里的 201 会根据 tag-list 值重命名为 Dates / Days of Week / Date Range。
  - Prefer Off 的 `allOrNothing` 强制 false，`minimumN` 强制 null。
- 已修正 `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`：弹窗 mode 由外层入口或已有 bid 值锁定，不再显示 `PREFER OFF TYPE` / Dates / Days of Week / Date Range 二次切换。
- `Dates` 弹窗只显示日期输入，`Days of Week` 只显示星期复选框，`Date Range` 只显示 from/to 日期输入；保存仍统一写回 `propertyCode=201`。

本轮验证：
- 运行过：
  `pnpm exec vitest run src/features/days-off/days-off-draft-mappers.test.ts src/features/days-off/pages/days-off-page.test.tsx --reporter=verbose`
- 结果：PASS，2 个 test files，23 tests passed。
- 运行过 `pnpm build`（在 `pbs-portal/`）：PASS。
- 运行过 Playwright：
  - `pnpm exec playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/condition-default-favorites.spec.ts -g 'PBS-3511|PBS-3512'`：PASS，3 passed（含 setup）。
  - `pnpm exec playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/condition-default-favorites.spec.ts -g 'PBS-3510'`：PASS，2 passed（含 setup）。
- 运行过 `npm run check:ui`：PASS，0 hard violations，136 warnings。
- 运行过 `node .gitnexus/run.cjs detect_changes --scope working`：medium risk，影响流程仍集中在 DaysOffPage。

下一窗口建议流程：
1. 先读根目录 `NEXT_CONTEXT.md`、本文件/最新 dev context、`pbs-server/AGENTS.md`、`pbs-portal/AGENTS.md`。
2. `git status --short`，确认工作树，不要误动 unrelated files。
3. 如果 UI 仍显示 203，先刷新页面；若仍存在，检查 pbs-server catalog cache TTL / 服务是否需要重启。
4. 不要重新加前端硬编码隐藏；DB visibility 是主方案。

## 当前工作树快照

### git status --short

```text
 M docs/test-cases/pbs/days-off/2026-07-07-days-off-visible-property-pruning.md
 M e2e/pages/pbs-portal/bid-workbench-page.ts
 M e2e/tests/pbs-portal/condition-default-favorites.spec.ts
 M pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
 M pbs-portal/src/features/days-off/days-off-draft-mappers.test.ts
 M pbs-portal/src/features/days-off/days-off-draft-mappers.ts
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/src/features/help/topics/days-off/days-off-add.tsx
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-07-07-pbs-pairing-visible-property-pruning-from-jenife-feedback-design.md
?? docs/superpowers/specs/2026-07-08-pbs-days-off-prefer-off-entry-simplification-design.md
?? docs/test-cases/pbs/days-off/2026-07-08-days-off-prefer-off-entry-simplification.md
?? sql/migration/2026-07-08-pbs-days-off-hide-consecutive-days-off.sql
```

### unstaged changed files

```text
docs/test-cases/pbs/days-off/2026-07-07-days-off-visible-property-pruning.md
e2e/pages/pbs-portal/bid-workbench-page.ts
e2e/tests/pbs-portal/condition-default-favorites.spec.ts
pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
pbs-portal/src/features/days-off/days-off-draft-mappers.test.ts
pbs-portal/src/features/days-off/days-off-draft-mappers.ts
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/help/topics/days-off/days-off-add.tsx
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-08-pbs-days-off-property-visibility-and-prefer-off-split.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
