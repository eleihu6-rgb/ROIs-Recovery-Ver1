# PBS Standing Bid 可复用条件集合扩展设计

## 背景

当前 `Standing Bid` 页面已经可以进入真实页面并保存长期模板，但现有条件目录仍是保守 Phase A 白名单。

用户反馈的核心问题是：如果 `Standing Bid` 被理解为“默认模板 / 长期备用模板”，它不应该只展示少量 AA Standing 专属条件，而应该能覆盖 `Days Off`、`Pairing`、`Line`、`Reserve` 中所有可复用的条件。当前页面看起来更像 demo，不像真正可用的默认模板。

本 spec 重新定义 Standing Bid 的 property catalog 口径：**Standing Bid 是长期可复用条件集合，不是只展示 AA Standing 专属的三四个条件；但它也不能无脑复制所有当月条件，凡是绑定具体 bid month、具体日期、具体 pairing occurrence 的条件必须被排除或转换为 Standing 专用输入形态。**

## 当前实现事实

- Standing Bid API 使用独立 route：`GET/PUT /api/standing-bids/current`。
- Standing 数据使用 `pbs_bid` 主链，`period_code='STANDING'`，`bid_context='StandingLineholder' / 'StandingReserve'`。
- 当前 catalog 由 contract 白名单与数据库 `pbs_bid_property` 交集决定：
  - contract：`packages/contracts/pbs-standing-bids.js`
  - DB 开关：`pbs_bid_property.is_visible_in_portal=1` 且 `is_active=1`
- 当前 Lineholder Standing 只包含少量 Days Off / Pairing / Line 条件。
- 当前 Reserve Standing 只包含：
  - `312 Reserve Day of Week Off`
  - `313 Reserve Work Block Size`
  - `314 Waive to Allow Carry over to be Days Off`

## 目标

1. 将 Standing Bid 条件目录调整为“长期可复用条件集合”。
2. Lineholder Standing Bid 覆盖可复用的 `Days Off + Pairing + Line` 条件。
3. Reserve Standing Bid 覆盖可复用的 `Reserve` 条件，并保留 AA Standing Reserve 专属条件。
4. 不允许 Standing Bid 保存绝对日期、当前 bid period、具体 pairing occurrence 等月度绑定数据。
5. 前端不硬编码注入 property，仍以后端 catalog + 数据库可见开关为准。
6. 页面体验上让用户明确知道：这是长期模板，不是当前月申请，也不会自动覆盖 current monthly bid。

## 非目标

- 不实现 engine fallback，即“不填当月 bid 时自动使用 Standing Bid”仍不在本轮。
- 不实现 `Import from Current Bid` / `Export to Current Bid`。
- 不修改 submit / lock / award 流程。
- 不启用所有隐藏 AA property。AA property 是否展示仍受数据库 `is_visible_in_portal` 控制。
- 不把具体日期型 current bid 原样搬进 Standing。
- 不把 Lineholder 和 Reserve 两类 Standing 混成一个无边界列表。

## 核心口径

### 1. 页面是一个长期模板页，但内部仍按业务身份分组

Standing Bid 页面整体是长期模板入口，但内容不应该混成一个大杂烩：

- `Lineholder Standing Bid`：用于 lineholder 场景，包含可复用的 `Days Off / Pairing / Line` 条件。
- `Reserve Standing Bid`：用于 reserve 场景，包含可复用的 `Reserve` 条件和 reserve standing 专属条件。

这样既符合“默认模板集合”的用户心智，也避免把 reserve 条件混进 lineholder 模板。

### 2. 可复用条件判定规则

一个 property 能进入 Standing Bid，必须满足：

1. 不依赖当前 `pbs_period_id`。
2. 不保存绝对日期，例如 `2026-06-05`。
3. 不保存具体 pairing occurrence / pairing run。
4. 不要求当前月份 pairing pool 才能解释。
5. 输入值能跨月复用，例如 weekday、time、duration、airport、credit、numeric range、relative date scope。
6. 后端能用同一套序列化 / 反序列化 / summary 回显。

### 3. Date / Day 类条件的 Standing 形态

`Date / Day` 类型不能在 Standing 中直接开放 date 输入。

Standing 中应只允许：

