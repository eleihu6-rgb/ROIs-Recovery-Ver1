# PBS Dictionary / Period 表统一设计

日期：2026-07-08  
状态：待用户 review  
范围：将 `f8_pbs.dictionary` / `f8_pbs.pbs_period` 的职责迁回 `f8.dictionary` / `f8.roster_period`，消除重复表和后续同步遗漏风险。

## 背景

当前远端库中存在两组含义重复的数据表：

- `f8.dictionary`：live schema 的统一字典和系统参数表。
- `f8_pbs.dictionary`：PBS schema 下的重复字典表，目前主要存 PBS Business Time 和历史 active period 残留配置。
- `f8.roster_period`：live schema 的排班周期主表，已有 2026-2036 年 F8 周期数据。
- `f8_pbs.pbs_period`：PBS schema 下的申请周期表，目前保存 PBS bid open / close / max tiers 等字段。

这会造成一个实际风险：后续同步或迁移时需要同时记住两套 dictionary / period 表，容易漏同步、漏清理，最终导致 PBS Portal、Gantt 管理端和数据维护页看到不同来源的周期或系统参数。

本设计推翻此前将 `pbs_period` 与 `roster_period` 长期分离的阶段性设计，改为：

- `f8.dictionary` 是唯一字典和系统参数来源。
- `f8.roster_period` 是唯一排班/PBS 周期主表。
- `f8_pbs` 只保留 PBS 专属业务数据表，例如 `pbs_user`、`pbs_bid`、`pbs_bid_*`、award/import/log 等。

## 当前库核查结论

只读查询确认：

- `f8` 下没有 `pbs_period` 表。
- `f8` 下存在 `dictionary`、`roster_period`、`roster_period_config`。
- `f8_pbs.dictionary` 有 14 行：
  - 3 行仍被 PBS Business Time 使用：`PBS_BUSINESS_TIME_MODE`、`PBS_BUSINESS_TIME_ANCHOR`、`PBS_BUSINESS_TIME_ANCHOR_REAL`。
  - 10 行 `PBS_PORTAL_ACTIVE_PERIOD_*` 是历史残留，运行时代码已经不再读取。
  - 1 行 `SYS_PARAM` parent。
- `f8_pbs.pbs_period` 有 36 行：F8 的 P/C/A 三个 division，各 12 个月。
- `f8_pbs.pbs_bid.pbs_period_id` 当前只有 1 条非空引用，指向 `f8_pbs.pbs_period.id = 38`。
- `f8_pbs.pbs_award_result` 当前没有 period 引用。
- `f8_pbs.pbs_period.roster_period_id` 当前全为 `null`，不能直接依赖现有外键式映射。

重要差异：

- `f8.roster_period` 当前缺少 PBS 申请窗口字段。
- `f8.roster_period` 是每个 roster period 一行。
- `f8_pbs.pbs_period` 是每个 `period_code + filiale + division` 一行。
- 当前实际数据里，同一 `period_code` 下 P/C/A 的 `bid_open_at`、`bid_close_at`、`max_tiers` 一致；只有旧 `status` 有差异。

## 目标

1. 删除运行时对 `f8_pbs.dictionary` 的依赖，PBS Business Time 改读写 `f8.dictionary`。
2. 删除运行时对 `f8_pbs.pbs_period` 的依赖，PBS 当前周期改由 `f8.roster_period` 承接。
3. 将 PBS 申请窗口字段补到 `f8.roster_period`。
4. 将 `pbs_bid` / `pbs_award_result` 对 period 的稳定关联迁移到 `roster_period_id`。
5. 在代码、schema、migration、测试和文档中移除冗余表口径。
6. 最终允许删除 `f8_pbs.dictionary` 和 `f8_pbs.pbs_period`。

## 非目标

- 不合并整个 `f8_pbs` schema；PBS 业务表仍保留在 `f8_pbs`。
- 不改变 `pbs_user` 与 live `users` 的分离模型。
- 不新增跨航司通用多租户设计；当前仍按 F8 处理。
- 不在本任务中引入 division-specific PBS period 子表。第一版按 P/C/A 共用同一个 roster period 的 PBS 申请窗口处理。
- 不把历史 `PBS_PORTAL_ACTIVE_PERIOD_*` 机制恢复回来。

