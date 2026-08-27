# PBS Reserve Legacy-first Bidding 设计

日期：2026-05-28  
状态：待用户确认  
范围：Reserve 竞标模块设计；本文件只定义需求和方案，不包含实现改动。

## 背景

本轮只读核对了以下资料：

- `init-docs/AA-Flight-Attendant-PBS-Guide_10JAN19.pdf`
- `init-docs/N-PBS 24.7 Bidders Guide.pdf`
- `init-docs/PBS 智能排班竞标系统需求规格书.md`
- `init-docs/crew_bids_reference-2026-03-16-072929.md`
- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
- `sql/seed/10-pbs-bid-property.sql`
- `pbs-portal/src/features/reserve/*`

当前项目的 `/reserve` 页面还是早期壳页面：有 7 层 heatmap、月历、每日数字和 `ADD BID` 按钮，但没有真实 Reserve bid 编辑、保存、后端 SQL 或业务校验。

现有 seed 中的 Reserve 属性为：

```text
301 Prefer Reserve On Date
302 Prefer Reserve Day of Week
```

通过 `git blame` 确认，这两项不是近期开发 Pairing / Days Off / Line 时改乱的，而是 `sql/seed/10-pbs-bid-property.sql` 初次进入仓库时就这样写入，来源为 `88f598e feat: P0-P3 全模块开发完成`。仓库历史里没有出现过旧库语义的 `Short Call Type` 或 `Reserve Day On` seed 定义。

## 核心冲突

AA 文档和旧库对 Reserve 的日期 bid 方向不同。

AA 文档模式：

- Reserve 月度 bid 的核心是 `Prefer Off`。
- 用户选择“我想哪天休息”。
- 日历上每日数字代表公司预计需要的 reserve 人数，帮助用户判断哪天请假更难。
- Reserve 自己有 7 层 bid。
- Reserve scheduling pattern 必须满足：
  - 连续待命 3 到 6 天。
  - 连续休息 2 到 8 天。
- 每层最多请求 12 个 day off。
- `Waive to Allow Carry over to be Days Off` 必须在 Layer 1，之后层级继承。

旧库模式：

- Reserve 属性只有两个：
  - `301 Short Call Type`
  - `302 Reserve Day On`
- `301 Short Call Type` 是选择备勤叫班类型，旧库 enum 为：
  - `CRAM`
  - `CRPM`
  - `PRAM`
  - `PRMM`
  - `PRPM`
  - `RESA`
  - `RESB`
- `302 Reserve Day On` 是选择“我想哪些日期上 reserve / on duty”。
- 旧库样本中 `301` 使用量很高：408 条 bid，233 个 crew。
- 旧库样本中 `302` 使用量较低：16 条 bid，12 个 crew。

大白话：

```text
AA：用户选想休息的天。
旧库：用户选想备勤的天，或选想要的 reserve call type。
```

因此不能把 AA 的 `Prefer Off` 和旧库的 `Reserve Day On` 合并成同一个条件，否则同一个日期点击会同时代表“想休息”和“想备勤”，语义相反。

## 目标

1. Reserve 第一阶段以旧库为主，恢复 `301/302` 的旧库语义。
2. Reserve 支持和 Pairing / Days Off / Line 类似的 Tier 分层编辑。
3. Reserve 页面默认进入 Legacy Reserve Mode。
4. Legacy 模式支持：
   - `301 Short Call Type`
   - `302 Reserve Day On`
5. AA 模式保留为独立模式，不占用 `301/302`：
   - 日期点击表示 `Prefer Off`
   - 后续支持 `Reserve Day of Week Off`
   - 后续支持 `Reserve Work Block Size`
   - 后续支持 `Waive to Allow Carry over to be Days Off`
6. 两种模式共用 Reserve Coverage 日历数据。
7. 页面明确展示每日：
   - 要 reserve / 要飞人数
   - 可请假人数
8. 第一阶段 coverage 数据直接落数据库，用 seed / data-fix 写入一批固定数据；后续对接管理端配置接口。

## 不做范围

- 不实现最终 Reserve award engine。
- 不实现管理端配置页面。
- 不实现完整 AA Reserve pattern 生成算法。
- 不把 AA `Prefer Off` 强行映射为旧库 `302 Reserve Day On`。
- 不让旧库 `301/302` 继续使用当前错误 seed 语义。
- 不把 Reserve 页面做成只读 mock。

## 推荐方案

采用 **Legacy-first Reserve Bidding**。

默认模式：

```text
Legacy Reserve Mode
```

页面仍然提供 7 个 Tier。用户在当前 Tier 中添加 Reserve 条件。

Legacy 模式下：

