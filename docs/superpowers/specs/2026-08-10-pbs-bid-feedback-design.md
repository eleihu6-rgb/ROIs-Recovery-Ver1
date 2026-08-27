# PBS Portal Bid Feedback 设计

## 1. 背景

Crew 在 PBS Portal 创建多条 Bid 后，目前只能查看已保存的规则和现有 `BID REVIEW` 提示，缺少一个面向整套 Bid 的反馈入口，无法直接确认：

- 当前规则最终匹配了哪些 Pairing；
- 希望获得的 Pairing 是否因硬性资格条件而不可能被 Award；
- Avoid 与 Days Off Bid 实际覆盖了什么；
- 不同 Bid 之间是否存在冲突或需要注意的组合。

本功能参考产品项目：

`/Users/lei/Codehub/Flair_PBS_Optimization_Report`

参考入口为 `Unit Test Page → Data Center Mode → Bid Feedback`。参考项目提供布局、反馈分类、冲突规则和资格原因基线；时间规则以本项目已确认的产品要求为准。参考项目 Pairing 使用 local 字段，但 Pre-assignment 详情仍显示 UTC，因此不能把它概括成“所有页面时间均已使用 Base Local Time”。本项目明确要求 Feedback 的用户可见时间统一转换为 Crew Base Local Time。

当前设计遵循以下原则：

1. Feedback 直接读取结构化 Bid，不依赖或解析算法 CSV。
2. 页面时间按 Crew Base Local Time 展示；算法导出的 Days Off 时间仍保持 UTC。

## 2. 目标

在 PBS Portal 的 Bid 页面提供 `BID FEEDBACK`，让当前登录 Crew 在提交或继续调整 Bid 前，能够查看整套 Bid 的匹配结果、Award 资格、Days Off 申请以及 Bid 冲突提示。

功能只提供解释和检查，不修改 Bid、不阻塞保存，也不承诺算法最终一定 Award 某个 Pairing。

## 3. 范围

### 3.1 本期包含

- 在 Bid 页面工具栏增加 `BID FEEDBACK`。
- 按当前登录 Crew、当前 Bid Period、全部 Tier 生成反馈。
- 提供 `Award`、`Avoid`、`Days Off` 三个页签。
- Award Pairing 进行硬性资格校验并解释不可 Award 的原因。
- 检查 Crew 自己的 Bid 之间是否存在 Conflicts 或 Advisories。
- 提供 `Bids / Calendar` 两种查看方式。
- Feedback 中所有业务时间按 Crew Base Local Time 展示。
- 增加加载、空数据、失败与重试状态。
- 增加后端测试、前端测试、真实 Playwright 测试和 QA 人工测试文档。
- 修复并验证现有 `DAYSOFF.csv` 基地本地时间转 UTC 的跨午夜和无效时区诊断行为。

### 3.2 本期不包含

- 不修改 PBS 算法。
- 不修改 `PAIRING_SCORE.csv`、`DAYSOFF.csv` 或其他算法输入格式。
- 不根据 CSV 反向生成 Feedback。
- 本功能不以新增业务表或字段为默认方案；若实现前确认 Tier 权重没有任何权威可读来源，必须先单独确认配置落点，不能在 Feedback 内硬编码。
- 不在 Feedback 中编辑、删除或重新排序 Bid。
- 不把 Feedback 结果作为保存或提交 Bid 的阻塞校验。
- 不合并或删除现有 `BID REVIEW`。
- 不预测算法最终 Award 结果，也不展示虚假的“必定获得”结论。

## 4. 术语与职责边界

### 4.1 BID REVIEW

现有 `BID REVIEW` 继续保留，仍负责展示当前 Tier 的摘要、诊断、warning 和 legacy item。它是当前编辑上下文的快速提示。

### 4.2 BID FEEDBACK

`BID FEEDBACK` 面向当前 Crew 的整套 Bid，跨全部 Tier 计算实际匹配对象和资格结果。它回答的是：

> 我现在整套 Bid 实际表达了什么，其中哪些 Award Pairing 对我不可行，规则之间有没有冲突？

两者职责不同，不能互相替代。

## 5. 入口与交互

### 5.1 工具栏位置

在 Bid 页面 `EXISTING BID PROPERTIES` 区域的操作栏中增加入口，主要按钮顺序固定为：

`REFRESH → VIEW RULES → BID FEEDBACK → SEARCH PAIRINGS`

参考项目中的 Bid Conflict 提示使用独立警告图标。Portal 中将它作为 `BID FEEDBACK` 的附属控件，紧邻并位于 `BID FEEDBACK` 左侧，不改变上述主要按钮顺序。

### 5.2 冲突提示入口

- 图标初始不伪装成 0；Bid 页面核心内容完成首屏后，再独立加载真实 conflict 数量徽标。
- Conflicts 计入徽标数量；Advisories 不计入。
- 点击图标打开轻量提示面板，分为 `Conflicts` 与 `Advisory`。
- 无结果时显示 `No conflicts in your bids.`。
- 加载失败时显示产品化错误和 Retry，不展示原始异常。
- 点击外部或按 `Escape` 关闭。

### 5.3 Feedback 弹窗

点击 `BID FEEDBACK` 打开 Portal 既有白色轻量业务弹窗，不使用 Gantt 工具窗口式蓝色标题栏。

弹窗头部显示：

- `BID FEEDBACK`
- 当前 Crew 姓名或 Crew ID
- 当前 Bid Period
- `Calendar / Bids` 切换
- 关闭按钮