## 数据模型设计

### `f8.dictionary`

`f8.dictionary` 继续作为统一字典和系统参数表。

需要迁入或确保存在的 PBS Business Time key：

| parent_code | code | 用途 |
|---|---|---|
| `SYS_PARAM` | `PBS_BUSINESS_TIME_MODE` | 当前只支持 `ROLLING` |
| `SYS_PARAM` | `PBS_BUSINESS_TIME_ANCHOR` | 业务时间锚点 |
| `SYS_PARAM` | `PBS_BUSINESS_TIME_ANCHOR_REAL` | 设置业务时间时对应的真实时间 |

迁移规则：

- 从 `f8_pbs.dictionary` 复制上述 3 个 key 到 `f8.dictionary`。
- 如 `f8.dictionary` 已存在同 code，优先保留当前 `f8_pbs.dictionary` 的值，避免 PBS 当前业务时间变化。
- 不迁移 `PBS_PORTAL_ACTIVE_PERIOD_*`，这批 key 属于已废弃的手动 active period 机制。
- 后续 `live-server` Period Admin 和 `pbs-server` Business Clock 都只读写 `f8.dictionary`。

### `f8.roster_period`

`f8.roster_period` 成为 PBS period 的唯一主表。新增 PBS 申请窗口字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `pbs_period_code` | `varchar(20)` | PBS 展示/兼容周期代码，例如 `Jun 2026`。保留原 `pbs_period.period_code` 语义，避免影响 `pbs_bid.period_code`。 |
| `pbs_bid_open_at` | `timestamptz` | PBS 申请开放时间。 |
| `pbs_bid_close_at` | `timestamptz` | PBS 申请截止时间。 |
| `pbs_award_run_at` | `timestamptz` | PBS award run 时间，可空。 |
| `pbs_award_publish_at` | `timestamptz` | PBS award publish 时间，可空。 |
| `pbs_max_tiers` | `smallint` | PBS 当前周期允许最大 tier 数。 |
| `pbs_status` | `varchar(20)` | PBS 周期生命周期标签，保留管理展示和后续 award/publish 状态扩展；不参与 can-edit 判定。 |
| `pbs_description` | `varchar(200)` | PBS 备注。 |

字段设计原则：

- `rp_start` / `rp_end` 继续表示排班周期自身。
- `pbs_bid_open_at` / `pbs_bid_close_at` 表示这个 roster period 对应的 PBS 申请窗口。
- `pbs_period_code` 用于兼容历史 PBS 文案和 `pbs_bid.period_code`，不要把 `roster_period` 的 `2026RP06` 直接暴露成 Portal periodCode。
- `pbs_status` 不再决定 Portal 是否可编辑；是否可编辑仍由 `businessNow + pbs_bid_open_at + pbs_bid_close_at` 自动计算。

### `f8_pbs.pbs_bid` / `f8_pbs.pbs_award_result`

新增或启用稳定关联字段：

- `pbs_bid.roster_period_id`
- `pbs_award_result.roster_period_id`

迁移后：

- 新写入的 Current bid 使用 `roster_period_id`。
- `period_code` 继续保留为兼容/展示字段，值来自 `f8.roster_period.pbs_period_code`。
- `pbs_period_id` 进入废弃状态，最终删除。

## 数据迁移设计

### 预检查

迁移脚本必须先做只读预检查，失败则停止：

1. `f8.dictionary`、`f8.roster_period`、`f8_pbs.dictionary`、`f8_pbs.pbs_period` 是否存在。
2. `f8_pbs.pbs_period` 是否能按 `period_code` 解析到 `YYYY-MM`，例如 `Jun 2026 -> 2026-06`。
3. 每个 `period_code` 下 P/C/A 的 `bid_open_at`、`bid_close_at`、`award_run_at`、`award_publish_at`、`max_tiers` 是否一致。
4. `f8_pbs.pbs_bid.pbs_period_id` 是否都能映射到 `f8.roster_period.id`。
5. `f8_pbs.pbs_award_result.pbs_period_id` 是否都能映射到 `f8.roster_period.id`。

