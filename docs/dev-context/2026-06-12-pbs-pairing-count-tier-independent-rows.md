# 开发上下文（2026-06-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-12 15:09:46 CST
- Wing：`pbs`
- Topic：`pairing-count-tier-independent-rows`
- Title：pairing-count-tier-independent-rows
- Git branch：`main`

## 本轮对话上下文

本轮继续处理 `/fpqe/pbs/pairing` Existing Pairing Properties 的 COUNT 语义和 UI。

用户最终确认的关键结论：
- 表格每一行 `COUNT` 永远只显示“这一条 property/condition 单独能筛出多少 pairing”。
- 行级 `COUNT` 不再跟随左侧 Bidding Calendar 当前 Tx/tier 变化，不再按 property 是否启用当前 Tx 隐藏。
- 左侧 `tier-01`、`ui-149`、`ui-81` 等 Tx/tier 切换时，只需要刷新 Existing Pairing Properties 顶部 main summary：当前 Tx 的规则数量，以及这些 active rules 合并筛出的 pairing 数。
- 如果要做细化到每条规则在每个 Tx 下的 count，目前解释成本高，先不做。

已写 spec：
- `docs/superpowers/specs/2026-06-12-pbs-pairing-count-tier-independent-rows-design.md`
- 旧 skeleton spec `docs/superpowers/specs/2026-06-12-pbs-pairing-count-loading-skeleton-design.md` 顶部已加修正说明：切 Tx 时行级 skeleton 设计被新语义覆盖。

代码改动：
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
  - `countCurrentRules` 拆成 `rowProperties` 和 `activeTierProperties`。
  - `rowProperties` 使用 `normalizeCriteriaPreviewProperties(request.properties)`，为所有 existing properties 计算 `rule:<propertyKey>`。
  - `activeTierProperties` 使用 `normalizeCurrentRulePreviewProperties(tier, request.properties)`，只为当前 Tx active properties 计算 funnel。
  - response `rows[].rule` 覆盖所有行；`summary.activePropertyCount` 和 `summary.allRules` 只来自当前 Tx active funnel。
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
  - 行级 count map 直接使用最近 response 的 `rows[].rule`，不再要求 response tier 等于当前 Tx。
  - `refreshPairingPoolCounts` 进入 loading 时保留已有 response，所以切 Tx 顶部显示 Refreshing/Calculating，但行级 COUNT 不消失。
  - 行组件不再根据 property 是否 active in current Tx 决定是否展示 COUNT。
- `pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx`
  - count mock 改为 rows 永远返回所有 existing properties 的单条件 count。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - 原 row skeleton test 改为验证切 Tx loading 时行级 count 保持可见。
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
  - 增加/调整后端断言，覆盖“当前 Tx 没 active property 也返回 row rule count”和“row 与 summary 分离”。

验证结果：
- `npm test -- src/services/pairing-search/pairing-search-service.test.ts` in `pbs-server` 实际因 package script 跑了全量 pbs-server tests，390 passed。
- `npm test -- src/features/pairing/pages/pairing-page.test.tsx` in `pbs-portal`，50 passed。
- `npm run build` in `pbs-server` passed。
- `npm run build` in `pbs-portal` passed；Vite 仍有既有 chunk size warning。
- `npm run lint` in `pbs-portal` 0 errors，6 warnings，都是既有 fast-refresh warnings，非本次文件。
- 本地浏览器尝试打开 `http://127.0.0.1:3030/fpqe/pbs/pairing`，被登录页拦截；测试账号返回 401，因此未做真实页面视觉冒烟。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/features/pairing/components/pairing-property-table.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
?? docs/superpowers/specs/2026-06-12-pbs-pairing-count-loading-skeleton-design.md
?? docs/superpowers/specs/2026-06-12-pbs-pairing-count-tier-independent-rows-design.md
```

### unstaged changed files

```text
pbs-portal/src/features/pairing/components/pairing-property-table.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-12-pbs-pairing-count-tier-independent-rows.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
