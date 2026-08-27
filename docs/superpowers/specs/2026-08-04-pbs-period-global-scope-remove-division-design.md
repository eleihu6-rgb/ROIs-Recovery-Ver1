# PBS Period 全局共享并移除部门维度设计

## 1. 背景

PBS Period 当前由 Live schema 的 `roster_period.pbs_*` 字段统一承载。`roster_period` 本身没有
`division` 字段，因此数据库中不存在“某个部门对应某个 PBS 周期”的关系。

现有代码仍保留了早期按部门设计的痕迹：

- Gantt 的 PBS Period 页面展示并提交 `Division`。
- Live Server 的 Period API 接收 `division`，并在返回结果中固定补充 `A`。
- PBS Server 查询 `pbs_user.division`，再把用户部门拼入 Current Period 返回对象。
- PBS Server 的部分 Current Period 缓存按 `crewId` 拆分。

这些逻辑没有真正按部门选择 Period，却会让接口和页面看起来像 Period 受部门控制，也会让不同用户分别持有
Current Period 缓存，增加开放状态短暂不一致的可能。

## 2. 产品决策

PBS Period 是航司级全局配置，不按部门区分。

- Pilot、Cabin 和其他部门共用同一个当前 PBS Period。
- Period 的开放时间、截止时间、最大 Tier 数、Award 时间和状态对所有 Portal 用户一致。
- 用户部门仍是有效业务属性，继续用于 Pairing、Reserve、Dashboard 数据范围等现有业务。
- 不删除或修改 `pbs_user.division`；只禁止它参与或附着到 Period 解析结果。
- `Filiale` 继续保留，本次只移除 `Division`。

## 3. 目标

1. 从 PBS Period 管理页面和接口契约中彻底移除 `Division`。
2. 让 PBS Server 仅根据 `roster_period.pbs_*` 和 PBS Business Time 解析唯一的全局当前周期。
3. 让不同部门用户得到相同的 Period、开放状态、开放时间和截止时间。
4. 消除按 crew 拆分 Current Period 缓存造成的用户间状态更新时间差异。
5. 保留所有需要部门信息的非 Period 业务行为。

## 4. 非目标

- 不删除 `pbs_user.division`。
- 不改变 Pairing、Reserve、Dashboard、crew profile 等功能的部门过滤规则。
- 不修改 `roster_period` 表结构。
- 不新增 PBS Period 表或部门与 Period 的映射表。
- 不改变 PBS Business Time 的定义和管理权限。
- 不改变 Period 的自动选择排序规则、日期算法或状态计算规则。
- 不移除 `Filiale`。

## 5. 当前数据关系

```text
Live roster_period.pbs_*
  └─ 全局 PBS Period、开放窗口、最大 Tier、Award 时间

PBS pbs_user.division
  └─ 用户所属部门，用于部门相关业务数据范围

当前错误边界
  └─ PBS Server 把 pbs_user.division 拼入 Current Period，但二者没有数据库映射关系
```

`roster_period` 是 Period 的唯一事实源。部门不是 Period 的组成部分。

## 6. 设计方案

### 6.1 Gantt：PBS Period 页面

从以下位置删除 `Division`：

- Period 筛选区。
- Period 列表列。
- Add/Edit PBS Period 弹窗。
- Generate PBS Year 表单。
- Generate Year 预览表格。
- 前端 Period 类型、请求参数和本地默认值。

`Filiale` 保持现状。

删除 Division 后应同步调整表格 `colSpan`、表单网格和自动化测试定位，避免留下空列或布局缺口。

### 6.2 Live Server：Period Admin API

Period Admin API 不再接收或返回 `division`：

- 列表查询删除 `division` filter。
- Create、Update、Generate Year、Preview payload 删除 `division`。
- Period、Generate Preview 和 Generate Result response 删除 `division`。
- 删除 `DIVISIONS`、`SHARED_DIVISION` 及固定补 `A` 的 SQL 投影。

`filiale` 仍由当前 schema/config 解析并按现有契约保留。

由于 `roster_period` 没有 `division` 字段，本次不需要数据库 migration，也不需要清理已有 Period 数据。

