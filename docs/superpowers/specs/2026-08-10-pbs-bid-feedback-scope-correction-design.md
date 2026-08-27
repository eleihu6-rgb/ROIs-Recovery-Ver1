# PBS Bid Feedback 候选范围与资格状态修复设计

## 1. 背景与问题

当前 Bid Feedback 将普通 Pairing 条件直接应用于当前 Period 的 Live 全量 Pairing，再通过 Rank、Base 和 Pre-assignment 标记资格。该顺序导致无关基地、无关 Division/Rank 的 Pairing 大量进入列表。

以 DEV 的 Crew `19`、`Jun 2026` 为只读核查样本：

- Award 列表共 `2679` 条；
- `21` 条 Eligible，`2658` 条 Ineligible；
- `1653` 条包含 Rank mismatch；
- `1409` 条包含 Base mismatch；
- `2585` 条包含 Pre-assignment overlap。

这些原因可重叠。结果不是单纯的 UI 颜色问题，而是候选池过宽，同时 Pre-assignment 错把 `IMP` 排班纳入检查。

参考产品项目先在 Scenario 已限定的 Pairing 数据集上解析 Bid，再检查 Rank、Base、Team Rule 和 Pre-assignment。本项目没有 Scenario 身份，因此必须使用当前 Crew 的权威可用 Pairing 池替代 Scenario 范围，不能扫描全量 Live Pairing。

本设计修正并取代 `2026-08-10-pbs-bid-feedback-design.md` 8.2、8.3 中“普通条件 Bid 不先按 Rank/Base 过滤”的旧口径。

## 2. 目标

- 所有 Pairing Bid 只匹配当前 Crew 实际可申请的 Pairing 池。
- `rawMatches` 在进入 Tier 合并前已经完成 Period、FLY、Base、Rank 过滤。
- Pre-assignment 只读取真实 `PA` 数据，不把完整导入排班误判为预分配。
- Award 列表数量和状态分布与 Pairing Search、算法导出资格口径一致。
- 视觉语义对齐参考页面，避免满屏红叉和过度使用状态色。

## 3. 非目标

- 不修改 PBS Engine 或算法 CSV 格式。
- 不新增数据库字段或 migration。
- 不在 Feedback 中实现 Team Rule；没有稳定 Scenario/Run 绑定时继续标记 unavailable。
- 不通过隐藏错误数据、限制固定条数或调整排序掩盖候选池问题。
- 不把 Feedback 变成最终 Award 预测。

## 4. 候选池与匹配流程

### 4.1 Crew 可申请 Pairing 池

任何 Pairing Bid 在执行 property 条件前，先形成 `crewEligiblePool`：

1. Pairing 未删除，且属于现有 `buildEligibleFlyPairingFilter` 定义的有效 FLY Pairing；
2. Pairing 的 Base Local Origin Date 落在当前 `roster_period.rp_start` 至 `rp_end` 的闭区间内；
3. Pairing Base 与当前 Crew 在该 Period 的有效 Base 一致；
4. `pairing_composition.acting_rank` 必须包含 Crew 在该 Pairing Origin Local Day 有效的 Rank；没有有效 Composition 或没有匹配 Rank 均不进入候选池。

Base、Rank 必须读取 Live `crew_base` / `crew_rank` 的日期有效记录，并复用 `live-server` 权威 `PAIRING_SCORE.csv` 的逐 Pairing 日期资格逻辑。不得只依赖 `pbs_user.base/rank` 或 Period 开始时的单一快照，也不得在 Feedback 重新发明一套映射。

逐 Pairing 解析规则固定为：

- 使用 Pairing Base Local Origin Day 对应的 UTC 日界 `[localDayStartUtc, localDayEndUtc)` 判断 `eff_dt/exp_dt` 是否覆盖该日；
- Base 只读取 `is_prime_base=1`；同日多条有效 Base 时按 `eff_dt DESC, id DESC` 选择一条；
- Rank 保留该日全部有效 `crew_rank.rank`，任一 Rank 命中 Composition 即通过；
- 当天没有唯一可用 Base、没有有效 Rank、Base 时区缺失或没有匹配 Composition Rank 时，该 Pairing 不进入候选池；不得回退到 `pbs_user` 当前值。

本次不按 Crew Fleet 过滤。现有权威导出没有把 Fleet 定义为 Crew 级 Pairing eligibility，Feedback 不得自行增加该业务规则。

