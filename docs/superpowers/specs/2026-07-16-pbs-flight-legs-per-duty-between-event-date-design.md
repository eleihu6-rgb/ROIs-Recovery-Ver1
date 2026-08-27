# PBS Flight Legs per Duty 区间与事件日期统一设计

## 1. 背景

当前 PBS Portal 的 `Flight Legs per Duty`（`propertyCode=107`）已经支持：

- `Award / Avoid`；
- `Any duty / Every duty`；
- `< / = / >` 三种比较符；
- 单个 legs 数值。

与标准答案项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 对比后，当前实现仍有三项差异：

1. 标准答案使用 `minLegs / maxLegs` 表达 legs 区间，我们缺少 `Between`。
2. 标准答案为该条件提供日期 scope，我们缺少事件日期限制。
3. 标准答案只统计实际飞行腿，Deadhead legs 不计入；当前 Pairing Search 按 duty 统计全部有效 `pairing_segment`，存在把 Deadhead 一并计入的风险。

另一个已确认设计 [PBS Check-In / Check-Out Time 事件日期统一设计](./2026-07-16-pbs-check-time-event-date-alignment-design.md) 正在将 `Airport Preference` 与 `Pairing Check-In / Check-Out Time` 收敛到同一套 Event Date 契约和 UI。本次 `Flight Legs per Duty` 必须消费同一共享能力，不能再复制第三套日期实现。

## 2. 已确认产品结论

1. `Flight Legs per Duty` 增加 `Between`。
2. `Between` 显示 `From / To` 两个 legs 输入。
3. 增加 `LIMIT TO EVENT DATE` 可选日期限制。
4. 日期限制支持：
   - `Specific Dates`：支持一个或多个独立日期；
   - `Date Range`：支持一个起止日期闭区间。
5. Event Date 按标准答案定义为每个 duty 开始机场当地的 check-in 日期，不使用 crew Base 日期。
6. legs 只统计 FLY legs，Deadhead legs 不计入。
7. `Airport Preference`、`Pairing Check-In / Check-Out Time`、`Flight Legs per Duty` 共用相同的 Event Date 数据结构和 UI 行为。

## 3. 目标

1. 为 `Flight Legs per Duty` 增加完整的 `< / = / > / Between` 数字比较能力。
2. 复用共享 Event Date editor，支持多日期与日期范围。
3. 使用专属 bid payload，避免把日期字段扩散到所有通用 `stepper` 条件。
4. 兼容已有 `stepper` 历史 bid，打开、编辑、保存时不丢失用户原有选择。
5. Pairing 页面与 Search Pairings 使用同一个 editor、payload 和筛选语义。
6. Pairing Search、preview 与算法 `PAIRING_SCORE` 导出复用同一条件匹配逻辑。
7. 修正 legs 计数，只统计 FLY legs。

## 4. 非目标

- 不修改 `Airport Preference` 的机场、事件、layover 或 fulfilment 业务字段。
- 不修改 `Pairing Check-In / Check-Out Time` 的时间类型和时间比较逻辑。
- 不批量改造其他数字条件。
- 不改变 Tier、Award/Avoid、Favorite 或 Current Draft 的通用工作流。
- 不新增独立日期选择器或另一套 Event Date contract。
- 不使用 crew Base 时区解释 duty Event Date。
- 不改变标准答案之外的 solver 评分权重或 tier counter 语义。

## 5. 方案比较与决策

### 5.1 方案 A：共享 Event Date + 专属 Flight Legs payload（采用）

为 `Flight Legs per Duty` 定义专属 bid 类型；日期部分复用共享 `PairingEventDateScope` 和 optional Event Date editor。

优点：

- 业务语义明确；
- 不污染通用 `stepper`；
- `Between`、日期、旧数据兼容均可在一个边界内收敛；
- 三个 Event Date 条件不会再次产生 UI 与 payload 漂移。

代价：

- 需要同步修改 contracts、Portal、Server、搜索、序列化与测试；
- 必须提供旧 `stepper` 读取兼容。

