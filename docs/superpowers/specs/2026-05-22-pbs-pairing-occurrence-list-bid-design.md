# PBS Pairing Number 多 Pairing 多运行日结构设计

## 背景

当前 `/pairing` 的 `Pairing Number` 已经改成单窗口配置，但保存结构仍沿用旧的 `tag-list` / `tag-list-date`：

- `tag-list`：表示某些 pairing number 在整个月内都适用。
- `tag-list-date`：表示某些 pairing number 只在同一个 `date` 上适用。

这个结构只能表达：

```ts
{ type: "tag-list-date", values: ["M4959", "C4513"], date: "2026-04-10" }
```

它不能准确表达：

```text
M4959 -> 2026-04-10
C4513 -> 2026-04-13
```

用户确认：这是结构性问题，不应该继续把复杂关系硬塞进 `pbs_bid_group.param_a / param_b / param_c`，也不应该等到交付前再补结构。应新增更清晰的 bid 类型和专用明细表，让 Pairing Number 可以长期支持“多个 pairing number + 多个 run date + 一个 bid 保存”的业务能力。

## 目标

- 新增 Pairing Number 专用 bid 类型：`pairing-occurrence-list`。
- 新增 Pairing Number occurrence 明细表，保存每个 pairing number 与每个 run date 的对应关系。
- 一个 UI bid 仍对应一个 `property_group_key`，一个或多个 `Tx` 仍通过 `pbs_bid_group` 维护。
- `pbs_bid_group` 保留父规则身份、动作、量词、property、tier 等通用字段；occurrence 明细放入新表。
- `/pairing` 右侧 `Pairing Number` 支持在同一弹窗中选择多个 pairing number、多个 run date，并在 `RUN DATE` 下方显示已确认结果，可删除单条结果。
- 左侧 `BIDDING CALENDAR` 点击日期添加 Pairing Number 时，也必须写入同一套 `pairing-occurrence-list` 结构，不能继续使用一条旧的旁路保存方式。
- 保存、编辑、收藏、左侧日历展示、Dashboard 日历展示都读取同一份新结构。
- 接口继续遵循稳定身份和语义化 HTTP 方法：新增用 `POST`，编辑用 `PATCH`，删除用 `DELETE`，已有记录定位使用 `propertyGroupKey` / `favoriteKey` / `bidId`。
- 所有相关接口目标耗时 < 2s，包括 Pairing Number 新增、编辑、删除、收藏保存、收藏删除、当前 draft 读取、左侧日历刷新和 Dashboard 日历读取。
- 开发时必须保持模块化清晰：contract、route schema、service normalization、property 写入、occurrence 明细、calendar 展开、frontend dialog 状态各自有明确边界，禁止把复杂逻辑堆进单个组件或 service 文件。
- 必须补齐单元测试、回归测试和 QA 人工测试案例，防止破坏现有 Pairing、Search Pairings、Dashboard calendar、configured favorite 和 Days Off 冲突校验能力。

## 非目标

- 不重做 Search Pairings 的筛选器 UI。
- 不迁移生产历史数据；当前仍为开发阶段，历史不兼容数据可直接清理或按开发库需要回填。
- 不改变非 `Pairing Number` property 的 bid 结构。
- 不把 occurrence 明细塞进 `bid_payload` 或 `param_a` 的 JSON 字符串作为长期方案。
- 不新增第三方依赖。

## 方案比较

### 方案 A：继续扩展 `tag-list-date`

做法：在 `tag-list-date` 中增加类似 `datesByPairingNumber` 的字段，仍保存到 `pbs_bid_group.param_a / param_b / param_c`。

优点：改动最少。

缺点：`param_*` 字段语义会变得模糊，查询日历、冲突校验、收藏、编辑都需要反复解析 JSON 或特殊字符串；后端和数据库人员不容易看懂真实数据含义，后续性能和维护风险高。

