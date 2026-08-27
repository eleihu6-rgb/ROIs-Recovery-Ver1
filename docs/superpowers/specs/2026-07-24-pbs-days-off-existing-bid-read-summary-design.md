# PBS Days Off 既有申请读取与摘要修复设计

## 1. 背景

在 PBS Portal 检查机组用户 `19` 的 Current Bid 时，页面曾展示 4 条 Days Off：

1. Long Stretch Off：2026-06-01 至 2026-06-30，至少连续休息 10 天。
2. Prefer Off：2026-06-03 至 2026-06-05 的日期范围。
3. Prefer Off：2026-06-03、2026-06-04、2026-06-05 三个具体日期。
4. Prefer Off：Tuesday。

远端 `f8_pbs` 数据库中，bid `3635` 的 `pbs_bid_group` 确实存在以上 4 条 `DaysOff` group；其中具体日期和 Long Stretch Off 的页面摘要正确，但日期范围和星期条件被显示为：

```text
Prefer Off needs review
```

同一次排查还观察到：

- `GET /api/days-off-bids/current` 曾返回 `draft.properties: []`。
- `GET /api/lineholder-bids/current/summary` 曾返回 `daysOffCount: 0`。
- 上述返回结果与数据库中存在 4 条 Days Off group 的事实不一致。

因此，本次工作包含一个已确认缺陷和一个待复现观测：

1. **已确认缺陷**：合法的 Prefer Off 日期范围和星期条件未被正确摘要。
2. **待复现观测**：Days Off 当前草稿与统一 Bid Summary 的读取结果曾与底层 bid group 不一致。只有在同一服务实例和相同业务上下文中复现后，才将其纳入代码修复。

## 2. 目标

- 对既有 Days Off group 进行稳定、无损的读取。
- 核查 Current Days Off 接口与统一 Bid Summary 对同一 bid 是否返回一致的 Days Off 集合和数量；能够复现不一致时才修复真实丢失点。
- 正确识别并展示本次已确认的 Prefer Off 表达：
  - 具体日期；
  - 日期范围；
  - 单个星期。
- 保留原始申请语义，不把星期或日期范围永久展开为具体日期。
- `needs review` 只用于真正无法识别、格式无效或与当前配置不兼容的数据。
- 不影响 Days Off 保存、编辑、算法导出和日历展开的现有业务含义。

## 3. 非目标

- 不修改数据库表结构。
- 不批量重写现有 `pbs_bid_group` 数据。
- 不改变 Prefer Off 的申请规则、Tier 规则或算法含义。
- 不增加新的 Days Off property。
- 不修改 Pairing、Roster、Reserve 的摘要行为。
- 不使用前端硬编码数据掩盖后端漏读。

## 4. 已确认的数据语义

### 4.1 Prefer Off 持久化格式

Property `201` 继续使用现有 `tag-list` / `param_a` 持久化方式。以下值均为合法的既有表达：

| 类型 | 示例 |
|---|---|
| 具体日期 | `2026-06-03,2026-06-04,2026-06-05` |
| 日期范围 | `Between 2026-06-03 - 2026-06-05` |
| 星期 | `Tuesday` |

现有共享函数 `parsePreferOffBidValues`（`packages/contracts/pbs-prefer-off.js`）已经能够根据原始 values 和 `preferOffConfig` 将上述值分类。本次设计由 Portal 摘要层直接复用该函数，不建立第二套解析规则，也不为本任务新增 API 字段或分类 contract。

### 4.2 页面摘要口径

采用保留申请语义的展示方式：

| 原始条件 | 页面摘要 |
|---|---|
| `2026-06-03,2026-06-04,2026-06-05` | `Prefer off on Jun 3, 2026, Jun 4, 2026, Jun 5, 2026` |
| `Between 2026-06-03 - 2026-06-05` | `Prefer off from Jun 3, 2026 to Jun 5, 2026` |
| `Tuesday` | `Prefer off on Tuesdays` |

星期条件不得在摘要中展开成整月日期列表。具体日期较多时，继续沿用现有折叠式 selection summary。`Weekends`、多个星期组合及其他未在本次样本中确认的模式保持现有行为，不作为本次验收范围。

## 5. 方案比较

### 方案 A：读取时兼容并统一数据链路（推荐）

- 保留数据库原始值。
- 后端继续从 `pbs_bid_group` 读取 Days Off。
- Portal 使用现有共享 Prefer Off 解析函数识别本次已确认的具体日期、日期范围和单个星期。
- 若读取不一致能够复现，沿真实丢失点使 Current Days Off 与统一 Summary 对相同 bid 使用一致的有效 group 集合。
- 前端以 Current Days Off API 已有的 `bid.values` 和 `preferOffConfig` 为输入，根据识别后的语义生成摘要。

