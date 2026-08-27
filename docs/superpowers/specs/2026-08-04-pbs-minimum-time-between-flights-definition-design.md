# PBS Minimum Time Between Flights 定义管理设计

## 1. 背景

`Time Between Flights`（`property_code=129`）用于表达同一 duty 内相邻航班之间的间隔偏好。
当前有效输入范围由两部分组成：

- 最低值来自 `dictionary`：
  - `parent_code = SYS_PARAM`
  - `code = PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES`
  - 当前值为 `45` 分钟，即 `00:45`
- 最高值根据当前用户、Bid Period、Base、Rank 可见的 Pairing pool 实时计算。

最低值已经参数化，但尚未进入 Gantt 的 `Bid Definitions` 管理页面，管理员不能通过页面维护。

## 2. 目标

在现有 `Bid Definitions` 页面新增 `Minimum Time Between Flights`，允许管理员维护公司定义的最短航班间隔，并让 PBS Portal、PBS Server 的保存校验以及 Pairing Search 使用同一个最新定义。

## 3. 范围

### 3.1 包含

- 在共享 Bid Definitions contract 中增加 Minimum Time Between Flights 定义。
- Live Server Bid Definitions API 读取并更新现有 dictionary 行。
- Gantt Bid Definitions 页面显示、编辑该定义。
- PBS Portal 打开 `Time Between Flights` 时读取最新最低值。
- PBS Server 对新建或实际修改的 Current Bid、Standing Bid、Favorite 使用最新最低值校验。
- 已保存且具体时长未变化的旧记录允许保留原值。
- 更新自动化测试、Playwright 测试和 PBS 人工测试用例。

### 3.2 不包含

- 不把实时计算的最大值改为管理员配置。
- 不修改 `Time Between Flights` 的 Bid payload、property code、Any/Every、Award/Avoid 或比较符语义。
- 不批量更新、删除或重写已有 Bid、Standing Bid、Favorite。
- 不修改 Pairing interval 的计算方式。
- 不新增 dictionary 行；继续使用已存在的参数。

## 4. 业务规则

### 4.1 配置含义

管理员配置的是公司允许的最小航班间隔，不是某一位用户的 Bid 值。

示例：管理员把最低值从 `00:45` 修改为 `01:00` 后：

- 新打开的 `Time Between Flights` 弹窗使用 `01:00` 作为最低值。
- 用户可以保存 `01:00` 或更大的值。
- 用户不能新建或修改为 `00:59` 或更小的值。
- 当前 Pairing pool 的最大值仍由后端实时计算。
- 已保存的 `00:45` 记录保持不变。

### 4.2 历史记录豁免

规则与 `Minimum Base Layover` 一致：

- Current Bid、Standing Bid 使用稳定的持久化记录标识和原始 duration 判断。
- Favorite 使用稳定的 favorite 标识和原始 duration 判断。
- 已有记录的 duration 未发生变化时，即使低于最新最低值，也允许保存 Tier 等其他变化。
- 新增记录、复制后形成的新记录、删除后重建或修改 duration 时，必须满足最新最低值。
- 不允许仅凭前端状态绕过；PBS Server 是最终校验边界。
- dictionary 缺失、重复、非法或暂时不可读取时，稳定旧记录的 duration 若未变化，仍允许原样保留；新增、复制、重建或实际修改 duration 必须拒绝。
- Portal 编辑旧低值时也必须识别“稳定记录且规范化 duration 未变化”，不能在 Server 校验前错误阻断；该判断只改善交互，Server 仍需独立核对数据库原记录。

稳定记录的后端核对必须匹配当前认证用户、Bid Context、`property_code=129`、持久化稳定 key 和原始规范化 duration；Current Bid 与 Favorite 还必须匹配 Bid Period，Standing Bid 则匹配对应的 Standing Bid Context，不虚构 Period。客户端不能通过传入 grandfathered 标志获得豁免；跨用户、跨适用的 period、跨 context、伪造 key 或复制记录均不匹配。

### 4.3 时间格式

- 管理页面输入和展示使用 `HH:MM`，例如 `00:45`、`24:45`；小时为 2–3 位，分钟必须为 `00–59`。
- dictionary 继续保存整数分钟字符串，例如 `45`、`60`。
- 合法值为 1–59,999 分钟，对应 `00:01`–`999:59`；`00:00`、负数、小数、非安全整数和超出范围的值均非法。
- 管理页面保存前将 `HH:MM` 转换为整数分钟；读取后按小时至少两位的 canonical `HH:MM` 展示。
- 最低值不得大于当前 Pairing pool 的动态最大值不是管理接口的约束，因为最大值随人员和 Bid Period 变化；用户打开 Bid 弹窗时再按实际上下限校验。

