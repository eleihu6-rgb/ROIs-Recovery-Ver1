# PBS 只读期弹窗 Pending 状态统一修复设计

## 背景

在 PBS Portal 中，当前 bid period 关闭后，用户仍可能通过已有 bid 的编辑入口打开配置弹窗。弹窗底部按钮显示为 `UPDATING...`，看起来像请求一直没有结束，用户也无法正常判断这是“正在提交”还是“当前 period 不允许编辑”。

这次问题最明显出现在 `Days Off -> Prefer Off`，但代码检查后确认不是单页问题：

- `Days Off`、`Line`、`Reserve`、`Standing Bid` 都直接或间接复用 `RuleBidRightPanel`。
- `RuleBidRightPanel` 当前把 `isPeriodReadOnly` 合并进了 `draftActionDisabled`。
- `draftActionDisabled` 又被传给各配置弹窗的 `isPending` / `isFavoritePending`。
- 结果是：只读期不是请求 pending，却被 UI 当成 pending，按钮显示 `UPDATING...` / `ADDING...`。

Pairing 页面此前已有局部修复，但这次不能继续单点修，要把共享面板和同类页面统一处理。

## 目标

- 关闭 bid period 后，任何 PBS bid 配置弹窗都不能把“只读不可编辑”显示成 `UPDATING...` 或 `ADDING...`。
- 真正的网络提交 pending 仍然保留现有 pending label 和 disabled 行为。
- 只读期点击新增、编辑、删除、保存、收藏相关操作时，应走统一只读提示或保持按钮 disabled，不发写请求。
- `Days Off`、`Line`、`Reserve`、`Standing Bid` 的行为对齐，不能只修 Pairing 或只修一个入口。

## 范围

本次纳入：

- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`
  - 共享 bid 面板的只读状态、真实 pending 状态、弹窗 props 传递。
  - `requestedExistingPropertyId` 这类外部请求打开已有 bid 的入口，也必须受只读期约束。
- `Days Off`
  - `Prefer Off` 等已有 bid 编辑弹窗。
  - 新增 / favorite / update favorite 的 pending 与只读区分。
- `Line`
  - Line / Roster 类 property 配置弹窗，包括 Mixed Line Bid 相关入口。
- `Reserve`
  - 复用 `RuleBidRightPanel` 的 Reserve Short Call / reserve rule bid 编辑入口。
  - 单独的 `ADD RESERVE PREFERENCE` 按钮只使用真实提交 pending；同时检查关闭 period 时是否应 disabled 或提示只读，不能发写请求。
- `Standing Bid`
  - 复用 `RuleBidRightPanel` 的 standing bid property 新增和编辑弹窗。
  - `StandingBidPropertyDialog` 内部复用 `DaysOffBidDialog`、`LineBidDialog`、Reserve dialog 的 pending 传递要保持真实 pending。

本次不纳入：

- 不改 Business Time 的计算逻辑。
- 不改 current period 后端选择逻辑。
- 不改 423 / closed period 的后端保护语义。
- 不改 CSV、solver、award 后续保存逻辑。
- 不改弹窗视觉样式、布局和字段校验规则。

## 设计

### 1. 拆开两个概念

在共享面板里把状态拆成两个变量：

- `isDraftStructureMutationPending`
  - 只表示真实的 add / update / delete / save 等写请求正在进行。
  - 只允许这个状态传给弹窗 `isPending`。
- `isPeriodReadOnly`
  - 只表示当前 period 不允许编辑。
  - 用于禁止用户发起动作、显示只读提示、禁用入口。
  - 不能传给弹窗 `isPending`。

保留一个只用于按钮禁用的组合状态：

- `draftActionDisabled = isDraftStructureMutationPending || isPeriodReadOnly`
  - 只用于列表按钮、delete、save 等 action disabled。
  - 不再传给 dialog pending。

### 2. 修正弹窗 props

共享面板传给各 dialog 的 pending 规则：

- `isPending: isDraftStructureMutationPending`
- `isFavoritePending: isFavoriteMutationPending`

不能再写成：

- `isPending: isDraftStructureMutationPending || isPeriodReadOnly`
- `isFavoritePending: isFavoriteMutationPending || isPeriodReadOnly`

这样关闭 period 时，弹窗不会显示 `UPDATING...`；真正提交时仍会显示。

### 3. 修正打开已有 bid 的入口

已有 bid 点击编辑、外部 `requestedExistingPropertyId` 请求打开弹窗时：

- 如果 `isPeriodReadOnly === true`：
  - 不打开编辑弹窗。
  - 显示已有的只读提示，例如 `Bidding is closed...` / `Bidding is not open...`。
  - 调用 `onRequestedExistingPropertyHandled`，避免同一个外部请求反复触发。
- 如果 period 可编辑：
  - 保持现在的打开和编辑逻辑。

这样能处理用户截图里的场景：页面已经是 closed period，不应该进入一个看似 pending 的编辑态。

### 4. Reserve 单独入口

`Reserve` 页面里的 `ADD RESERVE PREFERENCE` 不是普通 available property 列表，需要单独检查：

- 按钮 disabled 只读期应包含 `isPeriodReadOnly`。
- 点击时如果 period closed，走只读提示，不打开可提交弹窗。
- 弹窗 `isPending` 仍只用 `isReservePreferencePending`，不能混入只读状态。

### 5. Standing Bid

`Standing Bid` 复用共享面板，因此共享修复应自然覆盖：

- 新增 Standing Bid property。
- 编辑 Standing Bid property。
- 内部转发到 `DaysOffBidDialog`、`LineBidDialog`、Reserve dialog 的 pending props。

如果 Standing Bid 的产品语义允许在 current period closed 时仍编辑，需要由后端返回 `currentPeriod.canEditBid === true` 或单独能力字段表达；本次不在前端硬绕只读期。

## 验收标准

- closed period 下，`Days Off -> Prefer Off` 打开/点击已有 bid 时，不出现 `UPDATING...` 卡死状态。
- closed period 下，`Line`、`Reserve`、`Standing Bid` 同类新增/编辑入口不出现 `ADDING...` / `UPDATING...` 假 pending。
- closed period 下不会发 add / update / delete / save / favorite 写请求。
- open period 下真实提交时，按钮仍显示 `ADDING...` / `UPDATING...`，并且提交期间不可重复点击。
- Pairing 之前的修复不回退。

## 测试计划

自动化：

- 更新 `RuleBidRightPanel` 或页面级 Vitest：
  - closed period + existing edit：不打开可提交弹窗，或至少不显示 `UPDATING...`。
  - closed period + `requestedExistingPropertyId`：不绕过只读期，不发 update 请求。
  - open period + update mutation pending：仍显示 `UPDATING...`。
  - favorite pending 只受真实 favorite mutation 控制。
- 为 `Days Off` 增加回归测试，覆盖截图里的 `Prefer Off` 场景。
- 为 `Line` 或 `Standing Bid` 增加一条共享面板回归，证明不是只修 Days Off。
- 检查 `Reserve` 单独 `ADD RESERVE PREFERENCE` 只读行为。

人工 / E2E：

- 新增或更新 QA 测试文档：
  - closed period 下 Days Off / Line / Reserve / Standing Bid 的只读点击行为。
- 如 mock 数据成本可控，补一个 Playwright closed-period 回归，优先覆盖 Days Off 截图场景。

验证命令：

- `cd pbs-portal && npx vitest run <touched tests>`
- `cd pbs-portal && npm run lint -- --quiet`
- `cd pbs-portal && npm run build`
- `npm run check:ui`
- 如新增 E2E：`cd e2e && npx playwright test <spec> --config=config/playwright.config.ts --project=pbs-portal --no-deps`
- `git diff --check`

## 风险和注意事项

- 共享面板影响范围比单页大，必须用 focused tests 覆盖 closed/open 两种 period。
- 不能把所有 disabled 都改成 pending，否则会重新制造假 loading。
- 不能只靠前端阻止写请求；后端 423/closed period 保护仍然是最终防线。
- 当前工作区已有 Pairing 的未提交修复，本次实现不能回滚那部分改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 核心修复集中在 `RuleBidRightPanel` 的状态拆分和调用方回归，文件耦合度高，多 agent 并行容易互相踩同一批测试和共享 props。
- Suggested split: 不建议拆分；由一个实现流程完成代码、测试、QA 文档和验证。
- Write boundaries: 主要限于 `pbs-portal/src/features/rule-bids`、必要页面测试、Reserve 单独入口、QA 文档。
- Conflict risk: 中等；当前工作区已有 Pairing 未提交改动，需要保留并避免覆盖。
- Execution gate: 用户确认本 spec 后再开始实现。

