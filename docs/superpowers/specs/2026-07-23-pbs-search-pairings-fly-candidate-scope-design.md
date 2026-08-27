# PBS Search Pairings 与算法导出有效飞行候选范围修复设计

## 背景

在 PBS Portal 的 `Search Pairings` 页面使用 `Pairing Check-In / Check-Out Time` 条件搜索时，结果中出现了 `TB8549`：

- 页面显示 `Base YYZ`、`Composition IFD(1)`；
- `Total BH 0:00`；
- 航段区域显示 `No legs available.`；
- 该记录同时被计入页面的结果总数。

远端 PostgreSQL 核查证明这不是前端异步加载或缓存问题。`TB8549` 对应的数据库记录为：

- `assignment_group = 'GRD'`；
- `assignment = 'GRD'`；
- `seg_count = 0`；
- 没有任何 `pairing_segment`；
- `pairing_composition` 中存在有效的 `IFD(1)`。

因此它能通过 Base、Rank 和 Bid Period 过滤，但并不是 Crew 可以申请的飞行 Pairing。

当前问题由两层逻辑共同产生：

1. Search Pairings 的通用候选查询没有统一限定 `assignment_group = 'FLY'`，也没有要求至少存在一条有效航段。
2. `Avoid` 条件当前使用 `not (coalesce((positiveClause), false))`。没有 Check-In / Check-Out 事实时，正条件得到 `NULL`，被归一成 `false` 后再取反为 `true`，因此无事实记录反而命中 Avoid。

前端只是如实渲染后端返回的空 `legs`，不是根因。

进一步核查实际算法导出路径后，发现 `live-server` 的 `PAIRING_SCORE.csv` 查询也只应用
`p.is_deleted = 0` 和 Property 条件，没有统一限定 `FLY + active segment`。Current Package
还没有逐 Crew 应用 Base、Rank 和 Period Pairing 资格。

远端真实数据存在可复现案例：

- Crew `844` 为 `YYC / CA`；
- Crew 844 的 T4 保存了 Award Pairing Length、最多 1 天；
- `TB8549` 为 `YYZ / IFD / GRD`、1 天、0 航段；
- 当前算法导出会因 `duration_days = 1` 将其写成 Crew 844 的 T4 Award 匹配。

CSV 使用内部 `Pairing_ID=147759` 和 `Interface_ID=115491`，不会显示 `TB8549` 标签，因此该错误不容易通过人工查看文件发现。

## 目标

1. `Search Pairings` 只展示当前 Crew 可申请的有效飞行 Pairing。
2. 通用候选必须是 `FLY`，并至少存在一条 `is_deleted = 0` 的 `pairing_segment`。
3. `Pairing Check-In / Check-Out Time` 只有在所需事件事实存在时才能参与 Award 或 Avoid 判断。
4. 数量统计、结果分页和详情卡片使用一致的候选语义。
5. `TB8549` 这类 GRD、RES 或无有效航段记录不能出现在 Search Pairings 结果中，也不能计入结果总数。
6. 不改变正常 FLY Pairing 的时间比较、日期限制、Base、Rank、Bid Period 和稳定分页规则。
7. `PAIRING_SCORE.csv` 只为每名 Crew 输出其目标 Period 内、Base/Rank 合格的有效 FLY Pairing。
8. Search Pairings 与算法导出的正向 Property 匹配集合使用一致资格语义。

## 非目标

- 不删除或修改 Live 数据库中的 `TB8549`。
- 不在前端通过隐藏 `No legs available.` 卡片掩盖后端结果。
- 不改变 Bid 条件表单、摘要文案或页面布局。
- 不改变 `PAIRING_SCORE.csv` 文件格式、counter 列或 Solver 计分协议。
- 不改变算法导出对 Avoid 的既有 counter 语义：导出仍查询正向命中集合，再写入 Avoid counter。
- 不重新启用 `pbs-server` 中已返回 410 的旧 Algorithm Export HTTP 路由。
- 不新增数据库表、字段、Migration 或第三方依赖。
- 不扩展本任务去统一重写全部 Pairing Property 的 `NULL` 语义。

