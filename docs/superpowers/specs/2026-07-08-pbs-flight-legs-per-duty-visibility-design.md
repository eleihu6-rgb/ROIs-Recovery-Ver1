# PBS Flight Legs per Duty 条件精简设计

日期：2026-07-08  
状态：已实施，远端 DB 变更已执行
范围：PBS Portal Pairing 条件中 `107 / 108 / 124 / 130` 的名称与可见性调整。

## 背景

Jen 在 `init-docs/Jenife_Bidding_Type_Clarification_20260707.docx` 中对 Pairing bids 提出精简建议：

- `Total Legs In Pairing`
- `Total Legs In First Duty`
- `Total Legs In Last Duty`

这些条件对普通用户理解成本较高，可以由更直观的 duty-level leg 条件覆盖大部分真实使用场景。Jen 的表述是：用户主要想控制的是每天 / 每个 duty 的 flight leg 数，例如避免 4-leg days。因此保留 duty-level 条件，并改名为 `Flight Legs per Duty`。

当前系统中相关 Pairing property 为：

| code | 当前条件 | 当前实现语义 | Jen 方向 |
|---:|---|---|---|
| 107 | `Any/Every Duty Legs` | 按每个 `duty_seq` 统计 leg 数，支持 Any / Every。 | 保留并改名为 `Flight Legs per Duty` |
| 108 | `Total Legs In Pairing` | 统计整个 pairing 的总 leg 数。 | 隐藏 |
| 124 | `Total Legs In First Duty` | 只统计第一个 duty 的 leg 数。 | 隐藏 |
| 130 | `Total Legs In Last Duty` | 只统计最后一个 duty 的 leg 数。 | 隐藏 |

## 当前实现口径

### 107 `Any/Every Duty Legs`

当前后端按 `pairing_segment.duty_seq` 分组统计每个 duty 的 segment / leg 数。

- `Any`：存在任意一个 duty 满足比较条件。
- `Every`：所有 duty 都必须满足比较条件。
- 典型用途：`Avoid Any Duty Legs > 3`，表达避免任何 duty 出现 4 段或以上。

### 108 `Total Legs In Pairing`

当前后端统计一个 pairing 下所有未删除 `pairing_segment` 的总数。

### 124 `Total Legs In First Duty`

当前后端统计 `duty_seq = 1` 的 segment / leg 数。

### 130 `Total Legs In Last Duty`

当前后端先找该 pairing 的最大 `duty_seq`，再统计该最后 duty 的 segment / leg 数。

这些条件不是数学上完全等价，但从 Jen 的产品简化目标看，`107` 是更符合用户心智的主入口。

## 目标

1. 将 Pairing property `107` 的展示名从 `Any/Every Duty Legs` 改为 `Flight Legs per Duty`。
2. 保留 `107` 的现有行为：
   - `Award / Avoid`
   - `Any / Every`
   - `= / < / >`
   - stepper 数值输入
   - Pairing Search / Current Rules / 保存读取逻辑不变
3. 通过数据库字段隐藏：
   - `108 Total Legs In Pairing`
   - `124 Total Legs In First Duty`
   - `130 Total Legs In Last Duty`
4. 不在前端或后端写 code-level 黑名单控制显示。
5. 延续 Airport Preference 本轮规则：旧数据直接清理，不做兼容迁移。

## 非目标

- 不新增 `107` 的 date range / specific date 能力；Jen 提到的日期扩展后续单独设计。
- 不改变 `107` 当前 SQL 匹配逻辑。
- 不把 `108 / 124 / 130` 自动转换为 `107`。
- 不删除 contract 中的旧 property 定义，避免历史解析、测试和导出代码出现不可预期断裂。
- 不处理其他 Pairing 条件，如 Check-In / Check-Out Time、Work Day Preference、Redeye、Deadhead flying 等。

## 设计约束

显示隐藏必须由数据库控制：

- `pbs_bid_property.is_visible_in_portal`
- `pbs_bid_property.recommended_order`
- `pbs_bid_property.recommended_usage_count`

禁止实现方式：

- 前端 hard-code `[108, 124, 130]` 过滤。
- 后端 hard-code `[108, 124, 130]` 从 catalog 删除。
- 在 UI 组件内根据名字隐藏。

允许实现方式：

- seed / migration 更新 `pbs_bid_property`。
- 前端和后端继续使用当前 catalog 读取链路：
  - 后端从 DB 读取 `is_visible_in_portal = 1` 的 property catalog。
  - 前端只渲染后端返回的 catalog。

## 推荐方案

### DB 变更

新增 migration，例如：

`sql/migration/2026-07-08-pbs-flight-legs-per-duty-visibility.sql`

内容：

1. 更新 `107`：
   - `property_name = 'Flight Legs per Duty'`
   - `is_visible_in_portal = 1`
   - 保留原 `award_or_avoid / any_or_every / operator_options / validation_json / display_order`
2. 隐藏 `108 / 124 / 130`：
   - `is_visible_in_portal = 0`
   - `recommended_order = null`
   - `recommended_usage_count = null`
