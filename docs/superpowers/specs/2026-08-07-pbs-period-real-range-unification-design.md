# PBS Period 真实范围统一设计

## 1. 背景

PBS 已经完成以下 Period 与 Award 基础能力：

- Live `roster_period` 是唯一 Period 主表。
- 管理员可以维护 `rp_start / rp_end`、Bid Open、Bid Close 和 Award Publish。
- Current Bid Period 与 Current Award Period 已分离解析。
- Award 通过计划开放时间与 `schedule_publish_record.published=1` 双重门禁。
- Period 时间按 Crew 在 Roster Start 的有效 Base 解释为当地墙上时间。

但部分运行时代码仍然从展示字段 `period_code` 解析月份，并将 Period 推算为某个自然月。例如把 `Feb 2026` 固定解释为 `2026-02-01～2026-02-28`。这与 Flair 已确认的实际 RP 不一致：

| Period | 真实范围 |
|---|---|
| 2026 RP1 | `2026-01-01～2026-01-30` |
| 2026 RP2 | `2026-01-31～2026-03-01` |
| 2026 RP3 | `2026-03-02～2026-03-31` |
| 2026 年 4 月起 | 按已配置的自然月范围 |

当前错误推算会影响 Pairing Search、Days Off、Reserve、Dashboard、Credit/Profile、算法导出和 Portal 日历。Award 已经能显示，并不代表这些页面和导出使用了同一份正确日期范围。

## 2. 本期目标

1. 所有 PBS 运行时业务日期范围只使用 `roster_period` 的真实配置。
2. 后端统一形成 Period Context，避免各服务重复解释周期。
3. `period_code` 只用于展示和历史业务文案，不再参与日期计算、数据筛选、日期校验或算法导出。
4. 对缺失关联、无效范围和越界日期采用 fail-fast；不保留自然月 fallback 或旧行为兼容。
5. 保证普通自然月 RP、非自然月 RP、跨月 RP 在 Portal、后端查询和算法导出中结果一致。

## 3. 非目标

- 不新增数据库字段或第二套 Period 表。
- 不修改历史 `period_code` 的值。
- 不修改 PBS 优化算法本身。
- 不在本期实现 Award Final、Crew Portal Final 生效、mis-award 申报或申诉截止流程。
- 不顺带补齐 Dashboard 的 Targeted Line、Targeted Reserve、Base Line Average。
- 不为尚未迁移的调用方提供自然月兼容层。

## 4. 核心决策

### 4.1 唯一事实源

`live.roster_period` 是 Period 范围的唯一事实源：

- 稳定身份：`roster_period.id`
- Live 周期业务键：`roster_period.roster_period`，例如 `2026RP02`
- Portal 展示值：`roster_period.pbs_period_code`，例如 `Feb 2026`
- 真实包含式日期范围：`roster_period.rp_start::date` 至 `roster_period.rp_end::date`

`pbs_period_code` 和 `roster_period` 都不得被解析成日期范围。对于必须连接只保存 `roster_period` 业务键的既有 Manday 周期表，使用 Period Context 中来自主表的真实 `rosterPeriodKey`，不得由月份重新拼接 `YYYYRPnn`。

### 4.2 统一 Period Context

PBS Server 在 Current Bid Period resolver 中一次性解析内部 Period Context：

```ts
type PbsPeriodContext = {
  rosterPeriodId: number;
  rosterPeriodKey: string;
  periodCode: string;
  rpStartLocal: string; // YYYY-MM-DD
  rpEndLocal: string;   // YYYY-MM-DD，包含结束日
};
```

约束：

- `rosterPeriodId` 是跨 PBS 记录关联和服务调用的主身份。
- `rosterPeriodKey` 仅用于连接仍以 Live RP 业务键保存数据的表。
- `periodCode` 仅用于 UI 标题、日志中的非敏感业务标签和兼容展示。
- `rpStartLocal / rpEndLocal` 必须来自数据库日期部分，不经过浏览器时区或 JavaScript UTC 转换。
- resolver 缺少任一必填字段、范围反转或命中多个相互冲突的 Period 时直接失败。

Portal 对外合同至少返回 `rosterPeriodId / periodCode / rpStartLocal / rpEndLocal`。前端不得从 `periodCode` 重新计算日期。

