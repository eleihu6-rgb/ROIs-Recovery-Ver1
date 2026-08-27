# 开发上下文（2026-05-08）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-08 09:23:37 CST
- Wing：`pbs`
- Topic：`large-file-governance-batch-3`
- Title：large-file-governance-batch-3
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS 大文件治理第三批：Days Off bid 保存链路治理。

用户约束延续：
- 只处理 PBS 相关，不动非 PBS。
- 不为了行数硬拆；职责清晰的 UI/业务编排保留主体。
- 不改变业务语义、接口契约、数据库 schema、UI 行为或错误文案。
- 保持 PBS 术语 Tier/Tx，不引入 Layer/Lx。
- 每批治理后必须跑回归测试和性能基线。

本批已完成：
- 后端 pbs-server/src/services/days-off/days-off-bid-service.ts 从约 1786 行降到 691 行。
- 新增 pbs-server/src/services/days-off/days-off-draft-queries.ts，抽出 Days Off draft property / favorite property 读取，以及 stable add 时的轻量 validation snapshot 查询。
- 新增 pbs-server/src/services/days-off/days-off-property-write.ts，抽出 Days Off 单个 property add/patch/delete 的 SQL 写入、Tier 创建/同步和 property group key 删除 helper。
- 新增 pbs-server/src/services/days-off/days-off-draft-write.ts，抽出 stable current draft 整份保存 SQL，避免把完整 draft 保存逻辑继续堆在 service 主文件里。
- days-off-bid-service.ts 现在保留 service orchestration、catalog/current period cache、请求 normalization 调用、validation 编排、favorite mutation 编排和 API 语义。
- pbs-server/src/services/calendar/calendar-days-off-service.ts 从 515 行降到 401 行。
- 新增 pbs-server/src/services/calendar/calendar-days-off-draft-state.ts，抽出 calendar days-off empty draft、日期集合构造、patch change split、patch response 构造等纯状态/helper。
- Days Off 前端页面只有约 145 行，结构清楚，本批没有硬拆前端页面。
- 没有新增依赖，没有改 SQL schema/migration，没有改 API contract。

当前行数：
- pbs-server/src/services/days-off/days-off-bid-service.ts：691 行。
- pbs-server/src/services/days-off/days-off-property-write.ts：605 行，职责为 Days Off 单 property 写入 SQL。
- pbs-server/src/services/days-off/days-off-draft-write.ts：276 行。
- pbs-server/src/services/days-off/days-off-draft-queries.ts：183 行。
- pbs-server/src/services/calendar/calendar-days-off-service.ts：401 行。
- pbs-server/src/services/calendar/calendar-days-off-draft-state.ts：143 行。

验证结果：
- pbs-server npm run build 通过。
- pbs-server Days Off / Calendar Days Off 定向测试通过；实际 npm script 会跑完整 pbs-server tests，164 tests pass。
- pbs-portal src/features/days-off/pages/days-off-page.test.tsx 通过，8 tests pass。
- pbs-portal npm run lint 通过。
- pbs-portal npm run build 通过。
- 根目录 npm run verify:pbs 通过：pbs-server 164 tests pass；pbs-portal 43 files / 234 tests pass；pbs-server build、sync:pbs-users --dry-run、pbs-portal lint/build 全部通过。
- pbs-server npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000 通过；Days Off current max 704.68ms，Calendar Days Off current max 687.54ms，Bidding Calendar current max 887.86ms，Pairing current max 1199.97ms，全部 endpoint max < 2s。
- git diff --check 通过。
- 检查 Days Off / Calendar Days Off 本批范围内没有 Layer/Lx 术语回流，也没有 console.log/console.debug。

注意事项：
- 当前工作树仍包含第一批和第二批未提交改动，不能回滚。
- .gitignore 仍有一个 staged 变动：删除根 lib/ ignore；这不是第三批产生的。
- pbs-portal/tsconfig.tsbuildinfo 会被 build 修改，它是 tracked build cache，不属于业务源码。
- pbs-portal/src/shared/lib/schedule-panel-layout.ts 仍是 untracked，但 HEAD 中 shared-bidding-workbench-layout.tsx 已引用它；整理提交时需要一起确认。

下一批建议：
- 进入第四批：剩余 500-900 行 PBS 文件和测试拆分。
- 重点候选：pbs-server/src/services/lineholder/shared.ts、pbs-portal/src/features/pairing/pages/search-pairings-page.tsx、pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx、pbs-portal/src/features/pairing/components/pairing-search-panel.tsx、pbs-portal/src/features/pairing/mock.ts、大测试文件。
- 继续遵守“不为了行数硬拆”：UI 主体/清晰测试流程可以记录为可接受保留，只抽纯逻辑、factory、局部子组件或重复 helper。

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
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/dev-context/2026-05-07-pbs-large-file-governance-batch-1.md
?? docs/dev-context/2026-05-07-pbs-large-file-governance-batch-2.md
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
?? pbs-server/src/services/calendar/calendar-days-off-draft-state.ts
?? pbs-server/src/services/days-off/days-off-draft-queries.ts
?? pbs-server/src/services/days-off/days-off-draft-write.ts
?? pbs-server/src/services/days-off/days-off-property-write.ts
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
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
.gitignore
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-08-pbs-large-file-governance-batch-3.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