- `Day of Week`，例如 `Mon / Tue / Sat / Sun`
- `Weekends` 这类跨月稳定语义，如果当前控件支持
- 相对月份范围，例如 `whole month / first half / second half`

Standing 中禁止：

- 具体日期
- 具体日期区间
- 当前 period 的日期 picker
- Pairing occurrence by date

## 方案对比

### 方案 A：把所有当前页面 property 原样复制到 Standing

优点：

- 实现最快。
- 页面看起来条件最多。

缺点：

- 会把 `Pairing Number`、具体日期、date range、当前月 reserve date 等不可复用内容带入长期模板。
- 用户可能保存一个下个月完全失效的模板。
- 后端只能在保存时报错，体验很差。

结论：不采用。

### 方案 B：按“可复用”扩展 Standing catalog，并为 date/day 条件提供 Standing 输入适配（推荐）

优点：

- 符合用户“默认模板集合”的理解。
- 避免月度绑定数据污染长期模板。
- 能复用现有 `Days Off / Pairing / Line / Reserve` property，但通过 Standing 上下文限制输入。
- 后续 Phase B/C 做 current bid import/export 或 engine fallback 时，数据语义更干净。

缺点：

- 需要补 contract、后端 validation、前端控件上下文、测试和 migration。
- 部分 current property 不能直接复用，需要 Standing 专用输入形态。

结论：采用。

### 方案 C：Standing Bid 不直接编辑条件，只做 current bid 模板导入导出

优点：

- 能减少 Standing 页面独立复杂度。
- 更像“复制一份当月申请作为模板”。

缺点：

- 用户当前需求是直接在 Standing 页面维护默认模板。
- 仍绕不开日期和 pairing occurrence 的长期语义转换。
- 会把 Phase A 扩成 import/export 工作流，不利于快速修正当前页面问题。

结论：不采用。

## 推荐设计

### Lineholder Standing Bid catalog

Lineholder Standing Bid 应按四组展示：

1. `Days Off`
2. `Pairing`
3. `Line`
4. `Standing`

#### Days Off

建议进入 Standing 的条件：

| Code | Property | Standing 处理 |
|---:|---|---|
| 201 | Prefer Off | 允许 weekday / weekend 等长期语义；禁止具体日期 |
| 202 | Max Consecutive Days On | 直接复用 |
| 203 | Min Consecutive Days Off | 直接复用 |
| 205 | Days Off / Days On Pattern | 直接复用 |
| 206 | Employee Schedule Preference | 直接复用，但不得依赖当前 period 日期 |
| 218 | Day of Week Off | Standing 专属，直接保留 |

暂不进入 Standing：

| Code | Property | 原因 |
|---:|---|---|
| 204 | Min Consecutive Days Off In Window | 当前是具体 date range，需要另行定义相对窗口后再开放 |
| 211-217 | AA hidden Days Off properties | 当前数据库默认隐藏，不能因 Standing 扩展绕过可见开关 |

#### Pairing

建议进入 Standing 的条件：

| Code | Property | Standing 处理 |
|---:|---|---|
| 101 | Any Landing In Airport | 直接复用 |
| 103 | Pairing Check-In Time | 直接复用 |
| 104 | Any/Every Layover In Airport | 直接复用 |
| 105 | Pairing Total Credit | 直接复用 |
| 106 | Departure Date / Day | 只允许 day-of-week，不允许具体日期 |
| 107 | Any/Every Duty Legs | 直接复用 |
| 108 | Total Legs In Pairing | 直接复用 |
| 109 | Average Daily Credit | 直接复用 |
| 110 | Any/Every Duty On Date / Day | 只允许 day-of-week，不允许具体日期 |
| 111 | Pairing Check-Out Time | 直接复用 |
| 112 | Pairing Length | 直接复用 |
| 113 | TAFB | 直接复用 |
| 114 | Any/Every Enroute Check-In Time | 直接复用 |
| 115 | Any/Every Leg With Employee Number | 保持当前已支持行为；不新增 Buddy / Avoid Person 语义 |
| 116 | Any Flight Number | 直接复用 |
| 117 | Any Leg Is Redeye | 直接复用 |
| 118 | Any/Every Duty Duration | 直接复用 |
| 119 | Any/Every Layover Duration | 直接复用 |
| 120 | Any Duty On Time | 直接复用 |
| 121 | Average Daily Block Time | 直接复用 |
| 122 | Deadhead Legs | 直接复用 |
| 123 | Any/Every Layover On Date / Day | 只允许 day-of-week，不允许具体日期 |
| 124 | Total Legs In First Duty | 直接复用 |
| 125 | Credit Per Time Away From Base | 直接复用 |
| 126 | Any/Every Enroute Check-Out Time | 直接复用 |
| 127 | Pairing Total Block Time | 直接复用 |
| 128 | Deadhead Day | 直接复用 |
| 129 | Any/Every Sit Length | 直接复用 |
| 130 | Total Legs In Last Duty | 直接复用 |
| 163 | Carry-Out Days | 直接复用 |
| 164 | Departure Time | 直接复用 |
| 165 | Work Start Station | 直接复用 |
| 166 | Any/Every Enroute Check-In Date / Day | 只允许 day-of-week，不允许具体日期 |
| 167 | Any/Every Enroute Check-Out Date / Day | 只允许 day-of-week，不允许具体日期 |

