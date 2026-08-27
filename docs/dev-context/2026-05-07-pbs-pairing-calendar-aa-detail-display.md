# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 15:24:08 CST
- Wing：`pbs`
- Topic：`pairing-calendar-aa-detail-display`
- Title：pairing-calendar-aa-detail-display
- Git branch：`main`

## 本轮对话上下文

本轮继续完成 PBS Pairing 日历蓝条 AA 风格详情展示闭环，并追加顶部摘要区 UI 修正：
- 顶部 Pairing Bid 摘要区不再使用左右 label/value 列表，改为横向表格。
- 表头为 Pairing Number / Internal ID / Tier / Origin Date / Start Date / End Date / Mode。
- 日期在摘要表格中显示为 yyyyMMdd，例如 20260408。
- pairingDateRanges 会解析成多行；同一个 pairing 有多个日期范围时，每个 pairing + start/end date 单独一行，避免全部挤在一个格子里。
- 下方 Pairing Details 仍复用 Search Pairings 的 PairingDetailCard，展示 BASE / REPORT / legs / TBLK / TCRD / TPAY / mini calendar。
- 新增组件测试 pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx，覆盖横向表格、多行、紧凑日期。
- 相关 spec 已更新：docs/superpowers/specs/2026-05-07-pbs-pairing-calendar-detail-aa-display-design.md。
- 验证已通过：npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx；pbs-portal npm run lint；pbs-portal npm run build；git diff --check。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
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
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-pairing-calendar-aa-detail-display.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
