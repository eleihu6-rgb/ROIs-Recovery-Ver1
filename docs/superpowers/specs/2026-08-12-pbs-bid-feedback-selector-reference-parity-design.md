# PBS Bid Feedback Selector 参考原型严格对齐设计

## 1. 状态与产品决策

- 状态：待用户审阅批准后实施。
- 产品决策：PBS Bid Feedback 的 Pairing 匹配语义以参考原型
  `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 为唯一行为基准。
- 架构决策：Bid Feedback 使用独立的 Feedback Selector，不再复用 Pairing Search
  的条件构建器或 Current Rules 的 Tier 组合逻辑。
- 扩展决策：本项目已有 `Time Between Flights` 作为第 12 类 Selector，遵循参考原型
  “正向匹配集合 + Award/Avoid 计分”的统一模型。
- Eligibility 决策：继续遵循已批准的第一阶段边界；Rule Engine 正式接口接入前，Award
  Pairing 统一显示 `Eligibility unavailable`，Avoid 不做 Eligibility 检查。
- 性能决策：真实 `/api/bid-feedback/current` 冷请求 P95 预算调整为不超过 4 秒；不能依靠
  热缓存掩盖冷计算超时。

本规格是 Bid Feedback Pairing 匹配语义的最新权威修正，并取代以下文档中与本规格冲突的
候选范围、Selector 复用和匹配口径：

- `2026-08-10-pbs-bid-feedback-design.md` 第 8 节；
- `2026-08-10-pbs-bid-feedback-scope-correction-design.md`；
- `2026-08-10-pbs-bid-feedback-scope-correction-implementation.md`。

以上历史文档不删除；未冲突的 UI、缓存、冲突提示和第一阶段 Eligibility 清理结论继续有效。

## 2. 功能要表达什么

Bid Feedback 不是 Pairing Search，也不是 Solver 结果预测。它回答两个问题：

1. Crew 当前全部 Pairing Bids 最终对哪些 Pairing 表达正向或负向偏好？
2. 对于正向偏好的 Pairing，Crew 是否具备获得它的 Eligibility？

第一阶段仅完整回答第一个问题；第二个问题统一显示 Rule Engine 尚未接入。

分类含义固定为：

- `Award`：该 Pairing 的全部 Bid 贡献净分大于 0，表示 Crew 倾向于获得它；不表示最终一定
  Award。
- `Avoid`：净分小于 0，表示 Crew 倾向于避开它；不表示该 Pairing 违法或 Crew 不能飞。
- `Neutral`：净分等于 0，不进入 Award 或 Avoid。
- `Days Off`：保持现有独立日期反馈，不参与 Pairing Selector 净分。

点击一条 Award Pairing 只选择该行并展示 Pairing 详情及 Eligibility；点击 Avoid 只展示
Pairing 详情，不做 Eligibility，不改变 Bid 或 Pairing 状态。

## 3. 当前根因

当前 Feedback 是混合实现：

```text
Feedback 的独立 Tier 加减分
    +
