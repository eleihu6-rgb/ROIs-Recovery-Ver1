# PBS Standing Bid 条件弹窗 UI 对齐设计

日期：2026-07-28

关联设计：

- `docs/superpowers/specs/2026-07-28-pbs-standing-bid-unified-page-design.md`
- `docs/modules/pbs/pairing-condition-ui-standard.md`

## 1. 背景

Standing Bid 单页工作区已经完成与 Current Bid 列表、分类 Tab、搜索和分页的视觉对齐，但条件弹窗仍统一经过 `StandingBidDialog`。

2026-07-28 使用真实 Portal 和 Playwright 逐个检查 Standing 的 22 个条件后确认：

- Standing 弹窗统一显示为 `Configure Standing Bid → BID → TIERS`。
- 18 个条件在 Current Bid、Current Line Bid 或 Current Reserve 中已有成熟的条件专属弹窗，但 Standing 没有直接复用这些专属编辑器。
- 多个 Standing 条件仍表现为简化控件，未呈现 Current Bid 中已经验收的完整字段分组、默认值纪律、必填状态和交互。
- 其余 4 个条件没有可直接复用的 Current 弹窗，需要沿用同一视觉体系做 Standing 专属适配。

因此本阶段只处理 Standing 条件弹窗层：复用 Current Bid / Reserve 的成熟编辑器和 UI primitives，同时保留 Standing 身份、数据隔离和长期条件限制。

## 2. 已确认的产品要求

1. Standing 条件弹窗必须继续明确显示 `Standing Bid`，不能直接变成普通 Current Bid 弹窗。
2. 标题固定为：
   - 主标题：`Configure Standing Bid`
   - 副标题：具体条件名称
3. 相同条件的字段、字段顺序、控件样式、选择状态、间距、验证和无障碍语义，应与当前 Bid / Reserve 中已经验收的弹窗一致。
4. Standing 不提供收藏，footer 不显示 `SAVE FAVORITE`。
5. Standing 与 Current Bid 继续使用独立数据、mutation、版本和 query cache。
6. Standing 是 Current Bid 条件的“去绝对日期版本”：
   - 只移除需要选择明确 `YYYY-MM-DD` 的 `Specific Dates`、`Date Range`、`Limit to Event Date` 等能力。
   - 星期、周末、每日时间窗口、Check-In / Check-Out 时间、Whole Month、First Half、Second Half、Month-End Carryover 等长期或相对时间语义继续保留。
   - 被移除的绝对日期入口直接不显示，不以禁用控件占位。
7. `Reserve Preference` 的 Standing 日期范围只允许：
   - `Whole Month`
   - `First Half`
   - `Second Half`

## 3. 方案比较

### 方案 A：扩展并复用现有条件弹窗（采用）

为 Current Bid / Line / Days Off / Reserve 的现有弹窗增加最小的 Standing 展示与能力参数，例如：

- 标题覆盖为 `Configure Standing Bid` + 条件副标题。
- 隐藏收藏按钮。
- 使用 Standing 的 confirm label 和 pending label。
- 注入 Standing 日期能力限制。
- 保持现有 editor、验证器和 payload mapper。

优点：

- Standing 与 Current 使用同一套条件专属编辑器。
- 后续 Current editor 修复可同步惠及 Standing。
- 不复制字段、验证和交互逻辑。
- 最能防止两套 UI 再次漂移。

风险：

- 会触达共享弹窗，需要确保新增参数为可选且 Current 默认行为不变。
- 个别 dialog 的回调形状不同，需要在 Standing feature 内做薄适配。

### 方案 B：复制 Current 弹窗到 Standing（不采用）

复制 Current Bid 的 JSX 和验证逻辑，再修改标题与 footer。

优点是短期直观；缺点是产生第二套实现，未来字段和 UI 极易再次不一致，不符合项目复用规范。

### 方案 C：保留通用 Standing 弹窗，仅调整 CSS（不采用）

只把标题、Tier 和按钮样式改得像 Current Bid。

该方案不能解决条件专属字段、默认值、验证和 payload 行为不一致，因此不满足本次目标。

## 4. 设计原则