弹窗关闭后再次打开，从默认 `Award` 页签开始，不保留上次选中的 Pairing。

## 6. Feedback 内容

### 6.1 Award 页签

展示所有合并计算后净偏好大于 0 的 Pairing。

列表至少展示：

- Pairing Number / Label
- Base
- Start
- End
- Days
- Credit
- Eligibility 状态

仅 Award Pairing 进行资格校验。点击某一行后，在详情区显示：

- `Eligible`；或
- `Not eligible` 及具体原因。

资格结果明确分成三态：`eligible`、`ineligible`、`unknown`。Crew Rank 与 Base
已经是进入 `rawMatches` 的前置条件，不再作为列表中的 `ineligible` 原因。首期列表内
有权威数据来源的硬性不合格原因是 Pairing 与 Crew Pre-assignment 重叠。

资格数据来源固定为：

- Rank：当前 Period 内 `crew_rank` 的有效记录；
- Base：当前 Period 内 `crew_base` 的有效记录；
- Pre-assignment：Live `roster_flight` 中当前 Crew、当前 Period、`source='PA'`、`is_deleted=0` 且与 Pairing 时间重叠的预排任务；普通 MA/CR/其他 roster 记录不参与；
- Pairing composition、Base 与时间：Live Pairing/Pairing Segment 权威数据。

参考项目的 `Team Rule` 来源是指定 Scenario 的 `team_rules`。当前 Crew Portal 在点击 Feedback 时没有 Scenario/Run 身份，现有 PBS Bid 也没有可绑定的 Team Rule 版本，因此禁止读取“最新 Scenario”冒充权威规则。Team Rule 在本项目中的处理为：

- API capability 返回 `teamRuleEligibility: "unavailable"`；
- UI 明确显示 `Team rule eligibility is not available before an optimization scenario is created.`；
- 不把 Team Rule 未检查误报成 Eligible；
- 后续只有在 Period/Run 与 Team Rule 快照形成稳定绑定后，才单独扩展该原因。

Pre-assignment overlap 使用半开区间 `[start, end)`：仅端点相接不算冲突。同一飞行预排任务按 `pairing_id` 聚合航段；地面任务复用现有 roster duty grouping 规则聚合，资格结果对同一业务任务只生成一个冲突，不按 `roster_flight` 航段行重复提示。

资格未知或基础数据缺失时不得显示为无修饰的 Eligible，应显示明确的 `Unable to verify`。当 Rank、Base、Pre-assignment 均通过但 Team Rule 不可用时，状态字段可为 `eligible`，但 UI 固定显示 `Eligible on available checks`，同时展示 Team Rule 未检查说明，禁止显示 `PASS` 或“全部资格已通过”。

### 6.2 Avoid 页签

展示所有合并计算后净偏好小于 0 的 Pairing，列表字段与 Award 基本一致。

Avoid 不做资格校验。Crew 希望避免某个 Pairing 时，Crew 是否具备执行该 Pairing 的资格不构成问题，因此不得显示误导性的红色不可行提示。

### 6.3 Days Off 页签

展示当前 Bid Period 内的 Days Off 申请，至少包含：

- 日期；
- Tier；
- 如现有结构化 Bid 已包含时间窗口，则显示对应本地时间窗口。

Days Off 不做 Pairing 资格校验。

### 6.4 空数据

- 当前 Crew 没有任何 Bid：显示说明，不发起无意义的 Pairing 资格请求。
- 某一页签没有结果：只显示该页签的空状态，不影响其他页签。
- 当前 Period 外的数据不进入本次 Feedback。

## 7. Calendar 视图

Calendar 仅用于辅助理解本次 Bid Period 内的申请分布：

- 绘制 Award Pairing；
- 绘制 Days Off；
- 不绘制 Avoid Pairing；
- 跨日 Pairing 按同一任务连续展示；
- 不可 Award 的 Pairing 使用可识别但不只依赖颜色的状态标识；
- 所有日期与时间均以 Crew Base Local Time 计算和展示。

## 8. Pairing 匹配与 Tier 合并规则

### 8.1 数据来源

Feedback 读取数据库中的结构化 Bid，并复用 `pbs-server` 已有 Pairing property contract 与 Pairing 搜索条件构建能力。不得通过生成、读取或解析算法 CSV 获得 Feedback。

“当前 Crew 的有效 Bid”必须复用权威算法导出的 Bid source resolution：Current Bid 与 Standing Bid 如何覆盖、合并或生效，由现有 `buildBidSourceSql`/等价正式逻辑决定。Feedback 不得只读当前页面草稿而漏掉算法实际会读取的 Standing Bid，也不得重复实现另一套优先级。

### 8.2 匹配范围

> **修订说明（2026-08-10）：** 本节及 8.3 的候选池口径已被
> `2026-08-10-pbs-bid-feedback-scope-correction-design.md` 修正。普通条件 Bid
> 必须先进入当前 Crew 的可用 Pairing 池，禁止在 Live 全量 Pairing 上直接匹配。

- 当前登录 Crew；
- 当前 Bid Period；
- 当前 Crew 的全部有效 Tier；
- Base Local Origin Date 位于当前 Period 内的有效 FLY Pairing。

Pairing 以 Base Local Origin Date 归属 Period：Origin Date 在 Period 外时，即使航段与 Period 重叠也不纳入；Origin Date 在 Period 内时，允许结束时间跨出 Period。