- `Short Call Type` 通过下拉或多选控件填写。
- `Reserve Day On` 通过月历点选日期填写。
- 点日期的默认语义是“我想这天备勤 / on reserve”。

AA 模式下：

- 点日期的语义是“我想这天休息 / Prefer Off”。
- AA 的 `Prefer Off`、`Reserve Day of Week Off`、`Reserve Work Block Size`、carry-over waiver 使用独立属性或独立 Reserve bid 类型，不抢 `301/302`。

两种模式都读取同一份 coverage 数据，只是解释方向不同：

- Legacy 模式：用于判断某天是否适合请求上 reserve。
- AA 模式：用于判断某天请假是否困难。

## 方案比较

### 方案 A：只恢复 301/302，不做双模式

优点：

- 改动最小。
- 能快速修正旧库属性。

缺点：

- AA 文档里的 Reserve Prefer Off 无处表达。
- 当前日历上的每日 reserve 人数无法形成完整业务。
- 后续再补 AA 模式时容易继续语义混乱。

结论：不推荐作为完整方案。

### 方案 B：AA 为主，旧库属性另放兼容入口

优点：

- 符合 AA 文档。
- Reserve 日历数字和 Prefer Off 的关系更直接。

缺点：

- 用户已明确当前阶段旧库为主。
- 旧库 `301/302` 是真实历史 bid library，对数据导入和兼容更关键。
- 容易让旧库 `Reserve Day On` 继续被误解成 `Prefer Off`。

结论：不采用。

### 方案 C：旧库为主，AA 作为独立模式扩展

优点：

- 修正 `301/302` 历史遗留错误。
- 保留旧库真实 bid 数据兼容性。
- AA 和旧库日期语义分开，不互相污染。
- Coverage 数据可以统一，后续接管理端也不需要重做页面底座。
- Reserve 仍保持 Tier 分层，和现有 PBS 工作台模型一致。

缺点：

- 第一阶段需要明确 mode、property、coverage 三层边界。
- 前端 Reserve 页面需要从 mock 壳升级为真实编辑页。
- 后端需要新增 Reserve draft/API/校验，而不是只改 seed。

结论：推荐。

## 数据设计

### Bid Property

恢复旧库语义：

```text
301 Reserve / Short Call Type
302 Reserve / Reserve Day On
```

`301 Short Call Type`：

```json
{
  "type": "enum",
  "label": "Short Call Type",
  "options": ["CRAM", "CRPM", "PRAM", "PRMM", "PRPM", "RESA", "RESB"]
}
```

保存语义：

```text
property_code = 301
operator = In 或 null，需按现有 rule-bid 保存模型统一
param_a = call type，多个值时按现有多值格式保存
```

`302 Reserve Day On`：

```json
{
  "type": "date",
  "format": "MM/DD/YYYY",
  "label": "Dates",
  "multi": true
}
```

保存语义：

```text
property_code = 302
operator = In 或 null，需按现有 rule-bid 保存模型统一
param_a = 日期列表
```

### Reserve Coverage

新增或预留 Reserve coverage 数据模型，用于日历每日数字。

建议字段：

```text
period_code
base_code
date
required_reserve_count
available_off_count
source_type
updated_at
```

字段含义：

- `required_reserve_count`：当天公司需要多少 reserve / 要飞 / 可用人员。
- `available_off_count`：当天可批准休息名额，或管理端计算出的请假空间。
- `source_type`：`seed`、`mock`、`admin`、`import` 等。

第一阶段数据来源：

- 直接使用数据库数据。
- 通过 seed / data-fix 固定写入一个或多个 bid period 的 coverage 数据。
- 前端禁止硬编码 coverage 数字。
- 后端禁止在 service 里临时拼 mock coverage 数据。

这样后面对接管理端接口时，只需要把管理端写入同一张 coverage 表或同一套数据模型，Reserve Portal 的读取链路不需要重做。

## API 设计

第一阶段需要新增 Reserve 相关 API，或复用现有 lineholder draft 基础能力后加 Reserve service 封装。推荐新增语义清晰的 Reserve 接口。

建议接口：

```text
GET /api/reserve/current
GET /api/reserve/coverage/current
POST /api/reserve/bids
PATCH /api/reserve/bids/:id
DELETE /api/reserve/bids/:id
```

`GET /api/reserve/current` 返回：

```text
current mode
current tier
7 tier summaries
reserve bid groups
supported property catalog
draft version
```

`GET /api/reserve/coverage/current` 返回：

```text
period
base
daily coverage rows
warnings
```

写接口需要保持现有 draft version / stale write 保护思路，避免前端旧版本覆盖新版本。