优点：

- 不需要修改生产数据。
- 不丢失原始申请意图。
- 与编辑器、日历和算法导出可以共享同一语义。
- 能修复摘要错误；读取一致性问题只有在复现并确认原因后才修复。

风险：

- 需要确保不同入口没有各自实现一套不一致的过滤或解析逻辑。

### 方案 B：把星期和范围批量展开为具体日期

优点：

- 现有只支持 ISO 日期的摘要代码可以直接展示。

缺点：

- 丢失“每周二”或“日期范围”的原始语义。
- 排班周期或配置变化后难以追溯用户原始选择。
- 需要数据迁移并增加回滚风险。

本次不采用。

### 方案 C：只在前端新增临时字符串正则

优点：

- 修改范围较小。

缺点：

- 无法解决可能存在的接口读取不一致。
- Days Off 页面、Bid Summary、日历和算法导出仍可能不一致。
- 会绕过共享 `parsePreferOffBidValues`，在前端复制另一套业务解析规则。

本次不采用。

## 6. 设计

### 6.1 先确认读取不一致的实际边界

实施前必须在同一个运行实例和相同业务上下文下完成一次可重复核查：

1. 确认 Current Bid 的稳定身份为运行时返回的实际 bid id；bid `3635` 只作为本次调查样本，不能被硬编码为未来的 Current Bid。
2. 查询该 bid 的 `DaysOff` group。
3. 请求 `GET /api/days-off-bids/current`。
4. 请求 `GET /api/lineholder-bids/current/summary`。
5. 对比 group key、property code、Tier 和数量。

这里的“相同业务上下文”指相同 crew、period、bid context、bid id 和 draft version，不要求 HTTP 请求与人工 SQL 共享同一个 PostgreSQL 物理连接。

复现时使用脱敏 correlation id 关联诊断信息，记录服务实例、`pg_backend_pid()`、bid id、crew id、period、draft version 和 property group keys。优先增加服务级诊断测试，或在同一 service 调用/事务中同时读取 current bid、group 集合和派生结果，避免仅比较来自不同时间点的浏览器响应与人工 SQL。

如果无法在相同业务上下文复现“数据库 4 条、接口 0 条”，不得添加猜测性的缓存清理、重试或兜底查询。此时只修复已确认的摘要问题，并把运行环境或旧缓存问题记录为独立诊断结果。

如果能够复现，则沿真实丢失点修复，可能的核查范围包括：

- Current Period 是否选择了相同 bid。
- crew、period、bid context 和 bid id 过滤是否一致。
- `pbs_bid_property` catalog 是否错误过滤了有效且 contract 支持的 property `201` / `204`。
- 现有 `property_definition_id` 与现有兼容字段的解析是否出现不一致；本任务不新增兼容规则。
- Redis 或进程内缓存是否返回了不属于当前 draft version 的数据。
- Unified Summary 是否使用了不同于 Days Off Current API 的 group 来源。

### 6.2 Days Off Current API

若读取不一致能够复现，`GET /api/days-off-bids/current` 对当前 bid 的有效 `DaysOff` group 应满足：

- 通过稳定的 `property_group_key` 合并同一 property 的多个 Tier。
- 使用当前既有 property identity 解析规则，不为本任务扩大 legacy fallback 范围。
- 不因为 Prefer Off 的 `param_a` 是日期范围或星期而丢弃整条 property。
- 返回的 `draftVersion`、bid id 和 period code 与读取的 group 属于同一 Current Bid。

如果用户 19 当前仍以相同 bid identity 持有上述数据，接口应返回对应的 4 个 property group。若 bid `3635` 已不再是 Current Bid，则使用受控等价 fixture 验证，不能要求 Current API 固定返回历史 bid。

### 6.3 Unified Bid Summary

若读取不一致能够复现，`GET /api/lineholder-bids/current/summary` 必须与 Current Days Off API 对同一 bid 保持集合一致：

- `statistics[*].daysOffCount` 按该 Tier 实际包含的 Days Off property 数量计算。
- `summaryItems` 包含相应 Days Off 条目。
- 同一 `property_group_key` 不重复计数。
- 无法格式化摘要时可以标记 `needs review`，但不能因此把 group 从统计或列表中删除。

不能复现读取不一致时，不修改该 API 的查询、过滤或缓存逻辑。

### 6.4 Prefer Off 解析

Prefer Off 分类只发生在 Portal 摘要层。Current Days Off API 保持现有 contract：

