# 开发上下文（2026-06-11）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-11 14:18:52 CST
- Wing：`pbs`
- Topic：`pairing-calendar-no-default-tier-selection`
- Title：pairing-calendar-no-default-tier-selection
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Portal 左侧 BIDDING CALENDAR 在 Pairing 页面新增 Pairing bid 时不默认选择 tier 的行为修复。

需求结论：
- Days Off 已确认行为：没有已有记录的日期默认不选 tier，已有记录显示已有 tier。
- Pairing 新增日期入口之前仍使用 buildDefaultSelectedTiers(activeDraftTierLabel)，导致 T1 默认 T1-T7、T4 默认 T4-T7。
- 本轮按客户偏好改为：新增 Pairing 点击日期打开 popover 时，selectedTiers 默认 []，用户必须手动勾选 tier 后才能 ADD BID。
- 已有 Pairing bid 详情/编辑仍从 draft property active tiers 初始化，继续显示已有 tier，不受影响。

代码改动：
- pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx：移除新增 Pairing pending action 对 buildDefaultSelectedTiers(activeDraftTierLabel) 的使用，改为 selectedTiers: []，并清理 unused import。
- pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx：新增“active T3 时新增 Pairing 不默认勾选任何 tier”的测试；同步更新两条保存/失败测试，显式选择 T2 后再保存。
- docs/superpowers/specs/2026-06-11-pbs-pairing-calendar-no-default-tier-selection-design.md：需求设计文档。
- docs/test-cases/pbs/pairing-calendar/2026-06-11-pairing-calendar-no-default-tier-selection.md：人工 QA 用例。

验证：
- pbs-portal npm test -- src/app/layout/shared-bidding-workbench-layout.test.tsx：通过，33 tests。
- pbs-portal npm run lint：通过，只有既有 Fast Refresh warnings。
- pbs-portal npm run build：通过，只有既有 chunk size warning。
- pbs-portal npm test：与本次无关的 rule-bids 既有失败仍存在，失败点是 action: null 字段断言不匹配；本次 shared-bidding-workbench-layout.test.tsx 通过。
- git diff --check：通过。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
?? docs/superpowers/specs/2026-06-11-pbs-pairing-calendar-no-default-tier-selection-design.md
?? docs/test-cases/pbs/pairing-calendar/2026-06-11-pairing-calendar-no-default-tier-selection.md
```

### unstaged changed files

```text
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-11-pbs-pairing-calendar-no-default-tier-selection.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
