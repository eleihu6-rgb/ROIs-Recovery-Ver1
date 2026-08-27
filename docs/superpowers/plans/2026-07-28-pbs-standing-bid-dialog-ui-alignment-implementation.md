# PBS Standing Bid 条件弹窗 UI 对齐实施计划

日期：2026-07-28

关联设计：

`docs/superpowers/specs/2026-07-28-pbs-standing-bid-dialog-ui-alignment-design.md`

## 目标

让 Standing Bid 的 22 个条件弹窗使用当前 Bid / Line / Days Off / Reserve 已验收的条件专属 UI，同时保留：

- `Configure Standing Bid` 主标题和条件副标题。
- Standing 独立 draft、context、version、query 和 mutation。
- 无收藏。
- 无具体日期。
- Reserve 仅允许长期 date scope。

## 实施顺序

### 1. 建立共享弹窗 context 和 Standing 路由

- 为现有条件弹窗增加最小、向后兼容的 Standing context / capability。
- context 只控制标题、副标题、footer、收藏能力、日期能力和 reference period。
- 在 Standing feature 内增加 property code / category 到对应 editor 的路由。
- 保留现有 Standing add / update callback 形状，不修改保存架构。

优先修改：

- `pbs-portal/src/features/standing-bid/components/**`
- `pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx`
- 必要的共享 dialog 类型或小型 helper

验证：

- router focused tests 覆盖 22 个 property code。
- Current 默认 props 行为不变。

### 2. 对齐 Pairing 的 11 个条件

- 复用 `PairingPropertyConfigDialog` 的专属 editor 和验证器。
- 增加 Standing header / footer 变体。
- 隐藏收藏。
- Tier 新增时为空，编辑时回显。
- 所有具体日期限制保持可见但禁用且为空。
- period-scoped reference query 在 Standing 下传 `undefined`，不得发送 `STANDING`。
- adapter 将 editor 输出映射回 Standing property。

重点条件：

- `Airport Preference`
- `Deadhead Flying`
- `Efficient Flying First`
- `Flight Legs per Duty`
- `Flight Number Preference`
- `Month-End Carryover`
- `Pairing Check-In / Check-Out Time`
- `Pairing Length`
- `Redeye Preference`
- `Time Between Flights`
- `Work Day Preference`

验证：

- 11 个字段基线 focused tests。
- Current Pairing dialog tests。
- Search Pairings focused tests。

### 3. 对齐 Days Off 的 2 个条件

- `Prefer Off` 复用现有 weekday editor 视觉。
- 增加 weekday code ↔ name adapter。
- Specific Dates / Date Range / Weekends 保持可见但禁用。
- Time Window 保持可见但禁用。
- 输出继续为 Standing `date-or-dow-list`，不改为 Current `tag-list`。
- `Day of Week Off` 使用统一 section、weekday select、Tier 和 footer primitives。

验证：

- 新增和编辑 round-trip。
- 非空具体日期被阻止，不静默清理。
- weekday、Tier 空值验证。
- Current Prefer Off 全模式回归。

### 4. 对齐 Roster / Line 的 5 个条件

- 复用 `LineBidDialog` 的专属 editor 和远端配置状态。
- 使用 Standing header / footer。
- 隐藏收藏和具体日期能力。
- `Mixed Block Pattern` 保持 Current 已有的字段顺序。

重点条件：

- `Commuter Pattern`
- `Credit Window Preference`
- `Minimum Base Layover`
- `Mixed Block Pattern`
- `Reserve Avoidance`

验证：

- 五个 editor 初始值、字段、验证和回显。
- Credit Window / Minimum Base Layover 加载失败状态。
- Current Line dialog 回归。

### 5. 对齐 Reserve 的 4 个条件

- `Reserve Preference` 复用现有 Reserve editor。
- Standing relative scope 不依赖真实 bid period。
- date scope 只开放 Whole Month / First Half / Second Half。
- 为 312 / 313 / 314 实现薄的 Standing 专属 editor：
  - weekday select
  - number range
  - flag / waiver semantic section
- 所有条件 Tier 新增时为空，编辑时回显。

验证：

- 四个字段契约和 payload。
- 只写 `StandingReserve`。
- Current Reserve 默认行为回归。

### 6. 清理旧通用分发

- 移除 `StandingBidDialog` 中已迁移到现有 editor 的通用 `PairingBidControl` 分发。
- 只保留四个无 Current 对应条件所需的薄容器，或用更明确的专属组件替代。
- 不修改 Standing 页面列表、双 context mapper 或保存流程。

验证：

- 22 个条件均由明确路由处理。
- 没有通用 `BID` 下拉框兜底。
- 未支持的 property code 显示安全错误状态，不猜测 editor。

### 7. Playwright、QA 与全量回归

- Playwright 逐个打开 22 个 Standing 弹窗。
- 对照 Current Bid / Reserve 的 18 个对应条件字段。
- 完成 6 个关键保存流程。
- 验证 4 个 Standing 专属条件。
- 验证无收藏、无具体日期、正确 context。
- 验证 Current Bid、Reserve 和 Search Pairings 未受污染。
- 更新 Standing Bid QA 人工测试文档。

## 写入边界

主要允许：

- `pbs-portal/src/features/standing-bid/**`
- `pbs-portal/src/features/pairing/components/**`
- `pbs-portal/src/features/days-off/components/**`
- `pbs-portal/src/features/line/components/**`
- `pbs-portal/src/features/reserve/components/**`
- 对应 focused tests
- `e2e/tests/pbs-portal/standing-bid-phase-one.spec.ts`
- 必要的 Current / Search Pairings E2E
- `docs/test-cases/pbs/standing-bid/**`

不修改：

- pbs-server contract 和业务校验。
- 数据库 schema。
- Standing 双 context 保存架构。
- Current Bid / Reserve 默认产品行为。
- solver fallback。
- 与这些弹窗无关的共享 UI。

## 风险控制

- 修改任何 symbol 前执行 GitNexus upstream impact。
- HIGH / CRITICAL 影响先停下说明。
- 共享 dialog 新参数必须可选，默认值保持 Current 行为。
- 不引入新的业务常量；默认值、options 和范围来自 catalog / config。
- 不把 `STANDING` 传给需要真实月份的 reference endpoint。
- 不通过隐藏或清理字段假装日期限制生效。
- 不执行任何主动 Git 提交操作。

## 完成门禁

- Standing focused Vitest：PASS
- Pairing / Days Off / Line / Reserve dialog focused tests：PASS
- Search Pairings focused tests：PASS
- `pbs-portal` 全量 Vitest：PASS
- Standing Playwright：PASS
- Current Bid / Reserve / Search Pairings 关键 Playwright：PASS
- `npm run check:ui`：硬违规 0
- `npm --prefix pbs-portal run lint`：PASS
- `npm --prefix pbs-portal run build`：PASS
- `git diff --check`：PASS
- GitNexus `detect_changes`：仅预期模块和流程

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 共享 dialog、Standing adapter 和回归测试高度耦合，并行写入相同组件风险高。
- Suggested split: 单人按 Pairing → Days Off → Line → Reserve → E2E 顺序实施。
- Write boundaries: 以上“写入边界”。
- Conflict risk: Medium。
- Execution gate: spec 已由用户确认；完成本计划后可开始第一阶段代码修改。
