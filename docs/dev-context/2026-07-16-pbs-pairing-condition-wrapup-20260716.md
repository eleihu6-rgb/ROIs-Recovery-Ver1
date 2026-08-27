# 开发上下文（2026-07-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-16 21:37:09 CST
- Wing：`pbs`
- Topic：`pairing-condition-wrapup-20260716`
- Title：pairing-condition-wrapup-20260716
- Git branch：`main`

## 本轮对话上下文

本轮 PBS Pairing/Days Off 条件开发与收尾上下文：

已完成并提交的主要事项：
- `7427fb2e feat: standardize time between flights editor`
  - Time Between Flights 改为统一 Pairing preference condition UI。
  - MATCH Any/Every 移入 editor 内部，外层 Pairing dialog 不再重复渲染 quantifier。
  - HH:MM 输入改用共享 `PreferenceComparisonValueControl` 的 text 模式，payload/search/export 不变。
- `d401ef2e feat: align Deadhead Flying with standard answer`
  - Deadhead Flying 仅保留 `Any deadhead` / `Deadhead-only duty`，删除 deadhead legs/operator 语义。
  - 增加可选 `LIMIT TO FLIGHT DATE`，支持 Specific Dates 与 Date Range。
  - 同步 packages/contracts、pbs-portal、pbs-server、live-server、search/export、seed、migration 和 QA。
  - 新增 deadhead migration 及 fixture/verify/second-run 脚本；迁移用于隔离 schema 验证，未在本轮记忆中记录任何 DB 密码。
- `f4c751a9 fix: keep pairing bid detail dialog within viewport scale`
  - Dashboard/Bidding Calendar 的 Pairing bid detail dialog 继续 portal 到 `document.body` 覆盖真实 viewport。
  - 通过 `ScaledPageCanvas` context 读取统一 pageScale，dialog panel 以 880px 设计宽度随工作台缩放。
  - `PbsDialogFrame` 增加 opt-in `portalToBody`/`portalPanelStyle`，默认普通弹窗行为不变。
  - 增加焦点陷阱、关闭后 focus restore、低视口/多视口 Playwright 验收。

此前本窗口还已完成并提交：
- Redeye Preference 日期统一与默认 Avoid：`54ae243a` spec、`8a41ce31` implementation。
- Flight Number Preference 标准答案对齐：`35b9873f`。
- Time Between 前的多个 Pairing/Days Off 条件标准化与相关 cleanup 已在历史提交中保存。

关键产品/技术结论：
- Time Between Flights 只是 UI 标准化，不改变 `duration` payload、搜索 SQL 或算法导出。
- Deadhead Flying 的标准答案不再支持 `deadhead-legs` 数量比较；旧数据通过破坏性 migration 清理。
- Deadhead Flying 的 flight date 使用 `pairing_segment.flt_dt`，正向集合用于 Award 和 Avoid 导出，Avoid 不导出补集。
- Dashboard Pairing detail 是顶层视口 dialog，但视觉 scale 必须来自 `ScaledPageCanvas`，不能脱离工作台缩放。
- `.playwright-mcp/` 是本地调试产物，不应提交。

已运行过的验证（分散在本轮实现过程中）：
- Time Between: focused Vitest、Pairing page focused test、Playwright PBS-3527、pbs-portal lint/build/test、check:ui、GitNexus staged detect。
- Deadhead: staged GitNexus detect 为 critical，原因是跨 contract/portal/server/live/export/migration；功能本身即为大范围标准答案对齐。
- Dashboard detail: staged GitNexus detect 为 medium，影响 DashboardPage/StandingBidPage 的 scaled canvas path；`git diff --cached --check` 通过。
- 多次提交时 git 提示 `.git/gc.log` / unreachable loose objects housekeeping warning；没有执行 prune。

当前工作树预期：
- 业务代码应已提交。
- 只应剩下 AGENTS.md / CLAUDE.md 的 GitNexus index 数字刷新、dev-context memory 文件，以及 `.playwright-mcp/` 本地调试产物。
- 后续如果继续新功能，仍按 AGENTS/CLAUDE 的 brainstorming/spec gate 执行。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M docs/dev-context/LATEST.md
?? .playwright-mcp/
?? docs/dev-context/2026-07-16-pbs-redeye-preference-date-standardization.md
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
docs/dev-context/LATEST.md
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-16-pbs-pairing-condition-wrapup-20260716.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