### 5.2 方案 B：给通用 `stepper / stepper-range` 增加 `dateScope`（不采用）

改动表面较少，但会让所有数字型 property 都看似支持日期，扩大无效状态空间并弱化类型边界。

### 5.3 方案 C：复用 property 外层 `effectiveDateRange`（不采用）

外层结构不能表达多个独立日期，也无法准确表达 duty event date，因此不符合已确认需求和标准答案。

## 6. 共享 Event Date 契约

本次不新增 Flight Legs 专属日期类型。三个条件统一使用：

```ts
type PairingEventDateScope =
  | { mode: "specific_dates"; dates: string[] }
  | { mode: "date_range"; from: string; to: string };
```

语义：

- `dateScope=null` 或缺失：不限日期；
- `specific_dates`：event local date 命中 `dates` 中任意一天；
- `date_range`：event local date 落在 `from` 至 `to` 的闭区间内。

日期格式统一为 `YYYY-MM-DD`。

共享 optional Event Date editor 负责：

- `LIMIT TO EVENT DATE` 开关；
- `Specific Dates / Date Range` segmented control；
- `PbsDatePicker mode="multiple"`；
- `PbsDatePicker mode="range"`；
- 模式切换与关闭开关时清理隐藏字段；
- 日期部分的局部有效性反馈。

具体条件仍负责完整 bid 的业务有效性，不把 legs、airport 或 check-time 逻辑塞进共享日期组件。

## 7. Flight Legs 专属数据契约

新标准 payload：

```ts
type PbsFlightLegsPerDutyBid =
  | {
      type: "flight-legs-per-duty";
      operator: "<" | "=" | ">";
      legs: number;
      dateScope?: PairingEventDateScope | null;
    }
  | {
      type: "flight-legs-per-duty";
      operator: "Between";
      from: number;
      to: number;
      dateScope?: PairingEventDateScope | null;
    };
```

`propertyCode=107` 的 catalog 定义同步收敛为：

```ts
type PbsPairingNumericBounds = {
  min: number;
  max: number;
};

{
  propertyCode: 107,
  name: "Flight Legs per Duty",
  defaultBid: {
    type: "flight-legs-per-duty",
    operator: "=",
    legs: 2,
    dateScope: null,
  },
  numericBounds: { min: 1, max: 8 },
  // existing actions/operators/quantifiers...
}
```

- `numericBounds` 是 property definition 的独立元数据，不再从 `defaultBid.min/max` 反推；
- `defaultBid` 必须是合法的专属持久化 payload，用于非显式选择路径和兼容 fallback；
- Pairing Property Definition contract、clone 和 catalog mapper 必须保留 `numericBounds`；
- 只有确实需要整数边界的 property 才设置该字段，不借本任务迁移其他 property；
- `propertyCode=107` 的新建显式配置仍按下述 UI draft 规则清空 operator/输入，不把 defaultBid 的 `=/2` 展示成用户已选择。

以上 union 只表示可持久化、可提交的合法 payload。未完成的新建/编辑状态使用独立 UI draft：

```ts
type FlightLegsPerDutyDraft = {
  operator: "<" | "=" | ">" | "Between" | null;
  legs: string;
  from: string;
  to: string;
  dateScope: PairingEventDateScope | null;
};
```

- draft 允许 operator 未选择、输入为空或暂时非法；
- property catalog 的 `numericBounds` 提供 min/max 边界；不得从 defaultBid 读取边界；
- require-explicit-selections 的新建路径不得把 defaultBid 的 value/operator 自动填入草稿；
- 编辑已有 bid 时，先归一化为严格 payload，再映射到 draft；
- 仅在 Add、Update、Save Favorite 或 Search criteria confirm 边界，从合法 draft 构造严格 payload；
- Flight Legs editor 内的 draft operator 是该条件唯一权威，不能再同时维护一个可独立变化的旧 stepper operator 状态。

`action`、`quantifier` 和 `tiers` 继续使用 property 外层现有字段：