`PbsCurrentPeriod` 目前也被 Standing Bid 的非日期型 synthetic context 复用，本期不强行把该通用类型的所有字段改为全局必填。应新增或收紧一个日期型 `PbsRosterPeriodContext`/类型守卫，让本设计列出的日期消费者只接受完整 Context；Standing Bid 保持独立，不得成为自然月 fallback 的入口。

### 4.3 日期边界

RP 范围是包含首尾两天的 Base-local 业务日期：

```text
rpStartLocal <= eventLocalDate <= rpEndLocal
```

数据库字段是 `date` 时使用包含式比较；字段是 timestamp 时，先按既定 Base-local 规则取得业务日期，或使用等价的半开区间：

```text
[rpStartLocal 00:00, rpEndLocal + 1 day 00:00)
```

禁止把 `rp_end = 2026-03-01 00:00:00` 解释成 3 月 1 日刚开始即结束。

Period 门禁 timestamp 转换必须复用《PBS Period 按 Crew Base 解释本地墙上时间设计》中已经确定的服务端规则：使用 Crew 在 Roster Start 当天的有效 prime Base，并从 Live `airport.zone_id` 取得 IANA 时区。Crew Base 或合法时区缺失时返回 `PERIOD_CONTEXT_REQUIRED`，不得退回 UTC、数据库 session timezone 或浏览器时区。

Pairing 的 operational/local origin date 使用另一条明确规则：一律以 `pairing.base -> airport.zone_id` 作为时区来源，再通过 `buildPairingLocalOriginDateExpression` 把最早 duty/brief/segment start 转为当地日期。即使 Pairing Search 没有单一 Crew actor，结果也不得改用 UTC 或当前登录 Crew 的历史 Base。`pairing.base` 缺失或无法解析合法 IANA 时区时返回 `PAIRING_BASE_TIMEZONE_REQUIRED`；现有 `coalesce(zone_id, 'UTC')` fallback 必须移除。

动态 SQL 优先传递 `rpStartLocal/rpEndLocal` 的 `YYYY-MM-DD` 参数并与权威业务日期表达式比较。确实需要 timestamp 半开区间时，由 PBS Server 使用上述 `zone_id` 在 PostgreSQL 中构造边界 instant；前端不得构造或传入该 instant。

### 4.4 各类业务对象的 RP 归属

不同对象不能使用同一种“与日期范围相交”规则，归属语义固定如下：

| 对象 | 权威业务日期 | RP 归属规则 | 跨边界行为 |
|---|---|---|---|
| Pairing、Pairing Search、Dashboard pairing count、PAIRING_SCORE pairing pool | Pairing 在 `pairing.base -> airport.zone_id` 时区的 local origin date；复用 `buildPairingLocalOriginDateExpression`，由最早 duty/brief/segment start 计算 | local origin date 位于 `[rpStartLocal, rpEndLocal]` | 允许 Pairing 从 RP 内开始并在 `rpEndLocal` 后结束；这是合法 carry-out，不属于数据错误 |
| Pairing active dates / segments | 各 segment/duty 的 Base-local operational date | 只用于展示 Pairing 覆盖日和 property 匹配，不改变 Pairing 的 RP 主归属 | 可超出 `rpEndLocal`；Month-End Carryover 以超出天数计算 |
| Days Off / Prefer Off / Reserve 日期条件 | 用户选择或规则展开得到的 local calendar date | 每个日期必须位于包含式 RP 范围 | 任一日期越界则整个保存/导出失败 |
| Reserve Coverage 与 Manday daily | `coverage_date / crew_base_dt` | 仅逐日统计 RP 范围内的日期 | 不把 RP 外日期计入当前覆盖结果 |
| Period Credit/Profile | Manday period 表的 `roster_period` 业务键 | 与 Context 的 `rosterPeriodKey` 精确匹配 | 不按单日拆分，也不从日期猜业务键 |
| LINE_RULES 的 Period 天数和 half scope | 从 `rpStartLocal/rpEndLocal` 派生的 RP 序号日 | 使用真实包含式 RP 天数 | 不使用公历月份的首日、15 日或月底 |

Pairing 从 `rpStartLocal` 前开始但在 RP 内结束，不属于当前 RP 的可投 Pairing；Pairing 从 RP 内开始但飞到下一 RP，可以属于当前 RP。所有搜索、计数、preview、导出与日历必须保持该规则一致。

## 5. Fail-fast 与兼容策略

项目尚未上线，本期不保留错误语义的兼容行为。

