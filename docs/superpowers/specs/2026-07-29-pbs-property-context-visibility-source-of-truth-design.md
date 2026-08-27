# PBS 条件上下文可见性唯一数据源设计

日期：2026-07-29
状态：已批准并实施
范围：PBS Portal Current Bid、Standing Lineholder、Standing Reserve 条件目录

## 1. 背景与问题

项目已明确规定：条件在 Portal 中显示或隐藏，必须由数据库配置控制，代码不得通过
property code 白名单、黑名单或条件分支决定目录可见性。

当前实现违反了该规则：

1. `pbs_bid_property.is_visible_in_portal` 是全局可见字段，不能表达不同 bid context 的差异。
2. Current Pairing、Days Off、Line、Reserve 服务先读取代码中的 `supportedCatalog`，再与数据库
   结果取交集。
3. Standing Bid 另外维护了 Lineholder Days Off、Pairing、Line、Reserve 的 property code
   allowlist。
4. 因此同一个数据库可见值在不同页面产生不同结果；修改数据库字段不一定能让条件显示。
5. 数据库标记为显示、但代码 registry 未包含的条件会被静默忽略，而不是暴露配置错误。

这导致实际目录出现以下偏差：

| 分类 | Current 实际开放 | Standing 当前目录 | 问题 |
|---|---|---|---|
| Days Off | 201、204 | 201、218 | 多出 218，漏掉 204 |
| Pairing | 102、103、107、110、112、116、117、122、129、163、168、428 | 除 102 外的 11 个 | 差异由代码写死 |
| Roster / Line | 407、408、427、429 | 407、408、410、427、429 | 多出已隐藏的 410 |
| Reserve | 301 | 301、312、313、314 | 多出 312、313、314 |

## 2. 目标

建立一个数据库驱动、按 bid context 区分的条件可见性模型，使：

1. 数据库成为条件目录显示与隐藏的唯一来源。
2. Current、StandingLineholder、StandingReserve 可以独立配置。
3. 修改数据库可见值后，无需修改或重新部署代码。
4. Standing 代码只负责长期条件的能力适配，例如去掉明确年月日，不决定条件是否显示。
5. 数据库配置与代码编辑器能力冲突时明确失败，不得静默隐藏。
6. 已保存的历史条件不能因后来隐藏而被静默丢失或在整份保存时被删除。

## 3. 非目标

本次不处理：

- 新增条件业务语义。
- 改变 Tier、Award/Avoid、Any/Every 或 operator 的既有含义。
- 新建 Portal 管理页面。
- 改变 Current Bid 与 Standing Bid 的草稿、提交和 fallback 数据边界。
- 把所有条件表单改成完全由 JSON 动态生成。

## 4. 方案比较

### 方案 A：新增上下文配置表（采用）

新增 `pbs_bid_property_context`，每个 property 在每个 bid context 下拥有独立可见配置。

优点：

- 与 `property_code | bid_context | is_visible` 业务模型一致。
- 支持未来增加 context，不需要继续增加列。
- 可以用唯一约束、外键和查询清晰表达关系。
- 彻底删除运行时代码 allowlist。

缺点：

- 需要 schema、migration、模型、resolver、缓存和测试的跨层迁移。

### 方案 B：在 `pbs_bid_property` 增加三个可见列

例如：

- `is_visible_in_current`
- `is_visible_in_standing_lineholder`
- `is_visible_in_standing_reserve`

优点是实现较快；缺点是每增加 context 都要修改 schema，字段职责持续膨胀。

### 方案 C：在 `pbs_bid_property` 保存 JSON context 配置

优点是 schema 改动少；缺点是约束、索引、查询、审计和迁移均较差，不采用。

## 5. 数据模型

新增表：

