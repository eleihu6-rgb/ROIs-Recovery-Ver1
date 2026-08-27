# PBS Bid Definitions 管理设计

## 1. 背景

PBS 中存在由航空公司统一定义、机组只能引用而不能自行修改的 Bid 业务参数：

- `Redeye` 的本地时间窗口；
- `Weekend` 的起止星期与时间；
- `Credit Window` 相对机组 period credit target 的调整小时数。

目前三者的数据来源不一致：

- Weekend 已从 live schema 的 `dictionary` 动态读取；
- Credit Window 已从 live schema 的 `dictionary` 动态读取；
- Redeye 虽在 `pbs_bid_property.validation_json` 中保存了展示定义，但 Pairing Search、Portal 展示等运行路径仍引用共享代码中的 `03:30–05:30` 硬编码。

这会造成数据库配置、前端展示、搜索和算法导出之间出现多份事实来源。项目需要在 Gantt 的 PBS 管理区增加独立的 `Bid Definitions` 页面，并将管理员可修改的 Bid 定义统一归属到 live `dictionary`。

## 2. 目标

1. 在 Gantt 左侧 `PBS` 菜单中增加 `Bid Definitions`，位于 `Period` 与 `Admin Tools` 之间。
2. 第一版支持管理 Redeye、Weekend、Credit Window 三项定义。
3. live `dictionary` 成为三项可变业务定义的唯一事实来源。
4. 修改定义后，已有 Current Bid、Standing Bid、Favorite、Pairing Search、Bidding Calendar 和算法导出在下一次服务端读取时立即采用新定义，不要求用户重新保存。
5. Redeye 时间范围支持跨午夜，例如 `23:00–05:00`。
6. 保持现有用户 Bid payload 语义稳定，不把公司定义复制进每条 Bid。

## 3. 非目标

- 不把全部 `pbs_bid_property.validation_json` 暴露给管理员编辑。
- 不提供通用 JSON 编辑器。
- 不改变 Current Bid、Standing Bid 或 Favorite 的现有页面交互。
- 不把用户选择、Tier 或 Award/Avoid 等实例数据迁入 `dictionary`。
- 不在第一版开放其他尚未确认的 Bid 参数。
- 不修改服务器操作系统时间；本功能与 PBS Business Time 管理相互独立。

## 4. 数据归属

### 4.1 live `dictionary`

`Bid Definitions` 是一个 UI 聚合页面，不要求所有配置使用同一个 `parent_code`。保留已经运行稳定的分组，并为 Redeye 新增独立分组。

| Definition | `parent_code` | `code` | 值 |
|---|---|---|---|
| Redeye | `PBS_PAIRING_REDEYE_CONFIG` | `START_TIME` | `HH:mm`，默认 `03:30` |
| Redeye | `PBS_PAIRING_REDEYE_CONFIG` | `END_TIME` | `HH:mm`，默认 `05:30` |
| Weekend | `PBS_PREFER_OFF` | `WEEKEND_START_DOW` | 星期代码，当前 `SAT` |
| Weekend | `PBS_PREFER_OFF` | `WEEKEND_START_TIME` | `HH:mm`，当前 `00:00` |
| Weekend | `PBS_PREFER_OFF` | `WEEKEND_END_DOW` | 星期代码，当前 `SUN` |
| Weekend | `PBS_PREFER_OFF` | `WEEKEND_END_TIME` | `HH:mm` 或结束边界 `24:00`，当前 `24:00` |
| Credit Window | `PBS_LINE_CREDIT_WINDOW_CONFIG` | `DELTA_HOURS` | `1–20` 的整数，当前 `5` |

Redeye 是否跨午夜由 `END_TIME <= START_TIME` 派生，不额外存布尔字段，避免同一语义出现互相矛盾的配置。

### 4.2 `pbs_bid_property`

`f8_pbs.pbs_bid_property` 继续负责条件目录元数据，例如：

- property code、名称与 Bid 类型；
- 可见性与适用 Bid Context；
- payload 结构及允许的交互类型。

