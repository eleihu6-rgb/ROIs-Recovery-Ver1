# PBS Credit Priority 选择与算法导出设计

## 背景

客户对 `Configure Pairing Bid` 中的 credit 类条件提出语义问题：例如 `Pairing Total Credit > 08:00`、`Average Daily Credit Between 04:00 and 07:30` 命中一批 pairing 后，算法是否应该在命中集合里优先考虑 credit hour 更高或更低的 pairing。

当前系统只保存筛选条件本身，并在 `PAIRING_SCORE.csv` / `RESERVE_SCORE.csv` 中输出 `T1-T7` 的 Award / Avoid counter。它不能表达“这个条件命中后还希望 credit 更高优先”或“偏好低 credit”。

用户确认：不要让系统按 operator 自动猜测，而是在页面上由用户显式选择 `Higher` / `Lower`。用户不选择时不产生默认 credit priority。

## 目标

- 在支持 credit priority 的条件配置弹窗中增加两个选择按钮：`Higher`、`Lower`。
- 默认不选；不选时导出字段为 empty array：`[]`。
- 用户选择后保存到 bid 数据，后续编辑 existing property 或 favorite 时可以回显。
- 算法导出新增字段：
  - `Award_Higher_Credit_Tiers`
  - `Avoid_Higher_Credit_Tiers`
- 导出时直接根据保存的选择生成算法需要的 list(int) 格式，不在导出时再猜测 operator 语义。

## 非目标

- 不改变现有 Pairing / Reserve 条件筛选逻辑。
- 不改变 `T1_Award_Counter` / `T1_Avoid_Counter` 等 counter 的既有计算。
- 不新增 `Award_Lower_Credit_Tiers` 或 `Avoid_Lower_Credit_Tiers` 字段。
- 不把所有 credit 条件默认标记为 higher credit；必须用户显式选择。
- 不把 `Higher` / `Lower` 塞入 `param_c`，避免和现有 `any/every`、pairing label 等用途冲突。

## 用户交互设计

在 `Configure Pairing Bid` 弹窗中，对支持 credit priority 的 property 显示一个区域：

```text
CREDIT PRIORITY
[ Higher ] [ Lower ]
```

交互规则：

- `Higher` 和 `Lower` 互斥。
- 默认两个都不选。
- 点击 `Higher` 后，bid 保存 `creditPriority = "higher"`。
- 点击 `Lower` 后，bid 保存 `creditPriority = "lower"`。
- 再次点击已选按钮，取消选择，bid 不带 `creditPriority`。
- 保存为 favorite、从 favorite 打开、existing property 编辑时，必须保留并回显该选择。

## 支持范围

第一阶段建议覆盖已经明确属于 Pairing credit / credit density 语义的属性：

- `Pairing Total Credit`，propertyCode `105`
- `Average Daily Credit`，propertyCode `109`
- `Average Daily Block Time`，propertyCode `121`
- `Credit Per Time Away From Base`，propertyCode `125`
- `Pairing Total Block Time`，propertyCode `127`

其他属性是否启用由后续业务确认后加入配置，不在算法导出里硬编码散落判断。

Reserve 第一阶段先保证 `RESERVE_SCORE.csv` 表头包含同样两个字段，并在没有 Reserve credit priority 数据时输出 `[]`。如果后续 Reserve 页面出现可配置的 credit priority 条件，应复用同一套 metadata 和导出聚合逻辑。

## 数据模型设计

当前 `pbs_bid_group` 以 `operator / param_a / param_b / param_c` 保存条件参数。`param_c` 已经用于部分 Pairing 条件的 `any/every` quantifier 或其他补充值，因此不适合继续塞 `Higher` / `Lower`。

建议新增专用元数据列，例如：

```sql
alter table pbs_bid_group
  add column if not exists preference_json jsonb;
```

保存格式：

```json
{
  "creditPriority": "higher"
}
```

或：

```json
{
  "creditPriority": "lower"
}
```

未选择时：

- 前端 bid 可以不带 `creditPriority`。
- 后端保存时 `preference_json` 为 `null` 或 `{}`。
- 导出时按空数组处理。

类型层面建议增加：

```ts
type CreditPriority = "higher" | "lower";
```

并允许支持的 bid value 携带：

```ts
creditPriority?: CreditPriority;
```

## 导出字段设计

`PAIRING_SCORE.csv` 和 `RESERVE_SCORE.csv` 表头调整为：

```text
Crew_ID,Pairing_ID,Interface_ID,Award_Higher_Credit_Tiers,Avoid_Higher_Credit_Tiers,T1_Award_Counter,T1_Avoid_Counter,...
```

字段格式：

- `Award_Higher_Credit_Tiers`: JSON-like list(int)，例如 `[1,2,3]`
- `Avoid_Higher_Credit_Tiers`: JSON-like list(int)，例如 `[1,3]`
- 没有命中时输出 `[]`
- tier 去重并按数字升序输出

## 导出映射规则

对每个命中的 crew + pairing/reserve row：

### 未选择

如果保存的 bid 没有 `creditPriority`：

```text
Award_Higher_Credit_Tiers = []
Avoid_Higher_Credit_Tiers = []
```

### Higher

