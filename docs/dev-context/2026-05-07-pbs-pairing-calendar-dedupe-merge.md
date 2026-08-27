# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 14:26:11 CST
- Wing：`pbs`
- Topic：`pairing-calendar-dedupe-merge`
- Title：pairing-calendar-dedupe-merge
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing 日历重复添加去重与蓝条合并：
- 用户确认 specific-date Pairing Number 添加最小身份为 originDate + normalizedPairingNumber + tier。
- 重复添加同一 pairing/date/tier 不应新增记录或 bump draftVersion；多选 Tx 时已存在 tier 跳过，缺失 tier 继续补齐。
- Pairing calendar 添加多个 pairing number 时，前端改为按 pairing number 顺序提交，并用返回 draftVersion 更新下一次请求，避免 values × tiers 在单请求里产生交叉组合。
- 后端 addCurrentDraftProperty 对 exact duplicate merge 返回现有 propertyGroupKey/rowSeq 和当前 draft identity，不写入。
- 后端 bidding calendar 将同 tier 重叠 pairing events 合并为一条蓝条，按日期并集显示，metadata 保留 propertyGroupKeys、pairingNumbers、pairingIds、date ranges。
- 前端 bidding-calendar mapper 也做同格蓝条合并兜底；合并自多个 property 的详情弹窗禁用单条编辑，避免错误修改其中一个 property。
- 新增 spec: docs/superpowers/specs/2026-05-07-pbs-pairing-calendar-dedupe-and-merge-design.md。
- 验证通过：目标后端/前端测试、pbs-server build、pbs-portal lint/build、根目录 npm run verify:pbs。

## 当前工作树快照

### git status --short

```text
 M docs/superpowers/specs/2026-05-07-pbs-calendar-popover-outside-click-design.md
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
 M pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/services/calendar/bidding-calendar-service.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/pairing/pairing-bid-service.test.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/superpowers/specs/2026-05-07-pbs-pairing-calendar-dedupe-and-merge-design.md
```

### unstaged changed files

```text
docs/superpowers/specs/2026-05-07-pbs-calendar-popover-outside-click-design.md
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx
pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/services/calendar/bidding-calendar-service.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/pairing/pairing-bid-service.test.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-pairing-calendar-dedupe-merge.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