说明：当前数据中旧 `status` 可以不一致，不应阻塞迁移。`pbs_status` 回填使用聚合优先级：

`PUBLISHED > AWARDED > CLOSED > OPEN > DRAFT`

### 回填 `f8.roster_period`

从 `f8_pbs.pbs_period` 聚合到 `f8.roster_period`：

- `pbs_period_code` = 聚合后的 `period_code`，例如 `Jun 2026`
- `pbs_bid_open_at` = 聚合后的 `bid_open_at`
- `pbs_bid_close_at` = 聚合后的 `bid_close_at`
- `pbs_award_run_at` = 聚合后的 `award_run_at`
- `pbs_award_publish_at` = 聚合后的 `award_publish_at`
- `pbs_max_tiers` = 聚合后的 `max_tiers`
- `pbs_status` = 按优先级聚合后的 status
- `pbs_description` = 可空；如多 division 有不同 description，拼接或保留非空第一条并记录 warning

映射方式：

- 解析旧 `period_code` 的月份，例如 `Jun 2026`。
- 匹配 `f8.roster_period.name = '2026-06'`。
- 不使用旧 `pbs_period.roster_period_id`，因为当前全为空。

### 回填 PBS 业务表

- `f8_pbs.pbs_bid.roster_period_id` 根据旧 `pbs_bid.pbs_period_id -> f8_pbs.pbs_period.period_code -> f8.roster_period.name` 回填。
- `f8_pbs.pbs_award_result.roster_period_id` 同理回填。
- 对 `pbs_period_id is null` 的 Standing / Default / 历史数据不强制填充；Current bid 如果能由 `period_code` 映射则可补。

### 清理冗余表

只有在代码切换并验证通过后才执行最终删除：

- 删除或 drop `f8_pbs.dictionary`。
- 删除或 drop `f8_pbs.pbs_period`。

最终 drop 前必须再次确认：

- 代码中没有 `f8_pbs.dictionary` / `${pbsSchema}.dictionary` 运行时引用。
- 代码中没有 `f8_pbs.pbs_period` / `pbsPeriod` Drizzle model 运行时引用。
- `pbs_bid.pbs_period_id` / `pbs_award_result.pbs_period_id` 不再被运行时读取。

## 代码改动设计

### pbs-server

1. Business Time：
   - `createPbsBusinessClock` 改为读取 live schema 的 `dictionary`。
   - live schema 由 `env.PBS_SCHEMA.replace(/_pbs$/i, '')` 推导，当前为 `f8`。
   - 查询必须显式 schema，例如 `${liveSchema}.dictionary`，不再依赖 search_path。

2. Current Period：
   - `resolveCurrentPeriod` 不再查询 `pbsPeriod` Drizzle model。
   - 改为使用 `pgPool` 或显式 schema SQL 读取 `${liveSchema}.roster_period`。
   - 返回体仍保持 `currentPeriod` contract：
     - `id` 暂时使用 `roster_period.id`
     - `periodCode` 使用 `roster_period.pbs_period_code`
     - `filiale` 从 PBS schema 推导为 `F8`
     - `division` 使用 actor scope 的 division
     - `bidOpenAt` / `bidCloseAt` 使用 `pbs_bid_open_at` / `pbs_bid_close_at`
     - `computedStage` 仍按 businessNow 和 open/close 自动计算

3. Bid 写入：
   - 新建 Current bid 时写 `roster_period_id`，不写或不依赖 `pbs_period_id`。
   - 仍写 `period_code`，值为 `pbs_period_code`，用于兼容现有唯一键和导出。

4. Award / Dashboard / Calendar / Summary：
   - 所有通过 `resolveCurrentPeriod` 获取当前周期的服务跟随新来源。
   - 直接读 `pbsPeriod` 的地方改为 `roster_period` 来源。

### live-server

