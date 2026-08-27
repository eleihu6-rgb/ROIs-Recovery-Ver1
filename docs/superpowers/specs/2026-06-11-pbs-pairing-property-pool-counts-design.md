# PBS Pairing Property Pool Counts 批量统计设计

日期：2026-06-11  
范围：PBS Portal `/fpqe/pbs/pairing` 的 `EXISTING PAIRING PROPERTIES`  
推荐方案：新增后端批量 count API，一次返回当前 active Tier 的逐条规则命中、累计漏斗和总过滤结果

## 背景

当前 `/fpqe/pbs/pairing` 页面已经支持维护 Pairing bid properties，并可通过 `SEARCH PAIRINGS` 跳转到 `/pairing/search` 查看当前 Tier 规则筛出的 pairing set。

现有 `/pairing-search/preview` 已能返回：

- `summary.pairingIdCount`
- `summary.totalItems`
- 分页结果和 pairing card 明细

但它更偏向“打开结果列表预览”。用户现在需要的是在 Pairing 页面直接看到规则诊断数字：

- 每一条 bid property 自己能筛出多少任务环。
- 每一条加入当前顺序后，累计漏斗还剩多少任务环。
- 当前 active Tier 的全部条件最终筛出多少任务环。
- 用户可以通过一个刷新按钮主动重新计算。

这个功能用于帮助排班员判断某条规则是否过窄、某一步是否把 pool 明显砍掉，而不是最终 Award 计算。

## 已确认需求

- 统计范围按当前左侧 `BIDDING CALENDAR` 选中的 active Tier / Tx 计算。
- 不把 `T1-T7` 混成一个大查询。
- 每条已添加的 Pairing property 都要展示统计。
- 需要展示一个总过滤结果，即全部 active properties 形成的最终漏斗结果。
- 需要新增 `Refresh` 按钮，由用户手动重新计算统计。
- 切换 active Tier / Tx 时，可以自动为切换后的当前 Tier 计算一次统计。
- 推荐采用后端批量计算，而不是前端为了省事发很多 preview 请求。

## 术语

- **Rule count**：单条 property 独立筛选时的命中数。
- **Funnel count**：从当前 active Tier 的第一条 active property 到当前行，按页面顺序累计筛选后的命中数。
- **All rules count**：当前 active Tier 全部 active properties 共同筛选后的最终命中数。
- **Pairing count**：优先对应后端现有 `summary.pairingIdCount`，表示 distinct pairing id / pairing number 口径。
- **Result count**：对应后端现有 `summary.totalItems`，表示结果行总数。若当前 live pairing 表一行即一个任务环，两个数字可能相同；UI 上仍保留语义区分，避免未来 occurrence 口径变化后混乱。

## 非目标

- 不做最终 Award / RO / PO 优化。
- 不做法规、coverage、资历或冲突分配计算。
- 不把统计结果写入数据库。
- 不新增 Pairing 业务表字段。
- 不自动在页面初次加载时批量计算所有 T1-T7。
- 不因为切换到某个 Tier 就预取其他 Tier 的统计。
- 不把 preview 结果卡片搬到 Pairing 主页面。
- 不因为实现方便而退回前端多次调用 preview API 的方案。

## 方案选择

### 方案 A：前端复用 preview API 多次请求

前端对每条 property 发一次单条 preview，再对每个前缀数组发一次累计 preview，最后再算全部规则。

优点：

- 初期代码改动少。
- 不新增后端 route / contract。

问题：

- 请求数量随 property 数量线性增长，8 条 property 可能接近 17 次请求。
- 单条、累计、总数来自多个异步请求，容易出现闪烁、竞争和旧结果覆盖。
- 前端承担了规则诊断的编排语义，长期不利于复用。
- 未来 `/tier` 或 Bid Review 想复用时还要重新拼装。

### 方案 B：新增后端批量 count API（采用）

前端一次提交当前 active Tier 和当前 draft properties，后端返回完整统计快照：

