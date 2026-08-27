# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 20:17:00 CST
- Wing：`pbs`
- Topic：`large-file-governance-batch-2`
- Title：large-file-governance-batch-2
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 大文件治理第二批：Pairing bid 保存链路治理。

用户约束延续：
- 只处理 PBS 相关，不动非 PBS。
- 不为了行数硬拆；UI 主体和 mutation 编排保持原有阅读路径。
- 不改变业务语义、接口契约、数据库 schema 或 UI 行为。
- 每批治理必须跑回归测试。

本批已完成：
- 后端 pbs-server/src/services/pairing/pairing-bid-service.ts 从约 1833 行降到约 805 行。
- 新增 pbs-server/src/services/pairing/pairing-bid-errors.ts，抽出 PairingBidServiceError，供 service/helper 复用。
- 新增 pbs-server/src/services/pairing/pairing-bid-normalization.ts，抽出 Current draft/add/patch/favorite request normalization、property group key 规范化、action/quantifier 映射、pairing draft bid 反序列化、empty draft 构造。
- 新增 pbs-server/src/services/pairing/pairing-specific-date.ts，抽出 Pairing Number specific-date merge、重复/合并判断、specific-date pairing vs day-off conflict 检测和校验。
- 新增 pbs-server/src/services/pairing/pairing-property-write.ts，抽出 pairing property DB 写入、delete、tier sync、group row values 和 stable bid id parsing。
- pairing-bid-service.ts 保留 service orchestration、cache、事务编排、favorite 保存和 API 语义，不再承载大量 helper/SQL 细节。
- 通过 pairing-bid-service.ts re-export 保持原测试 import 兼容：buildMergedPairingNumberSpecificDateProperty、findSpecificDatePairingDayOffConflicts。
- 前端 pbs-portal/src/features/pairing/components/pairing-bid-control.tsx 从约 945 行降到约 753 行。
- 新增 pbs-portal/src/features/pairing/pairing-bid-control-logic.ts 和 test，抽出 bid/operator 转换、tag/number input parse、clamp 纯逻辑。
- 前端 pbs-portal/src/features/pairing/components/pairing-right-panel.tsx 从约 909 行降到约 853 行。
- 新增 pbs-portal/src/features/pairing/components/pairing-rule-expression-view.tsx，抽出 rule expression 只读展示组件；右侧面板仍保留主要状态和 mutation 编排。
- 新增 pbs-portal/src/features/pairing/pairing-query-invalidations.ts，复用 Pairing calendar/tier query invalidation，替换右侧面板和 search pairings 页重复实现。

验证结果：
- git diff --check 通过。
- pbs-server npm run build 通过。
- pbs-server pairing 相关 targeted tests 通过。
- pbs-portal PairingBidControl / PairingBidControl logic / PairingPage / SearchPairingsPage targeted tests 通过。
- pbs-portal npm run lint 通过。
- pbs-portal npm run build 通过。
- 根目录 npm run verify:pbs 通过：pbs-server 164 tests pass；pbs-portal 43 test files / 234 tests pass；pbs-server build、sync:pbs-users --dry-run、pbs-portal lint/build 全部通过。
- pbs-server npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000 通过；GET /api/pairing-bids/current max 约 1281.39ms，GET /api/bidding-calendar/current max 约 1047.45ms，全部 endpoint max < 2s。

注意事项：
- pbs-portal/tsconfig.tsbuildinfo 仍会被 build 修改，它是 tracked build cache，不属于业务源码。
- 当前工作树里 .gitignore 有一个 staged 变动：删除根 lib/ ignore；这不是本批 Pairing 保存链路重构产生的，未回滚。
- 当前工作树里 pbs-portal/src/shared/lib/schedule-panel-layout.ts 是 untracked，但 HEAD 中 shared-bidding-workbench-layout.tsx 已引用它；这看起来与 .gitignore staged 变动相关，不属于本批 Pairing 重构，需要提交/整理时一起确认。

下一批建议：
- 进入第三批 Days Off bid 保存链路治理。
- 重点文件：pbs-server/src/services/days-off/days-off-bid-service.ts、pbs-server/src/services/calendar/calendar-days-off-service.ts 及 Days Off 前端页面/测试。
- 继续优先抽 catalog、draft normalization、stable save、date patch、conflict validation、write helper，不硬拆清晰 UI 主体。

## 当前工作树快照

### git status --short

```text
M  .gitignore
 M docs/dev-context/LATEST.md
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/dev-context/2026-05-07-pbs-large-file-governance-batch-1.md
?? docs/superpowers/specs/2026-05-07-pbs-large-file-governance-design.md
?? pbs-portal/src/features/dashboard/bidding-calendar-pairing-events.ts
?? pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
?? pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
?? pbs-portal/src/features/dashboard/pairing-calendar-detail.test.ts
?? pbs-portal/src/features/dashboard/pairing-calendar-detail.ts
?? pbs-portal/src/features/pairing/components/pairing-rule-expression-view.tsx
?? pbs-portal/src/features/pairing/pairing-bid-control-logic.test.ts
?? pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
?? pbs-portal/src/features/pairing/pairing-query-invalidations.ts
?? pbs-portal/src/shared/lib/schedule-panel-layout.ts
?? pbs-server/src/services/calendar/bidding-calendar-date-utils.ts
?? pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts
?? pbs-server/src/services/pairing/pairing-bid-errors.ts
?? pbs-server/src/services/pairing/pairing-bid-normalization.ts
?? pbs-server/src/services/pairing/pairing-property-write.ts
?? pbs-server/src/services/pairing/pairing-specific-date.ts
```

### unstaged changed files

```text
docs/dev-context/LATEST.md
pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
.gitignore
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-large-file-governance-batch-2.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