### 4.1 复用 editor，不复用 Current 业务状态

Standing 可以复用：

- 条件专属 editor。
- 视觉 primitives。
- 条件验证器。
- 只读 reference / config query，例如机场、航班号、Pairing 选项、公司 Credit Window 配置、Minimum Base Layover 配置和 Efficient Flying 配置。
- `TierToggleGroup`。
- `PbsDialogFrame`。
- footer 布局和禁用态逻辑。

Standing 不得复用：

- Current draft。
- Current draft / favorite / period calendar query cache。
- Current mutation 或 optimistic state。
- Current bid period 的具体日期状态。
- Current favorite mutation。
- Current pairing search、submit、lock 或 award 流程。

只读 reference / config query 可以继续使用现有稳定 query key，因为它们描述的是共享业务配置，不属于 Current draft。Standing draft 及其版本、Existing rows、mutation 和冲突恢复必须继续使用 Standing 自己的 query namespace。

### 4.2 Standing 身份由弹窗标题明确表达

所有 Standing 条件弹窗保持一致的头部：

```text
Configure Standing Bid
<Property Name>
```

不得使用：

- 只有 `Configure <Property Name>` 的 Current 标题。
- 只有 `Configure Standing Bid` 而没有条件名称。
- `Configure Line Bid`、`Edit Reserve Bid` 等 Current context 标题。

### 4.3 条件主体与 Current 对齐

主标题以下的主体区域复用对应 Current editor 的信息层级：

```text
TIERS
PREFERENCE（条件需要时）
条件专属字段
可选限制
footer
```

条件语义确实不同的情况下可以没有 `PREFERENCE`，但不得用一个通用 `BID` 下拉框替代现有专属字段。

字段顺序以对应的 Current editor 实际顺序为最终基线。`Mixed Block Pattern` 当前是已存在的例外：Segment / Preference Strength 在前，`TIERS` 在后；Standing 必须保持这一顺序，不在本任务中单独重排，也不借此修改 Current 弹窗。其余已符合统一标准的条件继续使用 `TIERS → PREFERENCE → 专属字段`。

### 4.4 Standing 时间与日期能力边界

复用 Current editor 时必须通过显式 capability / mode 控制绝对日期能力，不能把所有包含“日期、星期或时间”语义的控件一并删除，也不能在保存时才静默丢弃用户输入。

- `Specific Dates`、明确起止年月日的 `Date Range`、`Limit to Event Date`、`Pairing Start Date` 等绝对日期入口直接不渲染。
- 不显示可误导用户的 Current bid month 默认日期，也不显示无兜底能力的禁用日期控件。
- 周几允许多选；条件本身支持按星期设置时间窗口时，Standing 必须保留每个已选星期对应的时间窗口。
- Weekends 是周期性定义，不是绝对日期；配置可用时继续显示和使用，配置不可用时直接隐藏。
- Check-In / Check-Out、Time Window、duration 等纯时间能力继续可用。
- Whole Month、First Half、Second Half、Month-End Carryover 等相对月份语义继续可用。
- 被隐藏的绝对日期字段必须清空，不得残留进 Standing payload。

Standing 的 `periodCode = 'STANDING'` 不是一个真实月度 bid period。相对范围的完整性验证不得依赖 `listPbsPeriodDates('STANDING')`：

- `whole_month / first_half / second_half` 只校验 mode 合法性。
- `days_of_week` 只校验至少选择一个合法 weekday。
- 只有 Current 的 `specific_dates / date_range` 才使用真实 bid period 做日期边界验证。

## 5. 条件复用映射

### 5.1 Days Off

| Standing 条件 | 目标实现 |
|---|---|
| `Day of Week Off` | 复用 Days Off 的星期多选和 Tier primitives，保留 Standing 专属弹窗；不复用 Current 月历 popover |
| `Prefer Off` | 复用 `DaysOffBidDialog` / `PreferOffEditor`；隐藏 `Specific Dates` 和 `Date Range`，保留 `Days of Week`、可用的 `Weekends` 和 `Time Window` |

`Day of Week Off` 不直接复用 Current Bid 月历中的 `All SUNDAY dates in <month>` popover，因为 Standing 不绑定具体月份。

