# 开发上下文（2026-05-08）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-08 09:49:38 CST
- Wing：`pbs`
- Topic：`large-file-governance-batch-4`
- Title：large-file-governance-batch-4
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS 大文件治理第四批：剩余 500-900 行文件与大测试文件治理。

用户约束延续：
- 只处理 PBS 相关，不动非 PBS 模块。
- 不为了行数硬拆；UI 主体、状态编排、清晰测试流程可以保留并记录理由。
- 不改变业务语义、API contract、数据库 schema、UI 行为或错误文案。
- 保持 PBS 术语 Tier/Tx，不引入 Layer/Lx。
- 每批治理后必须跑回归测试和性能基线。

本批新增/调整：
- pbs-server/src/services/lineholder/shared.ts 从 807 行拆成 barrel re-export。
- 新增 pbs-server/src/services/lineholder/shared-types.ts、tier-keys.ts、current-bid.ts、property-catalog.ts、tier-sync.ts。
- lineholder 拆分保持外部 import 路径不变，shared.ts 继续作为兼容入口。
- pbs-portal/src/features/pairing/pages/search-pairings-page.tsx 抽出纯逻辑到 pbs-portal/src/features/pairing/search-pairings-page-logic.ts。
- 新增 pbs-portal/src/features/pairing/search-pairings-page-logic.test.ts，覆盖 preview query enabled、local refresh pageData、Pairing Number occurrence candidates、重复 Pairing Number 折叠等纯逻辑。
- pbs-portal/src/features/pairing/components/pairing-search-panel.tsx 把已独立的 PairingSearchCriteriaRow 搬到 pbs-portal/src/features/pairing/components/pairing-search-criteria-row.tsx。
- pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx 只抽出响应式表格布局计算到 pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.ts，并新增对应 test。
- pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx 将重复 previewProperty fixture 收成 buildSearchPreviewProperty/buildTierOptions，保留原测试流程和断言。

当前行数变化：
- pbs-server/src/services/lineholder/shared.ts：807 -> 5。
- pbs-server/src/services/lineholder/current-bid.ts：482。
- pbs-server/src/services/lineholder/property-catalog.ts：96。
- pbs-server/src/services/lineholder/tier-sync.ts：161。
- pbs-server/src/services/lineholder/shared-types.ts：72。
- pbs-server/src/services/lineholder/tier-keys.ts：27。
- pbs-portal/src/features/pairing/components/pairing-search-panel.tsx：约 687 -> 478。
- pbs-portal/src/features/pairing/pages/search-pairings-page.tsx：780 -> 718；页面仍保留状态、React Query、mutation/cache/toast 编排，不硬拆。
- pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx：1084 -> 857。
- pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx：712 -> 687；共享 Days Off/Line 面板的 mutation 主流程保留集中，避免跨文件追踪保存状态。

本批明确保留/后续观察：
- pbs-portal/src/features/pairing/pages/search-pairings-page.tsx 仍 700+ 行，但职责是页面状态、query、mutation 和 cache 编排；已抽纯逻辑，继续硬拆会降低可读性。
- pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx 仍 600+ 行，但它是 Days Off/Line 共用面板，主风险在保存/回滚/乐观更新状态，当前保留集中更利于回归。
- pbs-portal/src/features/pairing/mock.ts 仍 668 行，确认不是僵尸文件，被 page data、mapper 和测试引用；它是集中 seed/factory，后续如要继续可按 page/search data 拆，不删除。
- pbs-portal/src/features/pairing/components/pairing-search-panel.module.css 仍 970 行，主要是同一页面的样式表；本轮未拆 CSS，避免样式分散。
- pbs-portal/src/features/pairing/pages/pairing-page.test.tsx 和 pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx 仍较大，但主要是清晰用户流程回归；本轮只压缩 search-pairings-page.test.tsx 中明显重复的 fixture。