Pairing Search 的条件判断器 buildPreviewCondition
```

两者目的不同：

- Pairing Search 寻找“最终符合搜索意图”的 Pairing，因此 `Avoid X` 会搜索“不满足 X”的
  Pairing。
- Feedback 需要找到“被这条 Bid 打分”的 Pairing，因此 `Avoid X` 必须先找到“满足 X”的
  Pairing，再对同一集合扣分。

直接复用导致：

- Avoid 条件被取反后又扣分，方向错误；
- Pairing Length 使用 `p.tafb`，参考原型使用 Pairing 计划跨度天数；
- 当前 Query 强制 FLY 且要求 Segment，参考原型输入还包含 Reserve；
- Work Day、Airport、Redeye、Month-End、Deadhead 和 Efficient Flying 的事件或日期口径漂移；
- 参考原型会跳过参数无效的 Option，当前单边 Pairing Length 会被解释为开放范围。

Crew `19`、`Jun 2026` 的只读样本证明了该问题：

- `Pairing Length min=1, max=null` 在参考原型中无效、不贡献分数；当前实现把它解释为
  `TAFB >= 1`，命中全部 2617 条。
- `Pairing Length 2–3 days` 当前按 `p.tafb` 命中 1171 条；按参考原型从计划起止日期
  重新计算天数后命中 526 条，双方只有 220 条重合。

这些数字只用于解释根因，不作为长期硬编码验收值。

## 4. 方案比较

### 方案 A：建立 Bid Feedback 专用 Selector 层（采用）

批量加载当前 Period 的标准化 Pairing/Duty/Leg facts，在 `bid-feedback` 模块内实现与参考原型
一一对应的纯 Selector；每个 Selector 只返回正向匹配 `true/false`，Action 只在计分阶段决定
正负。

优点：

- 可以用同一套 parity fixture 逐项锁定参考行为；
- 不再受 Pairing Search 的 Avoid、字段和候选池语义影响；
- Selector 与数据加载、计分、Eligibility 职责分离；
- 后续 Rule Engine Eligibility 接入不需要再改匹配规则。

代价：需要批量构建标准化 facts，但可以通过一次或少量 SQL、分组聚合和现有缓存满足 4 秒预算。

### 方案 B：继续复用 Pairing Search，增加 `feedbackMode` 分支（不采用）

在 Pairing Search 的每个条件中增加 Feedback 专用开关，分别关闭 Avoid 取反、替换字段和修改
日期口径。

不采用原因：两个产品语义继续耦合；每增加一个 Property 都容易再次漂移，且同一函数会包含互斥
的搜索与打分行为。

### 方案 C：在 Portal 前端复制参考 Selector（不采用）

后端把所有 Pairing/Duty/Leg 明细交给浏览器，由 Portal 计算结果。

不采用原因：响应体过大，业务规则落在客户端，难以保证权限、缓存、Conflict Summary 和算法
解释路径的一致性。

## 5. 总体架构与数据流

采用固定数据流：

```text
Current/Standing effective Pairing Bids
        ↓
当前 Period 的完整 Pairing/Reserve facts（不按 Crew Base/Rank/Division 过滤）
        ↓
Feedback 专用正向 Selector（12 类）
        ↓
每条 Bid 对匹配 Pairing 贡献 ±Tier Weight
        ↓
按 Pairing 聚合净分
        ↓
Award / Avoid / Neutral
        ↓
