# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 17:10:00 CST
- Wing：`pbs`
- Topic：`pairing-calendar-combined-edit-target`
- Title：pairing-calendar-combined-edit-target
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS Pairing 日历蓝条详情与编辑闭环，完成 combined 蓝条编辑目标选择收口。

关键产品结论：
- 普通 pairing 蓝条保持精简，不显示额外 EDIT 列。
- 只有一个蓝条由多个底层 pairing bid/propertyGroupKey 合并时，才在顶部摘要 MODE 右侧显示 EDIT 单选勾。
- combined 蓝条不支持批量一起编辑；用户必须先选择某一行，保存只 patch 该行对应的 propertyGroupKey。
- 未选择行时禁用 Tx 编辑和 SAVE BID，提示 Select one pairing bid to edit Tx.
- PBS UI/代码术语继续使用 Tier/Tx，不引入 AA 的 Layer/Lx。

实现要点：
- 后端 bidding calendar event metadata 增加 pairingBidEntries，用来保留每个摘要行到 propertyGroupKey 的对应关系。
- 前端 calendar mapper 合并并排序 pairingBidEntries，避免 UI 行顺序不稳定。
- dashboard schedule panel 解析 pairingBidEntries，让摘要行带 propertyGroupKey/rowKey。
- Pairing calendar bid detail dialog 对 combined 状态显示 EDIT radio；选择后加载该 property 当前 Tx，并只保存对应 propertyGroupKey。
- Pairing detail 继续复用/search 的展示口径，保持 AA 文档要求的 BASE/REPORT/legs/totals/mini calendar 数据展示方向。

验证结果：
- pbs-portal: npm test -- src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx src/features/dashboard/bidding-calendar-mappers.test.ts 通过。
- pbs-server: npm test 通过。
- pbs-portal: npm run lint 通过。
- pbs-portal: npm run build 通过。
- pbs-server: npm run build 通过。
- 根目录 npm run verify:pbs 通过。
- git diff --check 通过。

后续提醒：
- 如果继续细化 UI，可用浏览器实测 combined 蓝条弹窗：普通蓝条不应显示 EDIT，combined 蓝条必须先选行才能编辑 Tx。
- 不要改数据库结构，不要新增依赖，不要把 propertyCode=128 当 Pairing ID。

## 当前工作树快照

### git status --short

```text
 M docs/dev-context/LATEST.md
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/services/calendar/bidding-calendar-service.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts
?? docs/dev-context/2026-05-07-pbs-pairing-calendar-aa-detail-display.md
?? docs/dev-context/2026-05-07-pbs-pairing-calendar-aa-detail-grid-and-stable-detail.md
?? docs/superpowers/specs/2026-05-07-pbs-pairing-calendar-detail-aa-display-design.md
?? pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
?? pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/services/calendar/bidding-calendar-service.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
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
2. 本文件：`docs/dev-context/2026-05-07-pbs-pairing-calendar-combined-edit-target.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
