# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 17:25:35 CST
- Wing：`pbs`
- Topic：`redeye-preference-date-standardization`
- Title：Redeye Preference 日期统一与默认 Avoid
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Portal 的 Redeye Preference（property 117）标准答案对齐。

用户确认的产品决定：
- 新增 Redeye Preference 默认选择 Avoid；已有保存条件继续保留原 Award/Avoid。
- 保留 03:30-05:30 local time 定义。
- 日期区统一为 LIMIT TO FLIGHT DATE，默认关闭；开启后支持 Specific Dates 多选或 Date Range。
- 项目未上线，不兼容旧 flag / specific_date 数据；迁移直接清理 property 117 的旧 bids 与 favorites。
- Avoid 搜索使用正向 Redeye 命中集合的补集；算法导出 Award/Avoid 都先查询正向集合，再写入各自动作 counter。
- Live Server property 117 的跨午夜判断已与 PBS Server interval-overlap 逻辑统一。

正式文档与提交：
- Spec commit：54ae243a docs: standardize Redeye Preference dates
- Implementation commit：8a41ce31 feat: standardize Redeye Preference dates
- Spec：docs/superpowers/specs/2026-07-16-pbs-redeye-preference-date-standardization-design.md
- QA：docs/test-cases/pbs/pairing/2026-07-16-redeye-preference-date-standardization.md
- Migration：sql/migration/2026-07-16-pbs-redeye-preference-date-standardization.sql

验证结果：
- PBS Server 聚焦回归 262/262 PASS。
- Live Server 聚焦回归 18/18 PASS。
- Portal 聚焦测试 64/64 PASS；Portal 完整测试 595/595 PASS。
- Redeye Playwright 两条真实业务流程 PASS：新增默认 Avoid + 多日期提交；Search Pairings 已有 Award + 多日期回显。
- pbs-portal lint/build PASS；pbs-server/live-server/pbs-portal TypeScript PASS。
- UI Standard Gate PASS，0 hard violations；git diff --check PASS。
- PBS Server 完整基线 654/656，两个失败为既有 Reserve export 与 catalog numericBounds 测试，与本次无关。
- Live Server 完整测试存在多项既有环境/旧基线失败，本次聚焦用例均通过。

未执行事项与约束：
- 破坏性迁移没有在共享远端 schema 执行；后续只能在隔离测试 schema 双跑确认幂等性后再按部署流程运行。
- 当前工作树仍有 Dashboard、日历滚动、Dialog、AGENTS.md、CLAUDE.md 等其他任务改动，未包含在 8a41ce31，必须继续保留且不要混入 Redeye 后续提交。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M docs/test-cases/pbs/dashboard/2026-07-02-pairing-bid-detail-dialog-overlay.md
 M e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts
 M e2e/tests/pbs-portal/pairing-preference.spec.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
 M pbs-portal/src/shared/components/ui/pbs-dialog-frame.test.tsx
 M pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx
?? .playwright-mcp/
?? docs/superpowers/specs/2026-07-16-pbs-bidding-calendar-unintended-scrollbar-design.md
?? docs/superpowers/specs/2026-07-16-pbs-pairing-calendar-detail-viewport-portal-design.md
?? docs/test-cases/pbs/pairing/2026-07-16-bidding-calendar-no-outer-scrollbar.md
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
docs/test-cases/pbs/dashboard/2026-07-02-pairing-bid-detail-dialog-overlay.md
e2e/tests/pbs-portal/dashboard-pairing-bid-detail.spec.ts
e2e/tests/pbs-portal/pairing-preference.spec.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
pbs-portal/src/shared/components/ui/pbs-dialog-frame.test.tsx
pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-16-pbs-redeye-preference-date-standardization.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