### 6.3 PBS Server：全局 Current Period 解析

Current Period 解析不再依赖 Portal 用户：

- 删除 Current Period CTE 中对 `pbs_user` 的查询。
- 删除 `actor_scope`、部门默认值和 `cross join scope` 中的部门拼接。
- Current Period 候选只来自 `liveRosterPeriod` 中有效的 `pbs_period_code` 记录。
- 继续使用 PBS Business Time 和现有排序规则选择唯一当前周期。
- `resolveCurrentPeriod` 不再因为 `actor.crewId` 不同而产生不同的 Period 结果。
- `CurrentPeriodBidRow` 和 `loadCurrentPeriodAndExistingBid` 的联合 SQL 投影也删除 `division`，避免只清理
  单独查询路径而留下另一条 Current Bid 路径。

现有 Current Bid 查询仍按 `actor.crewId` 查找该用户自己的 Bid；只把“选择当前 Period”和“查找用户 Bid”
分清楚，不能把用户身份从 Bid 查询中删除。

### 6.4 Current Period contract

从下列 Period 数据结构中删除 `division`：

- `PbsCurrentPeriod`。
- PBS Server 内部 `CurrentPeriodRow`、`LineholderPeriodContext` 和序列化结构。
- Current Period API response 和 Portal 对应类型/mock/test fixture。

Portal 页面目前不使用 `currentPeriod.division` 决定业务展示，因此不需要替代字段。

Dashboard 等功能需要部门时，继续使用独立的用户 profile `division`，不得从 Current Period 取部门。
移除 `resolveCurrentPeriod` 的 actor 依赖时，必须同步检查 Dashboard Profile、Dashboard Summary、Award、
Calendar、Days Off、Pairing、Line、Reserve 和 Summary 等调用方，确保只有 Period 解析不再依赖用户，用户
Bid 与业务数据范围仍保留 actor/profile。

### 6.5 Current Period 缓存

Current Period 是全局数据，缓存也必须是全局的：

- Redis key 从按 crew 的 `period/current/v1/<crewId>` 改为新的全局版本，例如
  `period/current/v2/global`。
- 各 Current Bid/Days Off/Pairing/Line/Reserve/Calendar/Summary 入口不得再按 crew 创建 Period cache key。
- 非 Redis 的进程内 fallback cache 也不再使用 `crewId` 作为 key。
- 旧 `v1/<crewId>` key 不主动迁移；改用 `v2/global` 后自然失效。
- 维持现有 60 秒 TTL，不在本需求中引入跨服务缓存通知机制。

这样同一 PBS Server/Redis 范围内，所有部门和 crew 读取同一份缓存，不会因每个 crew 的缓存建立时间不同而
呈现不同开放状态。

## 7. 数据流

```text
Gantt PBS Period Admin
  └─ 写入 Live roster_period.pbs_*

PBS Server
  ├─ 读取 PBS Business Time
  ├─ 从 Live roster_period 选择全局 Current Period
  └─ 使用全局 Current Period cache

Portal 用户请求
  ├─ Current Period：所有部门一致
  ├─ Current Bid：仍按 crewId 读取用户自己的 Bid
  └─ Pairing/Reserve 等部门业务：仍按 profile.division 过滤
```

## 8. API 兼容策略

项目尚未上线，本次直接收紧内部契约，不保留 `division` 兼容字段。

- 新版前端不再发送 `division`。
- 新版响应不再返回 `division`。
- 旧请求如果仍携带 Period `division` 参数或字段，API 返回 `400`，用于及时暴露未同步升级的内部调用方，
  不静默忽略。
- 不增加 deprecated alias、兼容 mapper 或双写逻辑。
- 部署时 Gantt、Live Server、PBS Server、Portal/shared contract 应作为同一版本发布。

## 9. 错误处理

本次不新增错误类型。沿用现有行为：

- 找不到有效 Period 时返回只读的 fallback Period。
- 开放时间未到、已截止或配置不完整时，继续由现有 computed stage 和 read-only reason 表达。
- 删除 Division 后，错误文案不得再出现“当前用户没有匹配部门周期”等部门匹配含义。