### 8.3 原始匹配、资格过滤与最终方向

必须区分四个概念，避免把页面匹配结果与算法实际输入混为一谈：

1. `crewEligiblePool`：先按当前 Period 的 Base Local Origin Date、有效 FLY、Crew 当日有效 Prime Base、Crew 当日有效 Rank 与 Pairing Composition 形成可申请池；没有 Composition/匹配 Rank 均排除，不做 Division fallback，也不增加 Fleet eligibility。
2. `rawMatches`：`crewEligiblePool ∩ 当前有效 Bid 条件命中集合`。所有普通条件和 `propertyCode=102` 的 Pairing Number/Occurrence 都必须经过相同前置过滤，不存在绕过 Base/Rank 的明确点选例外；Occurrence 使用 `(pairingId, originDate)` 独立精确分支，不交给通用 condition builder。
3. `exportEligibleMatches`：复用权威算法导出资格口径得到实际可写入 `PAIRING_SCORE.csv` 的集合。
4. `rawDirection`：在修正后的 `rawMatches` 上合并各 Tier Award/Avoid counter 后得到的净方向，驱动 Feedback 的 Award/Avoid 页签。
5. `exportDirection`：仅对 `exportEligibleMatches` 合并 counters 后得到的方向，用于解释算法实际接收到的偏好。`PA overlap` 不是 `PAIRING_SCORE.csv` 的过滤条件，不得清空或中和该方向。

同一 Pairing 可能被多个 Bid 和多个 Tier 命中。`rawDirection` 与 `exportDirection` 使用同一权威 Tier 权重版本，方向规则为：

- Award 命中贡献正权重；
- Avoid 命中贡献负权重；
- 相同 Pairing 的所有贡献合并；
- 净值大于 0：进入 Award；
- 净值小于 0：进入 Avoid；
- 净值等于 0：两边都不展示。

Tier 权重不得由 Portal 或 `pbs-server` 自行硬编码。实施前必须完成以下前置检查：

- 从当前 `pbs-engine` 运行配置确认 T1-T7 counter 的权威权重/优先级语义及版本；
- 将该配置通过现有运行配置读取链路或正式共享 contract 暴露给 Feedback；
- 若运行时拿不到权威配置，Feedback 返回稳定错误 `BID_FEEDBACK_TIER_WEIGHTS_UNAVAILABLE`，不得用 `[7,6,5,4,3,2,1]` 猜测。

### 8.4 一致性要求

必须分别增加三层 parity 测试：

- 原始匹配 parity：Feedback `rawMatches` 与 `crewEligiblePool` 前置过滤后的现有 `buildPreviewCondition` 对同一 property fixture 的匹配一致。
- 导出过滤 parity：Feedback `exportEligibleMatches` 与 `live-server` 权威 `PAIRING_SCORE.csv` 导出 Rank/Base eligibility 过滤一致。
- 净方向 parity：只有在读取到同一版本的权威 Tier 权重后，验证 Feedback `exportDirection` 与算法对实际导出 counters 的解释一致；`rawDirection` 与已经完成 Crew eligibility 前置过滤的 counters fixture 对齐。

## 9. Bid 冲突与 Advisory

参考项目将 Bid 内部检查分成两类：

- `Conflicts`：规则之间存在直接矛盾或会互相抵消，可能导致 Crew 的真实意图无法成立。
- `Advisory`：规则组合值得注意，但不一定构成错误。

实现原则：

- 使用结构化 Bid 进行检查；
- 返回稳定的规则代码和产品化说明，不让前端根据原始异常文本判断类型；
- 冲突提示只读，不自动修改 Bid；
- 不与现有 `BID REVIEW` 的 Tier warning 重复生成同一条提示；
- 首期规则集合按下表映射。Finding 使用稳定 `ruleCode + stableKey` 去重，不能按英文文案去重，也不能与现有 `BID REVIEW` 靠文本猜测是否重复。

| 规则 | 严重度 | 输入与粒度 | 当前项目映射 |
|---|---|---|---|
| A1 | Conflict | 每一对 Award/Avoid Pairing Bid；其匹配集合有交集 | 支持；复用 Pairing property 条件匹配 |
| A1m | Conflict | 同一 Pairing 的手工 counter 同时 Award/Avoid | 当前 Portal 没有参考项目的 manual cell 存储形态，标记 `not_applicable`，不能伪造 |
| A2 | Conflict | Whole-month Reserve 与相反方向 Short Call | 当前 Portal 没有参考项目独立的 whole-month `RESERVE` rule，标记 `not_applicable`；不能把其他 Line property 冒充该规则 |
| A3 | Conflict | 同 call type、时间范围重叠、方向相反的两条 Short Call | 支持；property 301 结构化 payload |
| A4 | Conflict | 同时要求 More Credit 与 Less Credit | 支持；当前 `Credit Window Preference` property 429 的相反方向 |
| B1 | Conflict | 一个 Crew 聚合；Days Off 日期被 Award Pairing 覆盖 | 支持；Days Off structured Bid + Award `rawMatches` 的基地本地日期跨度 |
| B3 | Conflict | 每条 Long Stretch；Award Pairing 覆盖其所有可用连续窗口 | 支持；property 204 + Award `rawMatches` |
| D1 | Advisory | 一个 Crew 聚合；Commuter Pattern 与 Days Off 组合不成立 | 支持；property 408 + Days Off structured Bid |
| D2 | Advisory | More Credit 且至少三分之一 Period 日期被申请 Off | 支持；property 429 + Days Off structured Bid |

