# 开发上下文（2026-05-29）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-29 10:34:07 CST
- Wing：`pbs`
- Topic：`line-most-flying-least-days`
- Title：line-most-flying-least-days
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Line 409 Most Flying In Least Days 条件实现：
- 该条件归属 Line，是 complex/configurable Line condition，不是 401-405 的 Enabled-only flag。
- 新增 bid value type: credit-density-preference，字段为 minimumTotalCredit、maximumWorkingDays、strength(normal/strong/must_try)。
- 新增 contract/catalog/seed/migration，property_code=409，property_name=Most Flying In Least Days。
- 后端 Line validation 校验 credit 40:00-120:00、working days 1-31、strength 白名单。
- 后端 rule-bid-value 支持序列化/反序列化/summary，参数映射为 paramA=minimumTotalCredit、paramB=maximumWorkingDays、paramC=strength。
- 前端 Line 将 409 加入 configurable 集合，点击 + 打开 LineBidDialog，支持三字段配置、SAVE FAVORITE、Favorited 中配置快照直接添加。
- PairingBidControl 增加 credit-density-preference 只读摘要展示，避免 Line favorited configured snapshot 显示空白。
- 测试覆盖 line validation、line route schema、rule-bid-value、LinePage add/favorite/favorited add。
- 已通过 pnpm --dir pbs-server build、pnpm --dir pbs-portal build、pnpm --dir pbs-portal exec vitest run src/features/line/pages/line-page.test.tsx、pnpm --dir pbs-server test -- line-validation.test.ts line-bids.test.ts rule-bid-value.test.ts。
- pbs-portal build 只有既有 Vite chunk size warning。
- 注意：工作树中还存在与 Line patch tier merge fix 相关的 pbs-server/src/services/line/line-bid-service.ts、line-draft-property-write.ts 和 spec 未跟踪文件，这不是本轮 409 实现的核心改动，后续不要随意回滚。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-days-off-bids.d.ts
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-line-bids.js
 M packages/contracts/pbs-pairing-bids.d.ts
 M pbs-portal/src/features/line/components/line-bid-dialog.tsx
 M pbs-portal/src/features/line/pages/line-page.test.tsx
 M pbs-portal/src/features/line/pages/line-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-server/src/routes/line-bids.test.ts
 M pbs-server/src/routes/lineholder-route-utils.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/line/line-draft-property-write.ts
 M pbs-server/src/services/line/line-validation.test.ts
 M pbs-server/src/services/line/line-validation.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M sql/seed/10-pbs-bid-property.sql
?? docs/superpowers/specs/2026-05-29-pbs-line-patch-tier-merge-fix-design.md
?? sql/migration/2026-05-29-pbs-line-most-flying-least-days.sql
```

### unstaged changed files

```text
packages/contracts/pbs-days-off-bids.d.ts
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-line-bids.js
packages/contracts/pbs-pairing-bids.d.ts
pbs-portal/src/features/line/components/line-bid-dialog.tsx
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-server/src/routes/line-bids.test.ts
pbs-server/src/routes/lineholder-route-utils.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/line/line-draft-property-write.ts
pbs-server/src/services/line/line-validation.test.ts
pbs-server/src/services/line/line-validation.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-29-pbs-line-most-flying-least-days.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