## 业务语义

### 1. Search Pairings 基础候选

进入任何 Property 条件判断前，Pairing 必须同时满足现有资格规则以及以下新增的全局规则：

```text
pairing.is_deleted = 0
AND upper(trim(pairing.assignment_group)) = 'FLY'
AND EXISTS (
  SELECT 1
  FROM pairing_segment
  WHERE pairing_segment.pairing_id = pairing.id
    AND pairing_segment.is_deleted = 0
)
```

该规则与现有 Base、Rank、Bid Period、Crew Base 有效期等资格规则共同组成 Search Pairings 的基础池。

`GRD`、`RES` 或没有有效航段的 Pairing 不属于 Search Pairings 基础池。它们不参与 Award/Avoid 补集，也不进入总数。

### 2. Check-In / Check-Out 条件适用性

`Pairing Check-In / Check-Out Time` 除了基础候选资格，还必须存在相应的有效事件事实：

- Check-In：至少一条有效航段具有可用的 `brief_start_utc`。
- Check-Out：至少一条有效航段具有可用的 `debrief_end_utc`。

对该 Property，判断顺序固定为：

```text
candidate eligibility
AND event fact exists
AND event date is applicable
AND Award/Avoid time comparison
```

具体语义：

- Award：事件事实存在，并且时间条件成立。
- Avoid：事件事实存在，并且时间条件不成立。
- 事件事实缺失：Award 与 Avoid 都不命中，不能通过 `NULL` 取反进入 Avoid。
- 没有 `dateScope`：所有具有所需事件事实的候选均具有日期适用性。
- 使用 `specific_dates` 或 `date_range`：事件当地日期必须落入所选日期范围，才能继续判断 Award/Avoid。
- 事件存在但日期不在 `dateScope`：Award 与 Avoid 都不命中，不能因为日期条件为 `false` 而进入 Avoid。

因此日期范围是 Property 的适用范围，不是一个可随时间比较一起整体取反的偏好事实。日期范围或具体日期继续作用于同一个 Check-In / Check-Out 事件，不改变现有事件机场时区规则。

### 3. 数量和列表一致性

以下结果必须基于同一候选范围：

- Search Pairings 的 `pairing numbers`；
- Search Pairings 的 `total results`；
- 当前页 Pairing rows；
- 对应 Pairing details/legs；
- Current Rules 中复用相同 Pairing candidate/facts 的计数。

禁止只在分页结果或前端过滤无效记录，否则会造成总数、页数和卡片不一致。

### 4. `No legs available.` 的保留边界

前端现有空状态可以保留，用于防御接口异常或详情数据在请求期间发生变化；但正常 Search Pairings 响应不得主动返回没有有效航段的 Pairing。

本任务不删除该 UI 防御状态。

### 5. Algorithm Export 资格与 Avoid 语义

实际生产算法导出位于 `live-server`。对 `PAIRING_SCORE.csv` 中的每个
`Crew_ID + Pairing_ID`，Pairing 必须满足：

- `FLY + 至少一个 active segment`；
- Pairing 当地 origin date 落入当前导出入口的有效窗口；
- Pairing Base 与该 Crew 在 origin date 有效的 Base 一致；
- Pairing Composition Rank 与该 Crew 在对应日期有效的 Rank 一致。

Current Package、YEG-14 Test Package 和 Scenario Package 都遵守以上逐 Crew 资格。
Scenario 的现有 scope union 过滤只能作为粗筛，不能代替逐 Crew 校验。

#### Pairing 当地 origin date

Pairing origin timestamp 固定取最早有效航段的
`coalesce(duty_sch_str_dt_utc, brief_start_utc, sch_str_dt_utc)`，再使用
`pairing.base -> airport.zone_id` 的有效 IANA 时区转换为当地日期。