- property `201` 继续返回 `bid.type === "tag-list"` 和原始 `bid.values`。
- Current Days Off 响应继续返回现有 `preferOffConfig`。
- 不增加 `mode`、`parsedValues` 或其他新响应字段。

Portal 的 `buildBidPropertySummary` / Days Off 摘要路径接收可选 `preferOffConfig`，并调用现有共享函数：

```text
parsePreferOffBidValues(bid.values, preferOffConfig)
```

该函数的现有返回模式用于识别本次范围：

- `specific_dates`
- `date_range`
- `days_of_week`（本次只验收单个星期）
- 无效或不支持的结果

规则：

- 多个合法具体日期可以共同构成一个 Prefer Off 条件。
- 单个合法日期范围保留为范围语义。
- 单个合法星期保留为星期语义。
- 无效日期、倒置范围或未知星期进入 `needs review`。
- 解析必须基于 Current Days Off API 已返回的 Prefer Off 配置；不得另行硬编码可选业务星期或周末规则。
- 若调用入口没有 `preferOffConfig`，不得猜测星期合法性；保持现有 `needs review` 兜底。

### 6.5 前端摘要

Days Off property summary 对 property `201` 增加模式感知：

- `specific_dates`：使用现有日期格式化与折叠展示。
- `date_range`：使用 `Prefer off from <from> to <to>`。
- 单个 `days_of_week` value：使用自然语言星期复数，例如 `Prefer off on Tuesdays`。
- 仅在解析结果为无效或不支持时显示 `Prefer Off needs review`。

摘要层只负责展示，不修改 property 的原始 values，也不把星期或范围写回为具体日期。

现有调用链中：

- Days Off 页面将 `data.preferOffConfig` 传给 `buildBidPropertySummary`。
- 合并 Bid 页面将 `daysOffQuery.data.preferOffConfig` 传给 `resolveBidExistingPropertySummary`，再传给 Days Off summary builder。
- Pairing 和 Roster summary 调用保持原签名语义，不需要 Prefer Off 配置。

### 6.6 缓存一致性

仅当排查证明漏读来自缓存时，修复必须满足：

- 缓存 key 至少能够区分 crew、period、bid context 和 draft version，或缓存只保存不会随草稿变化的静态数据。
- 新增、修改、删除 Days Off property 后，Current API 和 Unified Summary 不得继续返回旧数量。
- 不通过缩短 TTL 掩盖错误的 key 或失效策略。

若排查未证明缓存参与问题，则本次不新增缓存逻辑。

### 6.7 错误处理

- 数据库中存在无法识别的 Prefer Off value 时，接口仍返回该 property。
- 页面显示 `Prefer Off needs review`，并保留稳定 `property_group_key`，使用户仍可删除或重新编辑。
- 单条坏数据不得导致整个 Current Bid 返回 400 或丢失其他合法 Days Off。
- 日志可记录 property group key、property code 和解析失败类别，但不得记录用户密码、Token 或不必要的个人数据。

## 7. 数据流

```text
pbs_bid_group (DaysOff)
  -> Current Bid / crew / period 过滤
  -> property identity 与 Tier 合并
  -> 反序列化原始 rule value
  -> Current Days Off API: bid.values + preferOffConfig
  -> Portal 共享 parsePreferOffBidValues
  -> Portal 摘要展示

pbs_bid_group (DaysOff)
  -> Unified Bid Summary: 条目集合与 Tier 计数
  -> Portal 按 property_group_key 关联 Current Days Off property
  -> 使用同一 Portal 摘要结果覆盖可编辑条目的展示文本
```

同一条 property 在所有节点继续使用稳定的 `property_group_key`。摘要分类明确位于 Portal，不新增后端分类响应；摘要只是读取结果的派生展示，不成为数据身份或持久化来源。

## 8. 测试设计

### 8.1 PBS Server 自动化测试

至少覆盖：

1. 从 `pbs_bid_group` 读取具体日期 Prefer Off。
2. 读取日期范围 Prefer Off，property 不被丢弃。
3. 读取星期 Prefer Off，property 不被丢弃。
4. 读取 Long Stretch Off。
5. 同一 group 多 Tier 正确合并。
6. 若读取不一致能够复现，Current Days Off 返回 4 条时，Unified Summary 的 Days Off 集合与 Tier 计数一致。
7. 无效 Prefer Off value 保留 property，但摘要进入 `needs review`。
8. 若确认是缓存问题，覆盖保存/删除后的缓存一致性。
9. 使用相同原始 Prefer Off values 运行现有算法导出和日历展开 focused tests，证明摘要修复没有改变导出或展开结果。

