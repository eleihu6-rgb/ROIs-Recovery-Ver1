# PBS Work Day Preference（property 110）产品实现设计

日期：2026-07-13
状态：用户已确认；实现与验证完成，待用户审阅差异

## 1. 目标

将 Pairing property `110` 从技术名称 `Any/Every Duty On Date / Day` 改为面向机组的 `Work Day Preference`，并将已经验收的 v2 原型落入 PBS Portal。

用户应能表达：在指定 Tier 内，Award / Avoid 一个 pairing；其中任一或每一个 duty 的开始日期，是否命中指定日期、星期或连续日期范围。

## 2. 已确认业务语义与正式 payload

不创建新 property，不改变 `propertyCode=110`，也不改变既有 SQL 匹配、后端保存契约或日期判断基准（duty 开始日期）。

| Portal 模式 | 内部 operator | 正式 `bid` | 语义 |
| --- | --- | --- | --- |
| `Specific dates / weekdays` | `In` | `{ type: "date-or-dow-list", dates: string[], daysOfWeek: PairingDayOfWeek[] }` | 具体日期与星期之间是 OR。 |
| `Date range` | `Between` | `{ type: "date-range", from: string, to: string }` | 连续闭区间；`from <= to`。 |

- `Any work day`：至少一个 duty 命中当前模式的条件。
- `Every work day`：每一个 duty 都必须命中当前模式的条件。它不是“每个所选星期都必须出现”。
- 示例：`Award + Every + [Jun 3, Jun 5, Jun 7, Mon, Tue, Wed]` 表示每一个 duty 必须是三个指定日期之一，或落在周一至周三之一。

## 3. Portal 行为与视觉

### 3.0 UI 基线（强制）

正式 UI 必须以本轮已经新写并验收的 Pairing 条件为唯一视觉与交互基线，而不是以开发期 HTML 原型、旧通用 `DateOrDowListControl` 或浏览器原生控件为基线。具体对齐：

- `Pairing Preference`、`Airport Preference`、`Pairing Check-In / Check-Out Time`、`Flight Legs per Duty` 已确认的弹窗标题、关闭按钮、section caption、Tier、Award/Avoid、footer 和禁用态。
- 已确认的紧凑信息密度、英文字体、留白、边框、紫色选中态、焦点处理与 `SAVE FAVORITE | ADD BID` 排列。
- 使用现有 `PbsDialogFrame`、`TierToggleGroup`、`AwardAvoidSegmentedControl`、`PairingPropertyDialogFooter` 和 `PortalDatePicker`；只在 `110` editor 内组合这些既有标准，不另造通用视觉语言。

原型只用于确认 Work Day 的字段顺序和模式交互，不能把其独立 HTML 的 CSS 数值、字体或 mock workspace 直接搬进 `pbs-portal/src`。

### 3.1 入口、名称和默认值

- `pbs_bid_property.property_name`、seed 与 contracts 中的 `110` 名称统一为 `Work Day Preference`；保留 property code、actions、quantifiers、operators 和 value schema。
- 弹窗标题为 `Configure Work Day Preference`。
- 新增时：T1–T7 均未选；`Award` 默认；`Any work day` 默认；模式默认 `Specific dates / weekdays`；日期、星期、范围均为空；两个 footer 主操作禁用。
- 编辑已有 `110` 时，必须完整回填 tiers、Award/Avoid、Any/Every 和当前 payload；不套用新增空白规则。

### 3.2 专用编辑器

新增只供 `110` 使用的 `WorkDayPreferenceEditor`，在 `PairingPropertyConfigDialog` 中按 property code 分支渲染。不得修改通用 `DateOrDowListControl`，以免改变 Departure Date / Day、Layover 或 Enroute 等其他 property。

编辑器顺序与 v2 原型一致：

1. `TIERS · REQUIRED`
2. `PREFERENCE`：`Award | Avoid`
3. `WORK-DAY MATCH`：`Any work day | Every work day`
4. `WHEN SHOULD THE WORK DAY OCCUR? · REQUIRED`：`Specific dates / weekdays | Date range`

具体模式使用现有 `PortalDatePicker` 风格的英文日期触发器，选中日期显示可删除 chip，星期为 Mon–Sun 按钮。范围模式使用 From / To 两个同款日期触发器。不得使用浏览器原生 `input[type=date]`，也不得回退为旧通用日期 / 星期控件的宽松布局。

不显示技术 operator（`In` / `Between`）、`RULE PREVIEW`、实时自然语言结果句、模式说明小字或额外浮层。完成度只由 footer 启用状态表达。

### 3.3 模式草稿、完成度和保存

