# 开发上下文（2026-06-12）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-12 10:33:53 CST
- Wing：`pbs`
- Topic：`pairing-tx-counts-ui-revision`
- Title：pairing-tx-counts-ui-revision
- Git branch：`main`

## 本轮对话上下文

本轮继续处理 `/fpqe/pbs/pairing` Pairing property pool counts 的 UI/交互修订。

用户反馈上一版不是想要的：顶部 `All rules` 应该改为根据左侧 `BIDDING CALENDAR` 当前选中的 Tx 展示对应 Tx 的条件数量和筛选数量，并且 UI 要更显眼；每条 property 只需要显示自己这条条件能筛出多少，位置放在 `TIERS` 后面，而不是 property 下方；用户进一步澄清“切换 Tx 自动计算一次”指左侧 BIDDING CALENDAR 的 Tx 行按钮，例如 `ui-149`、`ui-81`，不是右侧 property 行内的 `T1/T2/...` tier toggle。

已按 AGENTS/brainstorming gate 写入修订 spec：`docs/superpowers/specs/2026-06-12-pbs-pairing-tx-counts-ui-revision-design.md`，并经用户“改吧”批准实现。

本轮实现：
- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
  - `currentPoolCountsTier` 改为只根据左侧 calendar shared store 的 `activeTierLabel` 推导，支持 `T4` 和 `TIER-04` 格式，默认兜底为 `T1`，不再用 existing properties 的第一个 active tier 兜底。
  - 顶部统计从灰色小字 `All rules` 改成显眼摘要条，分为 Tx、rules 数量、pairings/results 三段。
  - 顶部 rules 数量来自后端 response `summary.activePropertyCount`，结果来自 `summary.allRules`。
  - 行内 count map 只取 `row.rule`，不再展示 `row.funnel`。
  - 左侧 Tx 变化仍自动 refresh 一次；右侧 property tier toggle / add / edit / delete 保存后只标记 stale。
  - stale 时递增 request sequence，避免编辑期间旧 refresh 响应覆盖 stale 状态。
- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
  - Existing 表增加 `COUNT` 视觉列，仅 existing properties 使用；available/favorited 表不受影响。
  - 每条 active property 的 count badge 放在 `TIERS` 后面。
  - `PairingPropertyPoolCountDisplay` 简化为 `{ pairingIdCount, totalItems }`，不再包含 funnel。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - 更新 on-demand refresh 断言：顶部 Tx/rules/result 三段、行内只显示 rule count、页面不显示 `Funnel:`。
  - 自动刷新测试改为点击左侧 `TIER-04` button，确认调用 `countCurrentRules("T4", ...)`。
  - 新增测试：右侧 existing property 行内 tier toggle 保存后只 stale，不自动 count refresh。
  - 更新 existing row layout style 断言为四列 count grid。
- `pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx`
  - mock counts response 的 `activePropertyCount`：T1=1，T4=5。
- `docs/test-cases/pbs/pairing/2026-06-11-pairing-property-pool-counts.md`
  - QA 用例从 `All rules / Rule / Funnel` 旧口径更新为 Tx 摘要 + COUNT 列 + 左侧 Tx 自动刷新 + 右侧 tier toggle stale。

验证：
- `npm test -- src/features/pairing/pages/pairing-page.test.tsx src/shared/services/pairing-service.test.ts` 在 `pbs-portal` 通过：55 tests passed。
- `npm run lint` 在 `pbs-portal` 通过，仍有既有 Fast Refresh warnings：
  - `src/features/line/components/line-reserve-flying-pattern-control.tsx`
  - `src/features/reserve/components/reserve-date-scope-control.tsx`
- `npm run build` 在 `pbs-portal` 通过，仍有既有 Vite chunk size warning。
- `git diff --check` 通过。
- 试图用内置浏览器打开 `http://127.0.0.1:5175/fpqe/pbs/pairing`，被重定向到 `/fpqe/pbs/login?redirect=%2Fpairing`，本地没有可用登录态，因此无法完成真实页面视觉 smoke；没有输入账号。

注意：工作树仍包含上一轮后端 count API 和文档等未提交改动，本轮未回退任何既有改动。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-search-pairings.d.ts
 M packages/contracts/pbs-search-pairings.js
 M pbs-portal/src/features/pairing/components/pairing-property-table.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/shared/services/pairing-service.test.ts
 M pbs-portal/src/shared/services/pairing-service.ts
 M pbs-server/src/app.ts
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/routes/pairing-search.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
 M pbs-server/src/services/pairing-search/types.ts
?? docs/dev-context/2026-06-11-pbs-pairing-calendar-and-search-business-context.md
?? docs/dev-context/2026-06-11-pbs-pairing-property-pool-counts.md
?? docs/superpowers/specs/2026-06-11-pbs-pairing-property-pool-counts-design.md
?? docs/superpowers/specs/2026-06-12-pbs-pairing-tx-counts-ui-revision-design.md
?? docs/test-cases/pbs/pairing/2026-06-11-pairing-property-pool-counts.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-search-pairings.d.ts
packages/contracts/pbs-search-pairings.js
pbs-portal/src/features/pairing/components/pairing-property-table.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/shared/services/pairing-service.test.ts
pbs-portal/src/shared/services/pairing-service.ts
pbs-server/src/app.ts
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/routes/pairing-search.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
pbs-server/src/services/pairing-search/pairing-search-service.ts
pbs-server/src/services/pairing-search/types.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-12-pbs-pairing-tx-counts-ui-revision.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