1. PBS Period Admin：
   - `/api/pbs/period-admin` 不再读写 `${PBS_SCHEMA}.pbs_period`。
   - 改为读写 live schema `roster_period` 的 PBS 字段。
   - API contract 可以暂时保持原字段名，前端不用一次性大改：
     - `periodCode` <-> `pbs_period_code`
     - `bidOpenAt` <-> `pbs_bid_open_at`
     - `bidCloseAt` <-> `pbs_bid_close_at`
     - `awardRunAt` <-> `pbs_award_run_at`
     - `awardPublishAt` <-> `pbs_award_publish_at`
     - `maxTiers` <-> `pbs_max_tiers`
     - `status` <-> `pbs_status`

2. Business Time Admin：
   - 读写 `f8.dictionary`。
   - 不再读写 `${PBS_SCHEMA}.dictionary`。

3. Data Tab：
   - `Basic -> Roster Period` 需要展示新增 PBS 字段，或者新增字段至少能被管理员维护。
   - `PBS -> Period` 仍可以保留为 PBS 专用管理视图，但数据源必须改为 `f8.roster_period`。

### gantt

- `PBS -> Period` 页面保持现有操作习惯，但数据源变为 `roster_period`。
- UI 文案可继续显示 `PBS Period`，但内部不再对应独立 `pbs_period` 表。
- 新增/编辑时实际更新 `f8.roster_period` 的 PBS 字段。
- 如果使用 `Basic -> Roster Period` 维护，则需要避免两个入口编辑同一字段时文案混淆。

### pbs-portal

- pbs-portal 不直接读数据库，主要受 pbs-server API 返回影响。
- 需要确认所有 currentPeriod 展示、bid 可编辑判断、dashboard period 信息在切换后保持一致。

## API / Contract 兼容

为了降低前端和测试迁移成本，第一阶段保持外部 API 字段名不变：

- API 仍返回 `PbsCurrentPeriod.id`。
- `id` 的真实含义从旧 `pbs_period.id` 变为 `roster_period.id`。
- `periodCode` 仍返回 `Jun 2026` 这种 PBS 兼容文案。
- 管理 API 仍可叫 `/api/pbs/period-admin`，但实现不再读写 `pbs_period`。

需要在 docs 和代码注释里说明：

- `currentPeriod.id` 是当前周期稳定 id，后端来源为 `roster_period.id`。
- 不要再把它理解为 `pbs_period.id`。

## 实施阶段

### Phase 1：schema 与数据准备

- 给 `f8.roster_period` 增加 PBS 字段。
- 给 `f8_pbs.pbs_bid` / `f8_pbs.pbs_award_result` 增加 `roster_period_id`。
- 迁移 `PBS_BUSINESS_TIME_*` 到 `f8.dictionary`。
- 回填 `f8.roster_period` PBS 字段。
- 回填 `pbs_bid.roster_period_id` / `pbs_award_result.roster_period_id`。
- 不 drop 旧表。

### Phase 2：代码切换

- pbs-server 改读 `f8.dictionary` 和 `f8.roster_period`。
- live-server Period Admin / Business Time Admin 改读写 `f8`。
- Gantt PBS Period UI 保持功能，但数据源切换。
- 更新测试和 QA 文档。

### Phase 3：冗余表删除

- 删除运行时代码中的旧 model / route / SQL 引用。
- 迁移或删除 `pbs_period_id` 字段依赖。
- 执行最终 migration 删除 `f8_pbs.dictionary` 和 `f8_pbs.pbs_period`。
- 更新 `docs/architecture/data-model.md` 和 `docs/architecture/codebase-index.md`。

## 测试策略

### 自动化测试

pbs-server：

- Business Clock 从 `f8.dictionary` 读取 PBS Business Time。
- `resolveCurrentPeriod` 从 `f8.roster_period` 选择当前周期。
- P/C/A 用户在同一个 roster period 下得到各自 division 的 currentPeriod 响应。
- Current bid 保存写入 `roster_period_id`。
- 旧 `PBS_PORTAL_ACTIVE_PERIOD_*` 存在也不影响当前周期。