3. 清理旧数据：
   - 删除 `pbs_bid_pairing_configured_favorite` 中 property code 为 `108 / 124 / 130` 的记录。
   - 删除 `pbs_bid_pairing_favorite` 中 property code 为 `108 / 124 / 130` 的记录。
   - 删除 `pbs_bid_group` / `pbs_bid_condition` 中包含 `108 / 124 / 130` 的整个 pairing rule group。
4. 不清理 `107` 数据，只让它继续以新名称显示。

### Seed 同步

更新 `sql/seed/10-pbs-bid-property.sql`，确保重新 seed 后不会把状态覆盖回旧值：

- `107` 的 `property_name` 写为 `Flight Legs per Duty`。
- `108 / 124 / 130` 在最终状态中 `is_visible_in_portal = 0`。
- `108 / 124 / 130` 不出现在推荐列表中。

### 代码与测试

如果只依赖 DB visibility，理论上不需要改运行时代码的显示逻辑。

需要更新的内容：

- Contract / catalog 中 `107` 的默认名称改为 `Flight Legs per Duty`，保证 mock / fallback / 测试文本一致。
- Portal mock / unit test / Playwright 断言中旧名称更新。
- 后端 route / validation / search 测试中涉及 `Any/Every Duty Legs` 的显示名更新。
- 如存在 test case 文档引用旧可见列表，需要同步说明 `108 / 124 / 130` 已隐藏。

## 旧数据处理

本 spec 采用“清理，不兼容”的假设，和 Airport Preference 本轮规则一致：

- 已保存的 `108 / 124 / 130` Existing bid 会被删除。
- `108 / 124 / 130` configured favorite 会被删除。
- 不把旧 `108 / 124 / 130` 自动转为 `107`，因为语义不完全等价：
  - 总 pairing leg 数不等价于 per-duty leg 数。
  - first duty / last duty leg 数也不等价于 any / every duty leg 数。

如果后续业务要求保留历史可读性，应单独设计只读历史展示，不在本轮实现。

## 验收标准

### DB 验收

执行后查询：

```sql
select property_code, property_name, is_visible_in_portal, recommended_order, recommended_usage_count
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code in (107, 108, 124, 130)
order by property_code;
```

预期：

| code | property_name | is_visible_in_portal | recommended_order |
|---:|---|---:|---|
| 107 | `Flight Legs per Duty` | 1 | 保持当前推荐策略，不强制推荐 |
| 108 | `Total Legs In Pairing` | 0 | null |
| 124 | `Total Legs In First Duty` | 0 | null |
| 130 | `Total Legs In Last Duty` | 0 | null |

### UI 验收

- Pairing 页面新增列表中能看到 `Flight Legs per Duty`。
- Pairing 页面新增列表中看不到：
  - `Total Legs In Pairing`
  - `Total Legs In First Duty`
  - `Total Legs In Last Duty`
- 打开 `Flight Legs per Duty` 配置弹窗，仍保留：
  - T1-T7
  - Award / Avoid
  - Any / Every
  - 比较符和值输入
- 保存 / favorite / preview 不因改名而失败。

### 后端验收

- `107` Pairing Search 条件仍按 duty-level leg count 生成 SQL。
- `108 / 124 / 130` 不再由 current visible catalog 返回。
- 旧 `108 / 124 / 130` favorite / rule group 已清理。

## 测试计划

最小测试：

1. DB 变更后执行 SQL 验收查询。
2. 清理 Redis pairing property catalog cache 或等待 TTL 过期。
3. `pbs-server`：
   - route / validation / pairing search 相关 targeted tests。
4. `pbs-portal`：
   - pairing catalog / mapper / bid control targeted tests。
5. Playwright：
   - Pairing condition 默认 favorite / visible catalog 流程。
   - 断言新名称可见、旧三个名称不可见。
6. `npm run check:ui`：
   - 本轮如不改 UI 样式，仍应保持 0 hard violations。

## 实施记录

2026-07-08 已执行远端 `f8_pbs` DB migration：

- `107` 已改名为 `Flight Legs per Duty`，`is_visible_in_portal=1`。
- `108 / 124 / 130` 已设为 `is_visible_in_portal=0`，且 `recommended_order` / `recommended_usage_count` 已清空。
- 旧 `108 / 124 / 130` 相关 rule group 已清理 `79` 条，影响 `65` 个 bid。
- 旧 `108 / 124 / 130` configured favorite / simple favorite / generic favorite 均为 `0`。
- 当前 Pairing 可见条件数为 `22`。
- Redis key `pbs:f8_pbs:pairing:property-catalog:v2` 已检查，不存在旧缓存。

## 风险

- `108 / 124 / 130` 与 `107` 不是完全等价；隐藏后用户失去精确表达 total / first / last duty legs 的入口。
- 若当前 DB 未执行 migration，页面仍会显示旧条件；必须在实施后做运行库查询。
- 若后端 Redis catalog cache 未过期，短时间内可能仍看到旧 catalog；实施后应清理对应 cache key 或重启服务。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮改动小，主要是 DB visibility、名称同步和测试文案。拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 处理 SQL、测试和必要文本同步。
- Conflict risk: 低。主要风险是误把显示隐藏写成代码黑名单。
- Execution gate: 已由用户确认并完成实施。
