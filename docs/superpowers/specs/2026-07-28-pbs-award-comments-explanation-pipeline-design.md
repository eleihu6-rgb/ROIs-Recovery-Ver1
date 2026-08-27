# PBS Award 已获 Pairing Comments 解释链路设计

## 1. 背景

PBS 优化完成后，需要让 Crew 在 Bidding Portal 的 Award 页面看到“为什么获得这个
Pairing”的简短解释。项目现有三张 roster 表均已包含 `comments varchar(180)`：

- `scenario.roster_flight.comments`
- Live Schema `roster_flight.comments`
- Live Schema `roster_publish.comments`

现有代码已经具备以下两段复制能力：

1. Scenario Roster 导回 Live 时复制 `comments`。
2. Live Roster 发布为 `roster_publish` 快照时复制 `comments`。

当前缺口是：优化结果没有把解释写入 Scenario Roster，Award API 也没有读取并返回
`roster_publish.comments`。

## 2. 目标

打通以下发布链路：

```text
PBS Engine 生成已获 Pairing 简短解释
  → output.gz ASSIGNMENTS.comments
  → Live Server 写 scenario.roster_flight.comments
  → Scenario 导回 Live 自动复制到 live.roster_flight.comments
  → Live Publish 自动复制到 live.roster_publish.comments
  → PBS Server Award API 只读取 roster_publish.comments
  → PBS Portal 在对应已获 Pairing 中展示一次解释
```

最终运行时数据源必须是 `roster_publish`。PBS Portal 和 PBS Server 不在 Award 请求期间
读取 Scenario、Live 工作态 `roster_flight`、Engine Server 文件目录或
`bid_explanation_report.csv`。

## 3. 本阶段范围

### 3.1 包含

- 为优化输出的飞行分配 `ASSIGNMENTS` 增加可选 `comments` 字段。
- PBS Engine 为已获得的 `crew_id + pairing_id` 生成简短、可面向 Crew 展示的解释。
- Live Server Scenario Result Loader 读取 `ASSIGNMENTS.comments`。
- 同一个 Pairing 拆分为多个航段时，将同一解释写入该 Pairing 的各
  `scenario.roster_flight` 航段行。
- 验证 Scenario → Live → `roster_publish` 的现有复制链路继续保留相同文本。
- PBS Server Award 查询读取 `rp.comments`，API Contract 返回 Pairing 级
  `explanation: string | null`。
- PBS Portal 在 Selected Duty / Pairing 详情中只展示一次解释。
- 增加后端回归测试、真实 UI Playwright 测试和 QA 人工测试案例。

### 3.2 不包含

- 不解释 Crew 为什么没有获得其他候选 Pairing。
- 不接入完整 AA Reason Report。
- 不启用当前不可用的 `View Reason Report`。
- 不读取或解析未发布的 Scenario 数据。
- 不在 Award 请求期间读取静态 CSV。
- 不新增或修改数据库字段。
- 不新增 `pbs_award_result`、`pbs_award_item` 或其他 Award 原因表。
- 不把原始法规错误、其他 Crew ID 或求解器内部 pass 名称展示给 Crew。

## 4. 数据 Contract

### 4.1 受控 Comments 协议

`comments` 是既有通用备注字段。为避免把人工备注、历史文本或内部诊断误展示给 Crew，
只有以下受控格式可以作为 Award Explanation：

```text
PBS_AWARD_V1|Matched your Tier <n> pairing preferences.
```

- `PBS_AWARD_V1|` 是固定协议标识，计入 180 字符限制。
- Portal 只展示标识后的正文，不展示协议标识。
- PBS Server 只接受以下完整、锚定文法；不允许前后附加文字：

  ```regex
  ^PBS_AWARD_V1\|Matched your Tier ([1-9]|1[0-9]|2[0-4]) pairing preferences\.$
  ```

- PBS Server 还必须同时确认该 Published 行满足
  `source='CR' AND request_source='SCENARIO' AND request_id IS NOT NULL`。
- 不符合严格文法或 provenance 的普通 `comments` 一律返回 `explanation=null`。
- 空正文、纯空白正文或只有标识的值视为 `null`。
- 正文不得包含逗号、回车、换行或其他控制字符，避免破坏现有
  `## SECTION` 的逐行逗号分隔解析。
- Loader 只为本次 Solver 创建的 CR Flying Assignment 写入该格式；PA、lead-in、MA
  和人工备注不转成 Award Explanation。
- `PBS_AWARD_` 是保留命名空间。所有非 Solver comments 写入口，包括 Live Roster
  新增/修改、Scenario 人工 Patch、Ground Task、导入和同步入口，都必须复用统一校验，
  拒绝用户或外部数据写入任何以 `PBS_AWARD_` 开头的值。