必须直接失败的情况：

- PBS Bid、算法导出或其他业务记录缺少 `roster_period_id`。
- `roster_period_id` 找不到有效 `roster_period`。
- `rp_start`、`rp_end` 或 Period 业务键缺失。
- `rp_start > rp_end`。
- 用户提交的 Specific Dates、Date Range 或其他日期条件超出真实 RP。
- 调用方只提供 `periodCode`，却要求执行日期相关业务计算。

建议使用稳定的服务错误类型或错误码区分：

- `PERIOD_CONTEXT_REQUIRED`
- `PERIOD_NOT_FOUND`
- `PERIOD_RANGE_INVALID`
- `DATE_OUTSIDE_ROSTER_PERIOD`

HTTP 层继续使用项目统一响应格式。用户可见文案应说明结果和处理动作，不展示 SQL、Axios、堆栈或内部 schema。例如：

> 当前申请缺少有效排班周期，请重新进入当前 Bid；如问题持续存在，请联系管理员检查 Period 配置。

禁止以下 fallback：

- 从 `Feb 2026` 推算 2 月自然月。
- 从首个 pairing 日期猜 Period。
- 使用固定 30/31 天补齐范围。
- Period Context 缺失时继续返回空结果，让错误伪装成“没有匹配数据”。

## 6. 后端改造范围

### 6.1 Current Period 与服务调用

- Current Bid Period resolver 返回完整 `PbsPeriodContext`。
- 下游 service 方法接收 Context 或 `rosterPeriodId`，不再只接收 `periodCode`。
- 如果服务入口接收 `rosterPeriodId`，必须由服务端查询并校验 Context，不能信任客户端传入的起止日期。
- `pbs_bid.roster_period_id` 是业务关联；新旧代码不得再用 `pbs_bid.period_code` 定位日期范围。

同一次发布必须升级并切断以下共享合同和日期型入口：

- `packages/contracts/pbs-current-period.d.ts`：`PbsCurrentPeriod.id` 对当前业务 Period 必须非空，并返回真实起止日期；内部 Context 另外携带 `rosterPeriodKey`。
- `packages/contracts/pbs-search-pairings.d.ts`：preview、pairing IDs/numbers、occurrences、details 和相关 options 不再以请求中的 `periodCode` 解析范围；服务端使用当前 Context 或显式 `rosterPeriodId`。
- `packages/contracts/pbs-reserve-bids.d.ts`：current coverage 与日期型 draft 校验使用当前 Context。
- `packages/contracts/pbs-dashboard-summary.d.ts`、`pbs-dashboard-profile.d.ts`：对应服务使用同一个 Context；如 UI 需要展示范围，由合同直接返回真实日期。
- `packages/contracts/pbs-algorithm-export.d.ts`：Current/Scenario export 使用 `rosterPeriodId` 作为日期范围身份；`periodCode` 可保留为输出标签，但不能单独触发导出。
- Current Pairing/Days Off/Reserve/Line draft 的服务合同：已有 bid 必须通过 `roster_period_id` 与当前 Context 精确匹配。

旧入口如果只提供 `periodCode` 且请求涉及日期计算，必须返回 `PERIOD_CONTEXT_REQUIRED`。不得在某些 route 先迁移、另一些 route 继续自然月推算；contract、server 和 Portal 必须在同一次发布中切换。

### 6.2 Pairing Search

以下所有查询共享同一个 Context：

- Pairing occurrence 查询。
- Pairing ID / Pairing Number 选项查询。
- Core、Detail、Time 筛选条件。
- Search preview 和卡片详情。
- Month-End Carryover 等依赖周期结束日的条件。

行为规则：

- Pairing 是否属于当前 RP，以 §4.4 定义的 Base-local origin date 是否落入真实日期范围为准。
- 搜索日期范围必须与 RP 取交集；用户明确输入超出 RP 的日期时返回校验错误，不静默裁剪。
- Month-End Carryover 以 `rpEndLocal` 为边界计算，不以自然月月底为边界。
- 所有分页、选项数量、预览与最终搜索必须使用同一范围，避免“选项可见但结果找不到”。
- Pairing 从 RP 内开始后跨出 `rpEndLocal` 时仍属于当前 RP；active dates 和 segments 可以超出 RP，用于 carry-out 展示和匹配。

### 6.3 Days Off 与 Lineholder 日期校验

