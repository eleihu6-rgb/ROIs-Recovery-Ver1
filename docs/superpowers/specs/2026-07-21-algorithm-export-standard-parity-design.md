# 算法导出文件与标准答案对齐设计

## 背景

当前算法压缩包由 `live-server` 的算法导出接口生成，包含：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `RESERVE_SCORE.csv`
- `LINE_RULES.csv`
- `LINE_RULES_README.md`

此前 PBS Bid 存储格式有过较大调整，但实际提供压缩包的 `live-server` 仍保留部分旧解析逻辑，造成部分当前 Portal 条件被静默忽略、DAYSOFF 时区来源不准确，以及部分 Line 规则元数据与当前条件不一致。

本设计以 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 产生的 CSV 契约和真实样例为“标准答案”，以当前 PBS Portal 保存的数据结构为输入事实，修正 `live-server` 的转换逻辑。

## 目标

1. 当前 Portal 能保存且本次纳入范围的条件，都能转换为标准答案项目所使用的算法文件语义。
2. 保持现有压缩包入口、五个文件名、CSV 表头和 Tier Counter 结构不变。
3. 使用同条件的标准答案样例做输出对比，确保字段、时间、计数和规则参数一致。
4. 不再因 `pbs_user.base` 投影过期而使用错误时区。

## 非目标

- 不修改 Portal Pairing 搜索或预览逻辑。
- 不切换算法导出接口到 `pbs-server`。
- 不设计或导出 Line 428 `Efficient Flying First` 与 Line 429 `Credit Window Preference`；本次两者都忽略。
- 不改变 Line 410 的现有语义；该规则缺少足够的标准答案真实样例，本次不猜测新格式。
- 不新增数据库表、字段或依赖。

## 方案选择

采用方案 A：直接修正实际提供压缩包的 `live-server` 导出器。

未采用的方案：

- 抽取 `live-server` 与 `pbs-server` 共用导出库：长期可减少漂移，但本次改动面过大。
- 将导出入口切换到 `pbs-server`：会改变现有调用链和服务边界，超出本次目标。

## 数据来源与转换原则

### 标准答案

以下内容以标准答案项目为契约依据：

- `unit_test/**/PAIRING_SCORE.csv`
- `unit_test/**/DAYSOFF.csv`
- `unit_test/**/LINE_RULES.csv`
- `src/frontend/src/unittest/scoreCsv.ts`
- `src/frontend/src/unittest/daysOffBids.ts`
- `src/frontend/src/unittest/lineRulesCsv.ts`

标准答案决定 CSV 表头、字段含义、UTC 时间表达、Tier Counter 和 `Parameters_JSON` 结构。若本仓库内部较新的 Rule 名称与标准答案冲突，以标准答案的算法文件契约为准；无法在标准答案中找到契约的当前条件，本次不自行发明格式。

### 当前条件

当前 `f8_pbs` 中保存的 Bid 数据决定实际需要导出的条件、动作、参数和 Tier。转换时不得用旧格式假设覆盖当前格式，也不得对本次支持的条件静默跳过。

### Crew、基地与时区

- 所有算法 CSV 都只导出 `f8.crew` 中真实存在的 Crew；`__admin__`、孤立历史 Bid 等非 Crew 数据直接忽略。
- Crew Base 的权威来源改为 `f8.crew_base`，不再以 `f8_pbs.pbs_user.base` 为导出依据。
- 按条件日期匹配当日有效的主基地记录，再通过 `f8.airport.zone_id` 获取时区。
- 若真实 Crew 在对应日期缺少有效 Base、机场或时区，只跳过无法生成 UTC 时间的 DAYSOFF 行，不报错，也不影响该 Crew 的 Pairing、Line 或其他可转换条件。
- Jun 2026 远端核查显示：617 名有 Current Bid 的真实 Crew 中，616 名具备有效 `crew_base` 和时区；`13365` 缺少有效 Base。`pbs_user.base` 与 `crew_base` 另有两处不一致，因此不能继续作为权威来源。

## 功能范围

### PAIRING_SCORE.csv

保留现有 Award/Avoid 累加计数、Pairing ID 和 Interface ID 逻辑，补齐当前保存格式的转换：

- 103 Pairing Check-In / Check-Out Time：支持当前 `pairing-check-time` 数据。
- 107 Flight Legs per Duty：支持当前 `flight-legs-per-duty` 数据。
- 163 Month-End Carryover：支持当前 `month-end-carryover` 数据。
- 112 Pairing Length：兼容仍存在于数据库中的旧非 JSON 参数。

转换结果必须落到与标准答案相同的 `(Crew_ID, Pairing_ID)` 行和对应 Tier Award/Avoid Counter 中；同一行的多个命中继续累加，不能互相覆盖。

### DAYSOFF.csv

- 保持标准表头：`Crew_ID`、UTC 起止时间、T1-T7 Award Counter。
- 全天休息按 Crew 当地日历日转换为 UTC，结束时间使用下一当地日午夜前一秒，与标准答案真实 CSV 样例一致。
- `Prefer Off` 中的 `Window HH:MM-HH:MM` 必须导出真实局部时间窗口，不能扩大成全天。
- 相同 Crew、相同 UTC 窗口按现有 Tier Counter 规则合并。
- 非 Crew 或缺少有效 Base/时区的日期行直接跳过，不生成空时间字段。

### LINE_RULES.csv

