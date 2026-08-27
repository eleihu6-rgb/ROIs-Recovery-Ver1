# PBS Line Commuter Pattern 条件设计

日期：2026-05-28  
状态：待用户确认  
范围：在 Line 模块新增一个用于表达整月 work/off block pattern 的条件；本文件只定义需求和方案，不包含实现改动。

## 背景

用户场景：

```text
Commuter – all days worked in a row all days off in a row – pattern – 5 on 4 off – 4 on 4 off etc.
```

这个需求不是 Pairing 条件，也不应该主要放在 Days Off：

- Pairing 负责筛选航班环，比如 credit、red eye、weekday、pairing length。
- Days Off 负责表达想休哪些天、至少连续休几天。
- Line 负责表达最终整个月 line 的结构。

`5 on / 4 off`、`4 on / 4 off` 这种 commuter pattern，本质是整个月的连续工作块和连续休息块结构，因此应该作为 Line 条件。

当前系统里接近但不准确的条件：

- Days Off `205 Days Off / Days On Pattern`：语义位置不对，只能辅助表达。
- 隐藏 AA Line `414 Work Block Size`：只有工作块大小，没有 off block。
- 隐藏 AA Line `416 Commutable Work Block`：偏 report/release 时间窗口，不是 work/off pattern。

## 目标

1. 在 Line 可见条件中新增一个 commuter pattern 条件。
2. 用它表达整月 line 结构偏好：
   - 连续工作天数范围。
   - 连续休息天数下限。
3. 支持典型配置：
   - `5 on / 4 off`
   - `4 on / 4 off`
   - `4-5 on / 4 off`
4. 条件参与 Line 的 Tier 分层，和其他 Line 条件一致。
5. 第一阶段只做 bid 表达、保存、校验和 UI，不实现最终 award/optimizer 的完整打分算法。

## 条件定义

推荐新增：

```text
408 Commuter Pattern
```

归属：

```text
bid_type = Line
source_type = legacy 或 app
is_visible_in_portal = 1
```

默认 bid 建议复用现有 `PairingBidValue` 类型：

```json
{
  "type": "days-off-on-pattern",
  "minDaysOff": 4,
  "minDaysOn": 4,
  "maxDaysOn": 5,
  "min": 1,
  "max": 14
}
```

解释：

- `minDaysOn`：连续工作块最少几天。
- `maxDaysOn`：连续工作块最多几天。
- `minDaysOff`：连续休息块至少几天。

典型映射：

| 用户说法 | bid 值 |
| --- | --- |
| `5 on / 4 off` | `minDaysOn=5`, `maxDaysOn=5`, `minDaysOff=4` |
| `4 on / 4 off` | `minDaysOn=4`, `maxDaysOn=4`, `minDaysOff=4` |
| `4-5 on / 4 off` | `minDaysOn=4`, `maxDaysOn=5`, `minDaysOff=4` |

## 不做范围

- 不把这个条件放到 Days Off。
- 不复用 `205 Days Off / Days On Pattern` 作为主要入口。
- 不开启所有隐藏 AA Line 条件。
- 不实现复杂循环 pattern，例如严格整月重复 `5/4, 5/4, 5/4` 到月末。
- 不实现多候选 pattern 的一个控件内多选。第一阶段如果用户想表达多个候选，可以加多条 Line bid 或用不同 Tier 分层。
- 不改变 Pairing / Reserve 已有条件。

## 前端设计

Line 页面使用共享 `RuleBidRightPanel`，新增条件会自然出现在 `ADD LINE PROPERTIES` 中。

控件复用现有 `PairingBidControl` 的 `days-off-on-pattern` UI：

```text
Min Days Off
Min Days On
Max Days On
```

虽然控件名里叫 days off/on pattern，但在 Line 上显示的 property 名是 `Commuter Pattern`，用户理解为 Line 的 work/off block pattern。

如果后续觉得字段文案不够清晰，再单独做 Line 专属控件，把 label 调整为：

```text
Min Off Block
Min Work Block
Max Work Block
```

第一阶段建议先复用控件，减少风险。

## 后端设计

### Catalog

更新：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`
- `sql/seed/10-pbs-bid-property.sql`
- 如已有 migration/data-fix 规则，新增对应 migration，把 `408` 写入既有数据库。

### 校验

更新 `pbs-server/src/services/line/line-validation.ts`：

`408 Commuter Pattern` 必须满足：

- `bid.type = "days-off-on-pattern"`
- `minDaysOff >= 1`
- `minDaysOn >= 1`
- `maxDaysOn >= minDaysOn`
- `maxDaysOn <= 14`
- `minDaysOff <= 14`

建议把最大值先设为 14，和现有 Days Off pattern 上限保持接近，避免用户输入整月级超大值。

## 测试范围

### 后端

补 `line-validation.test.ts`：

1. 接受合法 `408 Commuter Pattern`。
2. 拒绝 `maxDaysOn < minDaysOn`。
3. 拒绝非 `days-off-on-pattern` bid。

如 catalog 有测试，补 catalog 返回 `408`。

### 前端

补 `line-page.test.tsx`：

1. `ADD LINE PROPERTIES` 中出现 `Commuter Pattern`。
2. 可以配置 `5 on / 4 off`：
   - `minDaysOn = 5`
   - `maxDaysOn = 5`
   - `minDaysOff = 4`
3. add payload 为 `propertyCode=408` 且 bid 类型正确。

## 验收标准

1. Line 页面可新增 `Commuter Pattern`。
2. 能表达 `5 on / 4 off`、`4 on / 4 off`、`4-5 on / 4 off`。
3. 条件保存到 Line draft，参与 Tx/Tier 分层。
4. 后端拒绝非法 pattern。
5. 不影响 Days Off / Pairing / Reserve 现有条件。
6. Line 测试、后端 Line validation 测试、portal build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前改动范围集中在 Line catalog、Line validation、Line 页面测试和 seed/migration，文件数不算少但逻辑顺序强；并行容易碰 contract 和测试夹层。
- Suggested split: 不拆分。
- Write boundaries: `packages/contracts/pbs-line-bids.*`、`sql/seed/10-pbs-bid-property.sql`、必要 migration、`pbs-server/src/services/line/*`、`pbs-portal/src/features/line/*`。
- Conflict risk: 中等。当前工作树已有多处 PBS 改动，单人顺序集成更稳。
- Execution gate: 用户确认本 spec 后再开始实现。