Redeye 的 `validation_json` 只保留结构描述，不再包含 `definition.start`、`definition.end` 或展示 label。运行时不得从该字段读取可变 Redeye 时间。

### 4.3 用户 Bid 与 Favorite

现有实例数据结构保持不变：

- Redeye Bid 只保存 Award/Avoid、可选 date scope 等用户选择；
- Weekend Bid 只保存语义值 `Weekends`，不保存展开后的具体日期；
- Credit Window Bid 只保存 `more` 或 `less`；
- Current/Standing 实例继续存于 `pbs_bid_group` 等现有表；
- Favorite 继续存于现有 `pbs_bid_*_favorite` 表。

因此，修改公司定义后，已有实例可直接按新定义解释，不需要逐条迁移或重新保存。

## 5. 管理页面

### 5.1 导航

Gantt 左侧 PBS 菜单顺序：

1. `Period`
2. `Bid Definitions`
3. `Admin Tools`

`Bid Definitions` 使用独立右侧页面，不嵌入 Period 页面。

### 5.2 页面布局

沿用现有 PBS 管理表格风格，不使用大卡片。表格包含：

- `Definition`
- `Current Value`
- `Description`
- `Updated By`
- `Updated At`
- 右侧小型 Edit 图标

第一版固定显示三行：

| Definition | Current Value 示例 |
|---|---|
| Redeye | `03:30–05:30 local time`；跨午夜时追加 `Crosses midnight` |
| Weekend | `Saturday 00:00 – Sunday 24:00` |
| Credit Window | `±5 hours from period credit target` |

### 5.3 编辑弹窗

使用 `@rois/ui` `AppDialog`，不新增自制 Modal。

- Redeye：开始时间、结束时间；允许跨午夜，并提供只读预览。
- Weekend：开始星期、开始时间、结束星期、结束时间；提供只读预览。
- Credit Window：调整小时数；只允许 `1–20` 的整数。

保存过程中保留表单值并显示明确 loading 状态；成功后关闭弹窗并刷新该行。失败时不得清空当前输入。

## 6. API 与数据流

### 6.1 Gantt → live-server 管理接口

建议新增管理员接口：

- `GET /api/pbs/bid-definitions`
- `PATCH /api/pbs/bid-definitions/redeye`
- `PATCH /api/pbs/bid-definitions/weekend`
- `PATCH /api/pbs/bid-definitions/credit-window`

GET 返回三项聚合后的强类型数据与审计信息。PATCH 使用各自的 Zod schema，不接受任意 `parent_code`、`code` 或 JSON，以避免管理端变成字典任意写入口。

所有写接口：

- 仅管理员可用；
- 在事务内更新同一 Definition 的全部 dictionary 行；
- 写入 `updated_by`、`updated_at`；
- 返回保存后的完整 Definition；
- 不向用户返回 SQL、异常对象或内部连接信息。

### 6.2 PBS 运行路径

pbs-server 通过强类型 loader 从 live `dictionary` 读取：

- Prefer Off / Weekend 配置；
- Redeye 配置；
- Credit Window 配置。

配置记录数量很小。为满足立即生效要求，三项定义的 loader 每次相关服务端请求都读取 dictionary，并计算稳定的 `definitionVersion`（例如对规范化配置做 hash）。不得使用会让 loader 返回旧值的进程内 TTL 缓存。

Pairing Search 现有 preview Redis 缓存必须将 `definitionVersion` 纳入 cache key。这样 PATCH 无需跨进程通知独立 Redis，也能让多实例 pbs-server 在下一次请求读取配置后自然绕过旧结果；旧 key 按原 TTL 自动过期。所有受配置影响的其他缓存同样必须包含对应版本，或在读取前明确失效。

Portal 配置查询使用 `staleTime: 0`，重新打开编辑器时 refetch；同一页面完成配置 mutation 后显式 invalidate 对应 query。不得要求用户重新登录或重新保存 Bid。

完整 consumer 清单如下，实施与测试不得只修改其中一条：