暂不进入 Standing：

| Code | Property | 原因 |
|---:|---|---|
| 102 | Pairing Number | 绑定具体 pairing pool / pairing label，跨月不可复用 |
| 132 / 139 / 140 / 152 等 `on Date` 类 AA property | 含具体日期，且当前数据库默认隐藏 |
| 131-162 中当前隐藏的 AA property | 默认不绕过数据库可见开关；后续可单独开启并按 Standing 规则校验 |

#### Line

建议进入 Standing 的条件：

| Code | Property | Standing 处理 |
|---:|---|---|
| 401 | Max Credit Window | 直接复用 |
| 402 | Min Credit Window | 直接复用 |
| 403 | Clear Schedule and Start Next Bid Group | 直接复用，保持 Line 页既有语义 |
| 404 | No Same Day Pairings | 直接复用 |
| 405 | Waive No Same Day Duty Starts | 直接复用 |
| 406 | Forget Line | 直接复用 |
| 407 | Min Base Layover | 直接复用 |
| 408 | Commuter Pattern | 直接复用 |
| 409 | Most Flying In Least Working Days (Configured) | 直接复用 |
| 410 | Reserve / Flying Date Pattern | 只允许 relative date scope，例如 whole month / first half / second half |
| 427 | Reserve | 直接复用 |
| 428 | Most Flying In Least Working Days | 直接复用 |

暂不进入 Standing：

| Code | Property | 原因 |
|---:|---|---|
| 411-426 中当前隐藏的 AA Line properties | 当前数据库默认隐藏，不能绕过可见开关；若后续打开，需要逐项确认 Standing 输入限制 |
| 418 / 420 等具体 on Date AA property | 即使后续显示，也必须在 Standing 中禁用具体日期 |

### Reserve Standing Bid catalog

Reserve Standing Bid 应按两组展示：

1. `Reserve`
2. `Standing`

#### Reserve

建议进入 Standing 的条件：

| Code | Property | Standing 处理 |
|---:|---|---|
| 301 | Short Call Type | 允许 call type；date scope 只允许 whole month / first half / second half |

暂不直接进入 Standing：

| Code | Property | 原因 / 替代 |
|---:|---|---|
| 302 | Reserve Day On | 当前语义是具体日期 reserve day；Standing 中不能原样开放。若业务需要“星期几做 reserve day”，应新增或确认 Standing 专用 property |
| 311 | Reserve Prefer Off | 当前 Reserve 页语义偏当前月日期；Standing 中使用 `312 Reserve Day of Week Off` 表达长期星期休息偏好 |

#### Standing

保留当前 Standing Reserve 专属条件：

| Code | Property | Standing 处理 |
|---:|---|---|
| 312 | Reserve Day of Week Off | 直接复用 |
| 313 | Reserve Work Block Size | 直接复用 |
| 314 | Waive to Allow Carry over to be Days Off | 直接复用 |

## 数据与后端设计

### Contract

调整 `packages/contracts/pbs-standing-bids.js`：