推荐示例：

```text
PBS_AWARD_V1|Matched your Tier 2 pairing preferences.
```

普通人工备注示例：

```text
Call crew scheduling before departure.
```

第二个示例不带协议标识，因此不会出现在 Crew Award Explanation 中。

### 4.2 解释生成规则

第一阶段解释只表示“该已获 Pairing 在 `PAIRING_SCORE.csv` 中命中 Crew 某一 Tier 的
Award Pairing Preference”，不声称完整还原求解器因果过程。

解释输入的唯一权威是本次 Solver 工作目录中的 `PAIRING_SCORE.csv`：

- 使用 `(Crew_ID, Pairing_ID)` 与最终 `ASSIGNMENTS` 精确关联。
- Tier `n` 的权威字段为 `T{n}_Award_Counter` 和 `T{n}_Avoid_Counter`。
- Tier 顺序使用 CSV Header 中存在的数值 Tier，由小到大；不得依赖 map、set 或文件行的
  偶然迭代顺序。
- Engine 和后续服务不得根据 `preference_score`、Property 名称或 Portal Bid 数据重新推导
  Tier。

确定性生成规则：

1. 必须先确认 Pairing 已分配给该 Crew。
2. 找出所有满足 `T{n}_Award_Counter > 0 AND T{n}_Avoid_Counter = 0` 的 Tier。
3. 取最小的 Tier `n`。
4. 使用唯一模板：
   `PBS_AWARD_V1|Matched your Tier {n} pairing preferences.`
5. 找不到唯一 `PAIRING_SCORE` 行、没有满足条件的 Tier、Counter 非法或 Tier 超出
   `1..24` 时输出空值。

禁止使用：

- `preference_score` 推导 Crew 看得懂的因果结论。
- `bid_explanation_report.csv.line_rule` 或 Property 展示名生成本阶段解释。
- 其他 Crew 的信息、竞争顺序、solver pass 或原始法规诊断。
- Assigned 行为空的 `failure_reason`。

### 4.3 优化输出

`output.gz` 的 `ASSIGNMENTS` Section 为每个已分配的 `crew_id + pairing_id` 提供：

| 字段 | 类型 | 要求 |
|---|---|---|
| `crew_id` | string | 必填，保持现有语义 |
| `pairing_id` | decimal string | 必填，十进制正整数，不带符号 |
| `comments` | string/empty | 可选；非空时必须符合 `PBS_AWARD_V1` 协议 |

`comments` 必须满足：

- 最大 180 个 Unicode 字符，与 PostgreSQL `varchar(180)` 语义一致。
- 内容描述“为什么获得”，不描述未获得候选项。
- 使用 Crew 可理解的产品语言。
- 不包含其他 Crew 的 ID、姓名或个人信息。
- 不包含 solver pass、堆栈、原始 C++/Rust 法规诊断或内部表名。
- 不使用 `bid_explanation_report.csv.failure_reason` 为 Assigned 行伪造原因。
- 算法无法给出可靠解释时输出空单元格，禁止由 Live Server 或 PBS Server 猜测原因。

输出格式示例：

```text
## ASSIGNMENTS
crew_id,pairing_id,acting_rank,source,comments
19,10924,IFD,CR,PBS_AWARD_V1|Matched your Tier 2 pairing preferences.
```

兼容及解析规则：

- 旧版 `ASSIGNMENTS` 没有 `comments` 列时按空值处理。
- 显式空单元格和缺失列均表示 `null`。
- comments 禁止逗号、CR/LF 和控制字符，因此不依赖未实现的 CSV quoting。
- 同一 `(crew_id, pairing_id)` 最多一条 Assignment；完全重复或 comments 冲突均视为
  结果结构损坏，沿用现有结果完整性失败路径，不能静默任选。
- 非 UTF-8、非法 `pairing_id` 或无法解析的 Section 属于整份结果结构错误。

### 4.4 Scenario Loader

Live Server 使用 `(crew_id, pairing_id)` 关联 `ASSIGNMENTS` 与 Pairing Segments：

- 每个 Segment 行写入同一 `comments`。
- 缺列或空单元格写入 `null`，Scenario 重跑时不得继承上次 Solver Explanation。
- Loader 不生成、不翻译、不改写原因。
- Loader 只接受严格匹配 `PBS_AWARD_V1` 文法的值；非法协议值写入 `null` 并记录不含
  正文的结构化 warning。
- 超过 180 个 Unicode 字符的受控协议值写入 `null`，禁止截断后展示不完整解释。
- Loader 每次先删除该 Scenario 的旧结果分区再写新结果，因此重复加载同一结果保持幂等；
  新结果为空值时旧 Solver Explanation 必须被清除。