- `action`: `award | avoid`；
- `quantifier`: `any | every`；
- `tiers`: 当前选中的 `T1-T7`。

不在 bid payload 内重复保存这些字段。

## 8. UI 与交互

弹窗字段顺序固定为：

1. `TIERS`
2. `PREFERENCE`
3. `DUTY MATCH`
4. `LEGS PER DUTY`
5. `LIMIT TO EVENT DATE`
6. Footer

### 8.1 默认状态

- Tier：不默认选中；
- Preference：默认 `Award`；
- Duty Match：默认 `Any duty`；
- legs operator：新建时保持未选择；
- legs value：新建时保持空；
- `LIMIT TO EVENT DATE`：默认关闭；
- Add/Save Favorite 仅在 Tier、operator、legs 及已开启的日期限制均合法时可用。

### 8.2 Legs 比较

- 使用共享 `PreferenceComparisonValueControl`。
- operator 显示 `< / = / > / Between`。
- `< / = / >` 显示一个 `Enter legs` 输入。
- `Between` 显示 `From / To` 两个输入。
- suffix 使用 `legs`。
- 值必须是现有 property catalog `min/max` 范围内的安全整数。
- `Between` 要求 `from <= to`。
- `Between` 是包含两端的闭区间：`from <= flyLegCount <= to`；`from=to` 合法。
- 切换到 `Between` 时不提交旧单值；切换回单值 operator 时不提交旧 `from/to`。

### 8.3 Event Date

- 完全复用 Airport/Check-Time 共享 optional Event Date editor。
- label 固定为 `LIMIT TO EVENT DATE`。
- 开关关闭时不展示日期 mode/picker，并输出 `dateScope=null`。
- 开启后默认 `Specific Dates`，日期数组为空，因此在至少选择一个日期前 bid 无效。
- `Specific Dates` 支持多选。
- `Date Range` 使用一个标准范围 picker，不使用两个独立日期浮层。
- 日期只能从当前 bid period 中选择。

## 9. 匹配语义

### 9.1 Duty Event Date

Flight Legs 不定义另一套 duty 日期字段，必须复用 Check-Time 统一设计中的 check-in event-date expression。对每个 `pairing_id + duty_seq`：

1. 在 `is_deleted=0` 且 `brief_start_utc` 非空的 segments 中，按 `brief_start_utc ASC, duty_seq ASC, seg_seq ASC` 选择最早一行；
2. check-in timestamp 使用该行的 `brief_start_utc`；
3. event airport 使用同一行的 `dep_arp`，不得从另一 segment 或 crew Base 取时区；
4. 使用 event airport 的有效 IANA timezone 转换 timestamp，得到当地日期；
5. airport `zone_id` 为空、非法或无法在 `pg_timezone_names` 中解析时，使用统一的 UTC fallback；
6. duty 没有合法 `brief_start_utc` 时，不进入带日期限制的候选集合。

timestamp 与 airport 必须来自同一个 event row。即使该首段是 Deadhead，它仍定义 duty check-in event；FLY/Deadhead 分类只影响 legs 计数，不改变 event airport/date。

该语义不读取 crew Base，也不使用 Base timezone。

### 9.2 FLY legs 计数

- 先按 `pairing_id + duty_seq` 建立全部有效 duty 候选集；Deadhead-only duty 仍保留，FLY legs 数量为 `0`。
- legs count 只统计同一 duty 内 `is_deleted=0` 且 `seg_assignment` 归一化后为实际执飞的 segment。
- 本项目 canonical 正常执飞代码是 schema 注释中的 `FLT`；为兼容现有导入数据，读取边界同时接受 `FLY`。
- Deadhead 代码 `DH`、`DHD` 均不计数。
- `TRN`、空值和未知 assignment 默认不计作 FLY，不允许用 `duty_assignment` 或显示层标签代替 `seg_assignment` 判断。
- 归一化只做 `trim + uppercase`，不把未知值静默改写成 FLY。

### 9.3 Any / Every