### 性能要求

Reserve 页面首屏应避免多次串行请求。推荐数据读取方式：

- `GET /api/reserve/current` 返回当前 draft、Tier bid 摘要、可用 Reserve property catalog。
- `GET /api/reserve/coverage/current` 返回当前 bid period 的每日 coverage。
- 两个接口可由前端并行请求。

后端查询要求：

- coverage 查询必须按 `period_code + base_code` 命中索引。
- bid 查询必须按当前 crew、period、bid type / tier 范围过滤，禁止全量扫描后在应用层筛选。
- property catalog 可复用现有缓存策略；如果新增 Reserve catalog helper，应保持只读缓存，不要每次请求重复查询静态 seed 数据。
- 列表接口只返回 Reserve 页面需要的字段，不返回大对象或无关 pairing 明细。

## 前端设计

当前 `pbs-portal/src/features/reserve` 需要从展示壳升级为真实 Reserve 工作台。

### 前端模块化要求

Reserve 前端不能把页面、数据请求、表单、日历、摘要和保存逻辑堆在一个文件里。建议拆分：

```text
pbs-portal/src/features/reserve/
  api/
    reserve-api.ts
  components/
    reserve-mode-toggle.tsx
    reserve-tier-selector.tsx
    reserve-coverage-calendar.tsx
    reserve-bid-list.tsx
    reserve-bid-editor.tsx
    short-call-type-field.tsx
    reserve-day-on-field.tsx
  hooks/
    use-reserve-current.ts
    use-reserve-coverage.ts
  utils/
    reserve-bid-formatters.ts
    reserve-date-utils.ts
  types.ts
```

实施时应优先复用现有共享组件，例如 month calendar、button、dialog、rule bid field 风格；只有 Reserve 语义独有的控件才放到 `features/reserve` 内。

组件边界要求：

- 页面组件只负责组装布局和传递状态。
- API hook 只负责请求、缓存、错误状态，不做 UI 文案拼接。
- editor 只负责表单状态和提交。
- formatter / mapper 负责 bid value 与展示摘要转换。
- calendar 只负责 coverage 展示和日期选择，不直接写后端。

### 页面结构

建议页面区域：

```text
Reserve mode switch / indicator
Tier selector
Reserve bid list / tier heatmap
Coverage calendar
Add bid editor
Bid detail / delete / edit actions
```

默认模式：

```text
Legacy Reserve
```

模式切换：

- `Legacy Reserve`
- `AA Prefer Off`

第一阶段如果 AA 模式不完整，可以显示为可见但禁用，或只做只读说明；但内部数据结构必须预留 mode，不再把日期点击写死为唯一语义。

### Legacy 模式交互

`ADD BID` 打开 Reserve bid editor。

可选条件：

- `Short Call Type`
- `Reserve Day On`

选择 `Short Call Type`：

- 显示 enum 控件。
- 保存为 `propertyCode=301`。

选择 `Reserve Day On`：

- 可从 editor 内选日期，也可通过日历点击日期。
- 保存为 `propertyCode=302`。

日历 cell 应显示：

```text
Need: 279
Off: 34
```

具体文案可在实现时结合 UI 视觉调整，但必须避免只显示一个无含义数字。

### AA 模式交互

AA 模式的日期点击表示 `Prefer Off`，不能生成 `302 Reserve Day On`。

AA 模式后续属性建议：

- `Reserve Prefer Off`
- `Reserve Day of Week Off`
- `Reserve Work Block Size`
- `Waive to Allow Carry over to be Days Off`

这些属性的编号和存储方式需要在 AA 模式实施前单独确认。

## 后端校验

Reserve 后端校验至少包括：

- 只允许 `bid_type = Reserve` 的 property 进入 Reserve API。
- Legacy 模式只允许 `301/302`。
- `301` 的值必须属于：
  - `CRAM`
  - `CRPM`
  - `PRAM`
  - `PRMM`
  - `PRPM`
  - `RESA`
  - `RESB`
- `302` 的日期必须属于当前 bid period。
- `302` 的日期列表不能为空。
- 同一个 Tier 内重复日期如何处理需固定：
  - 推荐去重保存。
- draft version 冲突返回 409。
- 不允许把 AA `Prefer Off` 请求提交到 Legacy `302`。

后续 AA 模式校验再补：

- Prefer Off 每层最多 12 天。
- Reserve Work Block Size 必须在 3-6。
- Reserve day-off block 最终 pattern 需要满足 2-8。
- Carry-over waiver 必须 Layer 1。

### 后端模块化要求

Reserve 后端不能把 route、SQL、校验、序列化和业务规则写在同一个文件里。建议拆分：