#### Standing Prefer Off 字段与映射

| 项目 | 规则 |
|---|---|
| 允许的 mode | `Days of Week`；配置可用时允许 `Weekends` |
| 不允许的 mode | `Specific Dates`、`Date Range` 入口不显示，不得产生值 |
| 新增默认值 | 使用 catalog 返回的 `date-or-dow-list.daysOfWeek`；当前 catalog 默认 `SAT`，不得在组件内另写默认星期 |
| Tier 默认值 | 新增时为空，至少选择一个 Tier 才可保存；编辑时回显已保存 Tier |
| Editor 输入映射 | `date-or-dow-list { dates: [], daysOfWeek }` → `mode = days_of_week` 和同一组 weekdays |
| Editor 输出映射 | `days_of_week` → `date-or-dow-list { dates: [], daysOfWeek }` |
| 日期字段 | `dates` 始终为空；禁用的 mode 不保留 draft 值 |
| Weekday code / name | 通过 `preferOffConfig.weekdays` 映射：Standing `SAT` 等 code → editor `Saturday` 等 name；confirm 时按同一配置反向映射，禁止靠字符串截断或硬编码表猜测 |
| Time Window | 保持可用；适用于 `Days of Week` 或 `Weekends` 的时间窗口继续进入 Standing payload |
| 验证 | 至少一个合法 weekday、至少一个 Tier；不调用月度 period 日期展开 |
| 编辑回显 | 已保存 weekdays 原样回显；发现非空 `dates` 时阻止更新并显示可恢复的字段级错误，不静默丢弃 |

Standing 不把 `date-or-dow-list` 转成 Current 持久化使用的 `tag-list`。复用的是 `PreferOffEditor` 的视觉与 weekday 交互，Standing adapter 负责上述双向类型映射，确保 add / edit round-trip 保持 Standing contract。

#### 2026-07-28 已确认的接口补充

现有 Standing response 没有提供 `preferOffConfig.weekdays`，前端无法在不硬编码的情况下完成
`SAT` 与 `Saturday` 的双向映射。经用户确认：

- `PbsStandingCurrentResponse` 增加只读 `preferOffConfig`。
- Standing service 复用现有字典配置加载逻辑，不新增表、不修改数据。
- 该字段只用于星期 code / name 映射，不读取 Current Days Off draft。
- Standing 保存 contract 继续使用 `date-or-dow-list`，保存逻辑与数据库结构不变。

### 5.2 Pairing

以下条件复用 `PairingPropertyConfigDialog` 中现有的专属 editor、验证器和字段顺序：

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

Standing 继续使用自身 catalog 返回的 property、action、tier 和 bid 草稿；不得从 Current Bid 页面读取临时 editor state。

Pairing editor 中按 period 查询的只读选项必须使用独立的 `referencePeriodCode`：

- Standing adapter 不得把 `STANDING` 或 `Standing Bid` 发送给机场选项和 `Time Between Flights` bounds endpoint。
- 本阶段不读取 Current draft 或 Current calendar 来推导月份。
- `referencePeriodCode` 在 Standing 下固定传 `undefined`，由现有后端按其默认参考月份解析；query key 同样使用明确的 `default` 标识，不能与字符串 `STANDING` 混用。
- 该参考月份只用于生成可选机场和数值边界，不写入 Standing payload，也不改变长期条件语义。
- reference query 失败时沿用 Current editor 的 loading / error / 禁用保存状态，不回退到硬编码选项或边界。

### 5.3 Roster / Line

以下条件复用 `LineBidDialog` 中的条件专属编辑和验证：

- `Commuter Pattern`
- `Credit Window Preference`
- `Minimum Base Layover`
- `Mixed Block Pattern`
- `Reserve Avoidance`

需要远端配置的条件继续使用现有 service：

- `Credit Window Preference`
- `Minimum Base Layover`

配置加载失败时沿用 Current editor 的持久状态和禁用保存行为，不显示原始异常。

### 5.4 Reserve