- 每行 `rule` count。
- 每行 `funnel` count。
- 顶部 `allRules` count。

优点：

- 一次请求得到一致快照。
- 后端统一定义 Pairing rule count 语义。
- 可只执行 count，不加载 pairing card 明细，性能比 preview 列表更可控。
- 后续可复用于 `/tier`、Zero Review、Bid Review 或算法导出前检查。
- 避免因为怕改后端而把复杂度转嫁到前端。

代价：

- 需要新增 contract、route、service 和测试。
- 后端需要抽取或复用 preview 的 condition builder/count 查询能力。

### 方案 C：只显示总过滤数

只显示 active Tier 全部条件最终筛出的结果。

问题：

- 无法解释每条 property 的贡献。
- 无法回答“第一个条件 100、第二个条件 50”这类调试问题。

## 推荐设计

采用方案 B。

新增一个只返回统计数字的后端 API。它不返回 pairing card 明细，不做分页，不替代 `/pairing/search` 页面。`Refresh` 按钮触发后，Pairing 页面获取当前 active Tier 的完整统计快照，并把结果展示在 `EXISTING PAIRING PROPERTIES` 区域。

## API 设计

### Route

建议新增：

```text
POST /pairing-search/current-rules/counts
```

也可以命名为：

```text
POST /pairing-search/current-rules/pool-counts
```

推荐第一种，更短，并且明确这是 current rules 的 count。

### Request

```ts
type PbsPairingCurrentRulesCountsRequest = {
  periodCode?: string;
  tier: string;
  properties: PbsPairingDraftProperty[];
};
```

说明：

- `tier` 使用 `T1`、`T2` 等 Tx 标签。
- `properties` 传当前 Pairing draft 的 existing properties，后端按 `tier` 过滤 active properties。
- `properties` 必须保留 `propertyGroupKey`、`rowSeq`、`propertyCode`、`tiers`、`bid`、`action`、`quantifier` 等现有语义。
- 前端不需要预先拆成 active-only，避免前后端过滤口径不一致。

### Response

```ts
type PbsPairingPoolCountValue = {
  pairingIdCount: number;
  totalItems: number;
};

type PbsPairingCurrentRulesCountRow = {
  propertyGroupKey: string;
  rowSeq: number;
  propertyCode: number;
  name: string;
  rule: PbsPairingPoolCountValue;
  funnel: PbsPairingPoolCountValue;
};

type PbsPairingCurrentRulesCountsResponse = {
  mode: "current_rules_counts";
  periodCode?: string;
  tier: string;
  computedAt: string;
  summary: {
    activePropertyCount: number;
    allRules: PbsPairingPoolCountValue | null;
  };
  rows: PbsPairingCurrentRulesCountRow[];
};
```

说明：

- `rows` 只包含当前 `tier` active 的 properties。
- `rule` 是单条 property 独立命中数。
- `funnel` 是从第一条 active property 到当前行累计后的命中数。
- `summary.allRules` 等于最后一条 row 的 `funnel`；没有 active property 时为 `null`。
- `computedAt` 只表示本次统计快照生成时间，不做持久化。

## 后端计算语义

后端接收 request 后：

1. 解析并校验 `tier`。
2. 复用现有 `normalizeCurrentRulePreviewProperties(tier, properties)`，得到当前 Tier active properties。
3. 保持当前 row 顺序。
4. 对每一条 active property 计算：
   - `rule`：只使用该 property 构造 condition。
   - `funnel`：使用 active properties 的前缀数组构造 condition。
5. 对全部 active properties 计算 `allRules`。

计算 condition 时必须复用现有 Pairing Search rule builder，继续遵守：

- 不同 property 默认 `AND`。
- 同一 multi-use property 或 forced OR 特例按现有规则处理。
- `Any / Every` 作为 property 自身量词处理。
- `periodCode` 与现有 Search Pairings preview 保持一致。

### Count 查询

应抽取一个轻量 count query，例如：