## 10. 测试设计

### 10.1 Live Server

- Period list/create/update/generate-year 请求和响应不包含 `division`。
- 查询不再接受 Division 作为业务筛选条件；旧请求携带 `division` 时返回 `400`。
- Generate Year 仍创建 12 个全局 Period，并正确识别已有月份。
- `Filiale`、时间窗口、最大 Tier 和状态行为保持不变。

### 10.2 PBS Server

- Pilot 用户与 Cabin 用户在同一 Business Time 下解析出相同：
  - Period ID。
  - Period Code。
  - computed stage。
  - bid open/close time。
  - `canEditBid` 和 `readOnlyReason`。
- Current Period SQL 不再读取 `pbs_user.division`。
- Current Period response 不包含 `division`。
- Redis cache 使用全局 `v2/global` key，不含 `crewId`。
- 用户自己的 Current Bid 仍按 `crewId` 隔离。

### 10.3 Gantt Playwright

真实操作 PBS Period 页面并验证：

- Filters 中没有 Division。
- Period 表格没有 Division 列。
- Add/Edit 弹窗没有 Division。
- Generate Year 表单和 Preview 没有 Division。
- 创建、编辑、预览和生成周期主流程仍可完成。

### 10.4 PBS Portal Playwright/集成回归

- 使用两个不同 `division` 的用户访问 Portal。
- 两个用户看到相同的当前 Period 和开放/关闭状态。
- 开放时两者均可编辑 Current Bid；关闭时两者均为只读。
- Pairing/Reserve 的原有部门数据范围不因本次修改而改变。

### 10.5 QA 人工测试

新增 `docs/test-cases/pbs/period/` 下的人工测试文档，覆盖：

- 管理端不再显示部门字段。
- Pilot/Cabin Portal 用户周期状态一致。
- Period 切换前后所有用户在共享缓存刷新范围内得到一致结果。
- Pairing/Reserve 部门过滤回归。

## 11. 验收标准

1. PBS Period 管理页面任何位置均不再出现 `Division`。
2. Period Admin API 的 request/response 不再包含 `division`。
3. `PbsCurrentPeriod` 和 PBS Server Period context 不再包含 `division`。
4. PBS Server 选择 Current Period 时不查询 `pbs_user.division`。
5. 不同部门用户在相同时间得到完全一致的 Period 和开放状态。
6. Current Period Redis cache key 不再包含 crew ID。
7. 用户 Current Bid 仍按 crew 隔离，Pairing/Reserve 等部门业务保持原逻辑。
8. `Filiale` 保留。
9. 不新增数据库表、字段或 migration。
10. 相关 TypeScript、Vitest、Playwright、build 和 `npm run check:ui` 验证通过。

## 12. 风险与控制

- **跨模块契约风险**：Current Period contract 同时被 PBS Server 和 Portal 使用。必须一次性更新所有消费者、
  mock 和测试，避免旧字段残留。
- **缓存风险**：旧按 crew 的 key 不能继续命中新逻辑。通过升级 key version 到 `v2/global` 隔离。
- **业务范围误删风险**：只能删除 Period context 中的部门，不能删除 profile、Pairing、Reserve 等业务部门字段。
- **工作树冲突风险**：当前 Pairing Search 有未提交改动。本任务不修改这些文件；如测试 fixture 与其重叠，需先
  核对 diff，并只编辑 Period 必需部分。
- **发布一致性风险**：共享 contract 和两端服务应同步发布，不支持新旧契约长期混跑。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Gantt、Live Server、PBS Server 和共享 contract 围绕同一 Period 契约连续变化，顺序修改和集中
  验证比并行写入更安全。
- Suggested split: 不拆分实施；可在实现完成后单独做只读 review。
- Write boundaries: 仅 Period 管理、Current Period 解析/缓存、共享 contract 和对应测试/QA 文档。
- Conflict risk: 中等；需要避开工作区现有 Pairing Search 改动。
- Execution gate: spec 经用户批准后才进入实施计划与代码修改。