```sql
create table pbs_bid_property_context (
    id                   bigint generated always as identity primary key,
    created_by           varchar(30) not null default 'system',
    created_at           timestamptz not null default now(),
    updated_by           varchar(30) not null default 'system',
    updated_at           timestamptz not null default now(),
    property_id          bigint not null,
    bid_context          varchar(24) not null,
    is_visible_in_portal smallint not null default 0,
    display_order        integer,
    constraint fk_pbs_bid_property_context_property
      foreign key (property_id) references pbs_bid_property(id),
    constraint ck_pbs_bid_property_context
      check (bid_context in ('Current', 'StandingLineholder', 'StandingReserve')),
    constraint ck_pbs_bid_property_context_visible
      check (is_visible_in_portal in (0, 1)),
    constraint uq_pbs_bid_property_context
      unique (property_id, bid_context)
);
```

设计说明：

- 使用稳定的 `property_id` 外键，不以 `property_code` 建立关系。
- `property_code` 仍是业务编码和 API 展示字段。
- `display_order` 放到 context 层，因为不同 context 的目录数量和排序可以不同。
- `recommended_order` 与 `recommended_usage_count` 暂时继续用于 Current 推荐区，不扩展本次范围。
- `is_active` 继续表达属性定义是否已退役，不再承担显示开关职责。
- 如果 context 配置为可见但 property 已 inactive，服务返回配置错误，不得静默隐藏。

## 6. 唯一数据源规则

### 6.1 目录显示

目录条件只由以下查询语义决定：

```text
pbs_bid_property_context.bid_context = 请求上下文
and pbs_bid_property_context.is_visible_in_portal = 1
```

代码不得再维护以下内容：

- Standing Days Off property code allowlist。
- Standing Pairing property code allowlist。
- Standing Line property code allowlist。
- Standing Reserve property code allowlist。
- Current catalog 的 property code 显示白名单或黑名单。

### 6.2 代码 registry 的职责

代码仍需要 property definition / editor registry，用于：

- bid payload 类型。
- 默认值。
- 专属编辑器。
- 输入验证。
- 序列化和反序列化。

registry 不能决定目录显示。

如果数据库 context 配置为可见，但 registry 缺少对应定义：

- 后端返回稳定配置错误码。
- API 不返回半截 catalog。
- Portal 使用持久、可恢复的页面级错误状态。
- 错误中可显示 property code，不暴露异常对象、SQL 或栈信息。
- 禁止把该条件静默过滤。

### 6.3 旧全局字段

旧来源：

```text
pbs_bid_property.is_visible_in_portal
pbs_bid_property.display_order
```

新来源：

```text
pbs_bid_property_context.is_visible_in_portal
pbs_bid_property_context.display_order
```

迁移完成后：

- 所有 Current 和 Standing catalog consumer 停止读取旧可见字段。
- 添加“旧字段与新 context 值冲突时，新 context 值必须胜出”的回归测试。
- 旧字段仅为历史 seed/migration 兼容保留，不进入 Drizzle runtime model，也没有运行时 consumer。
- 后续单独清理历史 seed/migration 后再物理删除旧字段；本次不保留任何 fallback。

## 7. 初始上下文迁移矩阵

迁移不能直接复制旧全局字段，因为旧字段已经混入 Standing 专属历史配置。初始数据必须按当前已确认业务目录写入。

### 7.1 Current

| Bid Type | 可见条件 |
|---|---|
| DaysOff | 201、204 |
| Pairing | 102、103、107、110、112、116、117、122、129、163、168、428 |
| Line | 407、408、427、429 |
| Reserve | 301 |

### 7.2 StandingLineholder

| Bid Type | 可见条件 |
|---|---|
| DaysOff | 201、204 |
| Pairing | 103、107、110、112、116、117、122、129、163、168、428 |
| Line | 407、408、427、429 |
| Reserve | 无 |

`102 Pairing Preference` 在 Current 可见、StandingLineholder 不可见，其差异由 context 数据表达，
不再由代码排除。

### 7.3 StandingReserve

