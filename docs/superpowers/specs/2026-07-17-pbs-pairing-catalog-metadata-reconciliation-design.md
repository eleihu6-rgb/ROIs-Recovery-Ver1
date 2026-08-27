# PBS Pairing 条件 Catalog Metadata 补迁移设计

> 日期：2026-07-17  
> 状态：已实施并执行  
> 执行范围：`f8_pbs`、`f8_sit_pbs`、`f8_uat_pbs`

## 执行结果

- 隔离 schema fixture、首次执行验证、第二次幂等验证全部通过。
- `f8_pbs`：删除 97 个非法 rule group、1 个非法 configured favorite；保留合法新格式与 112 legacy 数据。
- `f8_sit_pbs`：删除 98 个非法 rule group、1 个非法 configured favorite；保留 112 legacy 数据。
- `f8_uat_pbs`：删除 98 个非法 rule group、1 个非法 configured favorite；保留 112 legacy 数据。
- 三个 schema 第二次执行均为：0 个非法 rule key、0 个 group 删除、0 个 favorite 删除、0 个 metadata 更新。
- 三个 schema 的 103/107/112 最终 metadata 完全一致。
- 未创建 Git commit。

## 1. 背景

Portal、Server 与共享 contracts 已完成以下三个 Pairing 条件的产品行为升级，但数据库 `pbs_bid_property` 以及基础 seed 仍保留旧 metadata：

1. `103` Pairing Check-In / Check-Out Time
   - 当前代码支持 `Specific Dates` 多选与 `Date Range`。
   - 数据库仍声明 `dateScope: ["specific_date","date_range"]`。
2. `107` Flight Legs per Duty
   - 当前代码支持 `< / = / > / Between`、`1..8` legs、`Specific Dates / Date Range`。
   - 数据库仍只有 `< / = / >`，validation 只有 `min: 1`，缺少 `max` 与日期能力。
3. `112` Pairing Length
   - 当前代码支持 Min/Max days，以及 Pairing Start Date 的 `Specific Dates / Date Range`。
   - 数据库仍用 `dateScope: "pairing_start_date_range"` 描述为仅日期范围。

三个目标 PBS schema 的 catalog 最终状态一致，说明问题不是某一个环境少执行了已有脚本，而是上述行为升级后没有补写对应的前向 migration。

数据库没有 migration ledger，本设计以目标 schema 的最终状态、现有 migration 内容和当前代码契约为审计依据。

## 2. 目标

新增一个事务化、幂等的前向 migration，使 `103 / 107 / 112` 的数据库 catalog 与当前代码契约一致，并同步修正 `sql/seed/10-pbs-bid-property.sql`。

执行 migration 前先审计现有规则与 configured favorite：

- 合法的当前格式数据全部保留。
- 只删除明确不符合当前契约的数据。
- 不因 catalog metadata 落后而清空全部规则。
- 简单 property favorite 不保存 payload，不属于不兼容数据，必须保留。

## 3. 非目标

- 不修改 Portal、Server、Live Server 或共享 contracts 的业务行为。
- 不新增表、字段、索引或第三方依赖。
- 不修改 `property_code`、稳定 `pbs_bid_property.id`、可见性、推荐顺序或 Award/Avoid 能力。
- 不重写合法 payload，不把旧 payload自动转换为新 payload。
- 不重新执行历史破坏性 migration。
- 不提交 Git；只有用户再次明确要求时才提交。

## 4. 方案选择

### 方案 A：直接删除 103/107/112 的所有规则与收藏

优点是实现简单，数据库只剩新数据。缺点是会删除当前代码已经能够正确读取和计算的合法规则；如果目标 property 作为附加条件存在，还必须删除整个 `property_group_key`，误删范围更大。

### 方案 B：只更新 catalog，不检查业务数据

优点是风险最低、执行最快。缺点是无法兑现“项目未上线，不兼容旧数据”的约束；若数据库中确有非法旧 payload，它们会继续存在。

### 方案 C：先验证，再只删除非法数据，最后更新 catalog（采用）

该方案把 catalog 对齐与旧数据清理分开处理：

1. 预检并分类当前 payload。
2. 合法数据保留。
3. 非法 configured favorite 单独删除。
4. 非法 group 或 condition 按完整 `property_group_key` 删除。
5. 更新 catalog metadata。

