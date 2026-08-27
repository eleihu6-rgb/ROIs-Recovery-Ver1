# PBS YEG 14 人 Portal 配置重映射设计

日期：2026-06-04

## 背景

当前 YEG 14 人用于算法导出范围测试。用户希望不改变 crew 本身、不改变 `seniority_num`，只把这 14 人在 portal 中当前保存的 `Jun 2026 / Current` bid 配置按指定对应关系重新分配。

本次是一次性开发测试数据调整，用于让导出文件在按 `seniority_num ASC` 排序后，对应到用户希望查看的测试场景顺序。

## 目标

- 修改 `f8_pbs` schema 下 `period_code = 'Jun 2026'`、`bid_context = 'Current'` 的 14 人 portal bid 配置。
- 按用户指定映射，把“来源 crew 的完整配置”复制到“目标 crew”的 Current bid 上。
- 保留目标 crew 身份、base、seniority 排序不变。
- 修改后再次查询 14 人配置，确认目标 crew 已拿到正确来源配置。

## 映射关系

| 目标 Crew | 使用配置来源 Crew |
|---|---|
| `274` | `8888` |
| `383` | `13697` |
| `536` | `2697` |
| `572` | `2696` |
| `996` | `2440` |
| `2224` | `2377` |
| `2227` | `2229` |
| `2229` | `2227` |
| `2377` | `2224` |
| `2440` | `996` |
| `2696` | `536` |
| `2697` | `572` |
| `13697` | `383` |
| `8888` | `274` |

## 数据范围

- 数据库连接：使用 `pbs-server/.env` 中的 `DATABASE_URL`。
- PBS schema：当前连接 search path 指向 `f8_pbs`。
- live crew seniority：`f8.crew`，仅用于验证排序与范围。
- 目标 period：`Jun 2026`。
- 目标 context：`Current`。
- 目标 crew：上述 14 个 crew。

## 实施方案

推荐方案：在一个事务中完成“快照 → 删除目标当前配置明细 → 重建目标配置”。

1. 读取 14 个来源 crew 的最新 Current bid 作为源快照。
2. 对每个目标 crew 保留其 `pbs_bid` 主记录，更新 `updated_at`、`draft_version`，并把备注标记为本次 remap。
3. 删除目标 bid 下旧的 `pbs_bid_condition`、`pbs_bid_group`、`pbs_bid_tier`。
4. 重新插入 tier、group、condition：
   - `tier`、`group_seq`、`bid_type`、`action_id`、`property_definition_id`、参数字段、限制字段等全部来自来源配置。
   - `property_group_key` 生成新的 remap key，避免唯一键冲突。
   - 子条件随 group 一起复制。
5. 提交事务。
6. 查询 14 人配置并按 `seniority_num ASC` 输出给用户复核。

## 约束与假设

- 这是一次性开发测试数据调整，不新增正式接口，不改导出逻辑。
- 只处理 `Current` bid，不修改历史 bid、Submitted bid、property definition、crew、pbs_user。
- 如果某个来源 crew 没有 Current bid，应中止事务并报告，不做部分写入。
- 如果某个目标 crew 没有 Current bid，优先中止事务并报告；本次不自动创建新 bid。
- 配置复制以后，页面再次修改目标 crew 的配置，导出接口应读取修改后的最新数据库状态。

## 验收标准

- 14 个 crew 都仍为 YEG，`seniority_num` 未变化。
- 每个目标 crew 的配置语义与指定来源 crew 原配置一致。
- 查询结果按 `seniority_num ASC` 排列。
- `274` 最终显示 `8888` 原本的 Commuter Pattern；`8888` 最终显示 `274` 原本的 No Reserve。
- 没有修改代码文件或导出逻辑。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务是单次数据库配置重映射，范围小且必须在一个事务内保持一致性；多 agent 会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 仅数据库 `f8_pbs` 中 14 个 `Current` bid 的 tier/group/condition 数据。
- Conflict risk: 多 agent 同时写同一批 bid 会有高冲突风险。
- Execution gate: 用户确认本 spec 后执行数据库事务，并输出复核清单。
