# 开发上下文（2026-06-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-10 17:05:01 CST
- Wing：`pbs`
- Topic：`pairing-mini-calendar-active-dates-fix`
- Title：PBS Pairing mini calendar activeDates 修复
- Git branch：`main`

## 本轮对话上下文

本轮继续修复 PBS Pairing Search 结果卡片右侧 mini calendar。

用户反馈：修完跨月误亮后，右侧日历变成一个都不亮。截图中的 pairing 是 `YYZ/CUN/YYZ/YWG/YYZ/YXX/YYZ`，页面 period 为 `Apr 2026`。

最终根因：
- Contract 和前端已改为 `activeDates: string[]`，按完整 ISO 日期匹配，这是正确方向。
- 但后端 preview 在真实 API 中返回了样例/模板数据原始年月，例如 `2025-12-27` 到 `2025-12-30`。
- 前端 mini calendar 按 `Apr 2026` 生成格子，所以 `2025-12-*` 不可能点亮任何 Apr 2026 cell。
- 这不是前端需要兼容旧 number，而是后端应在有 `periodCode` 时输出当前 bid period 年月下的 ISO active dates。

修复：
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
  - `executePreviewQuery` 新增 `periodCode?: string | null`。
  - `buildActiveDates` 在有 `periodCode` 时，保留 `active_start_date` 的日号，映射到该 bid period 的年月，再按 `duration_days` 展开。
  - 若日号超过 period 当月最大天数，不强行 roll/clamp，保留原日期，避免错误点亮不存在的日期。
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
  - 三种 preview 模式都把 normalized `conditionContext.periodCode` 传给 `executePreviewQuery`。
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
  - 新增回归测试：原始 `active_start_date=2025-12-27` + `periodCode=Apr 2026` 输出 `2026-04-27` 到 `2026-04-30`。
- `docs/superpowers/specs/2026-06-10-pbs-pairing-mini-calendar-active-dates-design.md`
  - 补充 period 映射口径，避免后续误按原始 DB 年月返回。

验证：
- 真实本地 API `/api/pairing-search/preview`，payload 为 `periodCode: Apr 2026`、Layover at City `YYZ`，返回：
  - pairingNumber: `YYZ/CUN/YYZ/YWG/YYZ/YXX/YYZ`
  - activeDates: `["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"]`
- `npm run test -- src/services/pairing-search/pairing-search-service.test.ts` in `pbs-server`：实际脚本跑全量 `src/**/*.test.ts`，385 tests passed。
- `npm run test -- src/features/pairing/pages/search-pairings-page.test.tsx` in `pbs-portal`：13 tests passed。
- `npm run build` in `pbs-server`：通过。
- `git diff --check`：通过。
- `rg "activeDates:\\s*\\[[0-9]|activeDates:\\s*number\\[\\]|deadhead:|credit:" ...`：无旧字段/旧类型命中。

注意：不要回退成前端兼容 number[]。用户明确要求清理干净。正确 contract 是后端返回当前 period 的 ISO date strings，前端只按 ISO date 精准匹配。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M packages/contracts/pbs-search-pairings.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/dashboard/pairing-calendar-detail.test.ts
 M pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
 M pbs-portal/src/features/pairing/search-pairings-page-logic.test.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.ts
?? docs/dev-context/2026-06-10-pbs-pairing-mini-calendar-active-dates-fix.md
?? docs/superpowers/specs/2026-06-10-pbs-pairing-mini-calendar-active-dates-design.md
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/dashboard/pairing-calendar-detail.test.ts
pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/search-pairings-page-logic.test.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
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
2. 本文件：`docs/dev-context/2026-06-10-pbs-pairing-mini-calendar-active-dates-fix.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