它同时满足“不兼容非法旧数据”和“不误删合法新数据”。

## 5. Catalog 最终定义

### 5.1 Property 103

```json
{
  "type": "pairing-check-time",
  "timeType": ["check_in", "check_out"],
  "timeWindow": ["=", "<", ">", "Between"],
  "dateScope": ["specific_dates", "date_range"]
}
```

- `operator_options`：`["=","<",">","Between"]`
- tooltip：说明可按 Check-In / Check-Out time 限制，并可选 Pairing Date。

### 5.2 Property 107

```json
{
  "type": "flight-legs-per-duty",
  "label": "Legs",
  "min": 1,
  "max": 8,
  "dateScope": ["specific_dates", "date_range"]
}
```

- `operator_options`：`["<","=",">","Between"]`
- 保留 `any_or_every = ["any","every"]`
- tooltip：说明按每个 duty 的 FLY legs 数量匹配，并可选 Event Date。

### 5.3 Property 112

```json
{
  "type": "pairing_length_preference",
  "label": "Days",
  "min": 1,
  "max": 7,
  "dateScope": ["specific_dates", "date_range"]
}
```

- `operator_options`：`null`
- tooltip：说明按 Pairing Length 匹配，并可选 Pairing Start Date。

## 6. 业务数据预检与删除边界

### 6.1 需要检查的数据

1. `pbs_bid_group`
   - 主 property 通过 `property_definition_id` 定位，同时兼容核查 legacy `property_id`。
   - 103/107 与 112 专用格式应为 `operator = 'Json'`，JSON 位于 `param_a`；112 当前 Server 仍接受的 legacy `stepper / stepper-range` 按其非 JSON 存储格式单独验证。
2. `pbs_bid_condition`
   - 若 103/107/112 作为附加条件出现，也按同一 payload 规则检查。
3. `pbs_bid_pairing_configured_favorite`
   - 通过稳定 `property_id` 和兼容 `property_code` 定位。
   - JSON 位于 `bid_payload`。
4. `pbs_bid_pairing_favorite`
   - 仅保存 property 收藏关系，没有配置 payload；始终保留。

### 6.2 当前契约判定

所有 JSON 文本先使用 PostgreSQL 16 的安全输入检查能力判定是否可解析；畸形 JSON 直接归类为非法数据，不允许未经保护地执行 `param_a::jsonb`。

除 payload 本身外，还必须按存储载体检查：

| Property | Group action / quantifier | Configured favorite action / quantifier |
|---|---|---|
| 103 | `action_id in (1,2)`；`param_c is null` | `action in ('award','avoid')`；`quantifier is null` |
| 107 | `action_id in (1,2)`；`param_c in ('any','every')` | `action in ('award','avoid')`；`quantifier in ('any','every')` |
| 112 | `action_id in (1,2)`；`param_c is null` | `action in ('award','avoid')`；`quantifier is null` |

仅当 payload 含非空 `dateScope` 时，日期还必须结合所属 `pbs_bid.period_code` 复现当前 `isIsoDateInPeriod()` 语义：月份取 period code 的前三位英文月份缩写，年份取第二段；每个日期必须位于该月份。此时无法解析的 period code 或跨周期日期视为非法数据。`dateScope = null` 时不解析 period code，异常 period code 不影响该规则。

#### 103 Pairing Check-In / Check-Out Time

- `type = "pairing-check-time"`。
- `timeType` 为 `check_in` 或 `check_out`。
- operator 为 `= / < / > / Between`。
- 单值 operator 必须有合法 `HH:MM value`。
- `Between` 必须有合法 `HH:MM from/to`。
- `dateScope` 可为 `null`：
  - `specific_dates` 必须为至少一个合法 ISO 日期；
  - `date_range` 必须有合法 `from/to` 且 `from <= to`。
- `specific_date` 以及其他 date mode 视为旧格式，不自动转换。
- 单值分支只允许顶层 key：`type / timeType / operator / value / dateScope`。
- `Between` 分支只允许顶层 key：`type / timeType / operator / from / to / dateScope`。
- 未知 key 或单值/Between 互斥字段残留均视为非法。

#### 107 Flight Legs per Duty