- 删除 `isIsoDateInPeriod(value, periodCode)` 的业务使用。
- 日期校验改为 `isIsoDateInRange(value, rpStartLocal, rpEndLocal)` 或等价共享方法。
- Prefer Off 的 Specific Dates、Date Range、Weekend/Day-of-week 展开，都只在真实 RP 内生成日期。
- 旧草稿日期超出真实 RP 时，读取可保留原始记录用于诊断，但编辑、保存或导出必须明确失败，不自动删除或移动日期。

### 6.4 Reserve Coverage

- Coverage 起止日来自 Context。
- Crew availability、Manday、Reserve assignment 与 pairing 统计使用相同包含式范围。
- Reserve daily 数量只统计 `coverage_date` 位于真实 RP 的行；用于计算每日需要量的 Pairing 仍先按 §4.4 的 local origin date 归属，再把其 RP 内覆盖日计入对应日期。
- 普通自然月和跨月 RP 不得出现首日、末日漏算或相邻 RP 串入。

### 6.5 Dashboard 与 Credit/Profile

- Dashboard pairing/fleet 统计使用 `rpStartLocal～rpEndLocal`，删除 `buildPeriodMonthRange(periodCode)`。
- Dashboard pairing/fleet count 按 §4.4 的 Pairing local origin date 归属，不能用 UTC start date 或“任一 segment 与 RP 相交”替代。
- Profile 的周期 Credit 使用 Context 的 `rosterPeriodKey` 连接 `crew_manday_*_period.roster_period`，禁止从 `periodCode` 拼接 `YYYYRPnn`。
- Dashboard Header、Bid 时间和 Period 标题仍可显示 `periodCode`，但数据查询不得使用它计算日期。

### 6.6 算法导出

算法仍然只接收既有文件和既有字段，本期不新增 `durationDays` 或 Period 日期字段；修改的是导出前的范围解释。

- 导出入口必须携带 `rosterPeriodId`，服务端加载 Context。
- LINE_RULES、RESERVE_SCORE 及所有日期相关匹配使用真实 RP。
- PAIRING_SCORE 的候选 Pairing 按 §4.4 的 local origin date 进入当前 RP pool；允许合法 carry-out Pairing 保留完整 segments。
- `whole_month` 在内部解释为“整个当前 Roster Period”，不再表示公历自然月。
- `first_half` 定义为从 `rpStartLocal` 起最多连续 15 天，截止不超过 `rpEndLocal`。
- `second_half` 定义为 `rpStartLocal + 15 days` 至 `rpEndLocal`；不足 16 天的 RP 中该范围为空。
- Line rule 所需周期天数使用 `rpEndLocal - rpStartLocal + 1`，不使用公历月份天数。
- Specific Dates / Date Range 超出 RP 时导出失败，并指出 crew、tier/property 和错误日期；不跳过错误 property 后继续生成看似成功的压缩包。

## 7. Portal 改造范围

### 7.1 数据消费

- Bid、Dashboard、Pairing Search、Days Off、Reserve 和共享 Bidding Calendar 只消费后端返回的 Context。
- Query key 必须包含 `rosterPeriodId`；不能只用 `periodCode`，避免相同标签或配置修正后缓存串用。
- 日期控件的 min/max 使用 `rpStartLocal/rpEndLocal`。
- 前端发现 Context 缺失时显示持续可见的页面级错误状态，不渲染自然月占位数据。

### 7.2 日历展示

共享 Bidding Calendar 和 Pairing mini-calendar 不再强制绘制 `periodCode` 对应的自然月。

推荐展示规则：

- 以 `rpStartLocal～rpEndLocal` 生成连续 7 列日期网格。
- 只在网格首尾补齐周边日期用于布局，补齐日期必须 muted 且不可作为当前 RP 日期操作。
- 跨月时在日期格或周行边界显示月份缩写，标题同时展示 Period Code 与真实范围。
- 对 `2026-01-31～2026-03-01` 必须完整显示 1 月 31 日和 3 月 1 日。
- 共享 Bidding Calendar 只把真实 RP 日期作为可操作日期，不创建下一 RP 的 C/O Off placeholder。
- Pairing mini-calendar 可以展示从 RP 内开始后跨出 `rpEndLocal` 的 active dates，并将 RP 外日期标记为 carry-out/muted；不得用这些 active dates 反向改变当前 RP 或 Pairing 归属。