- pbs-server Pairing Search / preview 的 Redeye condition builder；
- live-server Admin Tools 算法包导出的独立 Redeye condition builder；
- pbs-server Weekend 校验、Prefer Off 展开、Pairing 日期冲突和 Bidding Calendar；
- live-server 的现行算法导出路径；pbs-server 已返回 410 的旧导出路由只做遗留引用清理与回归保护，不作为生产态 consumer 扩展；
- pbs-server Line Credit Window 配置接口与校验；
- pbs-portal Redeye、Weekend、Credit Window 编辑器和摘要展示；
- `packages/contracts` 中的强类型配置 DTO、parser 和纯函数；共享 contract 不得再导出带业务值的 Redeye 常量。

共享 contract 只定义配置形状和纯解析/窗口计算函数；数据库访问分别由 live-server、pbs-server 的薄 loader 完成。两个服务加载同一组 dictionary keys，并把解析后的强类型配置显式传入各自的 builder/exporter，不允许 builder 自行读取硬编码默认值。

### 6.3 Redeye 运行语义

单个有效 leg 的出发机场本地 operating interval 与 Redeye 本地时间窗口发生重叠，即命中 Redeye。

- 当 `END_TIME > START_TIME`，锚定日 `D` 的窗口为 `[D + START_TIME, D + END_TIME)`；
- 当 `END_TIME < START_TIME`，锚定日 `D` 的窗口为 `[D + START_TIME, D + 1 day + END_TIME)`；
- 为避免漏掉午夜后的 leg，候选锚定日必须覆盖 `legLocalStartDate - 1 day` 至 `legLocalEndDate`，再以真实时间区间重叠判断；
- date scope 匹配窗口锚定日 `D`，不是窗口结束日；
- Pairing Search、预览、冲突检查和算法导出必须复用同一个 Redeye 配置解析与窗口语义。

时间区间使用半开区间，恰好在窗口结束时开始的 leg 不命中。测试必须覆盖同日、跨午夜、跨月/跨年、窗口边界和 DST 切换日。

所有本地墙上时间必须由共享 helper 使用机场或 Base 的 IANA 时区解析成带时区 instant，并采用与 Temporal `disambiguation: "compatible"` 一致的固定政策：

- spring-forward gap 中不存在的本地时间按跳变间隔向前平移，例如 `America/Vancouver` 的 `2026-03-08 02:30` 解析为 `2026-03-08 03:30 PDT`（`2026-03-08T10:30:00Z`）；
- fall-back fold 中重复的本地时间选择较早的 instant，例如 `America/Vancouver` 的 `2026-11-01 01:30` 选择第一次 `01:30 PDT`（`2026-11-01T08:30:00Z`）；
- Search、Calendar 和 exporter 不得分别依赖 JavaScript、PostgreSQL 或运行机器默认时区的隐式解析结果，必须调用同一政策的 helper 并对上述 instant 写断言。

“有效 leg”沿用现有 Pairing Search 数据资格：只处理未删除且具备有效计划开始/结束时间的 flight segment；ground task 不属于 pairing segment。Deadhead segment 继续按当前 Redeye 条件的既定规则处理，不在本功能中改变 Counting Deadhead 语义。机场时区缺失或非法时，该 segment 不得被猜测为 Redeye，服务端记录经过清理的诊断信息并按现有配置不可判定策略返回。

动态时间值进入生成 SQL 时必须参数化，不得把管理员输入直接拼接为 SQL literal。相关变更需要遵守 `docs/modules/database/generated-sql-safety-standard.md` 的 fixture、远端 PostgreSQL `EXPLAIN`/最小只读执行和入口 smoke 要求。

### 6.4 Credit Window 运行语义

- `More credit`：目标为 period credit target `+ DELTA_HOURS`，但不超过机组 credit max；
- `Less credit`：目标为 period credit target `- DELTA_HOURS`，但不低于机组 credit min。

Bid 实例不保存 target、min、max 或 delta。算法导出继续输出规则 401/402，并从 dictionary 读取最新 `deltaHours`。

### 6.5 Weekend 运行语义

Weekend 是按公司定义每周重复的连续本地时间区间，从配置的开始星期/时间延续到结束星期/时间。跨周由星期顺序自然派生。

