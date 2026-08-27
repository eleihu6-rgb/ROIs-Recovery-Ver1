# Gantt Roster Period Config 管理端第一阶段设计

日期：2026-06-29
范围：第一阶段，仅完成 Gantt 管理端对 `roster_period` / `roster_period_config` 的维护能力
状态：待用户 review

## 背景

`Crew Planning PBS work flow Ver2.docx` 描述了 PBS 月度工作流：发布当前 roster、准备下月 pairing、确定 bid open date、每日刷新数据、bid close、award run、publish 等。这个流程后续需要落到 PBS Server / PBS Portal 的周期配置和状态控制上。

本阶段先不直接实现 PBS open/close/publish 业务流，而是先补齐 Gantt 管理端已有预留页面，让管理人员能维护 roster period 以及自动生成规则配置。这样后续再把 PBS `pbs_period` 对接到同一个周期概念时，不需要重新整理基础周期数据。

## 当前代码现状

- Gantt Data Tab 已有 `Basic -> Roster Period` 页面入口。
- `gantt/src/config/data-entity-registry.ts` 已完整配置 `roster_period`。
- `roster_period_config` 已在 Gantt 类型和 registry 中预留，但目前只是 stub。
- `PAGE_ENTITY_MAP['basic.roster-period']` 当前只包含 `roster_period`，没有展示 `roster_period_config`。
- live-server `POST /api/data/table` 当前只支持 `roster_period` 查询分支。
- live-server `POST /api/data/save` 当前只支持 `roster_period` create/update/delete。
- `sql/seed/roster-period-2026-2036.sql` 已存在 F8 roster period seed，说明系统已经有“不固定 30 天一个 RP”的痕迹。
  - 当前 seed 注释写的是：Feb RP ends Mar-01, Mar RP starts Mar-02, all others 01-last-day。
  - 本阶段以当前 seed 为权威口径：January RP = `1/1-1/31`，February RP = `2/1-3/1`，March RP = `3/2-3/31`，4 月开始按自然月。
  - 实现和测试不得假设 RP 固定 30 天。
- 数据库和 Drizzle model 已存在：
  - `sql/schema/live/01-base.sql`：`roster_period_config`
  - `live-server/src/models/base/roster-period.ts`：`rosterPeriodConfig`

## 第一阶段目标

在 Gantt 管理端完成 `Roster Period Config` 的可视化维护能力：

1. `Basic -> Roster Period` 页面同时展示两个 section：
   - `Roster Period`
   - `Roster Period Config`
2. 管理员可以在 `Roster Period Config` 中新增、编辑、删除、分页查看配置。
3. live-server 数据维护接口支持 `roster_period_config` 查询和保存。
4. 保持现有 `Roster Period` 行为不变。
5. 为后续 PBS `pbs_period` 对接保留清晰边界。

## 明确不做

本阶段不做以下内容：

- 不新增 PBS Portal 页面。
- 不改变 PBS Portal 当前 period 选择和 bid 提交流程。
- 不新增或修改 `pbs_period` 表结构。
- 不实现 bid open / bid close / award publish 的业务状态流。
- 不实现从 `roster_period_config` 自动生成 `roster_period` 的后台任务。
- 不把 PBS 业务字段塞进 live schema 的 `roster_period_config`。

## 数据模型边界

### `roster_period`

表示真实排班周期，例如某个月的起止时间、发布日、锁定状态。

重要业务约束：

- RP 不等于固定 30 天窗口。
- RP 也不一定从 1 号自然月开始；现有 F8 seed 的切换边界是 `1/1-1/31`, `2/1-3/1`, `3/2-3/31`。
- 4 月开始可按自然月，但 UI 和服务端保存逻辑仍必须以 `rp_start` / `rp_end` 的显式值为准。
- 第一阶段不能新增“自动按 30 天生成”或“自动按自然月纠正”的逻辑。

已有字段：

- `year`
- `name`
- `roster_period`
- `rp_start`
- `rp_end`
- `roster_publication_date`
- `paid_date`
- `lock_status`

### `roster_period_config`

表示排班周期自动生成规则配置，不表示 PBS bid 窗口。

本阶段维护字段：

- `name`：配置名称
- `name_type`：名称生成规则类型
- `rp_type`：周期类型，建议显示为 `Monthly` / `Quarterly`
- `period`：周期长度数值
- `period_type`：周期长度单位，建议显示为 `Day` / `Week` / `Month`
- `start_time`：周期开始基准时间
- `end_time`：周期结束基准时间

## UI 设计

入口沿用现有 Gantt Data Tab：

`Data -> Basic -> Roster Period`

页面布局沿用现有 `BasicTablePage` 多 entity section 机制：

1. 第一个 section：`Roster Period`
2. 第二个 section：`Roster Period Config`

`Roster Period Config` 表格列：

| UI Label | 字段 | 类型 | 行为 |
|---|---|---|---|
| ID | `id` | number | 只读 |
| Name | `name` | text | 可编辑 |
| Name Type | `nameType` | number | 可编辑；如后续明确枚举语义再改成 select |
| RP Type | `rpType` | select | `Monthly=1`, `Quarterly=2` |
| Period | `period` | number | 可编辑 |
| Period Type | `periodType` | select | `Day=1`, `Week=2`, `Month=3` |
| Start Time | `startTime` | datetime | 可编辑 |
| End Time | `endTime` | datetime | 可编辑 |