如果 `creditPriority = "higher"`：

- `action = Award`：该 tier 写入 `Award_Higher_Credit_Tiers`
- `action = Avoid`：该 tier 写入 `Avoid_Higher_Credit_Tiers`

### Lower

用户确认采用方案 1：不新增 lower-credit 字段，`Lower` 通过现有 higher-credit 字段做交叉表达。

如果 `creditPriority = "lower"`：

- `action = Award`：表示想 award 低 credit，等价于避免高 credit；该 tier 写入 `Avoid_Higher_Credit_Tiers`
- `action = Avoid`：表示想 avoid 低 credit，等价于偏好高 credit；该 tier 写入 `Award_Higher_Credit_Tiers`

因此完整映射表为：

| Action | Credit Priority | 导出字段 |
|--------|-----------------|----------|
| Award | Higher | `Award_Higher_Credit_Tiers` |
| Avoid | Higher | `Avoid_Higher_Credit_Tiers` |
| Award | Lower | `Avoid_Higher_Credit_Tiers` |
| Avoid | Lower | `Award_Higher_Credit_Tiers` |

## 示例

保存条件：

- T1: `Award Pairing Total Credit > 08:00`, `Higher`
- T2: `Avoid Pairing Total Credit > 08:00`, `Higher`
- T3: `Award Average Daily Credit Between 04:00 and 07:30`, `Lower`
- T4: `Avoid Average Daily Credit < 06:00`, `Lower`
- T5: `Award Average Daily Credit > 06:00`, 未选择

某个 crew/pairing 命中这些条件时：

```text
Award_Higher_Credit_Tiers = [1,4]
Avoid_Higher_Credit_Tiers = [2,3]
```

解释：

- T1 `Award + Higher`：想 award 高 credit，写入 `Award_Higher_Credit_Tiers`。
- T2 `Avoid + Higher`：想 avoid 高 credit，写入 `Avoid_Higher_Credit_Tiers`。
- T3 `Award + Lower`：想 award 低 credit，等价于避免高 credit，写入 `Avoid_Higher_Credit_Tiers`。
- T4 `Avoid + Lower`：想 avoid 低 credit，等价于偏好高 credit，写入 `Award_Higher_Credit_Tiers`。
- T5 未选择 credit priority，不写入任何 credit priority 字段。

## 兼容性

- 旧数据没有 `preference_json`，导出为 `[]`。
- 现有 counter 输出保持不变。
- 现有 Pairing 搜索、preview、favorite、existing property 编辑不应因未选择 credit priority 而改变行为。
- 如果导出字段新增后算法侧暂时未读取，字段仍为稳定格式，不影响 CSV 解析。

## 测试计划

- 前端：
  - `Pairing Total Credit` 弹窗显示 `Higher / Lower`。
  - 默认两个按钮都不选。
  - 选择 `Higher` 后保存，再编辑 existing property 能回显。
  - 选择 `Lower` 后保存，再编辑 existing property 能回显。
  - favorite 保存和回显保留 `creditPriority`。
  - 不支持 credit priority 的属性不显示该区域。
- 后端：
  - 保存 pairing property 时写入 `preference_json`。
  - 读取 draft / favorite 时回填 `creditPriority`。
  - 未选择时导出 `[]`。
  - `Award + Higher` 写入 `Award_Higher_Credit_Tiers`。
  - `Avoid + Higher` 写入 `Avoid_Higher_Credit_Tiers`。
  - `Award + Lower` 写入 `Avoid_Higher_Credit_Tiers`。
  - `Avoid + Lower` 写入 `Award_Higher_Credit_Tiers`。
  - 多个 tier 命中时去重、升序输出。
- 回归：
  - `PAIRING_SCORE.csv` 原 counter 结果不变。
  - `RESERVE_SCORE.csv` 原 counter 结果不变。
  - 旧 bid 数据可以正常导出。

## 待确认

- 第一阶段是否只做 Pairing 页面 UI，并让 `RESERVE_SCORE.csv` 先输出空数组字段。
- `preference_json` 列名是否接受，或是否希望使用更业务化的名称，例如 `algorithm_preference_json`。
- `Lower` 已确认采用交叉映射：`Award + Lower` -> `Avoid_Higher_Credit_Tiers`，`Avoid + Lower` -> `Award_Higher_Credit_Tiers`。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该需求同时涉及前端配置 UI、后端保存/读取、数据库迁移、算法导出和测试，边界可以拆开。
- Suggested split:
  - Agent A：前端 Pairing 配置弹窗、类型、回显和页面测试。
  - Agent B：后端数据模型、保存/读取、schema migration 和 API 测试。
  - Agent C：算法导出字段、CSV 聚合和导出测试。
- Write boundaries:
  - Agent A 只写 `pbs-portal/src/features/pairing/**` 和前端 contracts 类型消费。
  - Agent B 只写 `pbs-server/src/services/pairing/**`、models、migration。
  - Agent C 只写 `pbs-server/src/services/algorithm-export/**` 和导出测试。
- Conflict risk: Medium。contracts 类型和 bid serialization 是共享边界，需要主 agent 统一集成。
- Execution gate: 用户审阅并确认本 spec 后再进入实现。