- `type = "flight-legs-per-duty"`。
- operator 为 `< / = / > / Between`。
- 单值 operator 的 `legs` 必须为 `1..8` 的整数。
- `Between` 的 `from/to` 必须为 `1..8` 的整数且 `from <= to`。
- `dateScope` 与 103 使用相同的 `specific_dates / date_range` 校验。
- group 的量词必须为 `any` 或 `every`。
- 单值分支只允许顶层 key：`type / operator / legs / dateScope`。
- `Between` 分支只允许顶层 key：`type / operator / from / to / dateScope`。
- 未知 key 或单值/Between 互斥字段残留均视为非法。

#### 112 Pairing Length

- `type = "pairing-length-preference"`。
- `minDays / maxDays` 至少一个非空，非空值必须为 `1..7` 的整数。
- 两者同时存在时必须 `minDays <= maxDays`。
- `dateScope` 可为 `null`，非空时仅接受合法 `specific_dates / date_range`。
- 专用格式只允许顶层 key：`type / minDays / maxDays / dateScope / min / max`。
- 当前 Server 仍明确接受 legacy `stepper / stepper-range`，本 migration 不修改 Server，因此这两种格式继续视为可保留数据：
  - group 的 legacy 非 JSON 存储只按当前通用 route schema 要求验证整数 shape；
  - configured favorite 的 `stepper / stepper-range` JSON 只按当前通用 bid shape 验证整数字段；
  - 不额外施加 `1..7` 边界，也不要求 `stepper-range.from <= to`，因为当前 Server 对 legacy shape 没有这些限制；
  - 不在本 migration 中自动转换。
- 若后续决定彻底移除 112 legacy compatibility，必须单独修改 Server、contracts/测试，再用新的 migration 清理；不能在本次 metadata 补迁移中提前删除。

### 6.3 删除规则

- configured favorite 的 payload 非法：只删除该 favorite。
- group 主条件非法：删除该 bid 下所有 tier 中同一 `property_group_key` 的完整规则。
- 附加 condition 非法：同样删除完整 `property_group_key`，不得只删 condition 后扩大规则含义。
- 删除 group 前显式删除其 condition；`pbs_bid_pairing_occurrence` 由 group FK cascade 清理。
- 删除后重算受影响 `pbs_bid_tier.total_groups` 与 `pbs_bid.total_tiers`。
- 删除已经没有 group 或 day-off 的空 tier。
- 仅在 bid 已没有任何 group、day-off、occurrence，以及任何 Pairing / Days Off / Reserve / Line configured favorite、简单 favorite 或通用 property favorite 时，才删除空 bid container。
- 其他 property、其他 `property_group_key`、简单 favorite 和合法 configured favorite 必须保留。

如果预检结果为零条非法数据，migration 只更新 metadata，不删除业务数据。

## 7. Migration 结构

新增：

`sql/migration/2026-07-17-pbs-pairing-catalog-metadata-reconciliation.sql`

事务顺序：

1. `begin`。
2. 校验 103/107/112 catalog identity 各且仅各存在一条。
3. 创建临时表，记录非法 configured favorites、非法 group keys、受影响 bids/tiers。
4. 输出预检计数。
5. 删除非法 configured favorites。
6. 删除非法完整 rule groups 及关联 condition。
7. 重算 `total_groups / total_tiers`，并按严格空容器条件清理空 tier 与空 bid。
8. 更新 103/107/112 metadata 与 tooltip。
9. 断言最终 metadata 精确匹配预期。
10. 输出实际删除与更新计数。
11. `commit`。

稳定 `property_definition_id/property_id` 为权威 identity。legacy `property_id/property_code` 只用于一致性审计，不使用宽松 OR 直接扩大删除范围：

- 稳定 ID 指向 103/107/112 且 legacy code 一致：进入对应 payload 检查。
- 稳定 ID 与 legacy code 冲突：单独计数并 fail-fast，事务回滚，等待人工确认。
- 完整规则的稳定删除键固定为 `(bid_id, bid_type, property_group_key)`，不能只按 `property_group_key` 字符串删除。

## 8. 幂等性与失败处理

- 第二次执行时：
  - 已删除的非法数据不会再次命中；
  - metadata 使用 `IS DISTINCT FROM` 判断，只在值不同的时候更新；
  - 所有删除计数与 metadata 更新计数应为 0。
