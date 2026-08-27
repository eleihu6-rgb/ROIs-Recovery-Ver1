# PBS Mixed Line Bid 参考项目对齐实施计划

日期：2026-08-12
状态：已批准实施，进行中
权威设计：`docs/superpowers/specs/2026-08-12-pbs-mixed-line-bid-reference-parity-design.md`

## 目标

- 将员工端 `propertyCode=427` 从 `Reserve` 显示为 `Mixed Line Bid`。
- Current Line 与 Standing Lineholder 都使用三段选择：`Mixed Line`、`Reserve Only`、`Pairing Only`。
- `Mixed Line` 为 neutral/null 语义：新增不保存 427；编辑已有 427 时删除该 bid。
- `Reserve Only` 继续保存 `action=award`；`Pairing Only` 继续保存 `action=avoid`。
- 不改 CSV/export/solver/schema/migration，不新增 `mixed` action。
- 避开当前工作区已有的 pbs-server/Bid Feedback Selector 在途改动。

## 执行顺序

1. Impact 与上下文：
   - 对 `LineBidDialog`、`LinePage`、`StandingBidDialog`、`StandingBidPage`、Current/Standing mapper 和共享 RuleBidRightPanel 相关 symbol 做 GitNexus upstream impact。
   - 如出现 HIGH/CRITICAL，先报告 blast radius，再决定是否继续。
2. UI 显示名：
   - 在 PBS Portal 前端为 `propertyCode=427` 增加员工端 display name 映射 `Mixed Line Bid`。
   - 确保保存 draft 时不因为显示名改变污染后端 canonical 识别。
3. Current Line：
   - 将 427 配置器改成三段选择。
   - 新增默认 `Mixed Line`，neutral 禁用 Add/Save Favorite 并显示说明。
   - 编辑已有切到 `Mixed Line` 时调用现有 Current delete path。
4. Standing Lineholder：
   - 复用同一三段文案和 action/null 映射。
   - 新增 neutral 不保存；编辑已有 neutral 调 Standing delete path。
   - Standing Reserve 继续隐藏 427。
5. Summary/Help/Tests：
   - 更新 summary、Help、Current/Standing focused tests 和 Playwright 文案。
   - 增加 mapper/focused test，明确不产生 `action=mixed`。
6. 验证：
   - 跑 pbs-portal focused Vitest。
   - 跑相关 pbs-portal Playwright。
   - 如样式/组件结构变化，跑根目录 `npm run check:ui`。
   - 跑 `git diff --check`。

## 预期文件边界

允许修改：

- `pbs-portal/src/features/line/**`
- `pbs-portal/src/features/standing-bid/**`
- `pbs-portal/src/features/rule-bids/**` 中为 existing neutral 删除所需的最小接口扩展
- `pbs-portal/src/features/bid/**` 中 427 summary 文案
- `pbs-portal/src/features/help/**` 中 427 Help 文案
- `e2e/tests/pbs-portal/**` 中相关 427 测试
- `docs/test-cases/pbs/**` 相关人工测试

默认不修改：

- `packages/contracts`
- `pbs-server`
- `live-server`
- `sql`
- `pbs-engine`
- `rule-engine-rs`

## 风险控制

- `Mixed Line` 不进入 mutation payload；只作为前端 neutral 状态。
- 新增 neutral 不调用 add API。
- 编辑 existing neutral 走 delete API，而不是 update API。
- Favorite neutral 禁用或引导使用现有 Remove Favorite。
- Current 与 Standing 删除路径分别使用各自 draft context 和版本号。

## 验收重点

- Current/Standing catalog、dialog、existing row 都显示 `Mixed Line Bid`。
- 三段按钮默认 `Mixed Line`。
- `Reserve Only` -> `action=award`。
- `Pairing Only` -> `action=avoid`。
- existing 切回 `Mixed Line` 删除 bid。
- Standing Reserve 搜索不到 `Mixed Line Bid`。
- CSV/export 不变；无 `action=mixed`。