UI 文案使用英文，符合项目 UI language 规则。

## Backend 设计

### 数据查询

在 live-server `routes/data/index.ts` 的 data table 查询中增加 `roster_period_config` 分支：

- 从 `rosterPeriodConfig` Drizzle model 查询。
- 支持分页。
- 可选支持 `rpType` / `periodType` 筛选。
- 返回格式沿用现有 `{ rows, total, page, pageSize }`。

### 数据保存

在 `live-server/src/services/data/data-save-service.ts` 增加 `roster_period_config` 分支：

- `create`
- `update`
- `delete`

保存时复用现有 helper：

- `toNum`
- `toDate`
- `auditCreate`
- `auditUpdate`

缓存失效可纳入 `roster_period:*` 或新增 `roster_period_config:*`，保持与后续读取策略一致。

### Schema

本阶段不需要 schema migration，因为表和 model 已存在。实现前需要确认目标远端库 schema 已有该表；如果目标环境缺失，应单独补幂等 migration，不把 migration 混入第一阶段功能代码。

## 后续 PBS 对接方向

第二阶段才处理 PBS 周期设置。正确落点是 `pbs_period`：

- `period_code`
- `roster_period_id`
- `bid_open_at`
- `bid_close_at`
- `award_run_at`
- `award_publish_at`
- `max_tiers`
- `status`

后续推荐流程：

1. Gantt 管理端增加 PBS Period Settings 管理区。
2. PBS Server 提供 admin API 管理 `pbs_period`。
3. PBS Portal 从 PBS Server 读取当前 period 和状态，控制是否可编辑/提交。
4. 导入、dry run、bid submit 都统一以 `pbs_period` 为 PBS 业务周期来源。

## 测试要求

### 后端

增加或更新 live-server 测试，覆盖：

- `POST /api/data/table` 能查询 `roster_period_config`。
- `POST /api/data/save` 能 create `roster_period_config`。
- `POST /api/data/save` 能 update `roster_period_config`。
- `POST /api/data/save` 能 delete `roster_period_config`。
- 保存失败时事务回滚，不影响其他 changes。

### 前端

增加或更新 Gantt 管理端测试，覆盖：

- `Basic -> Roster Period` 页面显示两个 section。
- `Roster Period Config` 能打开新增/编辑弹窗。
- 成功保存后列表刷新。
- 删除后列表刷新。

### Playwright

因为这是管理端 UI 功能，需要一个真实 UI 回归：

1. 登录 Gantt。
2. 进入 Data Tab。
3. 打开 `Basic -> Roster Period`。
4. 确认 `Roster Period` 和 `Roster Period Config` 都显示。
5. 新增一条测试 config。
6. 编辑该 config。
7. 删除该 config。
8. 确认页面没有报错，列表状态正确。

### UI Gate

如果改动涉及样式或组件布局，需要运行：

- `npm run check:ui`

### Version Bump

第一阶段实现会同时改 Gantt 前端和 live-server 后端运行代码，因此需要按项目规则递增：

- `gantt/src/version.ts` 的 `FRONTEND_VERSION`
- `gantt/src/version.ts` 的 `BACKEND_VERSION`

## 风险与约束

- `roster_period_config` 当前没有被业务流程消费，本阶段只做维护能力，不承诺自动生成周期。
- 如果远端库缺失该表，需要先补幂等 migration 或确认部署脚本。
- 不应为了第一阶段引入新的页面框架；应复用 Data Tab 现有 registry、section、edit dialog 和 save API。
- 不应把 PBS `pbs_period` 的 open/close/status 字段混入 live `roster_period_config`。
- 现有 seed 是当前权威数据口径；除非用户另开需求明确调整 RP 边界，本阶段不修改 seed 数据。

## 验收标准

- Gantt Data Tab 中 `Basic -> Roster Period` 页面能看到两个配置区。
- `Roster Period Config` 支持新增、编辑、删除。
- 现有 `Roster Period` 查询和保存不回归。
- `Roster Period` UI 能展示和保存不规则 RP 边界，例如 `2/1-3/1` 这种跨自然月窗口。
- 后端数据维护接口支持 `roster_period_config`。
- 有对应自动化测试和 Playwright 回归测试。
- 第一阶段不修改 PBS Portal 用户侧行为。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 第一阶段范围集中，主要是 Gantt Data registry、live-server data route/save、测试，单线实现更容易保持契约一致。
- Suggested split: 暂不拆分；如果后续第二阶段进入 PBS Server / Portal，可拆成 backend admin API、Gantt admin UI、Portal consumption 三个子任务。
- Write boundaries: 第一阶段只写 `gantt`、`live-server`、测试和测试文档；不写 `pbs-server` / `pbs-portal` 运行代码。
- Conflict risk: 低到中等，主要风险是通用 Data Tab 组件和 data-save-service 共享分支。
- Execution gate: 本 spec 经用户确认后，再进入 implementation plan 和代码实现。
