# PBS Line Most Flying In Least Days 条件设计

日期：2026-05-29  
状态：待用户确认  
范围：在 PBS Line 模块新增一个可配置条件，用于表达“尽量少的工作天数里获得尽量多的 flying/credit”。本文件只定义需求和方案，不包含实现改动。

## 背景

用户场景：

```text
Most flying in the least amount of days
```

这个条件不是单纯 Pairing 条件。Pairing 条件只能判断单个 pairing 是否符合要求，例如 credit 高不高、pairing 多长、是否 red-eye。用户真正想表达的是整个月最终 line 的效率：

- 总 flying / credit 尽量高。
- 工作天数尽量少。
- 飞行集中，不要低 credit、分散占用很多天。

因此它应该归属到 `Line`，作为整月 line preference，而不是只放在 `Pairing`。

当前系统可以用多个 Pairing 条件近似表达：

- `Pairing Total Credit`
- `Average Daily Credit`
- `Pairing Length`
- Tx / Tier 顺序

但这些组合仍然只是筛选 pairing，不会直接表达“整月 line credit density 最大化”。为了让用户可以明确设置这个偏好，需要新增一个 Line 条件。

## 目标

1. 新增一个 Line 条件：`Most Flying In Least Days`。
2. 让用户能用少量参数表达“高 credit + 少工作天”的偏好。
3. 配置要足够清楚，但不暴露复杂权重或公式。
4. 条件可保存到 Line draft，并参与 Tx/Tier 分层。
5. 第一阶段只完成 PBS bid 表达、保存、校验、展示和收藏语义；不要求立即实现最终 award/optimizer 的完整排序算法。

## 非目标

- 不把该条件做成 Pairing 条件。
- 不要求用户配置复杂权重，例如 credit 权重 60%、work days 权重 40%。
- 不引入多目标优化公式编辑器。
- 不改变现有 `Pairing Total Credit`、`Average Daily Credit`、`Pairing Length` 条件。
- 不在第一阶段承诺 optimizer 一定能按该条件产出最终 award 结果。

## 条件定义

建议新增：

```text
409 Most Flying In Least Days
```

归属：

```text
bid_type = Line
source_type = app
is_visible_in_portal = 1
```

条件复杂度：

```text
complex / configurable Line condition
```

它不属于 `401-405` 这类只有 `Enabled` 状态的简单 flag 条件。用户添加该条件时必须进入配置弹窗，填写 credit、working days 和 preference strength 后才能保存。前端实现时应把它放入 Line 的配置型条件集合，行为应对齐 `406 Forget Line`、`407 Min Base Layover`、`408 Commuter Pattern`，而不是对齐 `401 Max Credit Window` 这类直接点击 `+` 添加的简单条件。

建议 bid value 类型：

```json
{
  "type": "credit-density-preference",
  "minimumTotalCredit": "78:00",
  "maximumWorkingDays": 14,
  "strength": "strong"
}
```

字段含义：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `minimumTotalCredit` | `HHH:MM` | 用户希望整月 line 至少达到的总 credit，避免系统为了少工作天而牺牲太多 flying。 |
| `maximumWorkingDays` | integer | 用户希望最多工作多少天，用来表达 least amount of days。 |
| `strength` | enum | 偏好强度，建议三档：`normal`、`strong`、`must_try`。 |

默认值建议：

```json
{
  "type": "credit-density-preference",
  "minimumTotalCredit": "75:00",
  "maximumWorkingDays": 15,
  "strength": "strong"
}
```

## 用户配置体验

Line 页面中，用户点击 `Most Flying In Least Days` 的 `+` 后打开配置弹窗。

弹窗包含三个字段：

1. `Minimum Total Credit`
   - 输入 credit，例如 `75:00`、`78:00`、`80:00`。
   - 用于表达最低 flying/credit 目标。

2. `Maximum Working Days`
   - 输入整数天数，例如 `14`、`15`。
   - 用于表达最多愿意工作多少天。

3. `Preference Strength`
   - 三档选择：`Normal`、`Strong`、`Must Try`。
   - 不暴露权重，只表达优先级强弱。

示例：

```text
Minimum Total Credit: 78:00
Maximum Working Days: 14
Preference Strength: Strong
```

用户理解为：

```text
我希望这个月至少 78:00 credit，最多工作 14 天，并且强烈偏好这种高效集中飞行的 line。
```

## 系统语义

第一阶段的保存语义：

- 该条件作为 Line bid property 保存。
- 支持 Tx/Tier 分层。
- 支持 configured favorite，即收藏已配置好的 `minimumTotalCredit + maximumWorkingDays + strength` 快照。
- Summary / Existing row 应展示可读文本，例如：

```text
Most Flying In Least Days: min credit 78:00, max working days 14, strength strong
```

后续 optimizer / award 可解释为：

1. 优先选择 total credit 高的 line。
2. 在 credit 接近时，优先选择 working days 少的 line。
3. 计算 `credit per working day`，越高越符合偏好。
4. 不应为了减少工作天而显著低于 `minimumTotalCredit`。
5. `strength` 控制该偏好的排序权重或约束力度，但不需要在 Portal 暴露具体公式。

## 方案对比

### 方案 A：Line 条件 + 三个简单参数（推荐）