- 不再只维护少量手写白名单。
- 增加 Standing catalog builder / adapter，明确从现有 catalog 中挑选可复用 property。
- 对 date/day property 在 Standing 下生成 Standing 专用 `defaultBid`：
  - `date-or-dow-list` 只开放 `daysOfWeek`
  - 禁止预置任何具体 `dates`
- 对 reserve date scope property 在 Standing 下只开放 relative scope。

### 数据库

需要新增 migration / seed 更新：

- 确保进入 Standing catalog 的 property 在 `pbs_bid_property` 中存在。
- 不强行把当前隐藏的 AA property 改成 visible。
- 如果 Standing 需要新增专属 property，例如未来的 `Reserve Day of Week On`，必须使用新 code，不能改变现有 `302 Reserve Day On` 的月度语义。
- migration 执行后必须同步当前远端 `f8_pbs` 库，避免部署后页面 catalog 为空或缺项。

### 后端 validation

后端保存 Standing 时必须继续做硬校验：

- 拒绝任何具体 date。
- 拒绝 pairing occurrence / pairing id list。
- 拒绝不在 Standing catalog 中的 property code。
- 拒绝当前 period 依赖字段。
- `date-or-dow-list` 中 `dates.length > 0` 必须返回 400。
- reserve date scope 只能使用 relative scope。

### API 返回

`GET /api/standing-bids/current` 应返回：

- `lineholderDraft`
- `reserveDraft`
- `propertyCatalog.lineholder`
- `propertyCatalog.reserve`
- `recommendedPropertyCodes`
- `draftVersion`

前端只消费后端返回的 catalog，不自行拼接 property。

## 前端设计

### 页面结构

保持当前两栏结构和 PBS Portal 工作台自适应规范：

- 左侧：Standing Bid 说明与当前模式概览。
- 右侧：Existing rules + Add rules。

需要优化文案，降低误解：

- 页面标题仍为 `Standing Bid`。
- 副标题建议：`Long-term reusable bid template. It does not replace your current monthly bid unless fallback is enabled later.`
- `Lineholder Standing Bid` 说明应提到包含 `Days Off / Pairing / Line`。
- `Reserve Standing Bid` 说明应提到包含 `Reserve`。

### Add rules 分类

Lineholder 模式显示：

- `Days Off`
- `Pairing`
- `Line`
- `Standing`

Reserve 模式显示：

- `Reserve`
- `Standing`

搜索框应搜索当前模式全部可见分组。

### Standing 输入上下文

新增或扩展通用 rule bid 控件时，需要传入 `context='standing'` 或同等配置：

- date picker 不出现。
- date tag 输入不出现。
- pairing occurrence 选择入口不出现。
- date/day 类条件只显示 weekday selector。
- reserve date scope 只显示 relative scope。

不能通过“前端隐藏，后端不校验”完成；前后端必须双重约束。

## 测试要求

### 后端测试

需要覆盖：

1. `GET /api/standing-bids/current` 返回扩展后的 Lineholder catalog。
2. `GET /api/standing-bids/current` 返回扩展后的 Reserve catalog。
3. 保存可复用 Days Off / Pairing / Line / Reserve 条件成功。
4. 保存包含具体日期的 Standing bid 返回 400。
5. 保存 `Pairing Number` / pairing occurrence 类条件返回 400。
6. 保存 reserve relative date scope 成功，保存具体 date range 失败。
7. 已保存 Standing bid 能正确 reload、summary、edit、delete。

### 前端单元测试

需要覆盖：

1. Lineholder mode 展示 `Days Off / Pairing / Line / Standing` 分组。
2. Reserve mode 展示 `Reserve / Standing` 分组。
3. date/day 条件在 Standing context 下只显示 weekday 输入。
4. `Pairing Number` 不出现在 Standing add list。
5. Existing table 中新增条件 summary 可读。

### Playwright

需要新增或更新真实 UI E2E：

1. 登录 PBS Portal。
2. 进入 `/standing-bid`。
3. 在 Lineholder 模式添加一个 Days Off 条件、一个 Pairing 条件、一个 Line 条件并保存。
4. 刷新页面后确认三类条件仍存在。
5. 切换 Reserve 模式，添加 `Short Call Type` 或 Standing Reserve 专属条件并保存。
6. 验证 Add list 中不会出现 `Pairing Number`。
7. 验证 date/day 条件没有具体 date picker。