每条 Finding contract 至少包含：`ruleCode`、`stableKey`、`severity`、参数化 message、涉及的 Bid stable IDs、Tier、匹配数量/日期（适用时）。

## 10. 时间与时区规则

### 10.1 Portal Feedback

- Pairing Start、End、航段时间和 Days Off 时间按 Crew 在该 Pairing report/start instant 对应的有效 Base 时区显示；同一 Pairing 全程沿用该次解析出的 Base/zone，避免跨日或跨 Base 变更时中途换时区。
- 优先使用已有 local 字段；没有 local 字段时，由权威 UTC 时间与 Base 的 `airport.zone_id` 转换。
- 必须按 IANA 时区处理 DST，禁止使用固定 UTC Offset。
- 每个 Pairing/Days Off 响应项携带已解析的 `base` 和 `zoneId`；页面明确标识 `Base Local Time`，避免用户误认为 UTC。
- 多条 Base 记录重叠时，与现有导出选择规则一致：先选 `is_prime_base`，再选最新 `eff_dt`，最后以稳定记录 ID 决胜；没有唯一有效记录时该项返回 `unknown`，禁止猜测。
- Pre-assignment 原始数据即使存储为 UTC，用户可见时间也转换到该项解析出的 Base `zoneId`。

### 10.2 算法导出

- `DAYSOFF.csv` 继续输出 UTC 时间。
- Crew 输入的 Base Local 日期或时间窗口，在导出时按对应日期有效 Base 的 IANA 时区转换为 UTC。
- Feedback 的本地时间展示不得改变算法导出的时间语义。
- 跨午夜窗口中，当本地 `endTime <= startTime` 时，End 使用下一本地日再转换为 UTC。
- 缺少或无效 `zone_id`、不存在的 DST 本地时刻、无法解析的 Base 记录必须产生结构化导出诊断，并使本次 package 导出失败；禁止静默丢掉该 Crew/日期行。
- 修改范围限制在现有 `live-server` Days Off 导出逻辑及其测试，不重构其他算法导出。

## 11. 后端设计

### 11.1 分层

- Route：认证、请求参数校验、统一响应。
- Feedback service：读取当前 Crew、当前 Period 和结构化 Bid，计算匹配集合与冲突提示。
- Eligibility service：对 Award Pairing 执行硬性资格校验。
- Mapper：生成稳定、面向 UI 的 Feedback contract。

路由不得承载 Pairing 匹配或资格业务逻辑。

### 11.2 API

提供两个面向当前用户的只读接口：

- `GET /api/bid-feedback/current/conflicts`：只返回 conflict/advisory 摘要，供首屏完成后的警告图标使用，不执行资格检查，不返回 Pairing 详情。
- `GET /api/bid-feedback/current`：用户点击 `BID FEEDBACK` 后加载完整 Feedback。

服务端从认证身份解析 Crew，不接受前端传入任意 Crew ID，避免越权读取其他 Crew 的 Bid。

响应建议包含：

```ts
type FeedbackEligibility = {
  status: "eligible" | "ineligible" | "unknown";
  checked: Array<"rank" | "base" | "preassignment">;
  unavailable: Array<"team_rule">;
  reasons: Array<{
    code: "RANK_MISMATCH" | "BASE_MISMATCH" | "PREASSIGNMENT_OVERLAP" | "FACTS_MISSING";
    message: string;
    conflict?: {
      assignment: string;
      label: string;
      startLocal: string;
      endLocal: string;
    };
  }>;
};

type FeedbackPairing = {
  id: string;
  label: string;
  rawDirection: "award" | "avoid";
  exportDirection: "award" | "avoid" | null;
  matchedBidIds: string[];
  tiers: number[];
  pairingBase: string | null;
  crewBaseAtOrigin: string | null;
  zoneId: string | null; // Crew effective Base zone
  startLocal: string | null;
  endLocal: string | null;
  days: number | null;
  creditMinutes: number | null;
  exportEligible: boolean;
  eligibility: FeedbackEligibility | null;
};

type FeedbackDayOff = {
  bidId: string;
  date: string;
  tier: number;
  startLocal: string | null;
  endLocal: string | null;
  crewBaseOnDate: string | null;
  zoneId: string | null; // Crew effective Base zone
};

type FeedbackIssue = {
  ruleCode: "A1" | "A2" | "A3" | "A4" | "B1" | "B3" | "D1" | "D2";
  stableKey: string;
  severity: "conflict" | "advisory";
  message: string;
  bidIds: string[];
  tiers: number[];
  count: number | null;
  dates: string[];
};

type FeedbackSectionError = {
  section: "award" | "avoid" | "days_off" | "conflicts" | "advisories" | "calendar";
  code: "BID_CONTRACT_INVALID" | "PAIRING_FACTS_INCOMPLETE" | "BASE_ZONE_UNRESOLVED";
  message: string;
};

type BidConflictSummaryResponse = {
  draftVersion: string;
  generatedAt: string;
  conflictCount: number;
  conflicts: FeedbackIssue[];
  advisories: FeedbackIssue[];
  sectionErrors: FeedbackSectionError[];
};

type BidFeedbackResponse = {
  draftVersion: string; // Current + Standing 有效输入快照版本
  generatedAt: string; // UTC ISO instant
  crew: {
    id: string;
    displayName: string;
  };
  period: {
    id: string;
    code: string;
    start: string;
    end: string;
  };
  award: FeedbackPairing[];
  avoid: FeedbackPairing[];
  daysOff: FeedbackDayOff[];
  conflicts: FeedbackIssue[];
  advisories: FeedbackIssue[];
  sectionErrors: FeedbackSectionError[];
  calendar: Array<{
    id: string;
    type: "award_pairing" | "day_off";
    label: string;
    startLocal: string;
    endLocal: string;
    zoneId: string;
    eligibilityStatus: "eligible" | "ineligible" | "unknown" | null;
  }>;
  capabilities: {
    teamRuleEligibility: "available" | "unavailable";
    tierWeightVersion: string;
  };
};
```