## 5. 页面与交互

### 5.1 Bid Definitions 列表

新增一行：

| Definition | Current Value | Description |
|---|---|---|
| Minimum Time Between Flights | `00:45 minimum` | Minimum same-duty connection time allowed for Time Between Flights bids. |

沿用现有行尾编辑图标，不新增独立按钮或新的页面结构。

### 5.2 编辑弹窗

- 标题：`Edit Minimum Time Between Flights`
- 字段：`Minimum Duration`
- 输入格式：`HH:MM`
- 保存成功后刷新当前定义列表。
- 格式错误显示在字段附近，并通过可访问描述与输入框关联。
- 短暂的保存请求失败使用项目现有全局 message/toast；配置缺失、重复、非法等需要持续参考的问题使用带 Retry 的局部错误状态，不能只显示 toast，也不能显示原始异常信息。

## 6. 数据与接口

### 6.1 数据源

继续使用：

```text
SYS_PARAM / PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES / 45
```

本次原则上不需要 migration。若目标环境缺少该行，应报告配置不可用，不得以代码常量静默兜底。

### 6.2 Bid Definitions API

- 列表响应增加 Minimum Time Between Flights definition。
- definition code：`minimum-time-between-flights`。
- value response：`{ available: true, minimumMinutes: number } | { available: false }`。
- 更新入口：`PATCH /api/pbs/bid-definitions/minimum-time-between-flights`。
- 唯一请求格式：`{ minimumMinutes: number }`，必须为 1–59,999 的安全整数；不接受字符串或额外字段。
- 成功响应返回更新后的完整 definition row。
- GET/PATCH 均仅允许管理员访问；`updated_by` 只能来自认证身份。
- 更新在事务中完成，并要求目标 dictionary 行恰好一条；缺失或重复均回滚并返回 `409`，不得自动插入、静默选择第一行或使用代码默认值。
- dictionary 值非法时 GET 返回 `available: false`，页面进入可恢复的局部错误状态。

### 6.3 PBS Bounds API

现有 Time Between Flights bounds API 保持职责：

- `minimumMinutes`：读取最新 dictionary。
- `maximumMinutes`：按当前用户、period、base、rank 的 Pairing pool 实时计算。

不得把动态最大值写入 Bid Definitions。

动态最大值继续作为当前 Period Pairing pool 的输入参考，不升级为跨上下文的公司业务定义。Standing Bid 本身没有固定 Bid Period，不能把某一个当前 Period 的动态最大值作为长期 Standing 规则的后端硬限制。因此本次 PBS Server 权威保存校验只增加最新公司最低值；现有 Portal 对当前可见 pool 最大值的交互保持不变，不在本次扩大或重定义。

## 7. 数据流

1. 管理员在 Gantt Bid Definitions 保存新的最低时长。
2. Live Server 更新 dictionary 及审计字段。
3. PBS Portal 后续打开或重新打开 `Time Between Flights` 时强制重新请求 bounds，不以同一会话的旧缓存作为最终值。
4. PBS Server 返回最新最低值和实时最大值。
5. Portal 沿用现有字段级动态范围校验。
6. 保存 Current Bid 全草稿、Current 单条新增/修改、Standing 全草稿、Favorite 新建/修改时，PBS Server 再次校验最新最低值；仅豁免 duration 未改变的稳定旧记录。Search Pairings 编辑/预览入口继续通过 bounds API 使用最新最低值。
7. Pairing Search 和算法消费继续读取用户 Bid 中保存的具体 duration，不把公司最低值写入 Bid payload。

保存校验以 PBS Server 开始校验时可读取到的最新 committed dictionary 值为准。管理员提交与用户保存并发时，不要求跨 Live Server 和 PBS Server 建立分布式串行事务；若配置在本次校验读取后才提交，该用户请求允许按刚读取的已提交值完成，下一次请求必须使用新值。

Portal bounds 查询按 actor、period、base、rank 使用现有 query key，但弹窗每次打开或重新启用查询时必须 refetch。更新定义后无需跨应用共享前端 cache invalidation；真实重新请求是验收依据。