匹配顺序：先按 Event Date 筛选 duties，再计算 legs 条件。

- 无日期限制：候选集合为 pairing 的全部有效 duties。
- 有日期限制：候选集合仅包含 Event Date 命中的 duties。
- `Any duty`：候选集合中至少一个 duty 满足 legs 条件。
- `Every duty`：候选集合至少包含一个 duty，且所有候选 duties 都满足。
- 候选集合为空：不命中。
- `Between`：对每个 duty 使用闭区间 `from <= flyLegCount <= to`。
- Deadhead-only duty 的 `flyLegCount=0`，因此可命中 `< 1`，不能命中 `> 1`；它也必须参与 Every 与 Avoid 的结果计算。

`Avoid` 继续通过现有 intent wrapper 对正向匹配结果取反，不另写一套 legs SQL。

## 10. 保存、回显与旧数据兼容

### 10.1 新写入

Add、Update、Favorite 和 Search criteria 新写入只产生 `flight-legs-per-duty` payload。

### 10.2 旧格式归一化

读取边界兼容：

```json
{ "type": "stepper", "value": 3, "operator": ">", "min": 1, "max": 8 }
```

归一化为：

```json
{
  "type": "flight-legs-per-duty",
  "operator": ">",
  "legs": 3,
  "dateScope": null
}
```

如果历史数据存在 `stepper-range`，归一化为 `Between + from/to`。

旧格式归一化仅在 `propertyCode=107` 生效：

- `stepper.operator` 缺失时沿用现有语义，归一化为 `=`；
- 合法 `< / = / >` 与数值原样保留；
- `stepper-range` 归一化为包含两端的 `Between`；
- catalog 的当前 min/max 是验证权威，旧 payload 自带的 min/max 仅作历史元数据，不覆盖 catalog；
- 非法 operator、非整数、缺值或超出当前 catalog 的历史数据不得被静默夹取或改写，应保留可诊断错误并阻止重新保存；
- 该归一化覆盖 Current Bid、Favorite、clone、summary、Search criteria 和 algorithm export 的读取边界。

兼容只存在于 contract normalization / deserialize 边界：

- 前端 state 不维持旧新双轨；
- 新保存不再产生旧结构；
- summary、搜索和算法导出只消费归一化后的专属结构。

若数据库中存在需要批量升级的历史 JSON，实施阶段先执行只读统计，再决定是否增加幂等 migration；不得在没有数据证据时预先修改业务数据。

## 11. 服务端验证与错误处理

服务端在 Add、Update、Favorite、Search preview 边界统一验证：

- `operator` 必须为 `< / = / > / Between`；
- 单值 operator 必须有合法整数 `legs`；
- `Between` 必须有合法整数 `from/to` 且 `from <= to`；
- legs 必须落在 property catalog 的有效 min/max 范围内；
- 日期验证直接复用 Check-Time 共享 normalizer/validator，不另写 Flight Legs 分支；
- `specific_dates` 至少一个日期，所有日期合法且位于当前 period；重复日期保存前去重、不报错，并保持第一次出现的顺序；
- `date_range` 起止日期合法、位于当前 period 且 `from <= to`；
- period 边界统一由 `parsePeriodMonth(periodCode)` 解析为自然月；periodCode 无法解析而 payload 带日期限制时返回 400，不降级为不限日期；
- 不接受与当前 operator 不匹配的隐藏字段。

错误响应沿用现有 `{ code, data, message }`，不新增独立错误协议。

## 12. Search 与算法导出

### 12.1 Pairing Search

Pairing 页面 preview 与 Search Pairings 必须调用同一个条件构造逻辑：

- 使用参数化 SQL；
- 多日期使用数组匹配；
- 日期范围使用闭区间；
- operator 与 legs 值均通过 query parameter 传递；
- FLY legs 与 duty Event Date 在同一 duty 粒度内计算，不能先对 pairing 全局汇总再套日期。
- `Between` 必须生成包含两端的 lower/upper bound 比较。

### 12.2 Algorithm export

