# 开发上下文（2026-06-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-10 15:51:22 CST
- Wing：`pbs`
- Topic：`pairing-search-duty-kpi-layout-fix`
- Title：pairing-search-duty-kpi-layout-fix
- Git branch：`main`

## 本轮对话上下文

本轮在已完成 PBS Pairing Search duty KPI clean contract 基础上，继续修复 /fpqe/pbs/pairing/search 结果卡片过挤问题：
- 用户反馈截图中左侧 leg 明细列挤在一起，但右侧/中间有大量可用空间。
- 根因：pbs-portal/src/features/pairing/components/pairing-search-panel.module.css 中 .resultMain 固定 width: 472px，新增 FDP/FH/DH/CRD 后 12 列仍挤在窄区域里。
- 已新增简短 spec：docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md。
- 实现：移除 .resultMain 固定宽度；.resultCard 保持左侧 minmax(0,1fr) + 右侧 324px mini calendar，并增加 column-gap: 28px。
- PairingDetailCard 中新增 styles.legsTable 包住 leg header/rows，只对 leg 明细提供 overflow-x:auto / overflow-y:hidden，避免 resultMain 出现内部竖向滚动条。
- leg grid 调整为 12 个稳定列宽：34px 48px 48px 48px 48px 64px 44px 44px 50px 50px 52px 38px，gap 12px，min-width 700px。
- 用 Playwright + Vite dev server mock 了 /api/auth/session、/api/bidding-calendar/current、/api/pairing-bids/current、/api/pairing-search/preview，在 1920 宽视口验证结果卡片：main/table 宽 722，mini calendar 宽 324，二者间 gap 28；截图视觉上列距清晰、无内部竖向滚动条。
验证：
- pbs-portal npm test -- search-pairings-page pairing-search-page-data shared-bidding-workbench-layout tier-right-panel pairing-calendar-bid-detail-dialog dashboard-page：7 files / 79 tests pass。
- pbs-portal npm run build 通过，仅保留既有 Vite chunk size warning。
- pbs-portal npm run lint 通过，仍有既有 line/reserve Fast Refresh warnings。
- git diff --check 通过。
- 本地 Vite dev server 已停止，Playwright 截图/快照验证产物已删除。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-search-pairings.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
?? docs/dev-context/2026-06-10-pbs-pairing-search-duty-kpi-clean-contract.md
?? docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md
?? docs/test-cases/pbs/pairing/2026-06-10-pairing-search-duty-kpi.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-10-pbs-pairing-search-duty-kpi-layout-fix.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