不得直接使用 `pairing.pairing_dt`，也不得把 UTC 日历日当作当地日期。由于基础候选已经要求
active segment，因此不回退到无航段主表时间。Base 机场缺失或 `zone_id` 无效时排除该
Pairing，禁止 fallback UTC。

#### 导出窗口

- Current Package：以 `periodCode` 解析出的自然月首日和末日为闭区间。
- YEG-14 Test Package：使用与 Current Package 相同的 `periodCode` 自然月窗口。
- Scenario Package：显式 `scenarioStart/scenarioEnd` 为权威窗口；缺失时使用 `periodCode`
  自然月。保留现有前后各 7 天 buffer，作为场景 carry-in/carry-out 候选范围，不再额外与
  `periodCode` 月份求交集。

三条路径都使用 Pairing 的真实当地 origin date 检查窗口。

#### Base / Rank 日期有效性

禁止把整个 Period 或 Scenario Window 中出现过的 Base/Rank 聚合成无日期 Set 后应用到所有
Pairing。每个 Crew/Pairing 必须使用该 Pairing 的当地 origin date 单独判断。

以 Pairing Base 当地日换算出的 `[local_day_start_utc, local_day_end_utc)` 为边界：

```text
eff_dt < local_day_end_utc
AND (exp_dt IS NULL OR exp_dt >= local_day_start_utc)
```

- Base 只认可 `crew_base.is_prime_base = 1`。
- 同一天有多条重叠主 Base 时按 `eff_dt DESC, id DESC` 选择一条，Pairing Base 必须与其一致。
- Rank 使用当天满足有效期的 `crew_rank` 行；Pairing Composition 匹配其中至少一个当天有效
  Rank，不能使用其他日期才有效的历史 Rank。
- `exp_dt IS NULL` 表示持续有效。
- Period 内发生 Base 或 Rank 变更时，变更前后的 Pairing 分别使用各自 origin date 的资格。

算法导出的 Avoid 与 Search Results 的 Avoid 展示语义不同，并保持现有设计：

- Search Results Avoid：显示适用候选池中的补集。
- Algorithm Export Avoid：仍以 Award 正向条件查找“要惩罚的 Pairing”，再写入 Avoid counter。

因此 Property 103 的空事实不会通过 Avoid 取反进入算法导出，但所有算法匹配仍必须先通过
逐 Crew 有效 FLY 资格。

## 方案比较

### 方案 A：前端隐藏空航段卡片

做法：前端收到 `legs.length === 0` 时不渲染该结果。

缺点：

- 后端总数仍包含无效记录；
- 分页可能出现不足 30 条、空页或漏项；
- 其他消费者仍会收到错误候选；
- 无法修复 Avoid 的 `NULL` 命中。

不采用。

### 方案 B：只在 Check-In / Check-Out 条件中排除 TB8549

做法：仅给 Property 103 增加 `EXISTS pairing_segment`。

优点：改动小。

缺点：

- 其他 Search Pairings 条件和 All Pairings 仍可能显示 GRD/RES 或空航段记录；
- 候选资格分散在 Property builder 中；
- 后续容易再次出现数量和列表范围漂移。

不采用。

### 方案 C：统一有效 FLY 候选池，并让算法导出逐 Crew 应用资格（采用）

做法：

1. 在 Pairing Search 通用候选查询中统一加入 `FLY + active segment`；
2. 对 Check-In / Check-Out 的 Award/Avoid 显式加入相应事件事实存在条件；
3. 算法导出按 Crew 应用 Period、Base、Rank 和有效 FLY 资格；
4. 数量、分页与导出正向匹配使用一致资格；
5. 保留前端空状态作为防御显示。

优点：

- 直接修复业务根因；
- 总数和列表天然一致；
- 不依赖特定 Pairing Label；
- 不改变正常 FLY Pairing 的 Property 比较；
- 与 Pairing Preference picker 已有 `pairingScope: "fly"` 方向一致。