`propertyCode=107` 当前通过 Pairing Search 匹配 pairing，并进入 `PAIRING_SCORE` 导出。本次不新增另一套 solver 参数格式：

- 导出复用更新后的 preview/search 匹配；
- `Between`、多日期、日期范围、Any/Every、FLY-only 均影响最终匹配 pairing 集合；
- 输出文件结构保持现有格式；
- 必须新增 focused export 回归，覆盖 Any/Every、无日期、多日期、日期范围、Between 与 Deadhead-only/混合 duty，证明三入口使用同一匹配集合。

## 13. 摘要与回显

摘要必须表达：

- action；
- Any/Every duty；
- 单值或 Between legs 条件；
- 可选日期范围。

示例：

- `Award · Any duty · > 3 legs`
- `Avoid · Every duty · Between 2 - 4 legs`
- `Award · Any duty · Between 2 - 4 legs · on 2026-07-18, 2026-07-21`
- `Award · Every duty · = 3 legs · between 2026-07-18 - 2026-07-21`

具体标点和大小写应沿用当前 Pairing summary 风格，不另建展示体系。

## 14. 影响范围

预计涉及：

- `packages/contracts/pbs-pairing-bids.d.ts`
- `packages/contracts/pbs-pairing-bids.js`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/components/flight-legs-per-duty-editor.tsx`
- Flight Legs editor、Pairing 页面与 Search Pairings focused tests
- Pairing bid mapper、summary、完整性验证
- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/lineholder/` 的 serialize / deserialize / clone / format
- `pbs-server/src/services/pairing-search/` 的 duty 级日期与 legs 条件构造
- `pbs-server/src/services/algorithm-export/` 的 Pairing Score 回归
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- `docs/test-cases/pbs/condition-properties/` 下的手工 QA 用例

共享 Event Date contract/component 由 Check-Time 统一设计先落地；本任务消费，不复制。如实施时尚未落地，应先完成共享基础并明确文件所有权，禁止两个任务同时编辑同一 shared contract/component。

## 15. 测试设计

### 15.1 Portal focused tests

覆盖：

- 新建默认 Award、Any duty、空 Tier、空 operator、空 legs、日期开关关闭；
- `< / = / >` 单值输入；
- `Between` 显示 From/To；
- operator 切换清理隐藏字段；
- `Between` 倒序无效；
- `Between` 下界、上界、区间外和 `from=to`；
- 日期开关开启后默认空 `specific_dates` 且不可保存；
- 选择一个和多个日期；
- 切换 Date Range 清理旧 dates；
- 切回 Specific Dates 清理旧 from/to；
- 关闭开关输出 `dateScope=null`；
- 旧 `stepper` 和可能存在的 `stepper-range` 正确回显；
- Pairing 与 Search Pairings 复用同一 editor。

### 15.2 Server focused tests

覆盖：

- contract normalization；
- 新结构 validation；
- 旧 `stepper` 缺失 operator 时归一化为 `=`；
- 旧 `stepper-range` 归一化为 inclusive `Between`；
- 旧 payload 的 min/max 不覆盖 catalog `numericBounds`；
- 非法 operator、非整数、缺值和超出 catalog 的历史值阻止重存且产生可诊断错误；
- propertyCode 非 107 的通用 stepper 不进入 Flight Legs 归一化；
- serialize / clone / summary；
- 非法 operator、空值、越界值与倒序 Between；
- Specific Dates 重复值去重但不报错，并保持首次出现顺序；
- 多日期、范围和 period 越界；
- 带日期限制时非法 `periodCode` 返回 400；
- Any / Every 的候选 duty 为空语义；
- duty 开始机场本地日期；
- 跨 UTC 午夜但本地日期不同的匹配；
- timezone 缺失/非法时 UTC fallback；
- FLY + Deadhead 混合 duty 只统计 FLY；
- assignment `FLT/FLY` 均计为 FLY，`DH/DHD/TRN/空值/未知值` 不计；
- Deadhead-only duty 保留为 0-leg duty，并覆盖 `< 1`、`> 1`、Every 与 Avoid；
- 首段为 Deadhead 时仍以该 check-in event row 的机场/时间确定 Event Date；
- Pairing Search SQL 全部参数化；
- 同一 fixture 在 Pairing preview、Search Pairings 和 `PAIRING_SCORE` export 的结果 pairing ID 集合一致；
- 三入口集合对照覆盖 `< / = / > / Between`、Any/Every、null/specific_dates/date_range、跨午夜及 Deadhead-only/混合 duty。