| Bid Type | 可见条件 |
|---|---|
| Reserve | 301 |
| DaysOff / Pairing / Line | 无 |

### 7.4 当前确认隐藏

以下条件不进入对应 Standing 目录：

- 218 Day of Week Off。
- 312 Reserve Day of Week Off。
- 313 Reserve Work Block Size。
- 314 Waive to Allow Carry over to be Days Off。
- 410 Mixed Block Pattern。

它们的 definition/editor 能力可以保留在 registry 中；以后只需修改 context 表可见值即可开放，
不需要修改 catalog 代码。

## 8. Standing 能力适配

Standing catalog 从数据库获取后，按 `bid_context` 使用已有编辑器。

Standing 适配只改变字段能力，不改变目录可见性：

- 不显示明确的 YYYY-MM-DD 日期。
- 不显示 Specific Dates。
- 不显示绝对 Date Range。
- 保留 Day of Week 多选。
- 保留每星期对应的时间窗口。
- 保留纯时间、时长、数量和相对月份范围。
- Reserve Preference 只允许 Whole Month、First Half、Second Half。
- Current Bid 编辑器和 payload 行为保持不变。

任何 Standing 能力判断必须基于 bid value 类型或数据库 context，不得根据 property code 决定是否显示目录项。

## 9. 历史草稿与隐藏条件

目录可见性和历史草稿可读性必须分离：

- `catalog`：只包含当前 context 可见条件，用于 Add Properties。
- `catalogByCode` / registry：包含所有已实现且 active 的定义，用于读取历史草稿。

当一个已有条件后来被设为隐藏：

1. Existing 区仍显示该历史条件。
2. 用户可以删除它。
3. 如果编辑器仍受支持，允许编辑。
4. 整份草稿保存不能因目录隐藏而删除该条件。
5. 如果 definition/editor 已不可用，页面显示持久兼容错误并阻止覆盖保存。

当前 Reserve、Days Off、Pairing、Line 中遇到未知 definition 后直接 `continue` 的路径都需要审计，
避免静默丢失。

## 10. 缓存一致性

修改 context 可见值后，不应要求重新部署代码。

要求：

- catalog cache key 必须包含 `bid_context` 和新版本号。
- 新表上线时废弃旧 catalog cache namespace。
- 由于 property catalog 数据量很小，优先取消跨请求 catalog 缓存，确保页面刷新即可读取新配置。
- 如果保留缓存，必须提供受控失效入口，并验证直接修改数据库后的最长生效时间。
- Portal 重新进入页面或刷新页面时重新获取 catalog。

## 11. API 与错误处理

Current 和 Standing API 返回的 property catalog 均由同一个 context-aware resolver 生成。

建议稳定错误：

```text
PBS_PROPERTY_CONTEXT_CONFIG_INVALID
PBS_PROPERTY_EDITOR_MISSING
PBS_PROPERTY_DEFINITION_INACTIVE
```

Portal 行为：

- 字段输入错误保持字段级错误。
- catalog 配置错误使用页面级 recovery panel。
- 提供 Refresh/Retry 操作。
- 不显示原始异常、SQL、Axios/RPC 信息或栈。
- 重复失败不得无限弹 toast。

## 12. 数据流

```text
请求页面
  -> 确定 bid_context
  -> 查询 pbs_bid_property_context
  -> Join pbs_bid_property
  -> 校验 active definition 与 editor registry
  -> 返回当前 context catalog
  -> Portal 按 bid_type 分类展示
  -> Standing editor 去除绝对日期能力
```

## 13. 迁移和上线顺序

1. 新建 context 表、约束和索引。
2. 按本设计矩阵写入幂等 context seed/migration。
3. 增加 context-aware catalog resolver。
4. 先让 Current 与 Standing 双读对比，只记录脱敏差异，不改变用户结果。
5. 修复所有预期外差异和缺失 registry。
6. 切换 Current、Standing 到新 resolver。
7. 更新缓存 namespace 并清理旧缓存。
8. 验证新 context 为唯一来源。
9. 删除运行时 property code allowlist。
10. 删除旧全局可见字段消费者。
11. 完成冲突回归后删除旧数据库字段。