- 畸形 JSON 属于预期的非法数据，安全判定后进入删除集合，不触发 migration 失败。
- catalog identity 冲突、stable/legacy identity 冲突、删除边界断言或最终 metadata 断言失败时，事务整体回滚。
- migration 不吞掉异常，不做自动重试。
- 每个 schema 独立执行；一个 schema 失败时停止后续环境执行并报告，不继续带错运行。

## 9. Seed 对齐

修改 `sql/seed/10-pbs-bid-property.sql` 中 103/107/112 的当前 Pairing catalog 覆盖定义，使全新 schema 在 seed 后直接得到本设计第 5 节的最终 metadata。

不修改文件前部历史/示例 catalog 区域的业务编码含义；以当前 Jen Pairing catalog consolidation 使用的覆盖定义为准。若同一 seed 中后续 upsert 会再次覆盖 103/107/112，则所有最终写入点必须一致，避免 seed 自身回退。

## 10. 测试与验证

新增 SQL fixture 和验证脚本：

- `sql/migration/tests/2026-07-17-pbs-pairing-catalog-metadata-reconciliation-fixture.sql`
- `sql/migration/tests/2026-07-17-pbs-pairing-catalog-metadata-reconciliation-verify.sql`
- `sql/migration/tests/2026-07-17-pbs-pairing-catalog-metadata-reconciliation-verify-second-run.sql`

覆盖：

1. 三个 property 的合法 group 与合法 configured favorite 均保留。
2. 103 `specific_date`、非法时间和非法日期被识别为旧/非法数据。
3. 107 非法 operator、越界 legs、倒序 Between、非法量词与非法日期被识别。
4. 112 专用格式的空 Min/Max、越界、倒序 Min/Max 与非法日期被识别；当前 Server 接受的 legacy `stepper / stepper-range` 全部保留，包括超出 `1..7` 或倒序的 legacy 整数数据。
5. target property 作为附加 condition 非法时删除完整 group key。
6. 同一 bid 中其他 group 保留。
7. 简单 favorite 保留，非法 configured favorite 只删除自身。
8. 空 bid 清理边界正确。
9. metadata 与 seed 最终值精确一致。
10. migration 第二次执行零变更。
11. malformed JSON、`operator <> 'Json'`、未知顶层字段、互斥字段残留均按各 property 的规则处理。
12. group 与 configured favorite 的 action/quantifier 分别覆盖合法与非法组合。
13. 日期覆盖当前 period、跨 period 与无法解析 period code。
14. stable/legacy identity 冲突必须 fail-fast，且不发生业务删除。
15. `dateScope = null` 且 period code 无法解析时，规则仍保留。

实现后先在隔离测试 schema 双跑，再执行目标 schema。

## 11. 目标环境执行

用户已经授权执行本设计 migration。验证通过后按以下顺序串行执行：

1. `f8_pbs`
2. `f8_sit_pbs`
3. `f8_uat_pbs`

每个 schema：

1. 执行前只读查询并记录合法/非法 group、condition、favorite 数量。
2. 使用 `ON_ERROR_STOP=1` 执行 migration。
3. 查询 103/107/112 最终 metadata。
4. 核对删除计数与预检一致。
5. 再执行一次 migration 验证幂等；第二次必须零业务删除、零 metadata 更新。

数据库密码只通过交互或已有环境变量提供，不写入命令回执、代码、spec 或日志。

## 12. 验收标准

- 三个 schema 的 103/107/112 metadata 与第 5 节完全一致。
- seed 与 migration 的最终定义一致。
- 合法 rules/favorites 保留。
- 明确不符合当前契约的数据已清除。
- 其他 property 和其他 group key 不受影响。
- migration 在隔离 schema 和三个目标 schema 第二次执行均为零变更。
- SQL fixture/verify/second-run 全部 PASS。
- `git diff --check` PASS。
- 没有未经用户授权的 Git commit。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: migration、fixture、seed 与三个 schema 执行共享同一数据契约，且数据库写入必须串行完成。
- Suggested split: 不拆分；由同一实现者完成 SQL、测试、执行与结果核对。
- Write boundaries: `sql/migration/**`、`sql/migration/tests/**`、`sql/seed/10-pbs-bid-property.sql`。
- Conflict risk: 高；并行编辑或并行执行可能造成预检计数失真、重复删除或测试夹具冲突。
- Execution gate: 用户审阅并明确批准本 spec 后开始实现；数据库执行授权已包含在本轮请求中，但仍以代码与 SQL 测试通过为前提。