| Standing 条件 | 目标实现 |
|---|---|
| `Reserve Preference` | 复用 `ReservePreferenceDialog` / `ReservePreferenceEditor`，限制日期范围为 Whole Month / First Half / Second Half |
| `Reserve Day of Week Off` | Standing 专属适配，复用 Tier、星期选择、section 和 footer primitives |
| `Reserve Work Block Size` | Standing 专属适配，复用标准数字范围控件、section 和 footer primitives |
| `Waive to Allow Carry over to be Days Off` | Standing 专属适配，复用标准 flag / preference section 和 footer primitives |

三个没有 Current Reserve 对应弹窗的条件不得继续使用与其他条件相同的通用 `BID` 下拉框；必须按自身字段语义使用统一 primitives。

### 5.5 四个 Standing 专属条件字段契约

以下默认值和边界均以服务端 catalog 返回的 `defaultBid` 为来源。表中的当前值用于验收现有 F8 contract，组件不得再硬编码第二份业务常量。

#### `Day of Week Off`（218）

| 项目 | 规则 |
|---|---|
| 字段 | 多选 `DAYS OF WEEK` |
| 选项 | Mon–Sun，使用现有 weekday code / name 配置映射 |
| 默认值 | catalog `date-or-dow-list.daysOfWeek`；当前为 `SAT` |
| 必填 | 至少一个 weekday 与至少一个 Tier |
| Tier 默认值 | 新增时为空；编辑时回显已保存 Tier |
| Payload | `{ type: 'date-or-dow-list', dates: [], daysOfWeek }` |
| 旧数据兼容 | 已保存的 `{ type: 'select', value }` 在读取/编辑时规范化为单元素 `daysOfWeek`，不要求用户删除后重建 |
| 编辑回显 | 所有已保存 weekdays 原样多选回显；非法 code 显示字段错误并禁用更新 |

#### `Reserve Day of Week Off`（312）

| 项目 | 规则 |
|---|---|
| 字段 | 多选 `DAYS OF WEEK` |
| 选项 | Mon–Sun，使用现有 weekday code / name 配置映射 |
| 默认值 | catalog `date-or-dow-list.daysOfWeek`；当前为 `SAT` |
| 必填 | 至少一个 weekday 与至少一个 Tier |
| Tier 默认值 | 新增时为空；编辑时回显已保存 Tier |
| Payload | `{ type: 'date-or-dow-list', dates: [], daysOfWeek }`，只写 `StandingReserve` |
| 旧数据兼容 | 已保存的 `{ type: 'select', value }` 在读取/编辑时规范化为单元素 `daysOfWeek` |
| 编辑回显 | 与 218 相同；不得根据显示文案猜测 weekday |

#### `Reserve Work Block Size`（313）

| 项目 | 规则 |
|---|---|
| 字段 | `FROM` / `TO` 数字范围，使用标准 range / number primitive |
| 默认值 | catalog `stepper-range.from / to`；当前为 3 / 5 |
| 边界 | catalog `min / max`；当前为 3 / 6 |
| 必填 | From、To 与 Tier 均必填 |
| 验证 | `min ≤ from ≤ to ≤ max` |
| Tier 默认值 | 新增时为空；编辑时回显已保存 Tier |
| Payload | 原样保存 `{ type: 'stepper-range', from, to, min, max }`，只写 `StandingReserve` |
| 编辑回显 | 回显 from / to；保存记录中的边界异常时显示字段错误，不自动夹取后覆盖 |

#### `Waive to Allow Carry over to be Days Off`（314）

| 项目 | 规则 |
|---|---|
| 字段 | 无额外可编辑业务值；该 property 的存在即表示启用 waiver |
| 主体 | 使用统一 `WAIVER` section 显示固定语义 `Allow carry over to be days off`，不增加可关闭后仍允许保存的伪 switch |
| 必填 | 至少一个 Tier |
| Tier 默认值 | 新增时为空；编辑时回显已保存 Tier |
| Payload | `{ type: 'flag' }`，只写 `StandingReserve` |
| 编辑回显 | 打开编辑弹窗即显示该 waiver 语义；更新只改变 Tier，不发明 boolean 字段 |

### 5.6 十八个复用条件的可访问字段基线