风险：

- Search Pairings 中此前可见的 GRD/RES 记录将不再显示，这是预期业务变化；
- 通用候选 SQL 变化会影响 Single Property、Criteria、All Pairings 和 Current Rules 相关查询，需要完整回归。
- Algorithm Export 结果行数会减少；被删除的是跨 Base、跨 Rank、GRD/RES、无航段或 Period 外的错误评分行。

## 设计与代码边界

### PBS Server

主要涉及：

- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts`
- `pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`

#### 通用候选过滤

在生成 Search Pairings 基础候选集合的位置建立单一、可复用的 SQL 片段，负责：

- `assignment_group = 'FLY'`；
- 存在有效 `pairing_segment`。

分页 summary 与 rows 必须从同一个 `filtered_pairings` 集合计算。Current Rules count 的基础候选 CTE 也应用相同规则，避免两个入口产生不同 Pool。

不允许只在 `buildAllPairingsResultFilter()` 的可选 `pairingScope` 分支中实现，因为 Single Property 和 Criteria 请求当前不携带该 filter。

#### Check-In / Check-Out 事实判断

Property 103 的时间 SQL 应明确区分：

- `eventFactExistsClause`；
- `dateApplicabilityClause`；
- `timeCompareClause`；
- `intentClause`。

逻辑结果应等价于：

```sql
event_fact_exists
and date_applicable
and (
  case
    when intent = 'award' then time_compare
    when intent = 'avoid' then not time_compare
  end
)
```

不能继续让通用 `wrapIntent()` 单独对一个可能为 `NULL` 的时间表达式取反。

实现应复用现有事件选择规则：

- Check-In 取最早有效 `brief_start_utc`；
- Check-Out 取最晚有效 `debrief_end_utc`；
- 时间和日期使用对应事件机场的有效 IANA 时区。

Current Rules 的 materialized facts 路径必须使用同样的事实存在语义，不能只修复非 materialized preview。

### Live Server Algorithm Export

主要涉及：

- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.test.ts`
- `live-server/src/services/algorithm-export/algorithm-export-service.ts`
- `live-server/src/services/algorithm-export/algorithm-export-service.test.ts`

`loadMatchingPairings` 的全局 Property 匹配可继续缓存，但最终生成 match 时必须按 Crew
应用资格，不能把同一份跨 Base/Rank 的全局结果直接写给每名 Crew。

资格加载必须批量完成，不允许对每个 Crew/Pairing 组合发起查询。Current Package 和
Scenario Package 应复用同一逐 Crew eligibility 结构；Scenario 现有 union scope 只负责缩小
SQL 候选规模。

YEG-14 Test Package 也必须为固定 Crew 加载同一日期化 eligibility，不能只限制 Crew ID 后
继续使用跨 Base/Rank 的 Pairing 全集。

Property 正向条件继续复用 `buildPreviewCondition(... action: "award")`。保存的 action 只决定
写入 Award counter 或 Avoid counter，不改 CSV 格式。

### PBS Portal

本任务原则上不需要改变 Portal 业务代码。Portal 继续：

- 显示后端给出的总数；
- 渲染后端返回的 Pairing rows；
- 根据返回的 legs 渲染详情。

如 Playwright 需要稳定定位，可只补测试定位属性，不改变用户行为和视觉。

## API 与数据影响

- API 路径不变。
- Request/Response contract 不变。
- 不需要兼容旧请求格式。
- 不写数据库，不需要 Migration。
- 不删除 GRD/RES 原始数据，只改变 Search Pairings 的可见候选范围。
- 不删除 Bid；只纠正 `PAIRING_SCORE.csv` 的 Crew/Pairing 匹配集合。
- 缓存键中的 Pairing Search 语义版本必须递增，或使旧缓存自然失效后再验收，避免修复后短时间读取旧候选结果。

## 性能设计