### 8.2 PBS Portal 自动化测试

至少覆盖：

1. 具体日期摘要。
2. 日期范围摘要。
3. 单个星期摘要：`Prefer off on Tuesdays`。
4. 真正无效的 value 仍显示 `Prefer Off needs review`。
5. 多日期折叠展示保持现有行为。

### 8.3 Playwright

已确认的摘要缺陷通过真实 Portal UI 驱动以下流程：

1. 以包含具体日期、日期范围、单个星期和 Long Stretch Off 的受控页面数据打开 Bid 页面。
2. 验证四条 Days Off 均出现。
3. 验证日期范围和星期不再显示 `needs review`。
4. 验证 Tier 标签和 Days Off 数量正确。
5. 刷新页面后结果保持一致，不能变成 0 条。

前端摘要 Playwright 可以使用项目既有 API fixture，但它只能验证真实 UI 展示，不能作为后端读取一致性的证据。

如果后端读取不一致能够复现，则必须另加一条连接真实 Portal、真实 `pbs-server` 和隔离测试数据库/可清理受控 fixture 的集成 Playwright：

1. 建立受控 bid、Tier、property 和 group 数据。
2. 真实调用 Current Days Off 与 Unified Summary API。
3. 通过 UI 验证条目、Tier、数量和刷新一致性。
4. 测试后清理 fixture。

若现有 E2E 环境无法安全写入隔离数据库，不得向共享业务库写测试数据；此时以 PBS Server 数据库集成测试验证读取链路，Playwright 只验证 UI，并在交付报告中明确该边界。

### 8.4 QA 人工测试

新增：

```text
docs/test-cases/pbs/days-off/2026-07-24-existing-bid-read-summary.md
```

覆盖：

- 用户 19 或等价测试账号的 Current Bid。
- 页面初次进入、刷新、跨 Tab 返回。
- 具体日期、范围、单个星期和 Long Stretch Off。
- 无效历史数据的 `needs review` 行为。
- Days Off 页面与 Bid Summary 数量一致性。

## 9. 验收标准

- `2026-06-03,2026-06-04,2026-06-05` 显示为三个格式化日期。
- `Between 2026-06-03 - 2026-06-05` 显示为日期范围。
- `Tuesday` 显示为 `Prefer off on Tuesdays`。
- 合法的日期范围和星期不显示 `needs review`。
- 无效历史值仍可见、可定位，并明确显示 `needs review`。
- 不修改现有数据库数据，不改变算法导出含义。
- PBS Server focused tests、PBS Portal focused tests、Playwright、lint、build 和 `npm run check:ui` 全部通过。

读取一致性采用条件验收：

- **能够在相同业务上下文复现时**：记录确定的丢失点；用户 19 当前 bid 或受控等价 fixture 的 4 条 Days Off 均能从 Current Days Off API 读取，Unified Summary 对同一 bid 不再统计为 0，并有回归测试。
- **不能复现时**：不修改 API、缓存或过滤逻辑；交付摘要修复、复现记录和证据边界，不声称读取问题已经修复。

算法语义通过运行现有 Days Off algorithm export 与 calendar expansion focused tests 验证；若实现触及相关共享解析代码，则补充相同输入的前后结果比较测试。

## 10. 风险与控制

### 风险 1：把运行环境差异误判为读取代码缺陷

控制：实施前必须在同一服务实例和相同业务上下文下复现；不能复现时不加入猜测性修复。

### 风险 2：摘要、编辑器和算法导出使用不同解析规则

控制：复用共享 Prefer Off 解析语义；禁止在摘要层复制另一套业务规则。

### 风险 3：修复历史读取时影响新保存的数据

控制：为现有三种合法持久化格式分别增加回归测试，同时验证新增、编辑和重新读取。

### 风险 4：错误数据导致整个 Bid 不可用

控制：按 property 隔离解析失败；保留 property identity，并仅对该条显示 `needs review`。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 后端读取、Prefer Off 结构化和前端摘要共享同一业务契约，工作量适中，顺序实施更容易保持语义一致。
- Suggested split: 不拆分；由同一实现链路依次完成后端诊断与修复、前端摘要、自动化测试和 QA 文档。
- Write boundaries: `pbs-server` Days Off/lineholder summary、`pbs-portal` bid summary、`e2e`、`docs/test-cases`。
- Conflict risk: 多人并行容易分别定义日期范围和星期结构，导致前后端契约漂移。
- Execution gate: 本 Spec 经用户审核确认后，才进入实施计划和代码修改。