## 8. 错误处理

- 管理端无效 `HH:MM`：字段级错误，禁止保存。
- dictionary 缺失、重复或非法：管理端和 Portal 显示带 Retry 的可访问局部错误状态；PBS 端禁止新建或修改 Time Between Flights，但允许稳定旧值原样保留。
- bounds 加载中：禁用新建或实际修改的保存操作，不清空现有输入。
- bounds 请求失败：显示带 Retry 的可访问局部错误状态并禁用新建或实际修改；瞬时失败不得无限重复 toast。
- `maximumMinutes = null`：表示当前 pool 没有可用于该条件的相邻航班间隔；显示持续状态并禁用新建或实际修改。
- `maximumMinutes < minimumMinutes`：表示当前用户和 period 没有合法输入区间；显示持续状态并禁用新建或实际修改。
- 上述动态最大值异常状态不阻止稳定旧记录保持 duration 不变后保存其他变化。
- 保存接口失败：保留弹窗输入，不提前清空；使用统一全局消息提示。
- 后端日志只记录清洗后的诊断信息，不向用户暴露 SQL、异常对象或内部连接信息。
- 前端按 HTTP 状态或规范化错误类型处理，不根据原始异常 message 分支：无效输入 `400`、非管理员 `403`、dictionary 缺失或重复 `409`、非预期服务失败 `500`。

## 9. 验收标准

1. Bid Definitions 显示 `Minimum Time Between Flights` 及 `00:45 minimum`。
2. 管理员能把最低值改为新的有效 `HH:MM`，刷新后仍显示新值。
3. PBS Portal 在同一会话重新打开 Time Between Flights 时使用最新最低值。
4. 动态最大值仍来自当前 Pairing pool，不受管理配置保存影响。
5. 新建或修改为低于最新最低值时，Portal 与 PBS Server 均拒绝。
6. 已保存且 duration 未变化的旧记录可以继续保存其他变化。
7. 旧记录一旦修改 duration，就必须满足最新最低值。
8. Current Bid、Standing Bid、Favorite 均遵守相同规则。
9. Bid payload 不新增公司最低值字段。
10. dictionary 缺失或非法时无代码常量兜底。
11. 非管理员无法读取或修改 Bid Definitions；审计用户来自认证身份。
12. 伪造、错配、跨用户、跨 context，以及 Current/Favorite 跨 period 的稳定 key 不能获得旧值豁免。
13. bounds 加载失败、无最大值或最大值小于最新最低值时，新建/修改被禁用并显示可恢复状态；稳定旧值仍可原样保留。
14. Search Pairings 已有 Time Between Flights 编辑/预览路径使用最新最低值，但筛选算法和已保存 payload 保持不变。

## 10. 验证范围

- Shared contract：解析、格式化、无效值。
- Live Server：列表映射、正常更新、无效输入、非管理员 `403`、缺行/重复行 `409` 与回滚、非法值 unavailable、认证审计字段。
- PBS Server：bounds 读取最新最低值；Current 全草稿/单条、Standing 全草稿、Favorite 新建/修改的新增与变更最低值校验；稳定旧值低于 minimum 或配置不可用时的豁免；伪造 key、跨用户、跨 context、Current/Favorite 跨 period 和复制绕过失败。
- PBS Portal：动态 bounds、字段错误、旧值未变豁免、复制/变更不豁免、加载失败 Retry、无有效区间、同一会话重新打开后的最新值。
- Pairing Search：已有 Time Between Flights 编辑/预览入口读取最新最低值，匹配仍使用 Bid 自身 duration。
- Playwright：管理员更新定义，再通过真实 Portal 打开条件并验证新最低值。
- Frontend UI 变更后运行 `npm run check:ui`。
- 涉及 `pbs-server/**/*.ts` 的提交前，按仓库规则执行一次 TypeScript 编译检查。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 功能跨 Gantt、Live Server、PBS Server 和 Portal，但共享同一 contract，且历史豁免依赖统一业务语义；串行实施更容易保证契约一致。
- Suggested split: 不拆分；按 contract → Live Server → PBS Server → Portal/Gantt → 测试顺序实施。
- Write boundaries: 单一实施者维护共享 contract 和各消费者。
- Conflict risk: Medium，重点风险是错误地使旧 Bid 全量失效，或把动态最大值变成静态配置。
- Execution gate: 用户审核并批准本 spec 后方可进入实施计划和代码修改。
