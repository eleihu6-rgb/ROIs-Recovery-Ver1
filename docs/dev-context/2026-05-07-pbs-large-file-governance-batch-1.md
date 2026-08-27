# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 19:51:13 CST
- Wing：`pbs`
- Topic：`large-file-governance-batch-1`
- Title：large-file-governance-batch-1
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 大文件治理第一批：左侧 BIDDING CALENDAR + Pairing calendar 链路治理。

用户约束：
- 只处理 PBS 相关，不动非 PBS。
- 不为了减少行数硬拆；DOM/业务阅读路径清晰的大组件可以保留主体，只抽有价值的 helper、纯函数和无状态逻辑。
- 不改变业务语义、接口契约、数据库 schema 或 UI 行为。
- 每批治理必须有回归测试兜底。

已完成：
- 新增治理 spec：docs/superpowers/specs/2026-05-07-pbs-large-file-governance-design.md。
- pbs-server/src/services/calendar/bidding-calendar-service.ts 保留 service orchestration、DB 查询、planned absence cache 和 current calendar assembly。
- 后端拆出 pbs-server/src/services/calendar/bidding-calendar-date-utils.ts，包含 normalizePgDate、listIsoDatesInRange。
- 后端拆出 pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts，包含 specific pairing id 解析、pairing event 构造/合并、day off conflict helper。
- 通过 bidding-calendar-service.ts re-export 保持原有测试和其他 service import 兼容。
- pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx 保留主要 DOM 和交互流程，不硬拆 UI。
- 前端拆出 pbs-portal/src/features/dashboard/dashboard-calendar-state.ts，承载 days-off patch、blocked tier、day-off/pairing 日历纯计算。
- 前端拆出 pbs-portal/src/features/dashboard/pairing-calendar-detail.ts，承载 pairing calendar detail metadata parse、detail targets、rows、results loading。
- 前端拆出 pbs-portal/src/features/dashboard/bidding-calendar-pairing-events.ts，承载 calendar mapper 的 pairing event merge 逻辑。
- 新增对应轻量单测：dashboard-calendar-state.test.ts、pairing-calendar-detail.test.ts。

行数变化：
- dashboard-schedule-panel.tsx：约 1551 行降到 900 行，但主体 UI 保留。
- bidding-calendar-service.ts：约 876 行降到 361 行。
- bidding-calendar-mappers.ts：约 596 行降到 385 行。
- 新 helper 文件规模：dashboard-calendar-state.ts 369 行、pairing-calendar-detail.ts 326 行、前端 pairing event helper 213 行、后端 pairing event helper 503 行、date utils 34 行。

验证结果：
- git diff --check 通过。
- pbs-server npm test 通过。
- pbs-server npm run build 通过。
- pbs-portal npm test 通过，42 个测试文件、231 个测试通过。
- pbs-portal npm run lint 通过。
- pbs-portal npm run build 通过。
- 根目录 npm run verify:pbs 通过。
- pbs-server npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000 通过；GET /api/bidding-calendar/current max 约 905.98ms，所有 endpoint max < 2s。

注意事项：
- pbs-portal/tsconfig.tsbuildinfo 是 tracked 但根 .gitignore 已忽略的 TypeScript 增量缓存；npm run build / verify:pbs 会自动修改它。本轮不要把它当业务源码看待，提交前建议单独处理。
- 当前第一批是结构治理，不是功能改造；不要借机改变 Pairing / Days Off / Tier 行为。

下一批建议：
- 进入 Pairing bid 保存链路治理。
- 重点文件：pbs-server/src/services/pairing/pairing-bid-service.ts、pbs-portal/src/features/pairing/components/pairing-bid-control.tsx、pbs-portal/src/features/pairing/components/pairing-right-panel.tsx。
- 仍遵守“不为行数硬拆”，优先抽 catalog、normalization、rule validation、specific-date merge、day-off conflict、mutation response helper，以及前端 bid value parsing / input controls / panel state。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
?? docs/superpowers/specs/2026-05-07-pbs-large-file-governance-design.md
?? pbs-portal/src/features/dashboard/bidding-calendar-pairing-events.ts
?? pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
?? pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
?? pbs-portal/src/features/dashboard/pairing-calendar-detail.test.ts
?? pbs-portal/src/features/dashboard/pairing-calendar-detail.ts
?? pbs-server/src/services/calendar/bidding-calendar-date-utils.ts
?? pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts
```

### unstaged changed files

```text
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/services/calendar/bidding-calendar-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-large-file-governance-batch-1.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