- 专用 editor 在弹窗会话中保留两种模式各自的草稿；切换模式不清空已选日期、星期或范围。
- 当前模式为具体日期 / 星期时，至少一个日期或星期即完整；提交时写入 `date-or-dow-list` 并将外层 operator 设为 `In`。
- 当前模式为范围时，From、To 均必填且 `from <= to`；提交时写入 `date-range` 并将外层 operator 设为 `Between`。
- footer 启用条件为：至少一个 Tier、合法 Award/Avoid、合法 Any/Every、当前模式合法。它不因隐藏模式的草稿而启用。
- `ADD BID` 和 `SAVE FAVORITE` 继续使用现有 Portal 保存路径；不增加请求、不改变 payload mapper 或后端保存接口。

## 4. 后端与数据变更

- 新增一份可重复执行的 migration，仅将 F8 `pbs_bid_property` 中 Pairing `110` 的显示名称和 tooltip 改为 `Work Day Preference`；不删除、重写或迁移现有已保存的 `110` bids。
- 同步更新 `sql/seed/10-pbs-bid-property.sql` 的名称和 tooltip，并更新 `packages/contracts/pbs-pairing-bids.js` 的名称；contracts 当前没有 tooltip 字段，不能虚构该字段。
- 保留 `pbs-server` 对 `date-or-dow-list` / `date-range`、Any/Every、日期范围先后顺序的校验；将 `110` 的用户可见错误文案改为 `Work Day Preference`。
- 不改 Pairing Search 的 SQL 条件构造、数据库 schema、API contract、property code 或其他日期 property。

## 5. 测试与 QA

### 自动化

1. Portal Vitest：catalog 显示 `Work Day Preference`；新增弹窗只有 Award + Any 默认，Tier 与两个模式的值为空，footer 禁用。
2. Portal Vitest：`110` 弹窗使用专用 editor 与已确认 Pairing UI 的共享基础组件；其他 `date-or-dow-list` property 仍走原通用控件。
3. Portal Vitest：具体模式可同时保存多个日期和星期，输出 `operator=In` 与原 payload；切换至范围后不清空具体模式草稿。
4. Portal Vitest：范围模式仅在 From / To 合法且顺序正确时输出 `operator=Between`；非法范围禁用 footer。
5. Portal Vitest：编辑已有具体列表或范围时，回显正确模式、action、quantifier、tiers 和值。
6. pbs-server Vitest：`110` 的两种现有 payload 仍通过 validation，范围倒置仍被拒绝，错误文案使用新名称；在 `pairing-search-condition-builder` 明确覆盖 `Every + date-or-dow-list`，断言 SQL 为“存在 duty，且不存在不满足 `(date OR weekday)` 的 duty”，防止 Every 被误降级为 Any。
7. Playwright：通过真实 Pairing 页面打开 `110`，完成具体日期 + 星期与范围两条路径；至少一条具体列表路径选择 `Every work day`，验证提交 payload 和编辑回显仍为 `quantifier=every`，且同时保留 date 与 weekday。不得直接调用保存接口。
8. Playwright：实际点击 `SAVE FAVORITE`，随后从 `FAVORITED PROPERTIES` 复用该 favorite，验证 action、quantifier、tiers、当前模式和日期值完整保留。
9. 更新 `docs/test-cases/pbs/pairing/` 的手工 QA，覆盖 Any / Every 的业务含义、日期与星期 OR、范围、模式草稿保留、保存与编辑回显。

### 验证命令

```bash
cd pbs-portal && npx vitest run <work-day-related-tests>
cd pbs-server && npm test -- <work-day-related-tests>
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps <work-day-test> --reporter=list
cd pbs-portal && npm run build
npm run check:ui
git diff --check
```

## 6. 非目标

- 不改变 `123` Layover On Date / Day、`106` Departure Date / Day 或 Enroute 日期 property。
- 不增加实时规则句、解释卡片、额外日期限制或新的 API。
- 不在本轮执行远端 migration；是否执行由用户另行授权。

## 7. Multi-Agent Parallelism Assessment

- Recommendation: Yes。
- Rationale: Portal 专用编辑器 / dialog 整合，与 migration / server validation / 后端测试可分开，并行边界清楚。
- Suggested split: Agent A 负责 Portal editor、dialog 和 Portal 测试；Agent B 负责 contracts、seed、migration、server 文案与后端测试；主 agent 负责接口整合、E2E、UI gate 和验收。
- Write boundaries: Agent A 仅 `pbs-portal/**`、`e2e/**`；Agent B 仅 `packages/contracts/**`、`sql/migration/**`、`sql/seed/**`、`pbs-server/**`；主 agent 处理 docs 和整合冲突。
- Conflict risk: Medium，集中在 property 110 名称与 payload 断言；以本设计第 2 节为唯一合同。
- Execution gate: 用户审阅并明确确认本 spec 后，才开始实现；远端 migration 另需单独授权。