下表是 Standing 与 Current 对照测试的稳定字段清单。字段文案和控件类型以现有 Current editor 为准；Standing 只覆盖标题、收藏能力和日期 capability。

| 条件 | Standing 中必须存在的字段 / 控件 |
|---|---|
| `Prefer Off` | `TIERS`、`PREFER OFF TYPE`、`Days of Week`、Mon–Sun、`Time Window`；配置可用时显示 `Weekends`；Specific Dates / Date Range 不显示 |
| `Airport Preference` | `TIERS`、`PREFERENCE`、`AIRPORT EVENT`、`AIRPORTS`；绝对日期限制不显示 |
| `Deadhead Flying` | `TIERS`、`PREFERENCE`、`DEADHEAD FLYING`、Any deadhead / Deadhead-only duty；绝对日期限制不显示 |
| `Efficient Flying First` | `TIERS`、`PREFERENCE`、Efficient flying / Inefficient flying |
| `Flight Legs per Duty` | `TIERS`、`PREFERENCE`、`DUTY MATCH`、`LEGS PER DUTY`；绝对日期限制不显示 |
| `Flight Number Preference` | `TIERS`、`PREFERENCE`、`TYPE`、`FLIGHT NUMBERS`；绝对日期限制不显示 |
| `Month-End Carryover` | `TIERS`、`PREFERENCE`、`CARRY-OUT DAYS`、operator 和 days 输入 |
| `Pairing Check-In / Check-Out Time` | `TIERS`、`PREFERENCE`、`TIME TYPE`、`TIME`、operator / from / to；绝对日期限制不显示 |
| `Pairing Length` | `TIERS`、`PREFERENCE`、minimum / maximum days；pairing start date 限制不显示 |
| `Redeye Preference` | `TIERS`、`PREFERENCE`、`REDEYE`；flight date 限制不显示 |
| `Time Between Flights` | `TIERS`、`PREFERENCE`、`MATCH`、`TIME BETWEEN FLIGHTS`、operator 和 duration |
| `Work Day Preference` | `TIERS`、`WORK DAYS & CHECK-IN WINDOW`、Mon–Sun 多选、每个已选星期对应的 Check-In 时间窗口；绝对日期限制不显示 |
| `Commuter Pattern` | `TIERS`、`WORK BLOCK`、`OFF BLOCK`、min / max days on、minimum days off；明确年月日的日期范围限制不显示 |
| `Credit Window Preference` | `TIERS`、`PREFERENCE`、More credit / Less credit、公司配置状态 |
| `Minimum Base Layover` | `TIERS`、`MINIMUM BASE LAYOVER`、HH:MM 输入、公司配置状态 |
| `Mixed Block Pattern` | Segment 列表、work / call type、date scope（只允许长期 scope）、Preference Strength、`TIERS` |
| `Reserve Avoidance` | `TIERS`、`AVOIDANCE`、If possible / No matter what |
| `Reserve Preference` | `TIERS`、`SHORT-CALL TYPE`、`DATE SCOPE`；scope 只有 Whole Month / First Half / Second Half |

## 6. 组件边界

### 6.1 Current 弹窗组件

Current 弹窗只增加向后兼容的可选配置。默认不传时，Current Bid 页面视觉和行为必须完全不变。

建议使用一份明确的 context 配置，而不是散落多个布尔值：

```text
dialogContext = current | standing
```

由 context 派生：

- header 标题和副标题。
- 是否显示 favorite。
- confirm / pending label。
- 是否允许具体日期。
- 允许的 Reserve date scope。

如果某个现有弹窗已经有清晰的可选 props，可沿用现有 props；不强制为了统一参数而重构所有 dialog。

共享弹窗的 `standing` context 还必须提供明确 capability：

- `allowedDateModes`
- `allowedReserveDateScopeModes`
- `requiresRealBidPeriod`

Current 默认值保持现状；Standing 的相对长期条件设置 `requiresRealBidPeriod = false`。不得把伪造月份或 Current active period 传给 Standing 来绕过 editor 校验。

### 6.2 Standing 编排层

Standing 页面根据 property category / code 选择对应弹窗适配器：