新增 `Most Flying In Least Days`，参数为：

- `minimumTotalCredit`
- `maximumWorkingDays`
- `strength`

优点：

- 用户能清楚表达目标。
- 不需要理解复杂公式。
- 和 Line 的整月结构语义一致。
- 后续 optimizer 可以逐步接入，不阻塞 Portal bid 表达。

缺点：

- 第一阶段只是条件表达，不等于完整 award 算法已经完成。

### 方案 B：只用 Pairing 条件组合近似

继续让用户组合：

- `Pairing Total Credit`
- `Average Daily Credit`
- `Pairing Length`

优点：

- 不新增 Line 条件。
- 复用已有能力。

缺点：

- 用户很难理解如何组合。
- 不能准确表达整月 line 的工作天数目标。
- 结果语义分散，不利于后续 optimizer。

### 方案 C：暴露完整权重配置

让用户配置多个权重：

- total credit weight
- working days weight
- credit per day weight
- pairing length weight

优点：

- 极其灵活。

缺点：

- 对普通 PBS 用户太复杂。
- 配置结果难解释。
- 容易出现“看起来可控，实际不可预测”的体验。

结论：推荐方案 A。

## 数据和接口设计

### Contract

在 Line bid value 类型中新增：

```ts
type PbsLineBidValue =
  | ExistingLineBidValues
  | {
      type: "credit-density-preference";
      minimumTotalCredit: string;
      maximumWorkingDays: number;
      strength: "normal" | "strong" | "must_try";
    };
```

### Catalog

新增或更新 Line property：

```text
property_code = 409
bid_type = Line
property_name = Most Flying In Least Days
validation_json = {"type":"credit_density_preference","label":"Most Flying In Least Days"}
is_visible_in_portal = 1
is_active = 1
```

如当前数据库需要增量更新，新增 migration，避免只改 seed 导致已存在环境缺少该属性。

### 后端校验

Line validation 应校验：

- `propertyCode=409` 必须使用 `bid.type = "credit-density-preference"`。
- `minimumTotalCredit` 必须是 `HH:MM` 或 `HHH:MM` credit 格式。
- `minimumTotalCredit` 建议范围：`40:00` 到 `120:00`。
- `maximumWorkingDays` 必须是整数。
- `maximumWorkingDays` 建议范围：`1` 到 `31`。
- `strength` 只能是 `normal`、`strong`、`must_try`。

范围值先作为前后端统一校验，不硬编码业务政策；如果后续需要航司差异，应参数化。

## 前端设计

Line 页面继续使用共享 `RuleBidRightPanel`。

`409 Most Flying In Least Days` 属于配置型 Line 条件：

- 在 `ADD LINE PROPERTIES` 中隐藏 inline bid 控件。
- 点击 `+` 打开 Line 配置弹窗。
- 配置完成后保存为 Existing Line bid。
- 支持在弹窗里 `SAVE FAVORITE`，保存 configured favorite。
- 在 `FAVORITED PROPERTIES` 中展示已配置快照，点击 `+` 直接添加。
- 不显示为只有 `Enabled` 的 flag 条件；不能通过默认 enabled bid 直接添加。

控件建议在 `line-bid-dialog.tsx` 中实现，不放到 Pairing 通用控件里，避免把 Line 优化目标误认为 Pairing 条件。

## 测试范围

### 后端

补充 Line 相关测试：

1. `POST /line-bids/current/properties` 接受合法 `409` bid。
2. 拒绝非法 credit 格式。
3. 拒绝 `maximumWorkingDays` 非整数或超范围。
4. 拒绝非法 `strength`。
5. configured favorite 能保存并回读 `409` 快照。

### 前端

补充 Line 页面测试：

1. `ADD LINE PROPERTIES` 中显示 `Most Flying In Least Days`。
2. 点击 `+` 打开配置弹窗。
3. 输入 `78:00`、`14`、`Strong` 后 add payload 正确。
4. Existing row 展示可读摘要。
5. `SAVE FAVORITE` 保存配置快照后，Favorited 中能直接添加。

## 验收标准

1. 用户能在 Line 页面新增 `Most Flying In Least Days` 条件。
2. 用户能配置：
   - `Minimum Total Credit`
   - `Maximum Working Days`
   - `Preference Strength`
3. 条件保存到 current Line draft。
4. Existing / Summary 文案能清楚表达该条件。
5. configured favorite 保存的是完整配置快照。
6. 后端拒绝非法参数。
7. 不影响现有 Line、Pairing、DaysOff、Reserve 条件。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前仍是单个 Line 条件的产品与技术定义，后续实现会跨 contracts/server/portal/test，但核心语义需要顺序保持一致，并行协调成本高于收益。
- Suggested split: 暂不拆分。
- Write boundaries: 后续实现预计涉及 `packages/contracts/pbs-line-bids.*`、`sql/seed/10-pbs-bid-property.sql`、新增 migration、`pbs-server/src/services/line/*`、`pbs-portal/src/features/line/*` 和相关测试。
- Conflict risk: 中等。Line 条件、configured favorite、现有 Line 弹窗都在近期频繁改动，单人顺序集成更稳。
- Execution gate: 用户确认本 spec 后，才能进入实施计划和代码实现。