live-server：

- `/api/pbs/period-admin` list/create/update/delete 读写 `f8.roster_period` PBS 字段。
- Business Time Admin 读写 `f8.dictionary`。
- 删除保护检查改为检查 `pbs_bid.roster_period_id` / `pbs_award_result.roster_period_id`。

Gantt / E2E：

- `PBS -> Period` 页面能加载 `roster_period` 中的 PBS 字段。
- 新增或编辑一个 period 的 PBS open/close/max tiers 后，pbs-portal currentPeriod 能反映变化。
- 被 Current bid 引用的 period 删除时返回明确错误。

### 手工 QA

新增测试用例文档：

`docs/test-cases/pbs/period/<YYYY-MM-DD>-roster-period-consolidation.md`

覆盖：

- Business Time 从 `f8.dictionary` 生效。
- `PBS -> Period` 修改 `f8.roster_period` 后 Portal 当前周期变化。
- 旧 `f8_pbs.dictionary` / `f8_pbs.pbs_period` 删除后 Portal 仍可打开并保存 bid。
- 当前已有 Cabin `Jun 2026` bid 不丢失。

## 验收标准

1. `f8_pbs.dictionary` 不再被任何运行时代码读取或写入。
2. `f8_pbs.pbs_period` 不再被任何运行时代码读取或写入。
3. PBS Business Time 只来自 `f8.dictionary`。
4. PBS 当前周期只来自 `f8.roster_period`。
5. 当前 `Jun 2026 / C` 的已有 bid 能正确映射到 `f8.roster_period`。
6. `PBS -> Period` 页面仍可维护 bid open/close/max tiers。
7. pbs-portal 当前周期、bid 可编辑状态、dashboard period 信息保持可用。
8. 本次最终 migration 删除 `f8_pbs.dictionary` 和 `f8_pbs.pbs_period`。

## 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| P/C/A 将来需要不同 bid window | 单行 `roster_period` 无法表达 | 当前业务确认 `roster_period` 对应 PBS period；第一版不支持 division-specific window。未来如需要，再新增明确的 `roster_period_division_config`，不能恢复重复 `pbs_period`。 |
| `periodCode` 从 `Jun 2026` 变成 `2026RP06` | 影响现有 bid 唯一键和展示 | 新增 `pbs_period_code` 保留 `Jun 2026`。 |
| `status` 曾按 division 不一致 | 聚合后丢失旧差异 | `status` 不再参与 can-edit 判定；`pbs_status` 只做 lifecycle/display，按优先级聚合。 |
| 直接 drop 旧表导致运行时失败 | Portal 或管理页不可用 | 本阶段先完成代码引用检查和自动化测试，再由 migration 在最后 drop 旧表。 |
| `pbs_bid.pbs_period_id` 仍有引用 | 删除旧表后断链 | migration 先新增并回填 `roster_period_id`，代码切换后删除旧字段。 |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务跨 schema、后端核心周期解析、管理端 API 和 Portal currentPeriod，耦合度高；并行实现容易造成字段口径不一致。
- Suggested split: 暂不拆分实现。后续可让第二个 agent 只做只读 review 或 QA 测试文档。
- Write boundaries: 主要涉及 `sql/schema`、`sql/migration`、`pbs-server`、`live-server`、`gantt`、`docs/test-cases`、`docs/architecture`。
- Conflict risk: High。尤其是 `resolveCurrentPeriod`、`period-admin`、`pbs_bid` period identity 和旧 tests。
- Execution gate: 用户 review 并确认本 spec 后，才能进入实施计划和代码修改。

## 用户确认点

请确认以下口径后再实施：

1. `f8.roster_period` 可以新增 PBS 字段，并作为 PBS 当前周期唯一来源。
2. P/C/A 第一版共用同一 roster period 的 PBS bid window。
3. `pbs_period_code` 保留 `Jun 2026` 这类 PBS 展示/兼容文案。
4. 旧 `f8_pbs.dictionary` / `f8_pbs.pbs_period` 在本次最终 migration 中直接 drop，不保留运行时兼容。