- 保持标准表头、Tier Counter 和 JSON 序列化规则。
- 407 的 Portal Property Code 仍为 407，但算法行严格按标准答案输出：`Code_ID=403`、`Rule_ID=403`、`Rule_Type=MIN_BASE_LAYOVER`、`Parameters_JSON={"minHours":number}`。当前 `HHH:MM` 值先换算为总小时数（分钟不为零时使用小数），不得继续输出 `{ "value": "HHH:MM" }`。
- 427 保持标准答案契约，不改成内部新命名：`Code_ID=427`、`Rule_ID=427`、`Rule_Type=RESERVE`、`Parameters_JSON={"action":"avoid","scope":"whole_bid_month"}`。当前 Portal 的 `reserve-avoidance` 输入使用 `if_possible` / `no_matter_what` 两种 mode，但标准答案无法表达这两档；经用户确认，两种 mode 均归一为标准答案的 `Avoid Reserve`。这是明确接受的有损映射，不读取或输出内部 `avoidance` 字段。
- 410 保持现状。
- 428、429 明确排除在本次范围外，均不输出到 `LINE_RULES.csv`。当前 428 仍会输出旧格式，因此本次需要修改为跳过；429 已经跳过，只补回归测试。

### 其他文件

`RESERVE_SCORE.csv` 与 `LINE_RULES_README.md` 的现有格式和行为保持不变，仍需在压缩包完整性测试中验证存在。

## 标准答案对比门禁

实现完成后必须执行两层对比：

1. **同条件 Golden 对比**：为本次涉及的 Pairing、DAYSOFF、Line 条件建立受控输入，使用标准答案项目的 CSV 行/构建逻辑作为期望值。双方输出按稳定主键排序后比较：
   - 表头及列顺序完全一致；
   - CSV 字段值完全一致；
   - UTC 时间字符串完全一致；
   - Tier Counter 完全一致；
   - `Rule_Type` 完全一致；
   - `Parameters_JSON` 以解析后的 JSON 结构做等价比较，避免仅由 JSON key 顺序造成假差异。
2. **远端 Jun 2026 Smoke 对比**：从实际接口生成五文件压缩包，检查无空 DAYSOFF 时间、无非 Crew 行、已支持条件无静默漏项，并使用标准答案文件校验器检查表头、列数、时间格式、Counter 和 JSON 结构。

不同项目使用不同真实业务数据，因此远端整包不要求与某个标准答案 Scenario 逐行相同；逐行一致性由“同条件 Golden 对比”保证，远端 Smoke 用于证明真实数据链路正确。

## 错误与跳过策略

- 明确排除项：428、429，允许忽略。
- 数据不完整项：非 Crew 从所有算法 CSV 中跳过；真实 Crew 的 DAYSOFF 日期缺失有效 Base/时区时，只跳过对应 DAYSOFF 行。
- 本次支持的 Pairing/Line 条件如果解析失败，测试必须失败；实现不得将其作为正常情况静默吞掉。
- 压缩包仍应包含全部五个文件，即使其中某个 CSV 只有表头。

## 测试与验收

### 自动化测试

- Pairing：覆盖 103、107、163 当前格式和 112 旧格式，并断言候选 Pairing 与 Counter；覆盖非 Crew 不进入 `PAIRING_SCORE.csv`。
- DAYSOFF：覆盖全天、局部窗口、跨 DST 日期、`crew_base` 有效期、PBS Base 投影不一致、缺失 Base/时区跳过、非 Crew 跳过、Counter 合并。
- Reserve：覆盖非 Crew 不进入 `RESERVE_SCORE.csv`。
- Line：覆盖 407 的 `403/MIN_BASE_LAYOVER/{minHours}` 转换；覆盖 427 的两种 Portal mode 均输出 `427/RESERVE/{"action":"avoid","scope":"whole_bid_month"}`；断言 428、429 均不输出，并覆盖非 Crew 不进入 `LINE_RULES.csv`。
- Archive：断言文件名和五文件完整性。
- Golden：运行标准答案同条件对比测试。

### 远端只读验收

- 对 Jun 2026 生成实际算法压缩包。
- 验证 `DAYSOFF.csv` 无空起止时间且不包含 `__admin__`。
- 验证 `crew_base` 与 `pbs_user.base` 不一致的 Crew 使用 `crew_base` 对应时区。
- 统计每类源条件、成功导出数和允许跳过数；除 428、429、非 Crew、缺失 DAYSOFF 时区外不得出现未解释差额。

### 完成标准

- 相关 Vitest 全部通过。
- Golden 对比全部通过。
- Jun 2026 远端只读 Smoke 通过。
- 不修改 Portal 搜索、数据库 Schema 或算法接口地址。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Pairing、DAYSOFF、Line 最终汇聚到同一导出服务和压缩包验收，且测试夹具与契约紧密关联；并行修改容易产生重复或冲突的契约判断。
- Suggested split: 单人按 Pairing → DAYSOFF → Line → 整包 Golden/Smoke 顺序完成。
- Write boundaries: 主要限制在 `live-server/src/services/algorithm-export/**`、对应测试和必要的测试夹具。
- Conflict risk: 多人同时修改导出服务、共享测试夹具或 CSV 契约时为中高风险。
- Execution gate: 本规格经用户确认后再创建实施计划并开始编码。

## 风险与约束

- `crew_base` 是带有效期的数据，不能简单取最新一行；必须按 DAYSOFF 条件日期匹配。
- 标准答案项目的源码构建逻辑与真实 Scenario CSV 个别历史数据可能存在差异；算法文件验收优先采用真实 CSV 契约，并用源码测试解释当前支持行为。
- 428、429 没有与标准答案一致的已确认算法契约，本次禁止自行设计。