- 本功能只拥有 `ASSIGNMENTS` 产生的 CR Flying 行。PA / lead-in 由现有 `ROSTER` 路径
  处理，人工 MA 不由结果加载器生成，本功能不得把它们的普通 comments 改成受控协议。
- 所有非 Solver comments 写入口必须在进入数据库前调用统一保留命名空间校验；检测到
  `PBS_AWARD_` 前缀时返回稳定的字段级校验错误，不能静默删除或改写前缀。
- Assignment 找不到 Pairing Segment 时沿用现有 Assignment 完整性处理；不得仅为保留
  comments 创建无航段的伪 roster 行。

### 4.5 Scenario 导回 Live

继续使用现有 Scenario Publish Copy Columns：

- `scenario.roster_flight.comments` 原样复制到 Live `roster_flight.comments`。
- `request_source='SCENARIO'` 和 `request_id=scenario_id` 继续用于问题追溯。
- 不在此步骤重新计算或覆盖解释。

### 4.6 Live Publish

继续使用现有 Roster Publish Snapshot：

- Live `roster_flight.comments` 原样复制到 `roster_publish.comments`。
- PBS 不运行时 Join Live `roster_flight` 或 Scenario。
- 重复 Publish 必须使用本次 Live Roster 的当前 comments 形成新快照，不读取旧
  Scenario 文件。

### 4.7 Award API

PBS Server 的 Award Roster 查询增加：

```sql
rp.comments::varchar as explanation
```

Pairing 聚合规则：

- 完全复用现有 Award 查询的认证 Actor、airline/schema、division、period 和 Published
  Snapshot 时间范围；`crew_id` 只能来自服务端认证身份，不接受客户端指定其他 Crew。
- 按当前认证 Crew、当前 period 和现有 `pairing_id` 聚合，不跨 period 或快照混合。
- 比较前只把缺失值、空字符串和纯空白规范化为 `null`；非空值逐字符比较。
- 聚合真值表：

| Segment comments | API explanation |
|---|---|
| 全部 `null` | `null` |
| 全部为相同、合法的 `PBS_AWARD_V1` 值 | 返回剥离标识后的正文 |
| 全部为相同普通 comments | `null` |
| 部分为空、部分为受控值 | `null`，记录数据质量事件 |
| 两个或以上不同受控值 | `null`，记录数据质量事件 |
| 普通 comments 与受控值混合 | `null`，记录数据质量事件 |

- 数据质量事件使用稳定内部代码 `AWARD_EXPLANATION_SEGMENT_MISMATCH`，记录
  schema、period、当前 Crew ID、pairing ID 和可用的 Scenario `request_id`，不记录
  comments 正文。
- Crew API 保持成功响应，不返回内部 warning 或原始诊断；解释冲突时仅返回
  `explanation=null`。
- API 不返回原始异常对象或内部诊断。

### 4.8 PBS Portal

- 在 Selected Duty / Pairing 详情中增加只读 Award Explanation 区域。
- `explanation=null` 时不显示该区域，不显示 `Missing`，也不伪造原因。
- 多航段 Pairing 只展示一次。
- 完整 Reason Report 按钮和 Preview 继续保持当前不可用逻辑。
- UI 文案使用 English，遵循现有 PBS Portal 语言规范。

## 5. 数据所有权与追溯

- PBS Engine 是解释内容的唯一生成方。
- `scenario.roster_flight.comments` 是优化结果落库后的工作态副本。
- Live `roster_flight.comments` 是导回后的 Live 工作态副本。
- `roster_publish.comments` 是 Award 页面唯一运行时权威。
- PBS Server 和 Portal 只能透传或展示，不得重建算法理由。
- 问题查询使用当前认证 Crew、period、`roster_publish.pairing_id`，并结合随 Roster
  复制的 `request_source/request_id` 追溯到 Scenario。
- 本阶段只能可靠追溯到 Scenario，不能区分同一 Scenario 的多次 Solver Run；在没有新增
  run ID/checksum 持久字段前，不声称能追溯到具体 `output.gz`。

## 6. 错误处理

- 单条 Explanation 生成失败或缺少可靠匹配事实：该 Assignment 输出空 comments，不影响
  合法 Assignment。
- Engine 未提供 comments 或输出旧版无该列：正常发布，Award 不展示 Explanation。
- Engine comments 不符合严格文法或超过 180 个 Unicode 字符：该值写入 `null`，Loader
  记录不含正文的结构化 warning，不展示截断内容。