### 方案 B：拆成多条旧 bid

做法：用户选择多组 occurrence 后，保存时拆成多条 `tag-list-date` bid，每条一个 pairing number + 一个 date。

优点：复用现有结构。

缺点：用户看到的是一个配置，数据库却拆成多条规则；编辑、收藏、删除、排序、同一组 Tx 同步都会变复杂。`M4959 -> 2026-04-10` 和 `C4513 -> 2026-04-13` 可以表达，但一个业务 bid 的边界丢失。

### 方案 C：新增 `pairing-occurrence-list` + 专用明细表

做法：`pbs_bid_group` 仍保存 Pairing Number 的父规则；新增 `pbs_bid_pairing_occurrence` 保存 occurrence 明细。

优点：语义清楚，数据库可查询，可加索引，编辑和收藏能保持一个完整 bid 边界；未来要扩展 occurrence id、pairing id、来源、校验状态也有位置。

缺点：需要改 contract、route schema、service、mapper、日历和测试。

推荐采用方案 C。

## 数据结构设计

### Contract bid 类型

新增：

```ts
export type PbsPairingOccurrenceBidItem = {
  pairingNumber: string;
  originDate: string;
  pairingId?: string;
  occurrenceId?: string;
};

export type PbsPairingBidValue =
  | ...
  | {
      type: "pairing-occurrence-list";
      occurrences: PbsPairingOccurrenceBidItem[];
      suggestions?: string[];
    };
```

语义：

- `pairingNumber`：用户选择的 pairing number，统一大写保存。
- `originDate`：这一次 pairing run 的 origin date，ISO date。
- `pairingId`：可选，来自 live pairing occurrence 查询，用于展示和追踪。
- `occurrenceId`：可选，来自 occurrence 查询结果，用于前端选择态和日历 metadata。
- `occurrences` 不允许为空；为空时前端不能提交，后端也返回 400。
- 同一 bid 内 `(pairingNumber, originDate)` 去重。

兼容：

- 旧 `tag-list` 继续表示 Entire Month Pairing Number。
- 旧 `tag-list-date` 暂时保留读取能力，避免已有测试和 Search Pairings 立即断开。
- 新的多 pairing 多日期交互保存为 `pairing-occurrence-list`。

### 新增数据库表

新增表：`pbs_bid_pairing_occurrence`

```sql
create table pbs_bid_pairing_occurrence (
  id bigint generated always as identity primary key,
  created_by varchar(30) not null default 'system',
  created_at timestamptz not null default now(),
  updated_by varchar(30) not null default 'system',
  updated_at timestamptz not null default now(),
  bid_id bigint not null references pbs_bid(id) on delete cascade,
  group_id bigint not null references pbs_bid_group(id) on delete cascade,
  property_group_key varchar(36) not null,
  tier_id bigint not null references pbs_bid_tier(id) on delete cascade,
  tier smallint not null,
  pairing_number varchar(20) not null,
  origin_date date not null,
  pairing_id varchar(40),
  occurrence_id varchar(80),
  source varchar(20) not null default 'portal',
  is_deleted smallint not null default 0
);
```

索引与约束：

```sql
create unique index uq_pbs_bid_pairing_occurrence_active
  on pbs_bid_pairing_occurrence (
    bid_id,
    property_group_key,
    tier,
    pairing_number,
    origin_date
  )
  where is_deleted = 0;

create index idx_pbs_bid_pairing_occurrence_bid
  on pbs_bid_pairing_occurrence (bid_id);

create index idx_pbs_bid_pairing_occurrence_group
  on pbs_bid_pairing_occurrence (group_id);

create index idx_pbs_bid_pairing_occurrence_calendar
  on pbs_bid_pairing_occurrence (bid_id, tier, origin_date)
  where is_deleted = 0;

create index idx_pbs_bid_pairing_occurrence_lookup
  on pbs_bid_pairing_occurrence (bid_id, pairing_number, origin_date)
  where is_deleted = 0;
```