Award → Eligibility unavailable（第一阶段）
Avoid → 不做 Eligibility
```

模块职责：

- Effective Bid Source：保持现有 Current/Standing 选择优先级，不在本规格重新定义。
- Feedback Facts Loader：批量读取并标准化 Pairing、Duty、Leg、Credit 和当地事件时间。
- Feedback Selector：只判断某条有效 Bid 是否匹配某个 Pairing，不处理 Action、Tier 或 UI。
- Feedback Scorer：应用 Tier 权重及 Award/Avoid 正负号，生成净方向和 matched bids。
- Feedback Mapper：生成现有 API/UI 所需的表格、详情、Calendar 和 Conflict 数据。
- Eligibility：保持第一阶段 unavailable；不能反向过滤 Award/Avoid。

实现不得让 `bid-feedback` import 或调用 `buildPreviewCondition`、
`buildCurrentRulesExpression` 或 Pairing Search 的 Avoid 包装逻辑。可以复用无业务方向的底层工具，
例如时长解析、时区转换和稳定 ID 归一化，但必须通过 Feedback 自己的接口使用。

## 6. Pairing 输入集合

参考原型的 Selector 直接消费页面已加载的 `data.pairings`，不会在 Selector 内按当前 Crew 的
Base、Rank 或 Division 二次过滤。PBS 的等价输入固定为：

- 当前 Bid Period 有时间重叠的非删除 Pairing/Reserve；
- 包含 `FLY` 和 Reserve assignment；
- 不按当前 Crew Base 过滤；
- 不按当前 Crew Rank、Pairing Composition 或 Division 过滤；
- 不要求每个候选必须存在 Pairing Segment；
- 完全不与 Period 重叠的记录不进入本次 Feedback；时间无法判定时遵循现有第一阶段 Period
  fail-open 决策，不因缺少 Segment 静默删除。

这里的“不过滤”只说明 Feedback 的意愿投影范围，不代表 Eligibility 已通过。将来 Eligibility
接入后，Base/Rank/Team Rule/Pre-assignment 只能作为 Award 的解释性 verdict，不能改变原始
Award/Avoid 净方向。

Pairing-level Selector 可以匹配没有 Leg 的 Reserve；需要 Duty/Leg facts 的 Selector 在缺少对应
facts 时自然返回 false。

## 7. 标准化 Pairing Facts

专用 Selector 使用与参考原型等价的内部 facts，不直接把数据库列名当成业务语义：

- Pairing：stable ID、label、assignment、base、计划 start/end、duration days、credit hours、TAFB。
- Duty：sequence、start/end airport、scheduled local check-in/check-out、layover hours、legs。
- Leg：sequence、flight number、departure/arrival airport、scheduled local departure/arrival、
  assignment、deadhead flag。
- Period Context：start/end 和 Efficient Flying percentile。
- Redeye Context：当前权威 Bid Definition 提供的 start/end window。

`durationDays` 必须按参考数据准备逻辑，从 Pairing 计划开始/结束日期重新计算包含首尾的日历日数；
不得使用 `p.tafb`，也不得盲信来源中可能错误的 duration 字段。无法得到合法起止日期时为空。

Pairing span 用于日期 Scope 和 Month-End：优先使用首个/最后一个 Leg 的 scheduled local 时间，
其次使用 Duty check-in/check-out，最后回退 Pairing 计划 start/end。

所有 facts 必须批量读取；禁止按 Pairing、Property 或 Leg 发出 N+1 查询。

参考原型把 Redeye 的 start/end 直接放在 Option params；ROIS 的已保存 Redeye Bid 只保存
`dateScope`，window 由当前权威 Redeye Bid Definition 统一管理。这里采用唯一且明确的上下文适配：
Facts/Context Loader 读取 Definition 后，在 Selector 输入归一化阶段注入等价的 `start/end`，再执行
参考原型的同一正向谓词。不得从 Pairing Search 借用 Redeye 条件，也不得硬编码参考原型默认值。

## 8. 有效 Option、计分与方向

### 8.1 Option 有效性

先按参考原型对应 Property 的参数规则验证 Option：

- 参数有效：运行 Selector；
- 参数无效：该 Option 对所有 Pairing 贡献 0，不使整个 Feedback 请求 500；
- 页面已有保存校验继续保留，但 Feedback 不能假设历史或导入数据永远合法。

有效性还包括 Property 自身允许的 Action/Quantifier。参考原型固定为 Award 的 Property 如果出现
Avoid 历史或导入脏数据，该 Option 视为无效并贡献 0；不能擅自把它解释为一个新的 Avoid 规则。

参考原型的 manual pairing cell counters 在当前 PBS 没有对应存储形态，本规格标记为
`not_applicable`，不新增表或字段模拟。

### 8.2 Tier 权重

继续使用已落地的共享权重版本 `solver-preference-v1`：

| Tier | Weight |
| --- | ---: |
| T1 | 7 |
| T2 | 6 |
| T3 | 5 |
| T4 | 4 |
| T5 | 3 |
| T6 | 2 |
| T7 | 1 |

### 8.3 每条 Bid 的贡献

对有效 Option：

```text
selector(pairing, option, context) = true