- Engine 输出非法 UTF-8、非法 Pairing ID、重复 Assignment 或同 key 冲突：视为结果结构
  损坏，沿用现有整份结果失败策略，不能降级为任意解释。
- Scenario → Live 复制失败：沿用现有 Publish 事务失败行为，不产生半份 Live 写入。
- Live → `roster_publish` 失败：沿用现有 Roster Publish 事务失败行为，不产生半份快照。
- 同一 Pairing 的 Segment comments 不一致：API 不展示任意一条，服务端记录脱敏数据质量
  事件。
- 所有用户可见错误必须使用现有页面级状态或全局消息入口，不显示原始数据库/求解器异常。

## 7. 验证方案

### 7.1 PBS Engine

- Assigned Pairing 输出不超过 180 字符的 `comments`。
- 按 `PAIRING_SCORE.csv` 的 Crew/Pairing 行和 Tier Counter 确定性生成。
- 多个有效 Tier 选择数值最小 Tier。
- 找不到唯一 Score 行、Counter 非法或没有有效 Tier 时输出空值。
- 输出不包含其他 Crew ID、内部 pass 或原始法规诊断。
- 测试 Tier 边界、多个 Tier、重复 Score 行、非法 Counter、逗号/换行/控制字符和旧格式
  兼容。

### 7.2 Live Server

- Loader 将一个 Assignment comments 写入对应全部 Segment。
- 非法文法和超长受控输入落 `null`，不截断展示。
- 旧版无 comments 列正常加载为空。
- 重复 key 和冲突 comments 不被静默接受。
- PA / lead-in 原有 comments 不被覆盖。
- 所有非 Solver comments 写入口拒绝 `PBS_AWARD_` 保留前缀。
- Scenario Publish SQL 继续包含 `comments`。
- Roster Publish SQL 继续把 Live comments 写入 `roster_publish`。
- 固定文本在 Scenario、Live 和 `roster_publish` 三段逐字符一致。

### 7.3 PBS Server

- Award 查询只读取 `roster_publish.comments`。
- 认证 Crew、period、airline/schema 和 division 沿用现有 Award 隔离。
- 多 Segment 相同受控原因聚合为一个 Explanation。
- 全空返回 `null`。
- 普通人工 comments 不返回给 Crew。
- 即使普通 comments 冒用相似文本，未同时满足严格文法和 CR/SCENARIO provenance 也不返回。
- 部分为空、受控值冲突或普通/受控混合均返回 `null`，记录脱敏事件。
- 测试证明 Award 请求期间不读取 Scenario、Live `roster_flight` 或 Engine 文件。
- 覆盖跨 Crew 越权请求和多 period/快照隔离。

### 7.4 PBS Portal / Playwright

通过真实 Award 页面验证：

1. 登录 Crew Portal 并打开 Award。
2. 选择一个带 comments 的已获 Pairing。
3. Selected Duty 只显示一条正确的 Award Explanation。
4. 页面不显示其他 Crew ID、solver pass 或原始法规诊断。
5. 选择无 comments 的 Pairing 时不显示 Explanation，也不显示 `Missing`。
6. 在两个 Pairing 间切换时 Explanation 正确更新，不残留上一条内容。
7. 普通人工 comments 不出现在 Award Explanation。

## 8. 验收标准

- 不新增数据库字段。
- 已获 Pairing 的解释能从 Solver 完整传递至 `roster_publish.comments`。
- Award API 请求期间只读取 Published Snapshot。
- Award API 只返回当前认证 Crew、当前 period 的数据。
- 只有 `PBS_AWARD_V1` 受控协议文本可以展示。
- 人工、导入和同步 comments 不能写入 `PBS_AWARD_` 保留命名空间。
- 同一个 Pairing 的多航段只展示一次解释。
- 无解释时不伪造、不显示 Missing。
- 不泄露其他 Crew 信息或求解器内部诊断。
- 完整 Reason Report 保持本阶段范围之外。
- 后端测试、PBS Portal 测试、Playwright 和 QA 测试案例全部通过。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: Contract 固定后，PBS Engine 输出、Live Server Loader、PBS Server/API 与 Portal
  可以按模块独立开发和验证。
- Suggested split:
  - Agent A：PBS Engine `output.gz` comments Contract 和测试。
  - Agent B：Live Server Scenario Loader 与两段 Publish 回归。
  - Agent C：PBS Server Award API、Portal 展示和 Playwright。
- Write boundaries: 三个 Agent 分别只修改 Engine、Live Server、PBS Server/Portal；SQL 不改。
- Conflict risk: 中等。主要风险是 Engine 的 Section/字段命名与 Loader 解析不一致。
- Execution gate: 本 Spec 经用户批准并形成实施计划后才能开始；并行执行还需用户明确授权。
