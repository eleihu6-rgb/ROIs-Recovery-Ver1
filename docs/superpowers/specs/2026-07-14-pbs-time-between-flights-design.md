# PBS Pairing「Time Between Flights」开发设计

## 1. 背景与依据

Jen 在 `Jenife_Bidding_Type_Clarification_20260707.docx` 中提出：

- 将旧的 `Any/Every Sit Length` 更名为 `Time Between Flights`；
- 最低可申请值为 **45 分钟**；
- 最高可申请值从已上传 pairing 的真实航段间隔中读取；用户不能填写当前数据范围以外的值；
- 最终清单明确保留 `(any/every sit length)` 的语义。

文档前文出现的 `Average sit length` 是旧功能的口语称呼；本设计以最终清单为准，**不计算平均值**，而是逐个判断同一 duty 内相邻航段之间的实际间隔。

当前 `property_code=129` 仍叫 `Any/Every Sit Length`，仅暴露 `>`，没有 45 分钟下限或数据驱动上限，且 Search Pairings 尚不能实际筛选该条件。因此它不能完整表达 Jen 的要求。

## 2. 目标与非目标

### 目标

1. 将 `property_code=129` 的可见名称改为 `Time Between Flights`。
2. 保留 `Award / Avoid` 与 `Any / Every`。
3. 支持 `<`、`=`、`>` 三种比较方式和 `HH:MM` 时长输入。
4. 最低可申请值从 dictionary 配置读取，初始值为 `00:45`；最高值从当前用户可见的当期 pairing pool 实时计算。
5. Pairing 页面、Search Pairings 使用同一个 editor、相同上下限和相同 payload。
6. Search Pairings / 当前规则计数按真实航段间隔计算，不能再返回“不支持预览”。

### 非目标

- 不新增“平均间隔”规则。
- 不新增 `Between` 作为 bid 比较方式；Jen 没有要求它，动态上下限也不是用户填写的 bid range。
- 不修改 `property_code`，不引入新的 bid value type，不改变 PBS 表结构。
- 不把 layover、跨 duty 休息、check-in 或 check-out 时间计入本条件。

## 3. 已确认的用户体验

原型已按 `Month-End Carryover` 的紧凑比较控件确认方向：

1. `TIERS`：新建时为空，至少选择一个才能保存。
2. `PREFERENCE`：`Award` 默认选中；可切换 `Avoid`。
3. `MATCH`：`Any` 默认选中；可切换 `Every`。
4. `TIME BETWEEN FLIGHTS`：左侧是 `< / = / >` 下拉控件，右侧是单一 `HH:MM` 输入。
5. 输入 placeholder 直接呈现有效区间，例如 `00:45 – 04:20`；不再单独显示“Allowed”“Current pairing maximum”等说明性小字。
6. Tier、有效 operator 和有效时长齐全前，`Save Favorite` 与 `Add/Update Bid` 保持禁用。

正式 UI 必须复用 `PbsDialogFrame`、`TierToggleGroup`、`AwardAvoidSegmentedControl`、`PreferenceConditionSection`、`PreferenceComparisonValueControl`、`PairingPropertyDialogFooter`，遵守 `docs/modules/pbs/pairing-condition-ui-standard.md`。

## 4. 业务语义

### 4.1 间隔计算

对同一 pairing、同一 duty 内按 `seg_seq` 排序的相邻非删除 `pairing_segment`，计算：

```text
time_between_flights_minutes = next.sch_str_dt_utc - current.sch_end_dt_utc
```

- 只保留 `next.sch_str_dt_utc`、`current.sch_end_dt_utc` 都存在的行。
- 每个 duty 最后一段没有下一段航班，不产生 interval。
- 维持旧 Connection Time 的口径：非删除航段均参与，包括 deadhead 航段；不跨 duty 计算。

示例：一个 duty 的三段航班产生 `00:50` 和 `02:10` 两个 interval。

| 申请 | 表达的规则 | 示例结果 |
| --- | --- | --- |
| `Award · Any · < · 01:00` | 至少有一个间隔小于一小时 | 匹配（`00:50`） |
| `Award · Every · > · 00:45` | 每一个实际 interval 都大于 45 分钟 | 匹配（两个均满足） |
| `Avoid · Any · > · 02:00` | 避免存在任意 interval 超过两小时的 pairing | 此 pairing 被排除（`02:10`） |

### 4.2 Any / Every