验证结果：
- pbs-portal 定向测试通过：search-pairings-page-logic.test.ts、search-pairings-page.test.tsx、pairing-page.test.tsx。
- pbs-portal 定向测试通过：rule-bid-right-panel-layout.test.ts、rule-bids/utils.test.ts、days-off-page.test.tsx、line-page.test.tsx。
- npm run verify:pbs 通过：pbs-server 164 tests pass；pbs-portal 45 files / 242 tests pass；pbs-server build、sync:pbs-users --dry-run、pbs-portal lint/build 全部通过。
- pbs-server npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000 通过；所有 endpoint max < 2s。关键值：pairing current max 1311.11ms，days-off current max 1078.8ms，calendar days-off max 669.18ms，bidding calendar max 830.75ms，lineholder summary max 727.13ms。
- git diff --check 通过。
- 本批范围内无 console.log/console.debug 新增。
- Layer/Lx 检查仅命中既有 lineholder 测试中用于校验拒绝的 invalid label L3，以及 pairingNumber ATL611，不属于新增 PBS 术语回流。

工作树注意：
- 当前工作树仍包含第一批、第二批、第三批和第四批未提交改动，不要回滚。
- .gitignore 仍有 staged 变动，不是本批新增，不要误改。
- pbs-portal/tsconfig.tsbuildinfo 会被 build 修改，是 tracked build cache。
- pbs-portal/src/shared/lib/schedule-panel-layout.ts 仍是 untracked，但已被现有代码引用；整理提交时需要确认一起纳入。

下一步建议：
- 第四批已经完成一次完整结构治理与回归验证，可以进入整理提交/提交前复核。
- 如果还要继续压大文件，优先做低风险整理：pairing/mock.ts 按 page/search data 拆分，或把共享 workbench 测试中的重复 render/mock setup 收成 fixture；不要拆散用户流程测试。

## 当前工作树快照

### git status --short

```text
M  .gitignore
 M docs/dev-context/LATEST.md
 M pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/components/pairing-right-panel.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
 M pbs-portal/tsconfig.tsbuildinfo
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/lineholder/shared.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
?? docs/dev-context/2026-05-07-pbs-large-file-governance-batch-1.md
?? docs/dev-context/2026-05-07-pbs-large-file-governance-batch-2.md
?? docs/dev-context/2026-05-08-pbs-large-file-governance-batch-3.md
?? docs/superpowers/specs/2026-05-07-pbs-large-file-governance-design.md
?? pbs-portal/src/features/dashboard/bidding-calendar-pairing-events.ts
?? pbs-portal/src/features/dashboard/dashboard-calendar-state.test.ts
?? pbs-portal/src/features/dashboard/dashboard-calendar-state.ts
?? pbs-portal/src/features/dashboard/pairing-calendar-detail.test.ts
?? pbs-portal/src/features/dashboard/pairing-calendar-detail.ts
?? pbs-portal/src/features/pairing/components/pairing-rule-expression-view.tsx
?? pbs-portal/src/features/pairing/components/pairing-search-criteria-row.tsx
?? pbs-portal/src/features/pairing/pairing-bid-control-logic.test.ts
?? pbs-portal/src/features/pairing/pairing-bid-control-logic.ts
?? pbs-portal/src/features/pairing/pairing-query-invalidations.ts
?? pbs-portal/src/features/pairing/search-pairings-page-logic.test.ts
?? pbs-portal/src/features/pairing/search-pairings-page-logic.ts
?? pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.test.ts
?? pbs-portal/src/features/rule-bids/rule-bid-right-panel-layout.ts
?? pbs-portal/src/shared/lib/schedule-panel-layout.ts
?? pbs-server/src/services/calendar/bidding-calendar-date-utils.ts
?? pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts
?? pbs-server/src/services/calendar/calendar-days-off-draft-state.ts
?? pbs-server/src/services/days-off/days-off-draft-queries.ts
?? pbs-server/src/services/days-off/days-off-draft-write.ts
?? pbs-server/src/services/days-off/days-off-property-write.ts
?? pbs-server/src/services/lineholder/current-bid.ts
?? pbs-server/src/services/lineholder/property-catalog.ts
?? pbs-server/src/services/lineholder/shared-types.ts
?? pbs-server/src/services/lineholder/tier-keys.ts
?? pbs-server/src/services/lineholder/tier-sync.ts
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
pbs-portal/src/features/pairing/components/pairing-search-panel.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
pbs-portal/tsconfig.tsbuildinfo
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/lineholder/shared.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
```

### staged files

```text
.gitignore
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-08-pbs-large-file-governance-batch-4.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