说明：

- `group_id` 指向每个 tier 下实际的 `pbs_bid_group` 行。
- `property_group_key` 用于跨 tier 聚合一个 UI bid。
- 由于同一个 UI bid 可以选择多个 Tx，保存时每个 Tx 的 `pbs_bid_group` 都会有对应 occurrence 明细。
- 当前开发阶段允许删除旧数据后重建，不做复杂生产回填。

## 后端设计

### 模块边界

本次实现必须拆成清晰子模块，避免形成新的大文件：

- Contract：只声明 bid 类型、route request/response 类型和序列化 helper。
- Route：只负责 Zod 校验、调用 service、统一响应，不写业务逻辑。
- Normalization：负责 payload 校验、日期格式、pairing number 大写和去重。
- Property write：负责父 `pbs_bid_group` 与 Tx 同步。
- Occurrence persistence：负责 `pbs_bid_pairing_occurrence` 的批量读取、写入、替换和删除。
- Calendar：只负责把已保存的 occurrence 明细展开为 calendar event，不反向推导保存结构。
- Conflict validation：只负责 Prefer Off 与 selected occurrence 的冲突检测。

如果某个文件因为本次改动明显变得难以阅读，应在当前需求范围内拆出小工具模块；不做无关重构。

### 序列化与反序列化

新增 Pairing Number 专用 mapper：

- `pairing-occurrence-bid.ts`
  - `normalizePairingOccurrenceListBid`
  - `serializePairingOccurrenceParentGroup`
  - `loadPairingOccurrenceItemsByGroupKey`
  - `writePairingOccurrenceItemsForGroups`
  - `deletePairingOccurrenceItemsForGroupKey`

父 `pbs_bid_group` 写入建议：

- `property_id / property_definition_id`：仍为 `102 Pairing Number`。
- `operator`：`In`。
- `param_a`：可保存去重后的 pairing number 摘要，例如 `M4959,C4513`，只用于兼容摘要和快速定位，不作为完整明细来源。
- `param_b`：`null`。
- `param_c`：量词仍按现有规则保存。

读取 `getCurrentDraft`：

1. 先读取 `pbs_bid_group`。
2. 找出 Pairing Number 分组。
3. 批量读取 `pbs_bid_pairing_occurrence`，按 `property_group_key` 聚合。
4. 如果某个 Pairing Number 分组存在 occurrence 明细，返回 `pairing-occurrence-list`。
5. 如果没有明细，继续按旧 `tag-list` / `tag-list-date` 反序列化。

写入 `add / patch / full save`：

- 写入父 `pbs_bid_group` 后，同事务写入 occurrence 明细。
- `patch` 时删除该 `propertyGroupKey` 下旧 occurrence 明细，再写入新的明细。
- 删除 property 时通过 `propertyGroupKey` 删除父 group，明细因 `on delete cascade` 自动删除；也可显式清理，便于测试断言。
- 全量保存时先清理本 bid 下 Pairing 旧 group 和 occurrence，再按草稿重建。

### API Contract

不新增一组独立 endpoint，继续使用现有 Pairing draft endpoint：

- `GET /api/pairing-bids/current`
- `POST /api/pairing-bids/current/properties`
- `PATCH /api/pairing-bids/current/properties/:propertyGroupKey`
- `DELETE /api/pairing-bids/current/properties/:propertyGroupKey`
- `POST /api/pairing-bids/current/favorites`
- `DELETE /api/pairing-bids/current/favorites/:favoriteKey`

入口统一：

- 右侧 `ADD PAIRING PROPERTIES` 的 `Pairing Number` 新增/编辑走上述 `POST / PATCH / DELETE`。
- 左侧 `BIDDING CALENDAR` 点击某一天添加 Pairing Number，也走同一套 `POST /api/pairing-bids/current/properties`。
- 左侧日历快速添加单个 pairing + 单个 run date 时，请求体仍构造成：