### QA 测试案例

需要新增：

`docs/test-cases/pbs/standing-bid/<YYYY-MM-DD>-standing-bid-reusable-property-catalog.md`

内容覆盖：

- 前置数据和 migration 要求。
- Lineholder 可添加分类。
- Reserve 可添加分类。
- 不可添加具体日期 / pairing occurrence。
- 保存、刷新、编辑、删除。
- 当前月 Current Bid 不被污染。

## 兼容与风险

### 风险 1：用户把 Standing Bid 误认为已经参与当月申请

处理：

- 页面文案明确“long-term reusable template”。
- 不改变 current bid submit / award。
- 不在 Dashboard 或 Tier 中宣称 Standing 已参与 fallback。

### 风险 2：date/day 条件 UI 复用不当导致仍能输入具体日期

处理：

- 前端通过 Standing context 隐藏 date 输入。
- 后端通过 validation 拒绝 date。
- Playwright 覆盖真实 UI。

### 风险 3：数据库可见开关与 contract 不一致

处理：

- 后端 catalog 继续使用 contract whitelist ∩ DB active/visible。
- migration 后必须同步远端 `f8_pbs`。
- 页面空 catalog 要显示可诊断的空态，而不是像 demo。

### 风险 4：Reserve `302/311` 是否应有 Standing 等价语义

处理：

- 本轮不把 `302 Reserve Day On` / `311 Reserve Prefer Off` 原样搬入 Standing。
- 使用 `312 Reserve Day of Week Off` 承接长期休息星期偏好。
- 如业务确认需要“Reserve Day of Week On”，另增 Standing 专用 property，不覆盖 `302`。

## 验收标准

1. Standing Bid 页面不再只显示少量专属条件。
2. Lineholder Standing 能看到可复用的 `Days Off / Pairing / Line / Standing` 条件。
3. Reserve Standing 能看到可复用的 `Reserve / Standing` 条件。
4. `Pairing Number`、具体日期、具体 pairing occurrence 不会进入 Standing。
5. date/day 类条件在 Standing 中只能选 weekday。
6. 保存后刷新页面，Standing 条件不丢失。
7. Current monthly bid 数据不被 Standing 修改污染。
8. 自动化测试、Playwright、QA 文档齐全。
9. 远端 `f8_pbs` 数据库同步完成后，SIT / 本地连接同一库时 catalog 一致。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 本任务跨 contract、后端 service / validation、前端页面控件、数据库 migration、测试与 QA 文档，存在可拆分工作面。
- Suggested split:
  - Agent A：contract + 后端 catalog / validation / route tests
  - Agent B：pbs-portal Standing UI + input context + frontend tests
  - Agent C：Playwright + QA test case + remote DB verification script
- Write boundaries:
  - Agent A 只写 `packages/contracts`、`pbs-server`、`sql`
  - Agent B 只写 `pbs-portal`
  - Agent C 只写 `e2e`、`docs/test-cases`
- Conflict risk: Medium。contract 类型会被前后端同时依赖，需先由 Agent A 完成或由主 agent 统一集成。
- Execution gate: 只有用户确认本 spec 后才进入实现；实现前需要先明确是否采用多 agent，并由主 agent 统一集成和验证。

## 实施顺序建议

1. 调整 Standing contract，生成扩展 catalog。
2. 更新数据库 migration / seed，并同步远端 `f8_pbs`。
3. 更新后端 catalog resolution 和 validation。
4. 更新前端 Standing add list 分组与 Standing input context。
5. 更新 summary / existing table 回显。
6. 补后端、前端、Playwright、QA 测试。
7. 跑验证并提交。

## 待用户确认

本 spec 推荐采用“可复用条件集合”方案，而不是原样复制所有当前月条件。

需要确认的关键点：

1. `Pairing Number` 不进入 Standing，因为它绑定具体月份 pairing pool。
2. `Reserve Day On / Reserve Prefer Off` 不原样进入 Standing，使用 Standing 专属 weekday 语义承接。
3. 当前隐藏 AA properties 不因本次 Standing 扩展自动打开。

确认后再进入实现。