## 8. 数据与 migration

本设计预期不新增 schema migration，因为所需字段和稳定关联已经存在。

实施前必须只读核查 DEV、SIT、UAT：

- `roster_period.id / roster_period / pbs_period_code / rp_start / rp_end` 完整性。
- 当前和测试用 `pbs_bid.roster_period_id` 非空且能唯一关联。
- 普通自然月 RP 与 Q1 特殊 RP 的边界。
- 相关 Manday 周期表中的 `roster_period` 值能与主表业务键匹配。

发现脏数据时，先输出独立的数据修复清单；不得在应用代码中增加 fallback 掩盖。若最终需要修复数据，必须另行评审幂等 migration 或受控脚本，本 spec 不自动授权写库。

## 9. Source-of-Truth 迁移审计

### 9.1 旧来源与新来源

- 旧来源：`periodCode -> parsePeriodMonth()`、月份首日/次月首日、公历月底、固定天数，以及从 active date 猜月份。
- 新来源：`roster_period.id -> rp_start/rp_end`；连接既有 Manday 周期表时使用同一记录的 `roster_period` 业务键。
- 冲突规则：旧推算值与真实范围不一致时，真实范围必须胜出；旧来源不得继续参与判断。

### 9.2 必须审计的已知运行时路径

- `pbs-server/src/services/dashboard-summary/`
- `pbs-server/src/services/dashboard-profile/`
- `pbs-server/src/services/days-off/`
- `pbs-server/src/services/lineholder/date-utils.ts` 及其调用方
- `pbs-server/src/services/reserve/`
- `pbs-server/src/services/pairing-search/`
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/algorithm-export/line-rules-export.ts`
- `pbs-server/src/services/algorithm-export/reserve-score-export.ts`
- `pbs-portal/src/features/dashboard/` 的日历 mapper
- `pbs-portal/src/features/award/award-mappers.ts`
- `pbs-portal/src/features/pairing/` 的 mini-calendar 和日期筛选
- 相关 contracts、fixtures、mock、seed/diagnostic scripts、E2E 与 QA 文档

实施时必须再次全仓搜索旧解析函数和等价手写月份算法。只有测试工具中用于构造独立公历日期的通用函数可以保留；任何运行时业务消费者不得保留。

### 9.3 冲突回归

必须构造以下冲突 fixture：

```text
periodCode = "Feb 2026"
rosterPeriodKey = "2026RP02"
rpStartLocal = "2026-01-31"
rpEndLocal = "2026-03-01"
```

断言所有消费者使用 `2026-01-31～2026-03-01` 作为完整真实范围，而不是 `2026-02-01～2026-02-28`。

同时增加两个 Pairing 边界 fixture：

- Pairing A：local origin=`2026-03-01`、release=`2026-03-02`，属于 RP2，并保留 carry-out segment。
- Pairing B：local origin=`2026-01-30`、release=`2026-01-31`，不属于 RP2，即使其结束日与 RP2 相交。

冲突 fixture 必须断言不会包含 `2026-01-01～2026-01-30` 或 `2026-03-02` 之后才开始的 Pairing；任何重新使用自然月推算或区间相交归属的改动都必须使测试失败。

## 10. 测试设计

### 10.1 PBS Server Vitest

- resolver 返回完整、合法的 Context。
- 缺少 Period 关联或范围字段时 fail-fast。
- 日期首尾包含，前一天和后一天被拒绝。
- Pairing Search 的结果、选项计数、preview 和分页使用同一真实范围。
- Pairing local origin 位于末日且跨出 RP 时仍被包含；在首日前开始但延伸进入 RP 时被排除。
- Days Off Specific Dates、Date Range、Weekend 展开支持跨月 RP。
- Month-End Carryover 以 `rpEndLocal` 计算。
- Reserve Coverage 不漏首尾日、不串相邻 RP。
- Dashboard 统计使用真实范围。
- Credit/Profile 使用主表提供的 `rosterPeriodKey`，不从 `periodCode` 拼接。
- Algorithm export 的 whole/first/second half 和周期天数基于真实 RP。
- 日期型 property 越界时导出整体失败，不生成部分成功文件。
- 普通 `2026-06-01～2026-06-30` RP 保持现有正确行为。
- 仅传 `periodCode` 的旧日期型 API/导出请求返回 `PERIOD_CONTEXT_REQUIRED`，不得成功或返回空结果。

### 10.2 PBS Portal Playwright

- 特殊 RP 日历展示 `2026-01-31～2026-03-01` 完整范围。
- 日期控件不能选择范围外日期。
- Pairing Search、Days Off、Reserve 和 Dashboard 显示同一个 Period 与真实范围。
- Context API 失败时显示明确错误，不显示自然月 placeholder 或旧结果。
- 切换 Period 后缓存键变化，页面不短暂展示上一 Period 数据。
- 普通自然月 RP 页面无回归。

### 10.3 QA 人工用例

新增 `docs/test-cases/pbs/period/` 用例，至少覆盖：

- 2026 RP1、RP2、RP3 的边界。
- 4 月后的普通自然月。
- 搜索、日期条件、Reserve、Dashboard 和导出结果交叉核对。
- 缺失 `roster_period_id`、越界日期和错误 Period 配置的失败提示。

### 10.4 数据库与动态 SQL 验证

- 对修改后的动态 SQL 使用远端 PostgreSQL fixture 执行 `EXPLAIN` 或最小只读查询。
- DEV 通过后再验证 SIT、UAT；任何环境失败都停止后续验证。
- 不使用本地空 schema 证明业务数据正确。

## 11. 验收标准

- 全部 PBS 运行时业务路径不再从 `periodCode` 推算自然月。
- `periodCode` 与真实范围冲突时，所有查询、校验、日历和导出均以真实范围为准。
- 特殊 RP 的首尾日期在查询和 UI 中都可见、可筛选、可导出。
- 相邻 RP 数据不串入。
- Portal、API、Dashboard 和算法导出对同一 `rosterPeriodId` 使用完全一致的日期范围。
- 缺失或非法 Context 明确报错，不返回误导性的空结果或兼容结果。
- 不新增数据库字段，不修改历史 `periodCode`，不改变算法文件合同。
- PBS Server 测试、PBS Portal Playwright、`npm run check:ui`、相关模块 build 及根目录 `npm run verify:pbs` 全部通过并保留回执。

## 12. 实施顺序

1. 完成旧自然月来源和消费者审计，冻结 Period Context 合同。
2. 修改 resolver 和共享日期范围工具，并补冲突回归测试。
3. 迁移 Pairing Search、Days Off、Reserve、Dashboard、Credit/Profile。
4. 迁移算法导出并验证生成文件内容。
5. 修改 Portal Context 消费、日期控件和连续 RP 日历。
6. 更新自动化测试和 QA 文档。
7. 运行远端 SQL、模块测试、Playwright、UI gate、build 与 `verify:pbs`。
8. 在 DEV 验证后依次进行 SIT、UAT smoke；本阶段没有数据库写入时不执行 migration。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: Period Context 合同冻结后，后端业务消费者、算法导出、Portal 与测试可以使用不重叠目录并行处理。
- Suggested split:
  - Agent A：Period resolver、共享 Context/日期工具、Dashboard、Credit/Profile、Days Off、Reserve 及 Vitest。
  - Agent B：Pairing Search 与算法导出、动态 SQL 验证及对应 Vitest。
  - Agent C：PBS Portal 日历/日期控件、Playwright 与 QA 文档。
- Write boundaries: Agent A 不修改 Pairing Search/algorithm-export/Portal；Agent B 不修改 resolver 公共合同和 Portal；Agent C 不修改 PBS Server 与数据库。
- Conflict risk: Medium。公共 Context 类型、错误语义和测试 fixture 必须由主 Agent 先冻结；主 Agent 负责最终集成。
- Execution gate: 用户审核本 spec 并明确批准实施后，才能编写实施计划和开始代码修改；并行开发还需在实施开始前说明角色与写入边界。

## 14. 残余风险

- 某些旧 fixture 或历史草稿可能只有 `periodCode`、没有 `roster_period_id`；按本期决策它们会直接失败，需要单独修复测试数据或业务数据。
- Manday 周期表仍以字符串业务键关联，必须验证它与 `roster_period.roster_period` 一致；本期不擅自重构其 schema。
- `whole_month / first_half / second_half` 的 UI 文案可能仍使用 Month；实施时应统一成 Period 语义，但不扩展新的算法字段。
- Portal 连续 RP 日历与现有自然月视觉布局不同，需要真实 Playwright 截图验证 1920×1080 基线和缩放场景。