- `Any`：存在至少一个 interval 满足比较式。
- `Every`：至少存在一个 interval，且每一个 interval 都满足比较式。
- 没有 interval 的 pairing（例如每个 duty 都只有一段航班）不匹配 `Any`，也不匹配 `Every`。
- `Avoid` 对以上正向结果取反；实现必须保持和其他 Pairing 条件一致的 action 包装逻辑。

### 4.3 输入边界

- 下限：从 live schema `dictionary` 读取 `parent_code='SYS_PARAM'`、`code='PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES'`，migration 初始 seed 为 `45`。前端不硬编码业务下限。
- 上限：在**当前 bid period、当前登录用户可见 pairing pool**内，按 4.1 计算的最大 interval 分钟数。pool 的 base / rank / period 口径必须与 Search Pairings 当前规则计数一致。
- 若 pool 不存在任何有效 interval，或上限小于配置下限，则 editor 显示简短不可用状态且 footer 禁用；不得伪造上限或静默回退到固定数值。
- 前端加载 bounds 期间不允许保存；保存入口仍校验 duration、operator 和 quantifier，preview / 计数按同一 interval 语义执行。

## 5. 数据与接口契约

### 5.1 持久化 payload

沿用现有 `duration` 类型，不新增 schema：

```ts
{
  type: "duration",
  value: "01:30",
  operator: ">"
}
```

`propertyCode=129` 上保存 action、quantifier 和 tiers。上线 migration 会清空旧 129 bid / favorite 数据，不提供旧规则兼容或回显。

### 5.2 Bounds 读取

新增受认证保护的轻量 PBS API，由 Pairing editor 与 Search Pairings editor 共用。响应仅包含当前上下文的数值边界：

```ts
{
  minMinutes: 45,
  maxMinutes: 260 | null
}
```

请求必须显式携带或从既有页面上下文取得 `periodCode`，服务端使用当前 actor 的 base / rank 解析实际 pool。页面不自行查询 live 数据，也不从 catalog 写死最大值。

## 6. 实现范围

### 6.1 Catalog、迁移与展示

- 更新 `packages/contracts/pbs-pairing-bids.*` 中 129 的名称、支持 operator 和默认值；默认 value 保持空，避免替用户填入阈值。
- 更新 `sql/seed/10-pbs-bid-property.sql` 与新增 forward migration：名称改为 `Time Between Flights`、operator 改为 `['<', '=', '>']`。
- 新 migration 幂等写入 dictionary 系统参数 `PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES=45`，不在前端 / 服务端散落 `45` 常量。
- Summary、卡片、Search Pairings 文案统一显示 `Time Between Flights`，不再显示 `Sit Length`。

### 6.2 Portal editor

- 新建或改造 129 专属 editor，复用 Month-End Carryover 的比较下拉 + 单值输入布局。
- 同一 editor 用于 Pairing 主页和 Search Pairings；不复制两套 state / validation。
- Action 默认 `award`、quantifier 默认 `any`；tiers 新建默认空。
- 切换 `< / = / >` 不残留无效字段；输入为空或越界时不可保存。

### 6.3 PBS Server

- 为 129 增加 bounds service / route：读取 dictionary 下限，使用 `lead()` 按 `(pairing_id, duty_seq)`、`seg_seq` 计算当前 pool 最大 interval。
- 在 `pairing-search-detail-conditions` 增加 129 分支：使用同一 interval source query，分别实现 `Any` 的 `exists` 与 `Every` 的“存在 interval 且不存在不满足 interval”。
- 条件比较复用 `buildDurationCompareClause`，从而正确支持 `<`、`=`、`>`。
- 现有 145 / 146 的 Connection Time 已使用相同的 `lead(s.sch_str_dt_utc) - s.sch_end_dt_utc` 计算式；可抽出最小的共享 interval query helper，避免复制 SQL，但不修改其现有业务语义。
- crew bid importer 同时识别历史 `Any/Every Sit Length`，并保留原文中的 `Any` 或 `Every`，不再一律写成 `any`。

## 7. 方案比较

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 服务端动态上限 + 单值比较输入 | **采用** | 完整满足 Jen 的下限、数据驱动上限与 Any/Every 语义；界面与 Month-End Carryover 一致。 |
| 在静态 catalog 写固定最大值 | 不采用 | pairing 更新后会立刻失真，且不符合“reading it directly from the pairings”。 |
| 增加 `Between` 让用户填写 bid range | 不采用 | 增加未要求的复杂度，且把系统允许边界误变成用户业务条件。 |