边界计算统一换算为一周内分钟偏移：

- `END_TIME=24:00` 先规范化为结束星期的下一本地日 `00:00`，星期同步向后推进一天；
- 结束边界取开始边界之后第一个匹配的规范化星期/时间，持续时间按 `(endMinute - startMinute + 10080) % 10080` 计算；
- 计算结果为 `0` 的配置拒绝保存，不把相同边界解释为整周；因此 Weekend 持续时间必须大于 0 且小于 7 天；
- 同星期且结束时间晚于开始时间表示同日区间；同星期且结束时间早于开始时间表示延续到下一周的该星期；
- 示例：`SAT 00:00 – SUN 24:00` 规范化为 `SAT 00:00 – MON 00:00`，持续 48 小时；`FRI 18:00 – FRI 23:00` 持续 5 小时；`FRI 18:00 – FRI 17:00` 持续 167 小时；`MON 00:00 – SUN 24:00` 规范化后为相同边界并拒绝。

- Prefer Off 展开、Pairing 日期冲突、Bidding Calendar 的 Weekend 底纹/事件和算法导出都必须复用同一个 Weekend interval helper；
- Bidding Calendar 标记配置区间实际触及的本地日，不再固定判断 JavaScript 的 Saturday/Sunday；
- 现有 `buildWeekendEvents()` 固定周六/周日路径必须移除或改为消费强类型配置，包括空 Bid 的日历分支；
- 算法导出的起止 UTC 时间由机组 Base 时区和配置边界转换，边界日按真实 partial-day interval 裁剪，不得无条件导出整日 00:00–23:59；
- Pairing 冲突判断使用 pairing occurrence 与 Weekend interval 的真实时间重叠，而不是仅凭日期相同；
- 跨月时仍生成与目标 bid period 相交的区间片段，不能因为锚定日位于上月而漏掉本月开始部分。

该语义使 Weekend 的四个管理员字段都真正影响业务；不能只更新 Portal 展示文案。

## 7. 校验与错误处理

### 7.1 字段校验

- Redeye：开始/结束必须是有效 `HH:mm`；相同时间表示完整跨午夜边界还是零窗口容易产生歧义，因此不允许相同值。
- Weekend：星期代码必须来自 `DOW` 字典；普通时间使用 `HH:mm`，结束时间允许 `24:00`；按规范化和模周计算后持续时间必须大于 0 且小于 7 天。
- Credit Window：必须是 `1–20` 的整数。

字段错误显示在对应控件旁，并通过可访问描述与控件关联。

### 7.2 服务错误

- 配置缺失或无效时，受影响的 Portal 条件保持不可提交，不使用静默硬编码兜底。
- 短暂保存失败使用项目统一 toast；保留弹窗和用户输入，允许重试。
- 重复失败需去重或节流；不得向用户显示原始 Axios、PostgreSQL 或堆栈信息。
- GET 页面级失败显示可访问的本地错误状态与 Retry 操作，不把错误当普通业务文本展示。

## 8. 数据迁移

新增幂等 migration：

1. 预检 `dictionary` 是否存在重复 `(coalesce(parent_code, '___NULL___'), code)`；发现重复时 migration 明确失败并要求人工核对，不静默删除业务配置。
2. 将权威 live schema 补齐 `uq_dictionary_parent_code` 唯一表达式索引；migration 在预检通过后幂等创建同一索引，确保现有 `ON CONFLICT` 语句有真实约束支撑。
3. 在 live `dictionary` 中 upsert 顶级 `PBS_PAIRING_REDEYE_CONFIG` parent row，以及 Redeye `START_TIME=03:30`、`END_TIME=05:30`；已有非空配置不得被重复执行覆盖。
4. 从 `pbs_bid_property.property_code=117` 的 `validation_json` 移除可变 definition 值，只保留 payload 结构；同时清理 tooltip/description 中的 `03:30–05:30` 固定文案，改为不含具体值的说明。
5. 不修改现有 Bid、Standing Bid 或 Favorite 数据。
6. 提供 migration verify SQL，确认每个 dictionary key 恰好一行、property metadata 不含业务值、存量实例数量及 payload 均符合预期。