其中 Award Pairing 包含结构化 eligibility verdict；Avoid 不返回伪资格结果。Base mismatch 使用 `pairingBase` 与 `crewBaseAtOrigin` 比较；`zoneId` 始终属于 `crewBaseAtOrigin`，不得误用 Pairing Base 时区解释 Crew 的页面时间。

所有 `*Local` 字段均为不带 `Z` 的 ISO local datetime，并由同一对象的 `zoneId` 解释；`generatedAt` 使用 UTC ISO instant。API 不返回模糊的无时区时间字段。

若当前 Period 不存在或 Crew 身份无法映射，返回明确业务错误。不得静默回退到自然月，也不得读取其他 Crew。

响应必须携带生成时的 `draftVersion`。任何 Pairing、Days Off、Line、Reserve 或 Standing Bid mutation 成功后，前端立即取消并失效 conflict/Feedback query；晚到的旧 `draftVersion` 响应不得覆盖新状态。

### 11.3 性能

- 完整 Feedback 只在用户点击时加载，不阻塞 Bid 页面首屏。
- Conflict 摘要只在 Bid 页面核心数据完成渲染后异步加载；它使用独立轻量接口，不共享完整 eligibility 响应。
- 前端不逐 Pairing 发请求。
- 后端以批量查询计算 Pairing 事实和资格，禁止 N+1。
- 必须先消除逐条 Bid、逐页 Pairing 查询造成的 N+1，再使用 Redis；禁止用缓存掩盖本身超过性能预算的 SQL。
- 使用项目现有 PBS Redis 和 `PbsCache` Cache-Aside 能力，不新增 Redis 实例，不增加新的环境变量。
- 完整 Feedback 与 Conflict Summary 使用不同缓存项，Conflict Summary 不得读取、反序列化或返回完整 Feedback payload。
- 服务端缓存键必须至少包含：`crewId`、`rosterPeriodId`、Current Pairing/Days Off/Line/Reserve draftVersion、Standing Lineholder/Reserve draftVersion、Feedback contract/version。禁止只按 Crew 或 Period 缓存。
- 缓存键中的 draftVersion 必须来自生成本次结果所读取的同一组权威 Bid 快照。任一 Current 或 Standing Bid mutation 成功后，版本变化必须自然生成新缓存键，旧响应不得覆盖新状态。
- Feedback 缓存 TTL 为 5 分钟。旧版本缓存允许在 TTL 内自然淘汰，不扫描 Redis、不使用通配符删除；若项目现有精确失效入口能够无额外复杂度删除旧键，可作为补充，但不能代替版本化缓存键。
- Redis `get`、`set` 或连接失败时必须记录清洗后的服务端诊断并回退到数据库计算；不得因为缓存故障让 Bid Feedback 不可用，也不得向 Portal 暴露 Redis 错误。
- 同一实例内的相同冷缓存请求必须复用现有 stampede protection，避免 Bid 开放高峰时并发请求重复击穿数据库；不得另写一套锁实现。
- 缓存内容只允许保存当前认证 Crew 的 Feedback contract，不保存 JWT、密码、请求头或其他认证凭证。
- 匹配计算必须扫描当前 Period 的完整候选集合，不能套用 Pairing Search 返回明细的 cap，否则净方向、A1/B1/B3 与 Calendar 会不完整。结果明细若需要分页，只能在完整聚合完成后分页；Calendar strips 和 counts 必须基于完整集合。
- 以当前项目常用的 500 Pairing、7 Tier fixture 为基准，SIT 服务端完整 Feedback 冷缓存 P95 必须不超过 2 秒，Redis 命中 P95 目标不超过 200ms，SQL 往返不超过 12 次，响应体不超过 2 MB；实施测试必须记录实际值。
- 两秒预算从 `pbs-server` 收到请求至响应发送完成计算，包含读取 draftVersion、数据库查询、资格计算、序列化和 Redis 操作；不得只报告某一条 SQL 的耗时。
- Portal 在 Feedback 请求进行中使用稳定 skeleton，不能继续展示旧版本结果。超过两秒仍未返回属于性能失败，不通过增加前端超时时间或无限 loading 规避。
- 前端结果超过 100 行时使用项目已有虚拟化/分页模式，不一次创建无界 DOM；Calendar 复用服务端返回的轻量 strip 数据，不额外拉取每个 Pairing。

### 11.4 缓存读取流程

完整 Feedback 的固定读取顺序为：

1. 解析认证 Crew 和 Current Bid Period；
2. 批量读取 Current/Standing 各 Bid 的 draftVersion，生成版本快照；
3. 使用版本快照生成 Crew 私有缓存键；
4. 命中 Redis 时校验 Feedback contract/version 和 draftVersion 后返回；
5. 未命中时执行批量匹配、资格与冲突计算；
6. 计算结束后再次确认权威 draftVersion 未变化；若变化，丢弃本次结果并返回稳定错误 `BID_FEEDBACK_DRAFT_CHANGED`，禁止写入缓存；
7. 版本稳定时写入 Redis，再返回响应。