```ts
{
  propertyCode: 102,
  name: "Pairing Number",
  action: "award",
  bid: {
    type: "pairing-occurrence-list",
    occurrences: [
      { pairingNumber: "M4959", originDate: "2026-04-10" }
    ]
  },
  tiers: ["T1"]
}
```

- 后端可以在 service 层继续复用当前的“同 date / 同 Tx 合并”意图，但合并结果也必须是 `pairing-occurrence-list`，不能落回旧 `tag-list-date`。
- 日历入口不再写入独立日历 pairing 表，也不新增只给日历使用的保存接口。

请求体优化：

- 新增和编辑仍只传必要字段：
  - `bidId` 或 `draftKey`
  - `draftVersion`
  - `periodCode` 必要时保留
  - `property`
- 不回退到“整份 draft 大请求体”作为常规新增/编辑方案。

Route schema：

- `ruleBidValueSchema` 增加 `pairing-occurrence-list`。
- 后端对 `occurrences` 做长度、日期格式、pairing number 格式校验。
- 无效 payload 返回统一 `{ code, data: null, message }`，前端只展示统一 message，不在 DOM 中重复渲染错误面板。

### 收藏

`pbs_bid_pairing_configured_favorite.bid_payload` 可以保存完整 `pairing-occurrence-list` 快照。

规则：

- 点击 `SAVE FAVORITE` 保存当前已确认 occurrence 列表。
- `FAVORITED PROPERTIES` 展示禁用态 Tx 和 occurrence 摘要。
- 点击收藏直接添加 Existing。
- 删除收藏仍用 `favoriteKey`。
- 当前开发阶段旧收藏模板可清理，不做兼容迁移。

### 日历与冲突校验

左侧 `BIDDING CALENDAR` 和 Dashboard 日历：

- Pairing Number `pairing-occurrence-list` 从新表读取明细。
- 日历事件按 `tier + occurrence` 展开。
- 同一 tier 下日期范围重叠的 pairing event 继续合并显示。
- event metadata 保留：
  - `propertyGroupKey`
  - `pairingNumber`
  - `pairingId`
  - `originDate`
  - `occurrenceMode = "specific_date"`
  - `pairingBidEntries`

冲突校验：

- `pairing-occurrence-list` 与 Prefer Off 日期冲突校验必须覆盖。
- 校验按每个 `(tier, pairingNumber, originDate)` 查询 occurrence date range。
- 如果 occurrence 覆盖的任意日期与该 tier 的 Prefer Off 冲突，返回 409。
- 错误文案保持用户可读，例如：`Cannot add pairing because T2 has day off on 2026-04-10.`

## 前端设计

### 配置弹窗

`Configure Pairing Bid` 中 `Pairing Number` 的交互调整：

1. `BID` 搜索框允许选择多个 pairing number。
2. `RUN DATE` 区域展示当前 active pairing number 的运行日期列表。
3. 用户点击某个 run date 后，不立即关闭弹窗，而是加入“已确认结果”。
4. `RUN DATE` 下方显示已确认结果：

```text
M4959  2026-04-10   ×
C4513  2026-04-13   ×
```

5. 用户可以删除单条已确认结果。
6. `ADD BID / SAVE FAVORITE` 保存所有已确认结果。
7. 如果没有 confirmed occurrence，按钮 disabled，并显示必填提示或保持不可提交。

`Entire Month`：

- 仍使用 `tag-list`，不强制变成 occurrence list。
- 只有选择具体 run date 的结果使用 `pairing-occurrence-list`。

### 左侧日历添加入口

左侧 `BIDDING CALENDAR` 是 Pairing Number 的第二个添加入口，必须和右侧配置弹窗保持同一个数据源：