实际发布时 migration 需要按项目既定流程同步到 Development、SIT、UAT；执行数据库写操作必须单独获得用户授权，并记录每个环境的执行结果，不在文档中保存账号或密码。

## 9. 验证范围

### 9.1 live-server

- GET 聚合三项定义；
- 三个 PATCH 的管理员权限、Zod 校验、事务写入和审计字段；
- 无效时间、相同 Redeye 时间、非法 Weekend、Credit Window 越界；
- 算法导出读取修改后的 Credit Window 与 Redeye 定义；
- 动态 SQL fixture、远端 EXPLAIN/最小只读执行和 HTTP/file smoke。

### 9.2 pbs-server

- Redeye loader 的正常、缺失、非法配置；
- 同日、跨午夜、前一日锚定、边界、DST、跨月/跨年 Redeye 匹配；
- Weekend 与 Credit Window 保持 dictionary 动态读取；
- Weekend Calendar 不再固定周六/周日，空 Bid 和有 Bid 分支都按配置生成；
- Weekend same-DOW、`24:00` 规范化、partial-day、跨周/跨月展开与 Pairing 时间重叠冲突；
- Weekend 边界落在 DST gap/fold 时采用统一 compatible 政策，并断言转换后的 instant；
- 已有 Bid 无需重存即可按新定义校验、搜索、生成日历和导出；
- 配置不可用时不得回退到代码硬编码。
- Pairing Search cache key 包含 definition version，多实例读取新配置后不命中旧 preview。

### 9.3 gantt

- 菜单顺序与页面导航；
- 三行定义与当前值展示；
- 三类编辑弹窗、字段校验、保存 loading、成功刷新和失败保值；
- 非管理员不显示 PBS `Bid Definitions` 菜单或页面入口；直接访问管理 API 返回 401/403；
- `npm run check:ui` 必须通过且 hard violations 为 0。

### 9.4 pbs-portal 与 Playwright

- Redeye 编辑器显示服务端最新定义；
- Weekend 与 Credit Window 显示最新定义；
- 修改配置后，已有 Current Bid、Standing Bid 与 Favorite 无需重存即可显示和执行新语义；
- 重新打开编辑器会 refetch 配置，不显示旧 query cache；
- 管理员可进入 Gantt Bid Definitions，非管理员看不到入口且不能调用 GET/PATCH；
- UI 功能和修复使用真实页面操作的 Playwright 回归，不能仅以单元测试或代码检查代替。

## 10. 验收标准

1. PBS 菜单显示 `Period / Bid Definitions / Admin Tools`。
2. Bid Definitions 页面以紧凑表格显示三项定义，并通过统一弹窗编辑。
3. Redeye、Weekend、Credit Window 的管理员可变值全部以 live `dictionary` 为唯一来源。
4. 生产代码中不再存在决定 Redeye 运行语义的 `03:30/05:30` 常量。
5. Redeye 支持跨午夜，并在搜索、预览和算法导出中保持一致。
6. 修改任一定义后，已有 Bid、Standing Bid、Favorite 在下一次服务端读取时采用新定义，无需重新保存。
7. 配置缺失或非法时明确阻止相关操作，不使用隐藏默认值兜底。
8. 后端、前端、migration、动态 SQL 安全检查和 Playwright 回归全部通过并有命令回执。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 管理 API、共享配置契约、pbs-server 消费逻辑、Portal 展示和算法导出必须按同一语义顺序落地；并行编辑容易在 Redeye 跨午夜和配置失效策略上形成不一致。
- Suggested split: 不拆分实施 Agent；可在完成后使用独立审查 Agent 做只读 spec/code review。
- Write boundaries: 实施期由单一执行流依次处理 contracts/migration → live-server → pbs-server → gantt/pbs-portal → tests。
- Conflict risk: Medium，主要风险是共享 contracts、Redeye SQL builder 与跨模块测试同时变化。
- Execution gate: 本 spec 经用户明确批准后，先编写实施计划，再开始代码修改。