Conflict Summary 使用相同版本快照原则，但只能执行冲突所需的轻量批量计算。它不能为了复用缓存而先生成完整 eligibility 结果。

### 11.5 性能验证

- 在远程开发业务库上对核心批量 SQL 执行 `EXPLAIN (ANALYZE, BUFFERS)`，记录执行计划、扫描行数和 buffers；本地空库结果不作为依据。
- 使用编译后的 `pbs-server/dist` 对真实接口做 smoke，验证 HTTP 200、数据正确、缓存 miss/hit 行为和响应耗时。
- 至少采集 5 次冷缓存和 20 次缓存命中样本，报告 P50、P95、max、响应体大小和 SQL 往返次数。
- 增加并发同键请求测试，确认 stampede protection 只执行一次 loader；增加 Redis 故障测试，确认回退数据库且不会泄露内部错误。
- 性能测试必须由真实 Portal 点击 `BID FEEDBACK` 触发至少一次 Playwright 流程；不能仅通过直接调用 service 或 Mock route 宣称用户体验达标。
- 若冷缓存 P95 超过 2 秒，必须继续优化查询或索引后再交付；不得把目标改成“缓存命中时两秒内”。

## 12. 前端设计

- 请求统一放入 `src/shared/services` 或现有 Bid feature service 层，不在页面直接使用裸 `fetch` / `axios`。
- 服务端状态使用 TanStack Query，查询在点击 Feedback 后启用。
- 弹窗作为 Bid feature 本地组件实现；没有跨模块复用证据前不提升到共享 UI。
- 使用 Portal 现有业务弹窗视觉和设计 token。
- 首次加载显示保持布局稳定的 skeleton。
- 刷新时不得继续展示可能误导的旧资格结果；主体进入 skeleton 或明确 refreshing 状态。
- 错误使用弹窗内可访问的 persistent error state，并提供 Retry。
- 关闭按钮、页签、列表行、Calendar 切换和 Retry 均支持键盘操作。
- 弹窗需要正确的 dialog、tab、table 和 live/error 语义。
- 弹窗打开时焦点进入标题或第一个可操作控件，焦点限制在弹窗内；关闭后焦点恢复到 `BID FEEDBACK` 按钮。
- Conflict 面板关闭后焦点恢复到警告图标；`Escape`、遮罩关闭和焦点恢复都必须测试。

## 13. 错误处理

### 13.1 可恢复错误

例如网络失败或临时服务失败：

- 弹窗保持打开；
- 展示 `Bid feedback could not be loaded.`；
- 提供 `Retry`；
- 不显示原始 Axios、PostgreSQL 或堆栈信息。

### 13.2 配置或数据错误

例如 Crew Base/时区覆盖不完整、当前 Period 未配置、资格事实缺失：

- 返回稳定错误代码；
- UI 显示具体缺失项和下一步；
- 不把无法验证错误标记成 Eligible；
- 不使用自然月或固定时区做静默兼容。

错误边界固定如下：

- 全局失败：认证 Crew 无法解析、Current Bid Period 不存在、Tier 权重不可用，或 Crew 在整个 Period 内没有任何可解析的有效 Base/zone。完整请求失败并显示可恢复面板。
- 页签失败：某类 Bid contract 无法解析，或 Days Off 页签涉及的日期无法解析有效 Base/zone。该页签显示失败，其他已验证页签仍可查看，响应写入 `sectionErrors`。
- 单 Pairing `unknown`：只有该 Pairing origin instant 的 Rank、Crew Base/zone、Pairing Base、Composition 或 Pre-assignment 事实缺失。该行显示 `Unable to verify`，不使整份 Feedback 失败。
- Team Rule capability unavailable：属于明确能力缺口，不作为网络错误，也不得把其他检查结果包装成“全部资格已通过”。

稳定 HTTP/错误码至少包括：

- `401 PBS_AUTH_REQUIRED`
- `404 CURRENT_BID_PERIOD_NOT_FOUND`
- `404 PBS_CREW_NOT_FOUND`
- `409 BID_FEEDBACK_DRAFT_CHANGED`
- `422 BID_FEEDBACK_DATA_INCOMPLETE`
- `503 BID_FEEDBACK_TIER_WEIGHTS_UNAVAILABLE`
- `500 BID_FEEDBACK_FAILED`（仅返回清洗后的 request ID）

### 13.3 重复错误

同一请求失败只保留一个弹窗内错误状态，不连续发送全局 toast。

## 14. 测试与验收

### 14.1 `pbs-server` 自动化测试