本次也不使用 Division fallback。当前 Pairing Search 与活跃的 `live-server` 导出都以 Composition Rank 命中为准；Feedback 必须遵循相同的严格口径。

### 4.2 条件匹配顺序

Airport、Pairing Length、Time Between Flights、Flight Legs per Duty 等普通 property 只在 `crewEligiblePool` 内执行条件匹配。

普通条件不再产生其他基地、其他 Division/Rank 的解释性红叉；这些 Pairing 本就不属于 Crew 可申请范围，不应出现在 Feedback 中。

### 4.3 Pairing Number / Occurrence

`propertyCode=102`、`bid.type='pairing-occurrence-list'` 不调用通用 `buildPreviewCondition`，而是走独立精确匹配分支，再与同一个 `crewEligiblePool` 相交：

- 只按保存的 `(pairingId, originDate)` 精确解析；
- 仍须满足有效 FLY、Base Local Origin Date 在当前 Period、Base 和 Rank eligibility；
- 已删除、非 FLY、跨出当前 Period、找不到或已不再满足 Base/Rank 的旧选择不进入 Pairing 列表；
- 不把旧选择错误映射到同号但不同 ID/日期的 Pairing；
- 本次不新增“失效历史选择”展示契约，其现有保存/校验行为保持不变。

这样 Feedback 与 Pairing Number 搜索入口保持一致：搜索入口不能选择的 Pairing，Feedback 也不会重新放回列表。

### 4.4 Tier 合并

`rawMatches` 的新定义为：

`当前 Crew 的 crewEligiblePool ∩ 当前有效 Bid 条件命中集合`

Pairing Number/Occurrence 只是“当前有效 Bid 条件”的一种，不绕过前置资格范围。随后继续使用现有 Tier counter 合并规则计算 `rawDirection`。`exportDirection` 继续反映算法实际接收到的方向。

`PA overlap` 只属于 Feedback 的可执行性提示，不是 `PAIRING_SCORE.csv` 的 Base/Rank 导出过滤条件。因此：

- 命中 `crewEligiblePool` 的 Pairing 即使与 `PA` 重叠，也保留原本 `exportDirection`；
- Award 列表仍显示该 Pairing，并标记 `Not eligible` / `Pre-assignment overlap`；
- 禁止因为 `PA overlap` 把 `exportDirection` 改成 `null` 或 `neutral`。

## 5. Pre-assignment 口径

资格冲突查询固定为：

- 当前 Crew；
- 当前 Bid Period；
- `roster_flight.is_deleted = 0`；
- `roster_flight.source = 'PA'`；
- 与 Pairing 使用半开区间 `[start, end)` 判断重叠。

`IMP`、`MA`、`CR` 和其他普通或已发布 roster 来源不参与 Bid Feedback 的 Pre-assignment 检查。`IMP` 不得因为“可能包含预排数据”而整体加入；如果未来存在更细的权威类型字段，应另行设计迁移。

同一业务任务按 Pairing/Duty 聚合，只返回一个冲突说明，不按航段重复。

## 6. UI 状态与颜色

列表视觉语义对齐参考项目，同时使用项目语义化颜色 token：

- Eligible：普通白色行，末列灰色勾；选中后使用浅蓝背景；
- Not eligible：整行浅红背景并显示红叉；该状态只用于候选池形成后仍可权威判断的冲突，例如 `PA` overlap，不用于展示其他 Base/Rank 的 Pairing；
- Unknown/Unable to verify：中性背景和可访问的未知状态图标，不伪装 Eligible；
- 右侧详情中的 `Eligible on available checks` 使用绿色状态；
- 右侧 `Not eligible` 使用红色状态并列出具体原因；
- 状态不能只依赖颜色，图标必须具有可访问名称。

若不合格行被选中，浅蓝选中背景优先于浅红背景；红叉、红色状态文字和左侧红色状态标记继续保留，保证同时看得出“当前选中”和“不可用”。

Avoid 不显示 Eligibility 图标和红色资格状态。Days Off 不参与 Pairing Eligibility。

## 7. API 与实现边界