```ts
executePreviewCountQuery({
  condition,
  periodCode,
  pgPool,
  schema,
  sqlBuilder,
})
```

它只执行 `count(*)` 与 `count(distinct id_text)`，不查询分页、不加载 segments、不生成 card 明细。

## 前端交互设计

### 顶部统计条

在 `EXISTING PAIRING PROPERTIES` 标题下方或 `VIEW RULES / SEARCH PAIRINGS` 按钮同一行增加：

- 当前统计 Tier：例如 `T3`
- 总过滤结果：例如 `All rules: 42 pairings / 57 results`
- `Refresh` 按钮

未计算时显示：

```text
T3 counts not calculated
```

没有 active property 时显示：

```text
No active T3 pairing properties
```

### 每行统计展示

现有表格是 `PROPERTY / BID / TIERS` 三列，强行加第四列会挤压 1920 基线和缩放布局。因此推荐在每条 existing property 行下方增加一行紧凑诊断文本，仅当该 row 属于当前 active Tier 且已有统计结果时显示：

```text
Rule: 100 pairings / 100 results · Funnel: 50 pairings / 50 results
```

如果该 row 不属于当前 active Tier：

- 不显示 count。
- 或显示很轻的 `Inactive in T3`，但默认建议不显示，避免信息噪音。

如果已经刷新过，但用户后来新增、编辑、删除或切换 tier 导致统计过期：

- 清空或标记当前 snapshot 为 stale。
- 顶部显示 `Counts need refresh`。
- 行内不继续展示旧数字，避免误导。

### Refresh 按钮行为

- 点击后请求新 API。
- 请求期间按钮 disabled，显示 `Refreshing...` 或 spinner。
- 成功后更新当前 active Tier 的完整 snapshot。
- 失败后保留空态或上一次 snapshot，但必须显示错误提示；如果保留旧 snapshot，要明确标记为 stale。

### active Tier 切换

当左侧 `BIDDING CALENDAR` active Tier 从 `T3` 切到 `T4`：

- 自动触发一次 `T4` 的 counts 请求。
- 请求期间顶部显示 `T4 counts refreshing` 或等价 loading 状态。
- 请求成功后展示 `T4` 的 `All rules` 和每行 `Rule / Funnel`。
- 请求失败时显示错误提示，保留当前页面可编辑能力。
- `Refresh` 按钮仍保留，用于用户在当前 Tier 下手动重算。

原因：

- 切换 Tier 是用户明确切换诊断上下文，自动计算当前 Tier 有助于即时反馈。
- 自动计算只针对切换后的当前 Tier，不预取其他 Tier，因此仍受控。
- `Refresh` 用于重试、手动校验或数据变化后的再次计算。

## 状态设计

前端建议在 `PairingRightPanel` 内维护本地 state：

```ts
type PairingPoolCountsState = {
  tier: string;
  status: "idle" | "loading" | "success" | "error" | "stale";
  response: PbsPairingCurrentRulesCountsResponse | null;
  errorMessage?: string;
};
```

缓存边界：

- 不写入 Zustand。
- 不持久化到数据库。
- 可写入当前页面 query cache，但不是必须。
- 当 `existingProperties`、`draftMeta`、active Tier 或 hydration key 变化时，标记 stale 或清空。

## 错误处理

- Request schema 无效：400，前端显示 `Unable to calculate pairing counts.`
- 当前 Tier 没有 active properties：返回成功，`rows=[]`、`allRules=null`，前端显示空态。
- 某个 property 不支持 Search Pairings count：后端应返回可处理错误，前端显示整体失败；不建议局部吞掉，否则 rule/funnel 语义不完整。
- 数据库查询失败：500，前端显示 toast，并保留页面可编辑。
- 并发刷新：同一时间只允许一个 refresh；如果未来支持多次快速点击，前端必须只接收最后一次请求结果。

## 性能约束

