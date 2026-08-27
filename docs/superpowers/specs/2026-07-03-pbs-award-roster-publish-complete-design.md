# PBS Award 整月排班数据发布表补齐设计

日期：2026-07-03  
作者：Codex  
状态：待用户确认后实施  
范围：第一步，只补齐 `roster_publish` 数据结构并从 `roster_flight` 同步出可用数据；不开发 Award 页面展示。

## 背景

Award 页面要展示组员提交 PBS 申请后返回的最终整月排班。用户已确认页面不是只展示 awarded pairing，而是要展示整月真实排班，包括 flight / pairing leg，也包括 DO / VAC / RES / ILL / SIM 等 ground row。

目标数据源是 live schema 的 `roster_publish`。当前远端数据状态：

- `f8.roster_publish` 当前为 0 行。
- `f8.roster_flight` 当前约 17 万行，可作为临时同步源。
- `f8_pbs.pbs_award_result` / `f8_pbs.pbs_award_item` 当前为 0 行，不能作为第一阶段 Award 展示来源。
- PBS business time 当前有 override，业务时间从 2026-05-01 起滚动，因此现有页面显示 `Jun 2026` 是合理的；Award 后续也应复用同一 current period 解析。

## 已确认的数据模型问题

当前 `roster_publish` 更像 flight/check-in 发布表，不足以承载完整月排班：

1. `roster_publish.flt_id` 是 `not null`，但 `roster_flight` 里的 DO / VAC / RES / ILL / SIM 等 ground row 没有 `flt_id`，无法合法插入。
2. `roster_publish` 没有通用排班起止时间字段；flight 和 ground 在 `roster_flight` 中统一使用 `sch_str_dt_utc` / `sch_end_dt_utc`。
3. `roster_publish` 没有 `assignment_group`，无法区分例如 `FLY/DHD` 与 `GRD/DHD`。
4. `roster_publish` 没有通用 `label`，ground row 没有 pairing/flight 可 join 时无法稳定显示。
5. `roster_publish` 没有通用 `dep_arp` / `arv_arp`，ground row 的地点语义会丢失。
6. `roster_publish.roster_id` 已存在，应作为从 `roster_flight.id` 同步时的幂等身份。

## 目标

1. 将 `roster_publish` 补齐为可承载“整月最终发布排班”的表。
2. 保留 flight row 既有发布语义，同时允许 ground row 入表。
3. 提供一个可审查、可 dry-run、可按 period / crew 限定的同步脚本，把 `roster_flight` 数据同步到 `roster_publish`。
4. 同步后能通过 SQL 查出某个 crew 在当前 period 的完整月排班。
5. 后续 Award 页面只读 `roster_publish`，不再混读 `roster_flight` 或 mock。

## 不做范围

- 不在本步骤开发 Award UI。
- 不实现 Reason Report。
- 不生成 PBS solver award result。
- 不修改 `pbs_award_result` / `pbs_award_item` 语义。
- 不做生产环境自动写入；执行同步必须先 dry-run 并确认影响范围。

## 推荐方案

采用“补全 `roster_publish` + 同步脚本”的方案。

### Schema 变更

最小运行字段：

- `roster_publish.flt_id`：改为 nullable，用于允许 ground row。
- 新增 `assignment_group varchar(20)`：保留任务大类，例如 `FLY` / `GRD` / `RES`。
- 新增 `label varchar(200)`：保留源排班展示标签，例如 `GDO`、`F8703 YEG-YXX`。
- 新增 `sch_str_dt_utc`：通用计划开始时间。
- 新增 `sch_end_dt_utc`：通用计划结束时间。
- 新增 `dep_arp varchar(3)`：通用开始地点 / 起飞机场。
- 新增 `arv_arp varchar(3)`：通用结束地点 / 到达机场。

索引 / 约束：

- 保留或重建非空 flight row 的唯一约束：`(flt_id, crew_id)`，仅约束 `flt_id is not null` 的行。
- 新增 `roster_id` 唯一索引，限定 `roster_id is not null`，用于幂等同步。
- 新增按 crew + 时间查询的索引，例如 `(crew_id, sch_str_dt_utc)`，服务 Award 月视图。

迁移要求：

- 迁移必须兼容已有环境中 `roster_publish` 可能已有数据的情况。
- 不删除已有业务数据。
- 字段类型以实际 live 表为准；实施前再次读取远端 `information_schema` 确认 timestamp 类型。

### 同步脚本

新增一个 PBS 开发侧脚本，建议位置：

- `pbs-server/src/scripts/sync-roster-publish-from-roster-flight.ts`

脚本行为：

- 默认 `--dry-run`，只输出影响行数、冲突数、跳过原因，不写库。
- 只有显式 `--execute` 才写入。
- 支持 `--period-code "Jun 2026"` 或 `--from YYYY-MM-DD --to YYYY-MM-DD`。
- 支持 `--crew-id` 限定单个 crew，用于先做样本验证。
- 写入 live schema 的 `roster_publish`，读取 live schema 的 `roster_flight` / `pairing_segment` / `pairing`。

字段映射：