```text
Days Off  → DaysOff Standing adapter
Pairing   → Pairing Standing adapter
Roster    → Line Standing adapter
Reserve   → Reserve Standing adapter
```

适配器只负责：

- 将 Standing property 转成现有 editor 需要的输入。
- 注入 Standing dialog context。
- 把 editor 输出转回 Standing property。
- 调用现有 Standing add / update callback。

适配器不得包含重复的 editor JSX 或重复验证规则。

### 6.3 现有 `StandingBidDialog`

完成迁移后：

- 不再作为全部 22 个条件的统一编辑器。
- 可以保留为 4 个无直接 Current 对应条件的薄容器，前提是只承载统一 header/footer 和专属 control。
- 如果所有剩余逻辑已被更清晰的 Standing adapter 取代，则删除该通用分发逻辑。

不在本次任务中做与弹窗对齐无关的 Standing 页面重构。

## 7. 数据与保存流程

1. 用户在 Standing 页面点击条件。
2. 页面根据 property 的来源 context 和条件类型打开对应 editor。
3. editor 只维护本次弹窗的本地草稿。
4. 用户确认后，Standing adapter 生成 `RuleBidAvailableProperty` 或现有属性更新结果。
5. 页面继续调用当前 Standing add / update handler。
6. handler 只保存目标 `StandingLineholder` 或 `StandingReserve`。

复用 editor 不得改变：

- `period_code = 'STANDING'`
- `bid_context = 'StandingLineholder' | 'StandingReserve'`
- 两份独立 `draftVersion`
- 现有 409 冲突恢复流程

## 8. Footer 与操作状态

Standing footer 固定为：

- `CANCEL`
- `ADD BID` 或 `UPDATE BID`

要求：

- 不显示 `SAVE FAVORITE`。
- Tier 或必填字段未完成时，confirm 禁用。
- pending 时关闭、取消和确认均进入现有安全状态。
- 不允许通过隐藏字段或默认 Current 日期绕过验证。

## 9. 错误处理与可访问性

- 字段级错误继续与对应控件关联，并提供可访问描述。
- 配置加载失败使用条件弹窗内的持久错误状态和恢复信息，不散落原始红字。
- 新增或更新请求失败继续使用项目统一 message/toast。
- 不展示 Axios、RPC、数据库或堆栈信息。
- 标题、Tier、segmented control、switch、日期和数字控件沿用现有 accessible name。
- Standing 标题覆盖不得破坏 dialog 的 `aria-label`；建议使用 `Configure Standing Bid for <Property Name>`。

## 10. 验收标准

1. 22 个 Standing 条件弹窗的主标题均为 `Configure Standing Bid`，副标题为具体条件名称。
2. 18 个有 Current 对应实现的条件复用现有专属 editor，不再使用通用 `BID` 控件代替。
3. Pairing 条件的字段顺序、控件类型、选择态、间距和验证与 Current Bid 对应弹窗一致。
4. Roster 条件的字段和验证与 Current Line Bid 对应弹窗一致。
5. `Prefer Off` 使用现有 Days Off editor 的长期星期能力。
6. `Reserve Preference` 使用现有 Reserve editor，且只允许 Whole Month / First Half / Second Half。
7. 4 个无直接 Current 对应条件使用统一 primitives 完成专属适配。
8. Standing 弹窗不显示 `SAVE FAVORITE`。
9. Standing 中需要明确 `YYYY-MM-DD` 的控件不显示，payload 不包含具体日期。
10. Standing 继续保留星期多选、每周时间窗口、纯时间、duration、Weekends 和相对月份范围。
11. `Day of Week Off` 与 `Reserve Day of Week Off` 均可多选，并兼容旧的单选保存数据。
12. 新增和编辑继续只写正确的 Standing context。
13. Current Bid、Line、Days Off 和 Reserve 弹窗在默认模式下无视觉和行为回归。
14. 所有弹窗在 1280、1366 和 1920 宽度下无裁切、溢出或 footer 遮挡。
15. Standing 可以读取共享 reference / config query，但不会读取、写入或失效 Current draft、favorite 或 period calendar cache。
16. `periodCode = 'STANDING'` 下的相对范围不依赖真实月份即可通过合法性验证。