### 15.3 Playwright

通过真实 PBS Portal UI：

1. 打开 Pairing 页面新增 `Flight Legs per Duty`。
2. 选择 Tier、Award/Avoid、Any/Every。
3. 选择 `Between` 并输入 From/To。
4. 开启 `LIMIT TO EVENT DATE`，选择两个 Specific Dates。
5. 保存并验证摘要和编辑回显。
6. 编辑为 Date Range，确认旧 dates 已清理。
7. 关闭日期限制并保存，确认摘要不再包含日期。
8. 在 Search Pairings 入口验证相同 editor 和条件回显。
9. 使用可识别 fixture 验证 Search Pairings 实际返回集合与 Pairing preview 一致，而非只验证表单回显。

### 15.4 QA 手工用例

新增 `docs/test-cases/pbs/condition-properties/<date>-flight-legs-per-duty.md`，至少覆盖：

- `< / = / > / Between`；
- Any / Every；
- 无日期、多日期、日期范围；
- 模式切换与隐藏字段清理；
- Favorite；
- 旧 bid 回显；
- Search Pairings；
- FLY + Deadhead 混合 duty；
- Base 与 duty 开始机场不同时的本地日期；
- 非法、空值和边界值。

## 16. 验收标准

1. UI 提供 `< / = / > / Between`，且 Between 为 From/To 双输入。
2. UI 提供与 Airport/Check-Time 完全一致的 `LIMIT TO EVENT DATE` 交互。
3. Specific Dates 支持多选，Date Range 支持闭区间。
4. Event Date 使用 duty 开始机场当地 check-in 日期，不使用 Base 日期。
5. legs 只统计 FLY，Deadhead 不计入。
6. Any/Every、空候选 duty 的语义与本 spec 一致。
7. Deadhead-only duty 以 0 FLY legs 参与 `< / > / Between / Every / Avoid`，而不是从候选集合删除。
8. 旧 `stepper` bid 可无损打开并重新保存为新结构。
9. Pairing 页面、Search Pairings 和 Pairing Score export 的结果 pairing ID 集合一致。
10. focused tests、真实 UI Playwright、build、lint、`npm run check:ui` 和 `git diff --check` 通过。
11. QA 手工测试文档完成。

## 17. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Check-Time 与 Flight Legs 会触达共享 Event Date contract、组件、验证及搜索构造；并行写入容易产生契约和文件冲突。
- Suggested split: 先完成共享 Event Date 基础，再由 Flight Legs 串行消费；测试探索可并行，但实现写入不并行。
- Write boundaries: Check-Time 任务负责共享日期能力；Flight Legs 任务负责专属 editor、payload、FLY-only 计数、搜索和测试。
- Conflict risk: High if shared files are edited simultaneously; Low after shared foundation lands.
- Execution gate: 两份 spec 均经用户批准，并先确认共享 Event Date 文件的最终状态和所有权。

## 18. 实施门禁

实施前必须：

1. 确认 Check-Time Event Date 共享 contract/component 已落地，或明确由本任务先完成共享基础。
2. 阅读 `docs/architecture/data-model.md`、`docs/architecture/codebase-index.md` 和 `pairing_segment` 权威 schema/FK/assignment 字段。
3. 对所有将修改的函数/方法执行 GitNexus upstream impact analysis，并向用户报告 blast radius。
4. HIGH/CRITICAL 风险必须先告警，再开始编辑。
5. 用户审阅本 spec 并明确批准实施。