- 复用 Pairing Search 的 Period Context、FLY 基础过滤和 condition builder；Crew Base/Rank 改为抽取 `live-server` 导出等价的逐 Pairing Origin Local Day resolver，不能复用只返回单一当前值的 Actor Context。
- Feedback service 继续负责 Bid source resolution、Tier 合并、方向和响应组装。
- Pairing Search Feedback query 负责返回修正后的候选匹配与资格事实。
- 不新增依赖、配置开关、Redis 类型或数据库对象。
- 缓存 key/version 必须升级，避免读取旧的全量候选结果。
- Conflicts 摘要接口与完整 Feedback 必须使用同一修正口径。

## 8. 错误处理

- 当前 Period、Crew Base、Rank 或必要时区缺失：返回现有稳定业务错误，不退回全量 Pairing。
- 数据库或缓存失败：使用现有产品化错误与 Retry；不得向 Portal 暴露 SQL、Redis 或异常堆栈。
- Redis 旧缓存不得继续返回修复前的 `2679` 条结果。

## 9. 测试与验收

### 9.1 后端自动化

- 普通条件只匹配 Base Local Origin Date 位于 Period 内、Base 一致、Rank 匹配的有效 FLY Pairing。
- 无关 Base、Pilot/Cabin Pairing 不进入普通条件结果。
- Pairing Number/Occurrence 同样经过 Period、FLY、Base、Rank 前置过滤；失效、跨期或不属于 Crew 的选择不进入结果。
- Pairing Number/Occurrence 使用 `(pairingId, originDate)` 独立分支，不传入会拒绝该 payload 的通用 `buildPreviewCondition`；其 Pairing ID 集合与算法导出序列化结果一致。
- Pairing 在 Period 前开始但 Origin Date 不在 Period 内，即使后续航段与 Period 重叠也不进入；Origin Date 在 Period 内但结束时间跨出 Period仍可进入。
- Base/Rank 按每个 Pairing Origin Local Day 的有效记录解析，覆盖 Period 内换 Base、换 Rank以及重叠记录排序。
- 没有 Composition 或 Composition 不包含当日有效 Rank时均不进入；不使用 Division fallback。
- Pre-assignment 仅 `PA` 产生 overlap；相同时段 `IMP/MA/CR` 不产生 overlap。
- `PA overlap` 不清空或中和 `exportDirection`，只产生 UI Eligibility 原因。
- Avoid 不附带 Eligibility。
- Feedback 与 Pairing Search/算法导出的可用池 parity 测试通过。
- Redis cache version 更新后不会命中旧结果。

### 9.2 Portal 与 Playwright

- Award 列表正常行为以白色行和灰勾呈现。
- 不合格行使用浅红背景和红叉，选中行仍有清晰选中态。
- 右侧详情显示正确原因；Avoid 不显示资格状态。
- 真实 UI 打开 Feedback、切换页签、选中正常/异常行并检查详情。
- 不使用 mock 替代本次被测的真实 Feedback 请求。

### 9.3 DEV 数据验收

使用 Crew `19`、`Jun 2026` 作为回归观察样本：

- 普通条件结果不得继续出现其他 Base 和 Pilot `CA/FO` Pairing；
- 列表数量应从全量 `2679` 显著下降到 Crew 可用池范围；
- 不能再因 `IMP` 覆盖全月而产生 `2585` 个 Pre-assignment overlap；
- 若存在 `PA` overlap，保留该候选并正确显示红叉和原因；Base/Rank 不匹配项不得出现。

验收不硬编码某个最终数量，避免业务数据正常变化造成脆弱测试；自动化测试使用固定 fixture 锁定规则。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Pairing 候选池、资格查询、Feedback 组装和 Portal 状态语义共享同一业务契约，顺序实施更容易保证 parity。
- Suggested split: 不拆分，由单一实现链路依次完成后端查询、service、Portal、自动化与 QA 文档。
- Write boundaries: `pbs-server` Bid Feedback/Pairing Search、`pbs-portal` Bid Feedback、对应 contract/tests/QA 文档。
- Conflict risk: Medium；候选池逻辑与算法导出资格口径存在共享依赖，必须避免重复实现。
- Execution gate: 用户审阅并明确批准本 spec 后，才能编写实施计划和修改业务代码。

## 11. 验收结论

完成后，Bid Feedback 应回答“当前 Crew 实际可申请范围内，哪些 Pairing 命中了 Bid，是否还与 PA 冲突”，而不是把全航司 Pairing 全部列出后再用红叉淹没用户。