| `roster_publish` | 来源 |
| --- | --- |
| `roster_id` | `roster_flight.id` |
| `crew_id` | `roster_flight.crew_id` |
| `pairing_id` | `roster_flight.pairing_id` |
| `flt_id` | flight row 用 `coalesce(roster_flight.flt_id, pairing_segment.flt_id)`；ground row 为 `null` |
| `flt_dt` | `coalesce(roster_flight.flt_dt, pairing_segment.flt_dt, sch_str_dt_utc date)` |
| `division` | `roster_flight.division` |
| `assignment_group` | `roster_flight.assignment_group` |
| `assignment` | `roster_flight.assignment` |
| `label` | `roster_flight.label` |
| `acting_rank` | `roster_flight.flight_acting_rank` |
| `roster_rank` | `roster_flight.roster_acting_rank` |
| `active_rank` | `roster_flight.active_rank` |
| `position` | `roster_flight.position` |
| `duty_id` | `coalesce(roster_flight.duty_seq, 0)` |
| `seq_order` | `coalesce(roster_flight.seq_order, 0)` |
| `sch_str_dt_utc` / `sch_end_dt_utc` | `roster_flight.sch_str_dt_utc` / `roster_flight.sch_end_dt_utc` |
| `dep_arp` / `arv_arp` | flight row 优先 `pairing_segment.dep_arp/arv_arp`，ground row 用 `roster_flight.dep_arp/arv_arp` |
| `source` 相关审计 | `created_by` / `updated_by` 写脚本标识 |

冲突处理：

- 源数据中按 `pairing_segment.flt_id` 补齐后约有少量 `(flt_id, crew_id)` 重复，不能静默覆盖。
- dry-run 必须报告重复数量和样例。
- execute 默认跳过重复组中非首选行，并报告跳过行数。
- 首选规则建议为：同一 `(flt_id, crew_id)` 内按 `sch_str_dt_utc asc, roster_flight.id asc` 取第一条。
- 后续如业务要求保留同一 crew 同一 flight 的多条记录，需要先调整 publish 唯一语义，不能在脚本里绕过。

幂等策略：

- 以 `roster_id` 为主幂等键。
- 已存在同一 `roster_id` 时更新展示字段和 publish 字段。
- 新行插入前先排除会撞 `(flt_id, crew_id)` 的冲突行。

## 后续 Award API 预留

本步骤不实现 API，但数据形态应支持后续：

- `GET /api/award/current`
- 后端按 authenticated `crewId` + current period 读取 `roster_publish`。
- 返回整月 daily roster / grouped trip cards 所需的 contract。
- UI 不再读 `roster_flight`。

## 验收标准

第一步完成后必须满足：

1. `roster_publish` 可以插入 flight row 和 ground row。
2. `roster_publish` 中 ground row 的 `flt_id` 可以为 `null`，但仍有 `crew_id`、`assignment_group`、`assignment`、`label`、`sch_str_dt_utc`、`sch_end_dt_utc`。
3. 同步脚本 dry-run 能输出：
   - candidate rows
   - inserted rows
   - updated rows
   - skipped duplicate rows
   - skipped invalid rows
4. 对单个 crew 执行同步后，可查到整月完整排班，不只 flight legs。
5. 重跑同步不会重复插入。
6. 没有写入明文 secrets、连接串或 token 到文档 / 日志。

## 验证计划

开发侧：

- 新增 / 更新同步脚本单元测试，覆盖 dry-run、field mapping、duplicate skip、ground row mapping。
- 运行 `pbs-server` 相关测试。
- 执行远端 dry-run，只报告统计。
- 在用户确认后，对限定 crew 或限定 period 执行 `--execute`，再查询验证。

数据验证 SQL 方向：

- 按 period 查询 `roster_publish` 行数。
- 按 `assignment_group, assignment` 查询分布。
- 按 `crew_id` 抽样检查整月是否同时包含 FLY / DO / VAC / RES 等。
- 检查 `roster_id` 幂等唯一。
- 检查 `(flt_id, crew_id)` 非空 flight row 冲突为 0。

后续 UI 验证：

- Award 页面实现时必须补 Playwright，真实登录并打开 `/award`。
- loading / empty / populated 三种状态都要覆盖。

## 风险与处理

- **远端数据质量风险**：源数据里存在少量重复 `(flt_id, crew_id)`。脚本必须报告并跳过，不可静默覆盖。
- **时间语义风险**：ground row 没有 `flt_dt`，需要从 `sch_str_dt_utc` 推导月内日期。第一阶段使用现有业务 period 的 UTC 日期，后续如要按机场本地日历显示，应在 Award API 层明确转换。
- **生产数据风险**：同步脚本必须默认 dry-run，不允许默认写入。
- **另一个窗口并发改动风险**：当前工作树已有大量 PBS bid property 相关改动，本任务实施时只触碰 `roster_publish` schema/migration、sync 脚本及对应测试，提交时只 staging 本任务文件。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes，实施阶段可并行。
- Rationale: schema / script / verification / 后续 API 和 UI 可分离。
- Suggested split: 第一阶段建议主 agent 单线完成 schema + sync，避免 migration 冲突；后续 Award API/UI 再拆分。
- Write boundaries: schema/migration/script/tests 与 Award UI 分开。
- Conflict risk: 中等；当前另一个窗口已经在改 PBS contract、schema、tests。
- Execution gate: 用户确认本 spec 后，再进入 implementation。