```text
pbs-server/src/services/reserve/
  reserve-current-service.ts
  reserve-coverage-service.ts
  reserve-draft-write.ts
  reserve-validation.ts
  reserve-mappers.ts
  reserve-types.ts
```

route 层要求：

- 只做 schema 校验、调用 service、返回统一响应。
- 不直接写 SQL。
- 不直接拼业务摘要。

service 层要求：

- coverage 读取、draft 读取、draft 写入分开。
- Reserve property 301/302 的校验集中在 `reserve-validation.ts`。
- bid value 到 `pbs_bid_group` 字段的转换集中在 mapper，避免前后端多个地方重复硬拆字符串。
- 错误响应沿用现有 PBS 后端错误格式。

SQL / query 要求：

- 使用参数化查询或现有 Drizzle 查询模式，禁止字符串拼 SQL。
- 对 coverage 表预留 `period_code + base_code + date` 唯一约束或索引。
- 对 Reserve draft 查询复用现有 draft identity / version 约束，避免并发覆盖。

## SQL / Seed 设计

需要修正 `sql/seed/10-pbs-bid-property.sql` 中 301/302 的属性定义。

注意点：

- 当前 seed 使用 `ON CONFLICT (property_code) DO NOTHING`。
- 如果数据库里已经有错误的 301/302，仅修改 seed 不会更新既有数据。
- 因此实现阶段需要同时考虑 migration 或修复脚本，用于把既有环境里的 `301/302` 更新为旧库语义。

推荐实现阶段包含：

```text
1. 修改 seed，使新库初始化正确。
2. 新增 migration / data-fix，更新既有 pbs_bid_property 的 301/302。
3. 新增 Reserve coverage seed / data-fix，写入当前开发 period 的每日 required/off capacity 数据。
4. 如果已有错误语义的用户 bid 数据，需要评估是否迁移或清理。
```

当前看 `/reserve` 还没有真实保存能力，因此已有错误语义用户数据风险较低，但实现前仍需用 SQL 查库确认。

Coverage 数据第一阶段直接写数据库。后续管理端上线后，管理端应写同一张表或兼容视图，Portal 继续通过 `GET /api/reserve/coverage/current` 读取。

## 测试设计

后端测试：

- property catalog 返回 `301 Short Call Type`。
- property catalog 返回 `302 Reserve Day On`。
- `301` enum 合法值保存成功。
- `301` 非法 enum 返回 400。
- `302` 当前 bid period 内日期保存成功。
- `302` bid period 外日期返回 400。
- draft version 冲突返回 409。
- Legacy 模式拒绝 AA Prefer Off 类型。

前端测试：

- Reserve 页面默认显示 Legacy 模式。
- 月历显示 `Need` 和 `Off` 两类数字。
- 点击 `ADD BID` 后可选择 `Short Call Type`。
- `Short Call Type` 保存摘要显示 call type。
- 在 Legacy 模式点击日期生成 `Reserve Day On`。
- Reserve bid 写入当前 Tier。
- 切换 Tier 后只显示该 Tier 的 Reserve bid。
- AA 模式下日期点击不会生成 `Reserve Day On`。

回归测试：

- Pairing / Days Off / Line 的现有 bid editor 不受 Reserve 新类型影响。
- Tier Review / Bid Summary 后续如果展示 Reserve，必须显示为 Reserve 来源，不误标 Pairing 或 DaysOff。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: Reserve 开发会跨 SQL seed/migration、后端 API/校验、前端 Reserve 页面、测试和文档，适合拆分。
- Suggested split:
  - Agent A：SQL seed/migration 与 property catalog 校验。
  - Agent B：Reserve 后端 service/API/测试。
  - Agent C：Reserve 前端页面/editor/测试。
  - Main agent：整合契约、跑验证、处理冲突。
- Write boundaries:
  - Agent A 只写 `sql/` 和必要的 property catalog 测试。
  - Agent B 只写 `pbs-server/src/services/reserve`、routes、后端测试。
  - Agent C 只写 `pbs-portal/src/features/reserve` 和前端测试。
- Conflict risk: Medium。主要风险在 Reserve API contract 和 bid value shape，需要先由主 agent 定义清楚。
- Execution gate: 只有用户确认本 spec 后，才能进入 implementation plan 和代码实现。

## 待确认问题

当前推荐默认：

```text
Reserve 页面默认 Legacy Reserve Mode。
AA Prefer Off 作为后续可切换模式预留。
```

Coverage 数据源已确认：

```text
第一阶段直接写数据库固定数据；Portal 从后端接口读取数据库，不在前端硬编码。
```