Award contribution = +weight(tier)
Avoid contribution = -weight(tier)
```

同一 Property 同时属于多个 Tier 时，按每个 Tier 分别贡献；同一 Pairing 命中多个 Option 时全部
累加。最终：

- `score > 0` → Award；
- `score < 0` → Avoid；
- `score = 0` → Neutral，不展示。

除 Month-End Carryover 的参考特例外，Action 不得改变 Selector 的正向匹配集合；尤其禁止
`Avoid` 使用 `NOT selectorCondition`。

## 9. 12 类 Feedback Selector

参考原型有 11 类 Selector；`Time Between Flights` 是本项目按同一框架增加的第 12 类。

### 9.1 Pairing Preference

- 参数：至少一个 stable Pairing ID；否则 Option 无效。
- 精确匹配选中的 Pairing ID。
- Pairing picker 的日期过滤只是选项列表 UI 过滤，不进入 Feedback Selector。

### 9.2 Airport Preference

- 参数：至少一个 airport/city code；否则 Option 无效。
- `landing`：只检查 FLY Legs 的 arrival；Pairing 最后一个 FLY Leg 如果落回 Pairing Base，排除
  该最终返场 landing；中途落回 Base 仍可匹配。
- `layover`：检查 Duty end airport；如果配置 minimum layover hours，必须达到阈值。
- `both`：landing 或 layover 任一匹配。
- 日期 Scope 绑定到 landing 的 arrival local 时间或 layover Duty 的 checkout local 时间。
- Deadhead Leg 不作为 FLY landing 参与 landing 匹配。

### 9.3 Efficient Flying

- 只评估 FLY Pairing。
- 指标为 `creditHours / durationDays`；缺少 Credit 或合法正天数时不匹配。
- 分布范围是第 6 节的当前 Period 全部 FLY Pairing，不按 Crew Base、Rank 或 Division 缩小。
- percentile 使用现有权威 Efficient Flying Definition；按参考公式
  `k = max(1, round(n × pct / 100))`，percentile 限制在 1–50，阈值 tie-inclusive。
- `efficient` 匹配顶部 percentile，`inefficient` 匹配底部 percentile。
- 日期 Scope 使用 Pairing span overlap。

### 9.4 Pairing Check-In / Check-Out Time

- 参数必须包含不相同的 start/end；否则 Option 无效。
- Check-In 使用第一个 Duty 的 check-in local；Check-Out 使用最后一个 Duty 的 checkout local。
- 时间窗口为半开区间 `[start, end)`；`end <= start` 表示跨午夜。
- 日期 Scope 绑定到同一个 check-in/check-out 事件。

### 9.5 Flight Legs per Duty

- 参数必须能归一化为合法 min/max，且 `min <= max`；`=` 归一化为 `min=max`。
- 只统计 assignment 为 FLY 的 Legs，不统计 Deadhead。
- 日期 Scope 绑定 Duty check-in local；Scope 内没有 Duty 时不匹配。
- `Any`：至少一个 Scope 内 Duty 的 FLY Leg 数量在范围内。
- `Every`：至少存在一个 Scope 内 Duty，且每个 Scope 内 Duty 都在范围内。

### 9.6 Work Day Preference

- Action 固定为 Award；Avoid 形式无效并贡献 0。
- 至少选择一个 weekday；否则 Option 无效。
- 先要求日期 Scope 与 Pairing span overlap。
- 对每个 Duty 使用其 check-in local 的 weekday 和时间。
- 每个 weekday 可有独立时间窗口；空 start/end 表示对应一侧无界，全部为空表示该 weekday
  任意 check-in 时间；双边窗口包含边界并支持跨午夜。
- 任一 Duty 同时满足 weekday 和该 weekday 的窗口即匹配。

### 9.7 Pairing Length

- `minDays` 和 `maxDays` 必须同时存在、均为合法数字且 `minDays <= maxDays`；否则整个 Option
  无效并贡献 0。
- 使用第 7 节重新计算的 `durationDays`，不得使用 `p.tafb`。
- 范围包含首尾：`minDays <= durationDays <= maxDays`。
- 日期 Scope 使用 Pairing span overlap。

### 9.8 Flight Number Preference

- 至少提供一个 Flight Number；否则 Option 无效。
- 只检查 FLY Legs；Deadhead 不参与。
- Flight Number 使用规范化字符串精确匹配。
- 日期 Scope 绑定该 Leg 的 departure local 时间。

### 9.9 Redeye Preference

- 参考原型 Option params 中的 Redeye start/end，在 ROIS 中按第 7 节的唯一上下文适配由当前权威
  Redeye Bid Definition 注入；该 Definition 是 window 的唯一数据源。
- 配置缺失、非法或零长度时，该 Option 不参与匹配，不能使用硬编码默认值。
- 只检查 FLY Legs。
- 判断 Leg 的 scheduled airborne interval 是否与每日 Redeye window 有任意重叠，不是只判断
  departure 或 arrival 是否落在窗口内。
- 跨午夜 Leg 和跨午夜 Redeye window 均按参考算法处理。
- 日期 Scope 绑定 Leg departure local 日期。

### 9.10 Month-End Carryover

- `carryOutDays` 必须是 1–5 的整数；即使 Action 为 Avoid、实际阈值固定为 1，也必须通过该参数
  校验，否则整个 Option 无效并贡献 0。
- 使用第 7 节 Pairing span 的 end 与当前 Bid Period end 比较。
- 未跨出 Period end 不匹配。
- Award：carry-out calendar days `>= carryOutDays`。
- Avoid：参考原型固定为“避免任何 carry-out”，阈值始终是 `>= 1 day`；保存 payload 中的
  carryOutDays 不改变 Avoid 阈值。
- 现有 Pairing Search 的 `= / > / <` 解释不进入 Feedback；Feedback 必须执行上述参考语义。

### 9.11 Deadhead Flying

- `Any`：任意 Leg 标记为 deadhead，且其 departure local 位于日期 Scope。
- `Deadhead-only duty`：某个 Duty 至少有一条 Leg，且该 Duty 全部 Legs 都标记为 deadhead；
  日期 Scope 绑定该 Duty check-in local。
- Deadhead 识别在 facts normalization 层统一数据库 assignment 表达，不把 DB code 差异散落在
  Selector 中。

### 9.12 Time Between Flights

该 Property 不在参考原型清单中，但必须遵循相同 Selector/计分模型。

Option 必须同时满足以下防御性校验，否则对所有 Pairing 贡献 0：

- Action 为 Award 或 Avoid；Quantifier 为 `Any` 或 `Every`；Operator 为 `<`、`=` 或 `>`；
- threshold 是 canonical `HH:MM` duration：小时 1–3 位、分钟 `00–59`，归一化后为
  1–59,999 分钟；`00:00`、负数、小数、空值和超范围值均非法；
- Current Bid / Standing Bid 既有保存链路对最新 Minimum Time Between Flights Definition 的
  save-time 校验和稳定旧值 grandfather 规则保持不变。Feedback 只消费已经生效的 Bid：历史稳定值
  不因 Definition 后续提高而被 Feedback 二次判废，但结构、Operator、Quantifier 或 duration 格式
  本身非法的脏数据仍贡献 0。

对同一 Pairing、同一 Duty 内的非删除 Segment 按 `seg_seq` 稳定排序，计算相邻 Segment：

```text
connectionMinutes = next.sch_str_dt_utc - current.sch_end_dt_utc
```

规则：

- 不跨 Duty 计算；
- current end 或 next start 缺失时不生成 interval；
- 每个 Duty 最后一段不生成 interval；
- 延续该 Property 已确认的产品语义，FLY 与 Deadhead Segment 均参与；
- 使用保存的 `< / = / >` 和 `HH:MM` threshold；
- `Any`：至少存在一个 interval 满足比较式；
- `Every`：至少存在一个 interval，且全部 interval 都满足比较式；
- 没有 interval 时，Any 和 Every 都返回 false；
- Award 与 Avoid 使用完全相同的正向匹配集合；Award 加分，Avoid 扣分，禁止 Avoid 取反。

示例：

```text
Avoid · Any · < 00:50
```

表示找出至少有一个小于 50 分钟连接的 Pairing，再对这些 Pairing 扣分；不表示搜索所有连接
都不小于 50 分钟的 Pairing。

## 10. Current/Standing、Conflict 与 Eligibility

### 10.1 Effective Bid Source

- 保持现有 Current/Standing effective source resolution；本规格只替换 Pairing Selector。
- Feedback、Conflict Summary 和 matched bids 必须读取同一份 effective Pairing properties。
- Line/Reserve/Days Off 的其他 source resolution 不因本规格改变。

### 10.2 Conflicts

- 依赖 Pairing 匹配集合的 A1、B1、B3 等 Conflict/Advisory 必须改用同一 Feedback Selector
  结果，不能继续调用 Pairing Search 条件产生另一套结果。
- Conflict Summary 与完整 Feedback 在相同 draftVersion 下必须对同一 Pairing/Bid 关系达成一致。
- 本规格不新增或删除 Conflict 类型。

### 10.3 Eligibility

继续遵循 `2026-08-12-pbs-bid-feedback-phase-one-cleanup-design.md`：

- Award Pairing：`status=unknown`、`checked=[]`、`unavailable=[rule_engine]`；
- Avoid Pairing：`eligibility=null`；
- 不执行 Rank、Base、Pre-assignment、Team Rule Eligibility；
- 不显示对号、叉号、PASS、FAIL、浅红失败背景；
- Rule Engine 接入前，Selector 结果不能被 Eligibility 过滤或改方向。

## 11. API、缓存与错误处理

### 11.1 API

保持现有只读路由和外部响应结构：

- `GET /api/bid-feedback/current`；
- `GET /api/bid-feedback/current/conflicts`。

本规格不新增数据库表、字段、View 或 migration。公开 contract 只有在实现核对发现现有字段无法表达
参考结果时才允许最小调整，并必须先做影响分析；默认只改变返回内容，不改变结构。

### 11.2 缓存

- 提升 Feedback 完整结果和依赖 Selector 结果的 Conflict Summary cache/schema version；
- cache key 继续包含 Crew、Period 和全部 effective draftVersion；
- cache identity 必须包含当前 Redeye Definition 的 version/value hash，以及 Efficient Flying
  Definition 的 version/value hash（至少覆盖 percentile）；任一 Definition 变化后，旧 Selector 结果
  必须自然失效；
- 部署后不得读取旧 Pairing Search selector 产生的 Award/Avoid 结果；
- Redis 失败继续回退到真实计算，不向用户暴露 Redis 错误。

### 11.3 错误行为

- 单条 Option 参数无效：按参考原型贡献 0，不让整份 Feedback 失败；
- Redeye/Efficient Flying 权威配置缺失：对应 Option 不参与匹配，记录清洗后的服务端诊断；其他
  Selector 继续返回；
- Pairing 个别 Duty/Leg facts 缺失：依赖该 facts 的 Selector 返回 false，不删除该 Pairing，
  Pairing-level Selector 仍可匹配；
- 全局 Period、认证 Crew、数据库或有效 Bid Source 无法读取：使用现有持久错误状态和 Retry；
- 不向 Portal 返回 SQL、堆栈、Redis 或原始异常文本；重复失败使用现有错误去重机制。

## 12. 性能设计

- 不按 Pairing 或 Property执行 N+1 查询；标准化 facts 使用一次或少量批量 SQL。
- Selector 在服务端内存中对 facts 执行纯判断，或使用语义等价的批量投影；无论如何，
  `bid-feedback` 不能重新调用 Pairing Search 的条件构建器。
- Efficient Flying distribution 在一次请求中只计算一次。
- 相同 Pairing 的 span、duration、FLY Legs 和 connection intervals 只预计算一次，供多个 Selector
  复用。
- 完整结果必须先基于全量候选聚合，再进行 API 分页/展示；不能用列表 cap 截断后再计分。
- `/api/bid-feedback/current` SIT 真实数据冷请求 P95 不超过 4 秒；热缓存目标不超过 1 秒。
- 性能报告至少包含 5 次冷请求、20 次热请求的 P50/P95/max、响应体大小和 SQL 往返数。
- Crew `19`、`Jun 2026` 作为真实观察样本，但不得用 Crew ID 或数量写业务分支。

## 13. 测试设计

### 13.1 参考 parity fixture

在本仓库保存自包含 fixture，不在测试运行时依赖本机绝对路径。fixture 覆盖参考原型 11 类
Selector，并增加 Time Between Flights 扩展案例。

Redeye parity fixture 先把 ROIS 权威 Definition window 注入成参考原型等价 Option params，再比较
stable Pairing ID 集合；这项测试既锁定参考 Selector，也锁定第 7 节上下文适配。Efficient Flying
fixture 同时固定 percentile/config version，避免测试只验证偶然相同的 cutoff。

每类至少覆盖：

- 正向匹配与不匹配；
- Award/Avoid 使用同一匹配集合；
- 日期 Scope 与对应 Duty/Leg 事件绑定；
- 无效参数贡献 0；
- 缺少所需 facts 返回 false；
- 跨午夜或边界行为（适用时）。

测试必须同时执行参考期望和本项目 Selector，按 stable Pairing ID 比较集合；禁止只断言 SQL
字符串包含某个片段。

### 13.2 Scoring

- T1–T7 权重与 `solver-preference-v1` 一致；
- 同一 Pairing 多 Property、多 Tier 累加；
- T1 Award 可压过 T5 Avoid；
- 同权 Award/Avoid 抵消为 Neutral；
- Avoid 不取反匹配集合；
- matched bids 与实际贡献一致。

### 13.3 Time Between Flights

- 同 Duty 相邻 Segment；
- 不跨 Duty；
- 包含 Deadhead；
- `< / = / >`；
- Any/Every 非空集合语义；
- 无 interval 不匹配；
- Award/Avoid 集合一致、贡献符号相反。

### 13.4 后端集成

- 输入包含 FLY、Reserve、无 Segment Reserve、其他 Base/Rank/Division；不得做 Crew Base/Rank
  前置过滤。
- Period overlap 与完全跨期边界。
- Current/Standing effective source 不回归。
- Conflict Summary 与完整 Feedback 使用同一 Selector 结果。
- Award Eligibility 仍统一 unavailable，Avoid eligibility 仍为 null。
- cache version 更新，旧结果不命中；Redis 故障回退。
- 批量 SQL fixture、结构完整性检查、远端 PostgreSQL `EXPLAIN` 和真实 HTTP smoke 均通过。

### 13.5 Crew 19 回归证据

- `min=1,max=null` 的 Pairing Length 不得再给任何 Pairing 贡献分数；
- `2–3 days` 使用计划跨度天数，不使用 `p.tafb`；
- `Time Between Flights` 仍参与独立匹配和 Tier 计分；
- 最终 Award 数由全部有效 Bid 净分自然产生，不硬编码 2617、526 或其他固定总数；
- 测试输出每个 Property 的 match count，便于人工发现未来漂移。

### 13.6 Portal 与 Playwright

真实 UI 必须覆盖：

1. Crew 登录并打开 Bid Feedback；
2. Award/Avoid/Days Off counts 与 API 一致；
3. 选择 Award/Avoid 行只更新详情，不修改 Bid；
4. Award 显示 Eligibility unavailable，不显示对号/叉号或 PASS/FAIL；
5. Avoid 不显示 Eligibility；
6. Calendar 只展示 Award 和 Days Off；
7. 修改一个可控 Bid 后，旧 draftVersion 结果消失，新 counts 按参考 Selector 重算；
8. 接口失败显示持久错误与 Retry；
9. 冷请求在 4 秒预算内完成并记录网络耗时。

前端样式没有变化时不新增视觉样式；如实施中必须修改 UI，仍需运行 `npm run check:ui` 并保证
Hard violations 为 0。

## 14. 验收标准

1. Feedback 不再调用 Pairing Search 的条件构建器或 Tier-AND 组合逻辑。
2. 参考原型 11 类 Selector 的 parity fixture 全部通过。
3. Time Between Flights 按第 9.12 节作为第 12 类 Selector 通过全部扩展测试。
4. 不增加 Crew Base、Rank、Division 前置过滤；FLY 和 Reserve 均可进入 Feedback 输入。
5. Pairing Length 使用计划跨度日数；单边范围无效并贡献 0。
6. Avoid 匹配正向条件集合后扣分，不取反；净值为 0 不展示。
7. Conflict Summary 与完整 Feedback 使用同一匹配结果。
8. Award Eligibility 继续 unavailable；Avoid 不做 Eligibility。
9. 不新增 schema 或 migration，不修改 Pairing Search 用户行为，不修改 Solver 输入。
10. 后端聚焦测试、parity 测试、TypeScript build、Portal 测试、Playwright、远端 SQL
    preflight/EXPLAIN 和 `git diff --check` 全部通过。
11. SIT 真实冷请求 P95 不超过 4 秒，热缓存目标不超过 1 秒，并交付可复核测量记录。
12. 不覆盖或整理工作区中其他 Line/Reserve、Standing Bid、Import、SQL migration 等在途改动。

## 15. 实施边界

预期触达范围：

- `pbs-server/src/services/bid-feedback/`：专用 facts、selectors、scoring、service 与测试；
- `pbs-server` 的 Feedback route/cache wiring：只做必要版本更新；
- `packages/contracts`：仅当现有内部类型无法表达标准化 facts 时增加最小内部/共享类型，默认不改
  公开 API；
- `e2e/tests/pbs-portal/bid-feedback.spec.ts`：真实 UI 回归；
- `docs/test-cases/pbs/bid-feedback/`：人工验收更新。

明确不触达：

- Pairing Search 页面及其搜索语义；
- Pairing Bid editor 和保存 payload；
- Solver、PAIRING_SCORE.csv 和算法 Tier 规则；
- Rule Engine Eligibility；
- Live/Scenario Publish；
- 数据库 schema、migration、账号或权限；
- Bid Feedback 已完成的表格、Calendar 和第一阶段 unavailable UI，除非测试证明匹配结果映射存在
  必要修正。

实施前必须记录当前 dirty worktree baseline，并对计划修改的每个 symbol 执行 GitNexus upstream
impact；若出现 HIGH/CRITICAL 风险，先停止并告知用户。实施完成、用户授权 commit 前必须执行
GitNexus `detect_changes(compare main)`。

## 16. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: facts normalization、12 类 Selector、scoring 和 Feedback service 属于同一紧密契约；
  多人并写会增加语义分叉和当前 dirty worktree 冲突。
- Suggested split: 用户指定的实现窗口负责代码；当前主窗口负责 spec/impact 审核、diff 审查、测试
  复跑和 Playwright 验收。
- Write boundaries: 实现窗口只触达第 15 节文件；主窗口不同时修改业务代码。
- Conflict risk: High；当前工作区存在独立的 Line/Reserve、Standing Bid、Import 和 migration 在途修改，
  必须逐 hunk 保留。
- Execution gate: 用户审阅并明确批准本 spec 后，才允许编写实施计划和修改业务代码。

## 17. 已确认事项与剩余问题

已确认：

- Feedback 严格以参考原型 Selector 为准；
- 不增加参考原型 Selector 内不存在的 Crew Base/Rank/Division 过滤；
- 不复用 Pairing Search 的筛选语义；
- Time Between Flights 按参考框架作为扩展 Selector 一同实现；
- 第一阶段 Eligibility 继续 unavailable；
- 接口预算为 4 秒。

剩余产品问题：无。

本规格经用户批准后，下一步才是实施计划；本文件本身不授权修改业务代码、执行 migration、提交
Git 或 push。