- 当前认证 Crew 范围正确，不能读取其他 Crew。
- 当前 Period 选择正确，不按自然月推算。
- 全部 Tier 均参与计算。
- 正负 Tier 权重合并及净值为零行为正确。
- Pairing 按 Base Local Origin Date 归属 Period，并覆盖 carry-in/carry-out 边界测试。
- `rawMatches`、`exportEligibleMatches` 和净方向三层 parity 分别正确。
- Award 列表不出现 Rank/Base 不匹配项；候选池内的 Pre-assignment overlap 原因正确；Team Rule capability 明确为 unavailable，不伪装已检查。
- Avoid 不执行或不返回资格 verdict。
- Base Local Time 转换覆盖 DST 日期。
- 批量查询无 N+1。
- 缺少 Period/Crew、整个 Period 无有效 Base zone 时全局失败；单 Pairing Base/zone 缺口为行级 unknown；Days Off 日期缺少 Base zone 为 section error。
- Bid mutation 后旧 `draftVersion` 响应不能覆盖新状态。
- Conflict endpoint 不执行完整 eligibility 查询。
- A1、A3、A4、B1、B3、D1、D2 的 fixture、stableKey、严重度和聚合粒度正确；A1m、A2 明确 not applicable。
- Pre-assignment 只读取 `source='PA'`、`is_deleted=0`，使用半开区间 overlap，并按业务 duty 聚合避免航段重复。
- Pairing 全量聚合不受 Pairing Search 明细 cap 影响，counts、方向、冲突和 Calendar 均完整。
- 500 Pairing/7 Tier fixture 的响应时间、查询数和 payload 达到第 11.3 节目标，或在交付中明确说明未达到的瓶颈。
- 相同 Crew、Period 和 draftVersion 的完整 Feedback 第二次请求命中 Redis，且响应与冷缓存计算逐字段一致。
- 任一 Current/Standing Bid draftVersion 变化后不命中旧缓存，晚到的旧版本计算不会写入缓存。
- Redis 不可用时回退数据库并返回正确结果，Portal 不显示 Redis 或底层连接错误。
- 同一版本的并发冷请求复用一次 loader，不产生缓存击穿。
- Conflict Summary 与完整 Feedback 使用独立缓存键，且摘要请求不执行 eligibility 查询。

### 14.2 `pbs-portal` 组件测试

- 工具栏主要按钮顺序正确。
- conflict 图标、徽标、Conflicts/Advisory 面板正确。
- `Award / Avoid / Days Off` 数量与内容正确。
- 点击 Pairing 更新详情。
- `Calendar / Bids` 正确切换。
- 加载、空状态、失败与 Retry 正确。
- 时间标识为 Base Local Time。
- 关闭重开后恢复默认 Award 页签。
- modal focus trap、初始焦点、关闭焦点恢复、Conflict 面板焦点恢复正确。
- Bid mutation 后 Feedback 和 conflict query 立即失效，不显示旧版本结果。
- Feedback 缓存命中时页面仍使用当前 draftVersion；版本变化后不得短暂闪回旧数据。

### 14.3 Playwright

使用真实 Portal 页面和真实交互覆盖：

1. 登录 Crew Portal。
2. 打开 Bid 页面。
3. 验证 `BID FEEDBACK` 入口位置。
4. 打开 Feedback。
5. 验证 Award、Avoid、Days Off。
6. 选择不可 Award Pairing 并查看具体原因。
7. 查看 conflict/advisory。
8. 切换 Calendar，再返回 Bids。
9. 关闭并重新打开。
10. 验证 Base Local Time 与测试数据一致。
11. 修改一条 Bid，验证旧 Feedback 消失并按新 `draftVersion` 重新计算。
12. 仅使用键盘完成打开、切换页签、选择 Pairing、关闭和焦点恢复。
13. 连续关闭并重新打开相同版本的 Feedback，确认 Redis 命中且接口在目标时间内返回。
14. 修改任意 Current Bid 或 Standing Bid 后重新打开，确认返回新 draftVersion，内容不是旧缓存。

### 14.4 Days Off 导出回归

对 `live-server` 现有导出补充测试，至少验证：

- 夏令时 Base Local 全天转换为正确 UTC 区间；
- 冬令时转换正确；
- 跨午夜时间窗口的 End 使用下一本地日并晚于 Start；
- Base 在周期内变更时使用对应日期有效 Base；
- 缺少合法 `zone_id`、DST 不存在时刻或无法解析 Base 时，整包失败并返回结构化诊断，不静默丢行。

### 14.5 QA 文档

新增：

`docs/test-cases/pbs/bid-feedback/2026-08-10-bid-feedback.md`

覆盖前置数据、正常流程、无 Bid、净值抵消、不可 Award 原因、冲突、DST、失败重试和权限边界。

### 14.6 交付验证

实施阶段至少执行并报告：

- `pbs-server` 相关 Vitest；
- `pbs-portal` 相关组件测试；
- `pbs-portal` lint；
- `npm run check:ui`；
- `pbs-server` build；
- `pbs-portal` build；
- Bid Feedback Playwright；
- `live-server` Days Off 导出回归测试；
- 跨模块完成后执行仓库既有 `verify:pbs`（如运行环境可用）。

任何失败不得以“旧问题”为理由直接忽略；需确认是否由本次改动引入，并修复 touched-area stale assertion。

## 15. 验收标准

