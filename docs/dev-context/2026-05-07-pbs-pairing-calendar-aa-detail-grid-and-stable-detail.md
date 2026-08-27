# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 15:55:09 CST
- Wing：`pbs`
- Topic：`pairing-calendar-aa-detail-grid-and-stable-detail`
- Title：pairing-calendar-aa-detail-grid-and-stable-detail
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS Pairing 日历蓝条详情闭环，完成用户确认后的修正：
- Pairing detail 弹窗顶部摘要不再使用真实 table，改为 CSS grid 伪表格。
- 摘要表头使用短标题：PAIRING / ID / TX / ORIG / START / END / MODE。
- 摘要区不再有横向滚动条，多个 pairing/date range 继续拆成多行展示，日期保持 yyyyMMdd。
- Pairing Details 区不再复用完整 Search Pairings 大卡片，而是在弹窗里用紧凑 AA legs grid 展示 BASE / REPORT / TBLK / TCRD / TPAY，以及 DAY / DH / FLTN / DPS / ARS / DEP / ARR / BLKT / GRNT / EQP。
- 修复蓝条详情反查为空的核心原因：后端 propertyCode=102 的 tag-list-date 查询不再只按 pairing.sch_str_dt_utc 匹配，而是按 occurrence 口径使用 pairing_segment 的 min(coalesce(brief_start_utc, sch_str_dt_utc))，与 Bidding Calendar metadata 的 originDate 对齐。
- Search Pairings 页面原有 PairingDetailCard 保持不变。
- 仍不新增依赖、不改数据库结构、不误用 propertyCode=128。

验证结果：
- pbs-portal targeted tests：pairing-calendar-bid-detail-dialog.test.tsx + shared-bidding-workbench-layout.test.tsx 通过。
- pbs-server 全量单测通过。
- pbs-portal npm run lint 通过。
- pbs-server npm run build 通过。
- pbs-portal npm run build 通过。
- 根目录 npm run verify:pbs 通过，包含 pbs-server test/build/sync dry-run 与 pbs-portal test/lint/build。
- git diff --check 通过。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
?? docs/dev-context/2026-05-07-pbs-pairing-calendar-aa-detail-display.md
?? docs/superpowers/specs/2026-05-07-pbs-pairing-calendar-detail-aa-display-design.md
?? pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
?? pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-pairing-calendar-aa-detail-grid-and-stable-detail.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
