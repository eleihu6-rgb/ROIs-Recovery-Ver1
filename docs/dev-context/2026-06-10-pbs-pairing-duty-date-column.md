# 开发上下文（2026-06-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-10 17:35:51 CST
- Wing：`pbs`
- Topic：`pairing-duty-date-column`
- Title：pairing-duty-date-column
- Git branch：`main`

## 本轮对话上下文

本轮围绕 PBS Portal `/fpqe/pbs/pairing/search` 任务环搜索结果卡片继续处理 duty 级展示。

已确认并实施的需求：
- 搜索结果卡片 leg 表第一列从 `DAY` 改为 `DUTY`，因为该值实际是 `duty_seq`，不是日历日。
- 新增 `DATE` 列，展示该 duty 的开始日期，格式为 `MMDD`，例如 `0403`。
- 同一 duty 的多段 leg 只在第一段显示 `DATE / FDP / F/H / D/H / CRD`，后续段留空，保持 duty 分组视觉一致。
- `activeDates` 保持 ISO date string contract，不恢复旧的 number[] 或兼容层；mini calendar 继续按 pairing active dates 点亮。
- duty 日期与 active dates 一样按当前 `periodCode` 映射：如果 pairing 原始 active start 在 2025-12-27、请求 period 是 Apr 2026，原始 duty start 2025-12-31 会映射显示为 `0501`。
- 用户明确偏好 clean contract：不要保留看起来兼容但可能错误的旧字段。

主要改动：
- `packages/contracts/pbs-search-pairings.d.ts`：`PbsSearchPairingsLeg` 新增 `dutyDate: string`。
- `pbs-portal/src/features/pairing/types.ts`：`PairingSearchLeg` 新增 `dutyDate: string`。
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`：segment 查询新增 `coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc) as duty_start_utc`；mapper 新增 `formatDateAsMmdd`、period relative date 映射，并在 duty 首行输出 `dutyDate`。
- `pbs-portal/src/features/pairing/components/pairing-detail-card.tsx`：表头改为 `DUTY / DATE / FDP / F/H / D/H / CRD ...`，行内显示 `leg.dutyDate`。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`：leg grid 扩为 13 列，`min-width` 调整到 760px，继续横向滚动保护列不重叠。
- 更新相关 fixture/mock/test，补齐 `dutyDate`。
- 文档 `docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md` 已同步补充 `DUTY`/`DATE` 需求，并修正“不改 contract”的旧表述。

验证结果：
- `pbs-server`: `npm run test -- src/services/pairing-search/pairing-search-service.test.ts` 运行时实际执行了 pbs-server node test 全套，385 tests 全部通过。
- `pbs-portal`: `npm run test -- src/features/pairing/pages/search-pairings-page.test.tsx` 通过，13 tests。
- `pbs-portal`: `npm run test -- src/app/layout/shared-bidding-workbench-layout.test.tsx` 通过，32 tests。
- `pbs-server`: `npm run build` 通过。
- `pbs-portal`: `npm run build` 通过，仅有既有 Vite chunk size warning。
- `git diff --check` 通过。
- 尝试用 Browser 打开本地 Vite `http://127.0.0.1:5175/fpqe/pbs/pairing/search` 时被 Browser URL policy 拒绝，未继续绕过；临时 dev server 已停止。
- 尝试按文档/`.env` 连接真实库查询 live schema 字段时账号认证失败；不过 `duty_sch_str_dt_utc`、`brief_start_utc`、`sch_str_dt_utc` 已在 repo schema SQL 和既有 pairing search 条件代码中存在/使用。

注意：
- dashboard calendar 的紧凑 pairing detail dialog 仍显示 `DAY`，本轮未扩散修改，因为用户需求落点是 `/fpqe/pbs/pairing/search` 结果卡片。

## 当前工作树快照

### git status --short

```text
 M docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md
 M packages/contracts/pbs-search-pairings.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
```

### unstaged changed files

```text
docs/superpowers/specs/2026-06-10-pbs-pairing-search-result-card-layout-design.md
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/types.ts
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
2. 本文件：`docs/dev-context/2026-06-10-pbs-pairing-duty-date-column.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