- 不在页面首屏自动计算。
- 切换 active Tier 后只自动计算切换后的当前 Tier 一次。
- 不批量预取或后台计算其他 Tier。
- active Tier 快速连续切换时，前端应只接收最后一次请求结果；可使用 request sequence 或 abort 机制避免旧响应覆盖新 Tier。
- 后端 count API 不加载 pairing card detail 和 segment 明细。
- 后端应避免 N+1 查询。即使实现上先循环 active property，也应限制在 count 查询，并保留后续合并成 CTE 批量查询的空间。
- 若 active properties 过多，后端可设置合理上限并返回明确错误；当前 T1-T7 常规 property 数量预期可接受。

## 测试计划

### 后端测试

覆盖 `pbs-server`：

- route schema 接受合法 `current-rules counts` payload。
- 无 active property 返回空 rows 与 `allRules=null`。
- 单条 active property 返回 `rule` 与 `funnel` 相同。
- 多条 active property 返回每条 `rule` 和累计 `funnel`。
- `summary.allRules` 等于最后一条 row 的 `funnel`。
- 不支持或无效 property 返回明确错误。
- count query 不加载 preview results / segments。

### 前端测试

覆盖 `pbs-portal`：

- `/fpqe/pbs/pairing` 初始显示 `Tn counts not calculated`。
- 点击 `Refresh` 调用新 service，并显示顶部 `All rules`。
- 每条当前 active Tier property 显示 `Rule` 与 `Funnel`。
- 非当前 active Tier property 不显示统计或不误显示旧统计。
- 新增、编辑、删除、tier toggle 成功后统计标记 stale / needs refresh。
- active Tier 切换后自动请求新 Tier counts。
- active Tier 快速连续切换时，旧 Tier 响应不会覆盖当前 Tier 结果。
- refresh error 显示错误提示，页面编辑能力不受影响。

### QA 人工测试

新增：

```text
docs/test-cases/pbs/pairing/2026-06-11-pairing-property-pool-counts.md
```

覆盖：

- 单个 property count。
- 多个 property funnel count。
- 修改 property 后刷新。
- 切换 Tier 后刷新。
- 0 result 场景。
- API error 场景。

## 验收标准

- `/fpqe/pbs/pairing` 能通过 `Refresh` 计算当前 active Tier 的 Pairing property pool counts。
- 每条 active property 能看到 `Rule` 与 `Funnel` 两个数字。
- 顶部能看到全部 active rules 的最终过滤数字。
- 统计结果来自一次后端批量 API，不通过前端多次 preview 请求拼装。
- 切换 active Tier 后会自动计算切换后的当前 Tier，且不会批量计算其他 Tier。
- 统计结果不被误认为最终 Award。
- 新增、编辑、删除或 tier 改动后不会继续展示过期数字。
- 不改变现有 `SEARCH PAIRINGS`、单条 `eye` preview、Pairing property 保存/删除逻辑。
- 不新增数据库字段，不新增依赖。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务可清晰拆成后端批量 count API、前端展示/交互、测试/QA 文档三个相对独立部分；接口 contract 是唯一共享边界，先由主 agent 固定后即可并行。
- Suggested split: 后端 agent 负责 contracts、route、service、后端测试；前端 agent 负责 `pbs-portal` service、`PairingRightPanel` 展示与前端测试；文档/QA agent 负责测试用例与验收清单。
- Write boundaries: 后端 agent 只写 `packages/contracts/pbs-search-pairings.*`、`pbs-server/src/routes/pairing-search.*`、`pbs-server/src/services/pairing-search/*`；前端 agent 只写 `pbs-portal/src/shared/services/pairing-service.ts`、`pbs-portal/src/features/pairing/*`；文档 agent 只写 `docs/test-cases/pbs/pairing/*`。
- Conflict risk: Medium。`packages/contracts` 是共享边界，必须先由主 agent 定稿后再让前后端并行；`PairingRightPanel` 近期改动较多，需要避免与其他 pairing UI 修改重叠。
- Execution gate: 用户 review 并明确批准本 spec 后，再进入实施计划；并行开发也必须等接口 contract 定稿后启动。