## 11. 验证策略

### 11.1 Focused Vitest

- Standing dialog router 对每个 category / property code 选择正确 adapter。
- Standing 标题和副标题正确。
- favorite 按钮不存在。
- Pairing、Line、Days Off、Reserve editor 的初始值、必填状态和输出映射正确。
- 具体年月日入口不渲染，confirm 输出不包含绝对日期。
- `Day of Week Off`、`Reserve Day of Week Off` 和 `Work Day Preference` 支持星期多选。
- `Work Day Preference` 保留每个已选星期的 Check-In 时间窗口。
- 旧的单选 weekday 保存数据可回显并更新为多选 contract。
- Reserve date scope 只包含允许的三种模式。
- add / update 继续保留正确 context、tier 和 bid value。
- Current dialog 不传 Standing context 时，原测试行为保持不变。
- 逐条件字段契约断言至少覆盖：标题、Tier 初始态、可访问字段、默认值来源、必填状态、输出 bid type 和编辑回显。
- 共享 reference / config query 可用，Current draft / favorite / calendar query 不被读取或失效。
- `periodCode = 'STANDING'` 的 relative mode 可以保存；absolute date mode 无法输入和提交。

### 11.2 Playwright

在真实 Portal 中逐项覆盖 22 个 Standing 条件：

- 每个弹窗显示 Standing 主标题和正确副标题。
- 18 个对应条件与 Current Bid / Reserve 的字段结构一致。
- 关键条件完成真实交互和保存：
  - `Prefer Off`
  - `Pairing Check-In / Check-Out Time`
  - `Flight Legs per Duty`
  - `Month-End Carryover`
  - `Commuter Pattern`
  - `Reserve Preference`
- 4 个 Standing 专属条件分别验证专属字段。
- 所有弹窗无收藏按钮。
- 具体年月日入口不可见。
- 星期多选和星期对应时间窗口可正常填写、保存、编辑回显。
- Lineholder 和 Reserve 保存分别命中正确 Standing context。
- 导航到 Current Bid / Reserve 后确认其弹窗没有被 Standing 变体污染。
- Pairing 共享 editor 变化后，补跑 Search Pairings 的相同条件配置和回显路径，确认 Current 与 Standing context 参数不会进入 Search Pairings。

### 11.3 交付门禁

- Standing focused Vitest：PASS
- 受影响的 Pairing / Line / Days Off / Reserve dialog tests：PASS
- `pbs-portal` 全量 Vitest：PASS
- Standing Playwright：PASS
- Current Bid / Reserve 关键弹窗 Playwright 回归：PASS
- Search Pairings focused tests 与关键 editor Playwright 回归：PASS
- `npm run check:ui`：硬违规 0
- `npm --prefix pbs-portal run lint`：PASS
- `npm --prefix pbs-portal run build`：PASS
- `git diff --check`：PASS

## 12. 非目标

- 不修改 Standing 页面列表、分类和双 context 保存架构。
- 除已确认给 `PbsStandingCurrentResponse` 增加只读 `preferOffConfig` 外，不修改其他 pbs-server contract、数据库 schema 或 solver fallback。
- 不给 Standing 增加收藏。
- 不让 Standing 支持具体日期。
- 不改变 Current Bid / Reserve 的默认产品行为。
- 不处理与这 22 个条件无关的弹窗重构。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Standing adapter 与 Current 共享弹窗参数会集中触达同一批 dialog 和测试文件，条件间看似可拆分，但共享组件和 mapper 边界紧密，并行编辑容易产生冲突或不一致。
- Suggested split: 单人按 Days Off → Pairing → Roster → Reserve 顺序迁移，再统一补 Playwright 和 QA。
- Write boundaries: `pbs-portal/src/features/standing-bid/**` 为主；只对现有 Days Off / Pairing / Line / Reserve dialog 增加最小、向后兼容的 Standing 参数；测试和 QA 限制在对应范围。
- Conflict risk: Medium。最大风险是共享 dialog 默认行为回归，以及 Standing 日期限制被 Current editor 默认值绕过。
- Execution gate: 本设计文档经评审并由用户明确批准后，才编写实施计划和修改代码。