有效航段检查使用数据库 `EXISTS`，依赖现有部分索引：

```text
pairing_segment(pairing_id, is_deleted)
```

不得先加载全部 Pairing 后在 Node.js 中过滤，也不得为每个 Pairing 发起独立查询。

实现后必须对代表性真实 SQL 执行远端 PostgreSQL `EXPLAIN` 或最小只读执行，确认：

- 没有 N+1；
- 没有因新增规则产生非必要的全表重复扫描；
- count 和 page query 仍能使用既有 Pairing/Segment 索引。

若 Current Rules 已物化 segment facts，应从同一物化集合推导 active-segment eligibility，避免额外重复关联。

算法导出必须批量加载 Crew 的带有效期 Base/Rank intervals，并按 Pairing origin date 使用
预构建索引完成逐 Crew 筛选；禁止把整月资格压平成无日期 Set，也禁止 Crew × Pairing N+1
SQL。代表性 Current、YEG-14 与 Scenario Package 需要记录耗时和输出行数，确认修复没有引入
数量级回退。

## 错误处理

- 数据库中存在 GRD/RES 或无航段 Pairing：正常排除，不报错。
- FLY Pairing 没有有效 segment：正常排除，不报错。
- FLY Pairing 有 segment 但缺少所需 Check-In/Check-Out 时间：该 Property 的 Award/Avoid 均不命中，不报错。
- Algorithm Export 中 Pairing 不符合某 Crew 的 Period/Base/Rank：跳过该 Crew/Pairing，不报错。
- Base、Rank、Bid Period 等现有身份或资格错误：保持当前明确业务错误。
- 数据库查询失败：保持统一 API 错误响应，不返回部分结果。

## 测试与验收

### 后端条件测试

为 Property 103 增加回归矩阵：

| 场景 | Award | Avoid |
| --- | --- | --- |
| 事件存在，时间满足 | 命中 | 不命中 |
| 事件存在，时间不满足 | 不命中 | 命中 |
| 事件存在，但事件日期不在 dateScope | 不命中 | 不命中 |
| 有 active segment，但事件时间为 NULL | 不命中 | 不命中 |
| 无 active segment | 不进入基础池 | 不进入基础池 |

同时覆盖：

- Check-In 与 Check-Out；
- 单值比较与 Between；
- 无日期限制、specific dates、date range；
- 普通 preview 与 Current Rules materialized facts 路径。

### 后端查询测试

断言 Single Property、Criteria、All Pairings 和 Current Rules 的候选 SQL 均包含：

- `assignment_group = 'FLY'`；
- active `pairing_segment` eligibility；
- count 与 page 共享候选 CTE；
- Property 103 Avoid 不再把无事件事实判为命中。

更新任何因产品语义变化而过时的测试，不保留旧的 GRD/RES 可见预期。

### 远端数据库验证

使用远端 F8 PostgreSQL：

1. 只读证明 `TB8549` 是 `GRD` 且没有 segment；
2. 对修复后的代表性 SQL 执行只读查询；
3. 验证 `TB8549` 不在结果 ID 集；
4. 验证返回的每个 Pairing 都是 `FLY` 且至少有一个 active segment；
5. 验证 summary count 等于完整分页合并后的结果数；
6. 记录修复前后结果数变化，不把特定总数硬编码成长期业务常量。

### Playwright

通过真实 Portal UI：

1. 使用具有 YYZ / IFD 资格且处于 Jul 2026 Bid Period 的测试 Crew 登录；
2. 打开 `Pairing Check-In / Check-Out Time`；
3. 配置 `Avoid`、Check-In、`> 06:51`；
4. 进入 Search Pairings；
5. 验证页面正常返回结果；
6. 验证 `TB8549` 不出现；
7. 验证当前页所有卡片均有至少一个 leg，不显示 `No legs available.`；
8. 验证页面显示总数与 API summary 一致。

Playwright 不得通过 route mock 伪造结果。

### Algorithm Export 回归