不得长期保留双读 fallback；双读只用于上线核对。

## 14. 验证要求

### 14.1 数据库

- schema/FK/唯一约束测试。
- migration 幂等测试。
- 远端 PostgreSQL 只读 preflight。
- 每个 active property 的 context 配置完整性检查。
- 旧字段与新 context 冲突时，新 context 必须胜出。

### 14.2 后端

- Current、StandingLineholder、StandingReserve 各自返回正确目录。
- 修改 context 可见值后，无代码改动即可改变返回目录。
- 数据库可见但缺少 registry 时返回配置错误。
- inactive + visible 冲突时返回配置错误。
- 隐藏历史条件不会在读取或整份保存时丢失。
- 目录排序来自 context `display_order`。

### 14.3 Portal

- Current 和 Standing 分类与 API catalog 一致。
- Portal 不再维护 property code 可见数组。
- Standing 去掉绝对日期但保留周期能力。
- 配置错误使用持久恢复状态。
- Current Bid 行为不回退。

### 14.4 Playwright

- Current Days Off 只显示 201、204。
- Current Pairing 显示已配置的 12 个条件。
- Current Roster 显示 407、408、427、429。
- Current Reserve 只显示 301。
- StandingLineholder 显示本设计矩阵的条件。
- StandingReserve 只显示 301。
- 修改 fixture/context 数据即可改变目录，不修改前端测试代码名单。
- 所有 Standing 弹窗不显示明确年月日。
- Existing 历史隐藏条件不会消失。

### 14.5 UI 标准

- `npm run check:ui` 必须 0 个 hard violation。
- Portal build、lint、focused unit/integration、PBS Playwright 均需通过。

## 15. 验收标准

1. 仓库中不再存在决定 Current/Standing 目录可见性的 property code allowlist。
2. `pbs_bid_property_context` 是 Current 与 Standing 条件显示的唯一来源。
3. 将某 context 的 `is_visible_in_portal` 从 0 改为 1 后，刷新页面即可显示已实现条件。
4. 将值从 1 改为 0 后，Add Properties 不再显示该条件。
5. 不需要修改或重新部署代码。
6. Current、StandingLineholder、StandingReserve 可以配置不同目录。
7. Standing 只做绝对日期能力裁剪。
8. 数据库与 editor registry 不一致时明确失败，不得静默隐藏。
9. 已保存历史条件不会因为隐藏而被静默删除。
10. 新旧来源冲突回归证明旧全局字段不再参与决策。

## 16. 风险

- 现有服务中多处未知 property 使用 `continue` 静默跳过，需要逐一审计。
- catalog cache 可能使数据库修改不能立即生效。
- 旧 migrations 把 Standing 专属条件写入全局 visible 字段，不能直接复制旧值。
- 删除旧字段前必须确认帮助文档、测试 fixture、导入导出和其他 consumer 已迁移。
- 如果某个隐藏条件从未完成 editor，实现 context 开关前会暴露配置错误；这是预期保护，不得恢复静默过滤。

## 17. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 数据库、后端 resolver、Portal/Playwright 和历史兼容审计可以分域处理。
- Suggested split:
  - 数据库 schema/migration/完整性检查。
  - 后端 context resolver、历史草稿和缓存。
  - Portal catalog 消费、错误状态和 Playwright。
- Write boundaries: 数据库、pbs-server、pbs-portal/e2e 分离；contracts 和集成由主流程统一。
- Conflict risk: Medium，context contract 和 resolver 是共享边界。
- Execution gate: 用户批准本设计和实施计划后才能开始；未获得用户明确授权时不启动 sub-agent。
