# PBS Line Reserve 参考语义恢复实施计划

日期：2026-08-12
状态：已完成实现，待环境迁移与发布验证
权威设计：`docs/superpowers/specs/2026-08-12-pbs-line-reserve-reference-parity-design.md`

## 目标

- 将 Property 427 从 `Reserve Avoidance` 恢复为 `Reserve`。
- Current Line 与 Standing Lineholder 共用 `flag + action(award|avoid)` 语义。
- 保持 Standing Reserve 隐藏 427。
- 恢复 active `live-server` 与 legacy `pbs-server` 的 `LINE_RULES.csv` 427 `RESERVE` 输出。
- 恢复 Bid Feedback A2 conflict，cache `v7` 升级到 `v8`。
- 正式 Crew Bid Import 在 `live-server` 中映射 Award/Avoid/No Reserve 文本。
- 新增幂等 metadata migration，并用隔离数据库验证 legacy guard 与 canonical no-op。

## 执行顺序

1. Contract 与 shared type：
   - 更新 `packages/contracts/pbs-line-bids.*`、Standing contract 和 favorite eligibility。
   - 新增/更新 contract tests，确保 301/410 保持原 contract。
2. PBS Server：
   - 更新 Current/Standing route schema、line validation、standing validation、draft serialization、summary 和 property catalog。
   - 更新 Bid Feedback effective source / A2 conflict / cache version。
   - 更新 legacy algorithm export。
3. PBS Portal：
   - 用现有 preference primitives 替换 427 自定义 avoidance editor。
   - 保持 Tier 初始为空、Add/Update 必选、Save Favorite tierless。
   - 更新 Current/Standing mapper、summary、Help 和 focused tests。
4. Live Server：
   - 更新 active 427 exporter。
   - 更新正式 Crew Bid Import mapper 与 tests。
5. SQL / docs / E2E：
   - 新增 `2026-08-12` migration 与三类 fixture/verify SQL。
   - 更新 seed metadata、QA 测试用例和 Playwright。
6. 验证：
   - 先跑 focused contract/backend/frontend tests。
   - 再跑 migration isolated DB 验证、build/lint、`npm run check:ui`、`npm run verify:pbs`、`git diff --check`。

## GitNexus Impact 规则

- 当前 worktree 已重新生成 GitNexus 索引。
- 编辑函数、方法、类型相关 symbol 前，按 UID 或 file path 运行 `gitnexus impact --direction upstream --include-tests`。
- 若返回 HIGH/CRITICAL，先停止并向用户报告风险；否则按最小实现推进。

## 验收重点

- 427 catalog 为 `Reserve`，default action 只用于新建 UI，不用于 mutation fallback。
- mutation 缺失 action、旧 `reserve-avoidance`、旧 mode 均返回稳定 400。
- Favorite 保存 action 但不保存 Tier；从 Favorite 新增前 Tier 为空。
- A2 只在有效 427 avoid 与有效 301 同时存在时产生，并计入两个 Feedback endpoint。
- `LINE_RULES.csv` 输出不含 `RESERVE_AVOIDANCE`、`avoidance`、`if_possible`、`no_matter_what`。
- Migration 对 legacy nonzero 数据失败回滚，对 canonical 状态二次执行 no-op。

## 风险控制

- 不修改参考项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report`。
- 不改历史 spec / 历史 migration；历史资料中旧文案允许保留。
- 不对远端业务 schema 执行 fixture；远端只做允许的只读 preflight/verification。
- 不提交 Git commit。