## 8. 验收标准与测试

### 自动化测试

1. Contract / catalog：129 名称、`< = >`、默认 action / quantifier、duration payload。
2. Portal Vitest：新建为空、operator 切换、bounds loading、`00:44` / 大于 max 禁用、`00:45` / max 启用、Search Pairings 同 editor 回显。
3. Server Vitest：bounds SQL 的 pool scope、interval SQL、Any / Every、`< = >`、没有 interval 的 pairing、Avoid 包装。
4. Importer Vitest：`Any Sit Length`、`Every Sit Length`、`< = >` 的保留与迁移后的 129 映射。
5. Playwright：从真实 Pairing 页面打开条件，验证 `< / = / >`、动态 bounds、footer 禁用/启用、保存后在当前规则与 Search Pairings 都能正确回显。
6. QA 文档：新增 `docs/test-cases/pbs/pairing/2026-07-14-time-between-flights.md`，覆盖正常、边界、无 interval 和历史规则回显。

### 交付命令

最小验证顺序：focused Portal Vitest、focused pbs-server Vitest、对应 Playwright、`npm --prefix pbs-portal run lint -- --quiet`、`npm --prefix pbs-portal run build`、`npm run check:ui`、`git diff --check`。涉及 migration 时再执行远端只读验证与用户明确授权的 migration 执行。

## 9. 风险与性能

- 动态上限不能扫描不相关 period / base 的全表；必须复用 pairing preview 的 scope，并以 `pairing_segment(pairing_id, duty_seq, seg_seq)` 的既有唯一索引支持窗口排序。
- bounds 只返回两个数字，不传输 pairing 明细；这不会影响 Pairing 页面首屏。
- 时间范围由后端权威校验，前端仅提供即时反馈，避免绕过 UI 的请求写入越界值。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: catalog、editor、bounds、筛选 SQL 和 payload 同属 129 的单一契约，拆分会造成接口和状态竞争，协调成本高于并行收益。
- Suggested split: 不适用。
- Write boundaries: 不适用。
- Conflict risk: 高；多个实现者会同时修改同一 contract、editor 与条件构建文件。
- Execution gate: 用户审阅本 spec 并明确批准后，才开始实现；不会自动提交 Git 或执行 migration。

## 11. 已确认的上线数据策略

用户已确认：**清空并改名**。

- forward migration 将清空旧 `property_code=129` 的已保存 bid condition / bid group，以及引用 129 的 pairing favorite；清理后再删除空 bid container，范围仅限该 property。
- `pbs_bid_property.property_code=129` 改名为 `Time Between Flights`。
- 不保留旧 129 数据兼容或回显路径；本次上线以新的 129 规则为准。

## 12. 单值时长输入防呆（已确认）

本节仅优化输入行为；不改变 129 的 UI 布局、`< / = / >` 比较符、单值时长 payload 或 Any/Every 业务语义。

- `TIME BETWEEN FLIGHTS` 继续是一个单值输入框。范围文字 `00:45 – 04:45` 只表示当前允许的输入边界，不是用户应填写的区间。
- 输入框只接收一个最多四位的数字序列。键盘输入或粘贴中的 `-`、`–`、空格、冒号和其他非数字字符都会被拦截/剔除，不能形成 `0045-2405` 这类伪区间。
- 数字按四位时长格式化：`0045` 存为 `00:45`。未满四位时只存在于前端 draft，`Add Bid` / `Save Favorite` 继续禁用，不能送入保存或预览请求。
- 输入超过四位时保留前四位；格式化后的单值仍沿用现有动态下限/上限校验。footer 的禁用逻辑不变。
- 载入既有合法值时统一格式化为四位形式，例如 `1:05` 显示为 `01:05`；用户继续编辑不会退化成三位数字。

### 验收补充

1. 输入 `0045` 后，value 为 `00:45`，可以参与原有范围校验。
2. 输入或粘贴 `0045-2405`、`00:45`、`00 45` 时，最终框内只能保留一个四位数值并格式化为 `00:45`。
3. `< / = / >`、Any/Every、Award/Avoid、payload 类型和 Search Pairings 的筛选语义完全不变。
4. 载入 `1:05` 时显示 `01:05`；输入 `004` 时 footer 仍禁用，且不会发出保存或 preview 请求。