- Crew 能在约定位置找到并打开 `BID FEEDBACK`。
- Feedback 只展示当前 Crew、当前 Bid Period 的数据。
- Award、Avoid、Days Off 与结构化 Bid 的实际语义一致，并明确区分原始命中与导出资格过滤。
- 同一 Pairing 的跨 Tier 合并结果使用权威 Tier 权重版本，并与算法偏好方向一致；权重不可用时明确失败，不猜测。
- Award Pairing 可明确看到 Eligible、Not eligible 或 Unable to verify。
- 不可 Award 原因真实、具体，不使用推测文案；Team Rule 在没有绑定 Scenario/Run 权威快照时明确标记未检查。
- Avoid 不显示无意义的资格失败。
- Bid Conflicts 与 Advisories 可查看，且数量语义与参考项目一致。
- 页面时间使用 Crew Base Local Time；算法 CSV 继续使用 UTC。
- 无 Bid、空页签、请求失败、数据缺失均有明确且可恢复的状态。
- 默认不新增 schema/migration，不改变算法输入合同；Conflict 摘要在核心首屏完成后加载，完整 Feedback 仅点击加载。
- 500 Pairing、7 Tier 的 SIT 冷缓存 P95 不超过 2 秒，Redis 命中 P95 目标不超过 200ms；报告必须包含真实测量结果。
- 缓存按 Crew、Period 和全部 Current/Standing draftVersion 隔离；Bid 修改后绝不返回旧版本结果，Redis 故障时能够正确回退数据库。
- 自动化测试、Playwright、QA 文档和构建检查均有明确结果记录。

## 16. 风险与控制

### 风险 1：Feedback 与算法结果不一致

控制：区分 `rawMatches` 与 `exportEligibleMatches`，复用正式 property contract、Pairing 条件构建和导出 eligibility 语义，并用三层 parity 测试锁定匹配、过滤与 Tier 合并方向。

### 风险 2：把“可行”误解成“必定 Award”

控制：UI 使用 `Eligible / Not eligible / Unable to verify`，明确说明这里只检查硬性资格，不预测资历排序和优化结果。

### 风险 3：本地时间与算法 UTC 混用

控制：Portal 和 CSV 建立明确边界，并分别测试 DST、跨午夜和 Base 变更。

### 风险 4：资格检查产生 N+1

控制：后端批量加载 Crew、Pairing、Composition 和 Pre-assignment 事实，测试查询数量或执行路径；先完成查询优化，再使用版本化 Redis 缓存降低重复计算。

本期没有权威 Team Rule 快照时不查询 Team Rule，改为返回 capability unavailable；不得读取最新 Scenario 代替。

### 风险 5：与现有 BID REVIEW 重复

控制：BID REVIEW 继续负责当前 Tier 快速诊断；BID FEEDBACK 负责整套 Bid 的匹配、资格和内部冲突。

### 风险 6：Days Off 跨午夜或无效时区导致算法输入静默缺行

控制：跨午夜 End 使用下一本地日；无效时区、DST 不存在时刻或 Base 无法解析时使 package 导出失败并返回结构化诊断。

### 风险 7：Redis 返回过期的 Bid Feedback

控制：缓存键包含 Current/Standing 全部 draftVersion 和 Feedback contract/version；计算结束后再次核对版本，版本发生变化时禁止写入缓存。短 TTL 只负责清理旧键，不能作为一致性保障。

### 风险 8：缓存命中掩盖冷查询过慢

控制：冷缓存与缓存命中分别测量，冷缓存 P95 仍必须满足 2 秒；若不满足，继续通过批量 SQL、索引和减少往返优化，不能只报告 Redis 命中耗时。

## 17. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 前端、后端以及验证文档可按清晰边界并行，但 API contract 必须先由主任务固定。
- Suggested split:
  - 后端 agent：Feedback service、Eligibility、route、后端测试。
  - 前端 agent：入口、conflict 控件、Feedback 弹窗、组件测试。
  - 验证 agent：Playwright、QA 文档、Days Off 导出回归审查。
- Write boundaries:
  - 后端仅写 `pbs-server`。
  - 前端仅写 `pbs-portal`。
  - 验证仅写 E2E、测试 fixture、`docs/test-cases`，避免修改业务实现。
- Conflict risk: Medium。共享 API contract、mock 和 fixture 是主要冲突点，应由主任务先固定再分派。
- Execution gate: 用户批准本 spec 与后续实施计划后才允许启动实现；主任务负责 GitNexus impact、集成、构建和最终验证。

## 18. 推荐实施结论

采用“结构化 Bid → 后端批量匹配与资格检查 → Portal 只读 Feedback”方案。

该方案与参考项目当前方向一致，同时符合本项目的认证、数据边界和现有 Pairing 搜索架构。CSV 只服务算法输入，不再承担 Portal Feedback 的数据来源职责。

## 19. Feedback 加载态视觉修正

### 19.1 目标

- 加载态必须模拟最终的左侧 Pairing 列表与右侧详情结构，禁止使用两块无语义的大矩形占位。
- 骨架尺寸与加载完成后的主从布局保持一致，避免内容出现时发生明显布局跳动。
- 弹窗高度应随视口约束，并以实际内容区为中心，不制造无意义的底部大面积空白。

### 19.2 布局

- 左侧骨架包含列表表头以及 6 行 Pairing 行骨架，体现 Pairing、Base、日期、Days、Credit 和资格状态列。
- 右侧骨架包含 Pairing 标题与状态、时间摘要、4 个指标卡、Route、Matched Bids 和 Eligibility 区块。
- 宽屏保持 `42:58` 主从比例；窄屏继续沿用现有单列响应式布局。
- 使用项目现有 `bg-muted` 与轻量 `animate-pulse`，不新增依赖或独立动画系统。

### 19.3 验收

- 加载态不出现无结构的大灰块和无意义底部空白。
- 骨架能够清楚表达左侧列表、右侧详情的信息层级。
- 加载完成后主从区域的位置与尺寸基本稳定。
- 组件测试与 Playwright 覆盖加载态结构；Portal build 与 UI 标准检查通过。