1. 以 Crew 844 的 T4 Pairing Length（最多 1 天）和 `TB8549` 建立 fixture：
   - Crew：YYC / CA；
   - Pairing：YYZ / IFD / GRD / 1 天 / 无航段；
   - 断言 CSV 不包含 `Crew_ID=844 + Pairing_ID=147759`。
2. 增加同 Period、同 Base、同 Rank、FLY 且有 active segment 的 1 天 Pairing，断言正常写入 T4 Award counter。
3. 分别验证因 GRD、无 segment、Period 外、Base 不匹配、Rank 不匹配而排除。
4. 验证 Avoid 条件仍只对正向命中 Pairing 写 Avoid counter，不导出 Search Avoid 补集。
5. Current Package 与 Scenario Package 使用相同逐 Crew资格；Scenario union scope 不得绕过最终资格。
6. YEG-14 Test Package 使用同一逐 Crew 日期化资格。
7. Base 变更：变更日前 Pairing 只匹配旧 Base，变更日后只匹配新 Base。
8. Rank 变更：变更日前后分别按当天有效 Rank 匹配，不能用整月新旧 Rank Set 全部放行。
9. 覆盖 `exp_dt IS NULL`、生效日、失效日和重叠主 Base 的确定性选择。
10. 覆盖当地日期与 UTC 日期不同的 Pairing，证明没有使用 `pairing_dt` 或 UTC 日历日。
11. Scenario 显式窗口与 `periodCode` 月份不同时，以 Scenario 窗口及既有 ±7 天 buffer 为准。
12. 下载真实算法包，解压检查 `PAIRING_SCORE.csv`，确认格式与表头不变。

### 必跑门禁

- Pairing Search focused Vitest；
- Property 103 condition-builder tests；
- Pairing Search route/service tests；
- `live-server` Pairing Score / Algorithm Export focused Vitest；
- 真实 Portal Playwright 回归；
- `pbs-server` build；
- `live-server` build；
- 前端若有改动则运行 `npm run check:ui`；
- `git diff --check`；
- GitNexus `detect-changes --scope compare --base-ref main`；
- 远端 PostgreSQL 只读 SQL/EXPLAIN receipt。

## 验收标准

1. `TB8549` 不再出现在截图对应的 Search Pairings 结果中。
2. 页面结果总数不再包含 `TB8549`。
3. Search Pairings 返回的每个结果满足 `FLY + 至少一个 active segment`。
4. Property 103 在缺少对应事件事实时，Award 和 Avoid 都不命中。
5. 正常 FLY Pairing 的 Check-In / Check-Out Award/Avoid 时间结果正确。
6. Single Property、Criteria、All Pairings 与 Current Rules 候选范围一致。
7. 数量、分页和详情没有不一致。
8. 无数据库写入、无 Migration、无前端隐藏式修复。
9. `PAIRING_SCORE.csv` 不包含 Crew 844 / Pairing 147759 的错误组合。
10. Current、YEG-14 和 Scenario Package 均不输出跨有效窗口、Base、Rank 或非 FLY Pairing 分数。
11. CSV 格式、counter 列和 Solver 协议保持不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 虽然涉及 `pbs-server` 和 `live-server`，两边必须共享完全一致的候选资格与 Property 语义；并行设计容易产生 Search/Export 漂移。
- Suggested split: 由一个实现者顺序完成 Search 候选、Property 103 事实语义、Algorithm Export 逐 Crew 资格、测试与 Playwright 验证。
- Write boundaries: 单一实现者负责 `pbs-server/src/services/pairing-search/**`、`live-server/src/services/algorithm-export/**`；仅在需要测试定位时触及 Portal/E2E。
- Conflict risk: 当前工作树已有未提交的 Bid Summary 改动，实施时必须只暂存本任务文件，禁止覆盖或混入现有改动。
- Execution gate: 用户审阅并明确批准本 spec 后，才能编写实施计划和修改代码。