1. 用户从左侧日历某一天添加 pairing 时，前端根据所选 pairing occurrence 构造 `pairing-occurrence-list`。
2. 即使只有一个 pairing number 和一个 origin date，也保存为 `pairing-occurrence-list`，不再保存为旧 `tag-list-date`。
3. 添加成功后，左侧日历只通过共享 draft/calendar 读取链路刷新，不维护自己的独立 pairing bid 状态。
4. 后续从右侧 Existing 编辑这条 bid 时，应能看到同一条 occurrence 明细并继续编辑。
5. 如果用户从右侧删除这条 Existing，左侧日历上的对应蓝色 pairing event 必须消失。

### 摘要展示

`pairing-occurrence-list` 摘要规则：

- 1 条：`M4959 on 2026-04-10`
- 多条同 pairing：`M4959 on 2026-04-10, 2026-04-17`
- 多 pairing：`M4959 on 2026-04-10; C4513 on 2026-04-13`
- 超长时右侧列表可截断，但详情弹窗/hover 展示完整内容。

### i18n

新增文案必须进入现有 i18n：

- `pairing.dialog.confirmedRuns`
- `pairing.dialog.addRunDate`
- `pairing.dialog.removeRunDate`
- `pairing.dialog.noConfirmedRuns`
- `pairing.dialog.pairingOccurrenceRequired`

禁止新增硬编码用户可见文案。

## 测试计划

### 后端自动化测试

新增或更新：

- `pairing-bid-normalization.test.ts`
  - 校验 `pairing-occurrence-list` 空数组失败。
  - pairing number 统一大写并去重。
  - origin date 必须是 ISO date。
- `pairing-bid-service.test.ts`
  - 新增 Pairing Number occurrence list。
  - 编辑 occurrence list 后旧明细被替换。
  - 删除 property 后明细被清理。
  - full save 能保存并重新读取 occurrence list。
  - favorite 保存完整 occurrence list 快照。
- `bidding-calendar-pairing-events.test.ts`
  - occurrence list 展开到左侧日历。
  - 多 occurrence 正确合并和 metadata 正确。
  - Prefer Off 冲突校验覆盖 occurrence list。
- route 测试：
  - `POST /properties`、`PATCH /properties/:key` 支持新 payload。
  - invalid payload 返回统一 400 message。

### 前端自动化测试

新增或更新：

- `pairing-page.test.tsx`
  - Pairing Number 弹窗可选择多个 pairing number 和多个 run date。
  - confirmed result 显示在 `RUN DATE` 下方。
  - 点击 `×` 删除单条 confirmed result。
  - `ADD BID` 发送 `pairing-occurrence-list`。
  - Existing 编辑能回显 occurrence list。
  - Favorite 保存和直接添加 Existing 保留 occurrence list。
- shared bidding workbench / calendar quick-add tests：
  - 左侧日历添加单个 pairing run 时发送 `pairing-occurrence-list`。
  - 左侧日历添加后，右侧 Existing 可见同一条 bid。
  - 右侧删除 Existing 后，左侧日历事件消失。
- `pairing-bid-summary.test.ts`
  - occurrence list 摘要格式。
- dashboard tests：
  - 左侧日历读取新 structure 后展示一致。

### QA 人工测试案例

新增：

`docs/test-cases/pbs/pairing/2026-05-22-pairing-occurrence-list-regression.md`

内容覆盖：

- 单 pairing 单日期。
- 单 pairing 多日期。
- 多 pairing 多日期。
- 编辑删除单条 run date。
- 保存收藏并从收藏添加。
- Existing 编辑。
- 左侧日历添加 Pairing Number，并确认右侧 Existing 和 Dashboard 日历读取一致。
- 左侧日历和 Dashboard 日历一致。
- 与 Prefer Off 冲突。
- 接口耗时观察：新增/编辑/删除/日历刷新目标 < 2s。

## 性能要求

- 所有相关接口目标耗时 < 2s；如果本地验证出现超过 2s 的抖动，必须定位是数据库索引、N+1 查询、live occurrence 查询还是前端重复请求导致，不能只解释不处理。
- 保存 occurrence list 时必须在一个事务内完成父 group 和明细写入。
- 读取 draft 时 occurrence 明细必须批量查询，避免按 propertyGroupKey N+1。
- 日历读取时按 `bid_id + tier + origin_date` 或 `bid_id + property_group_key` 批量读取。
- Pairing occurrence 查询 live 数据时按 pairing number 集合批量查询，复用现有索引方向。
- 对关键接口保留性能测试或至少服务层测试覆盖批量读取路径。
- 前端保存成功后只刷新必要 query/cache，不能用整页重载掩盖状态问题。

## 数据清理与迁移策略

当前仍为开发阶段：

- migration 创建新表和索引。
- 可清理开发库中旧的临时 `Pairing Number` specific-date 数据，避免旧结构和新结构同时展示造成误解。
- 旧 `tag-list-date` 读取代码暂时保留，主要为了 Search Pairings 和历史测试不被一次性打断。
- 不删除后端 pairing-search occurrence API。
- 不删除 `pbs_bid_pairing_configured_favorite`，它继续保存配置化收藏快照。

## 验收标准

1. `Pairing Number` 可以在同一 bid 中保存：
   - `M4959 -> 2026-04-10`
   - `C4513 -> 2026-04-13`
2. 保存后 `GET /api/pairing-bids/current` 返回 `pairing-occurrence-list`。
3. `PATCH /properties/:propertyGroupKey` 可以稳定编辑同一个 bid，不拆成多条用户不可见 bid。
4. 删除 Existing 后，新表明细同步删除。
5. 保存收藏后，从收藏添加 Existing 保留完整 occurrence 列表。
6. 左侧 `BIDDING CALENDAR` 添加 Pairing Number 也保存为 `pairing-occurrence-list`，并能在右侧 Existing 中编辑/删除同一条 bid。
7. 左侧 `BIDDING CALENDAR` 和 Dashboard 读取同一数据源，展示一致。
8. Prefer Off 冲突校验覆盖新结构。
9. 所有相关接口目标 < 2s：新增、编辑、删除、收藏保存、收藏删除、当前 draft 读取、左侧日历刷新、Dashboard 日历读取。
10. 代码结构保持模块化，不把 occurrence 选择、保存、日历展开、冲突校验混在同一个大函数或大组件里。
11. 单元测试、回归测试和 QA 人工测试案例完整覆盖本次变化。
12. 自动化测试、lint、build、PBS verify 通过。
13. 不破坏现有 Pairing、Search Pairings、Dashboard calendar、configured favorite 和 Prefer Off 冲突校验功能。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 本次改动跨 contract、数据库、后端 service、前端弹窗、日历和测试，且可按清晰边界拆分。
- Suggested split:
  - Agent A：contract、route schema、后端 normalization/service/write/read。
  - Agent B：数据库 migration、Drizzle model、日历读取和冲突校验。
  - Agent C：前端 Pairing Number 弹窗、summary、i18n、页面测试。
  - Main agent：集成、冲突处理、端到端验证、QA 文档。
- Write boundaries:
  - A：`packages/contracts/**`、`pbs-server/src/routes/**`、`pbs-server/src/services/pairing/**`。
  - B：`sql/**`、`pbs-server/src/models/**`、`pbs-server/src/services/calendar/**`。
  - C：`pbs-portal/src/features/pairing/**`、`pbs-portal/src/shared/i18n/**`。
  - Main：集成测试与 `docs/test-cases/**`。
- Conflict risk: Medium。`pairing-specific-date`、`pairing-property-write`、`pairing-property-config-dialog` 都是热点文件，需要主 agent 最后统一整理。
- Execution gate: 用户审核并批准本 spec 后，才能进入实现；若启用多 agent，还需先说明 agent 分工和集成顺序。
