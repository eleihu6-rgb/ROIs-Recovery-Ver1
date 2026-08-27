# PBS Efficient Flying Pairing Bid 标准答案对齐设计

## 1. 背景

当前 Portal 将 `propertyCode = 428` 的 `Efficient Flying First` 作为 Line 条件：

- 位于 Bid 页 `LINE` 分类；
- 使用 `Award / Avoid`；
- 保存为 `{ type: "flag" }`；
- `live-server` 当前明确跳过 428 的 `LINE_RULES.csv` 导出；
- `pbs-server` 虽存在旧 Line 导出描述，但它不是本次确认的最终算法契约。

参考项目已经把 Efficient Flying 实现为 Pairing 条件。其业务定义是：

1. 对场景内每个有效飞行 Pairing 计算平均每日 Credit：

   ```text
   averageDailyCredit = pairingTotalCredit / pairingDays
   ```

2. 使用公司配置的百分位 `P` 划分：
   - Efficient：平均每日 Credit 最高的前 `P%`；
   - Inefficient：平均每日 Credit 最低的后 `P%`。
3. 默认 `P = 20`，员工不能修改。
4. 员工选择方向和 Tier 后，所有属于目标区间且该员工有资格执行的 Pairing，在 `PAIRING_SCORE.csv` 对应 Tier 的 Award counter 上 `+1`。

本项目尚未上线，本次不兼容旧的 Line 428 草稿、当前 Bid 或收藏数据。

## 2. 目标

1. 将 `Efficient Flying First` 从 Line 条件迁移为 Pairing 条件。
2. UI 遵循现有 PBS Preference 条件统一标准。
3. 员工明确选择 `Efficient flying / Inefficient flying`，不再使用容易产生歧义的 `Award / Avoid`。
4. 百分位由 `dictionary` 管理，默认 20%，员工端只读。
5. Pairing 页面、Search Pairings、Existing Bid、摘要和算法导出使用同一条件语义。
6. `pbs-server` 与 `live-server` 两条 `PAIRING_SCORE.csv` 导出链路结果一致。
7. 428 不再进入 `LINE_RULES.csv`。

## 3. 非目标

- 不允许员工修改百分位。
- 不在 Portal 增加公司参数管理入口；后续由 Live 管理端维护字典。
- 不新增 `PAIRING_SCORE.csv` 列，也不改变现有文件格式。
- 不修改 Pairing eligibility 的既有规则；继续复用当前 division、rank、composition 和场景范围约束。
- 不兼容或自动转换旧 Line 428 的保存数据、收藏和 Standing Bid。
- 不修改其他 Pairing 或 Line 条件。

## 4. 方案比较

### 方案 A：复用 428，迁移为 Pairing + 显式模式（采用）

- `propertyCode = 428` 保持稳定；
- `bid_type` 从 `Line` 改为 `Pairing`；
- payload 改为显式 `efficient / inefficient`；
- 评分固定写 Award counter。

优点：

- 与参考项目和算法含义直接一致；
- 用户不会把 `Avoid Efficient` 误解为扣分、反选或排除；
- 不新增重复 property code；
- 可以进入既有 Pairing 搜索、摘要和评分链路。

代价：

- 需要同步 contracts、数据库、Portal、Search Pairings、两套导出和测试；
- 旧 Line 428 数据必须清理。

### 方案 B：保留 Line 428，只在导出时特殊处理

优点是改动表面较小；缺点是员工端分类错误，`Award / Avoid` 语义不清，并会长期保留 Line 与 Pairing 两套不一致模型，因此不采用。

### 方案 C：新增 Pairing property code，保留 Line 428

优点是旧数据可以继续存在；缺点是产生两个同名条件、导入映射和展示歧义。项目尚未上线，没有兼容收益，因此不采用。

## 5. 最终产品行为

### 5.1 入口

- Bid 页 `PAIRING` 分类展示 `Efficient Flying First`。
- Bid 页 `LINE` 分类不再展示该条件。
- Search Pairings 的 Pairing 条件选择器展示同一个 property，使用同一个 editor 和 payload。
- Standing Bid 中旧 Line 428 入口删除；本次不新增 Pairing Standing Bid 能力，除非现有 Pairing Standing Bid 已自动复用可见 Pairing catalog。

### 5.2 配置弹窗

弹窗使用 `PbsDialogFrame` 和现有 Pairing editor/footer，固定顺序：

1. 标题
   - `Configure Pairing Bid`
   - `Efficient Flying First`
2. `TIERS · REQUIRED`
   - 使用 `TierToggleGroup`；
   - 初始不默认选中 Tier；
   - 支持当前 Pairing Bid 的多 Tier 行为；
   - 至少选择一个 Tier 才能保存。
3. `PREFERENCE`
   - 使用 `PreferenceSegmentedControl`；
   - `Efficient flying`
   - `Inefficient flying`
   - 默认选择 `Efficient flying`。
4. 只读说明
   - Efficient：`Top {P}% by average daily credit`
   - Inefficient：`Bottom {P}% by average daily credit`
   - 补充一行：`The percentage is company-defined.`
5. Footer
   - `CANCEL`
   - `SAVE FAVORITE`
   - `ADD BID` / `UPDATE BID`

说明区只解释用户必须理解的公司定义，不显示 SQL、阈值计算细节、Rule Preview 或技术字段。

### 5.3 状态与可访问性

- mode 使用唯一 state 驱动视觉选中态、`aria-pressed` 和保存 payload。
- 弹窗打开时如果公司配置加载中，显示稳定 loading 文案并禁止保存。
- 配置缺失、非法或读取失败时显示：

  ```text
  Efficient flying configuration is unavailable.
  ```

  同时禁止保存，不能静默回退到硬编码 20。
- 所有可点击控件提供 `cursor-pointer`；disabled 状态不可点击。
- 新增和编辑路径必须复用同一个 editor。

## 6. 数据契约

### 6.1 Property

复用：

```text
propertyCode = 428
name = Efficient Flying First
bidType = Pairing
defaultAction = award
supportedActions = [award]
```

`Award` 是内部评分方向，不在该条件 UI 中作为可选项展示。

### 6.2 Payload

新增 Pairing payload：

```ts
type EfficientFlyingPreferenceBid = {
  type: "efficient-flying-preference";
  mode: "efficient" | "inefficient";
};
```

示例：

```json
{
  "propertyCode": 428,
  "name": "Efficient Flying First",
  "action": "award",
  "bid": {
    "type": "efficient-flying-preference",
    "mode": "efficient"
  },
  "tiers": [
    { "tier": 2, "active": true }
  ]
}
```

校验规则：

- 只接受 `type = efficient-flying-preference`；
- `mode` 只能为 `efficient` 或 `inefficient`；
- action 只接受或规范化为 `award`；
- 至少一个有效 Tier；
- 不接受旧 `{ type: "flag" }`。

## 7. 公司参数

### 7.1 字典

新增独立字典配置：

```text
parent_code = PBS_EFFICIENT_FLYING_CONFIG
code        = PERCENTILE
value       = 20
```

约束：

- 必须为整数；
- 有效范围 `1..50`；
- seed 默认值为 `20`；
- migration 幂等；
- 三个目标数据库环境执行并验证；
- 运行时不在代码中硬编码业务回退值。

选择上限 50 是为了让 Efficient 与 Inefficient 区间在正常分布下保持有意义；少量 Pairing 或并列值仍可能造成两个区间重叠，这是明确允许的参考行为。

### 7.2 Source of Truth

- 新来源：`dictionary(PBS_EFFICIENT_FLYING_CONFIG, PERCENTILE)`。
- 旧来源：当前 Line 428 没有百分位来源，直接删除旧 flag 语义。
- Portal、Search Pairings、`pbs-server` 导出和 `live-server` 导出均读取同一字典值。
- 测试必须构造“调用方传入其他百分比、字典为 20”的冲突场景，并断言字典值获胜。

### 7.3 配置 API 与门禁

`pbs-server` 提供员工端只读接口：

```text
GET /api/pairing-bids/efficient-flying-config
```

成功：

```json
{
  "code": 200,
  "data": {
    "percentile": 20
  },
  "message": "ok"
}
```

配置缺失或非法时返回明确的非 200 响应，Portal 映射为 `unavailable`，不向员工暴露 dictionary 内部结构。

门禁只在实际使用 428 时生效：

- 打开/保存 428 editor；
- 使用 428 的 Search Pairings、Current Rules count 和分页；
- 导出范围内存在 428 时生成 `PAIRING_SCORE.csv`。

没有 428 的普通 Pairing 搜索和算法包不得因为该配置缺失而失败，也不得无条件多发配置查询。Existing Bid、Search Criteria 和 detail 摘要通过同一个按需配置 query 获得当前百分比。

## 8. 区间计算

### 8.1 唯一数据源

Daily Credit 必须与当前 Search Pairings 卡片中的 `Total Credit` 保持同一来源，禁止另写一套 segment 求和：

1. 从 active `pairing_segment` 按 `duty_seq` 去重；
2. 每个 duty 使用确定性顺序 `ORDER BY duty_seq ASC, seg_seq ASC` 选择第一条 active segment；
3. 读取该行冗余保存的 `duty_act_credited_minutes`；字段缺失时与现有卡片一致按 `0` 分钟处理；
4. 将各 duty 的 Credit 分钟相加得到 `pairingTotalCreditMinutes`，因此有效 active segment 存在时总值允许为 `0`；
5. `pairingDays` 固定读取 `pairing.duration_days`；
6. 不使用 `act_credited_minutes_seg` 逐 segment 累加，避免 duty Credit 重复计算；
7. 不在 scheduled/actual 之间自行增加新的 fallback。若当前 Search Pairings 的 Total Credit source 后续改变，本条件必须复用同一个共享 SQL expression 一起改变。

Pairing 是否属于飞行候选固定使用：

```text
pairing.is_deleted = 0
upper(btrim(pairing.assignment_group)) = 'FLY'
存在至少一条 is_deleted = 0 的 pairing_segment
```

Period、Base、Fleet、Division/Rank 和 scenario scope 继续复用当前 Pairing Search / Algorithm Export 的现有 scope builder，不为 428 发明另一套映射。

### 8.2 百分位 Cohort

cutoff 先在统一 cohort 中计算一次，之后才叠加员工或其他条件。

cohort 范围：

- Portal 单条件搜索、Search Criteria、Current Rules count/page：当前 `periodCode` 下的全局 active FLY Pairing 集合；复用当前请求已有的 Base/Fleet/Division/Rank scope，但不包含员工 eligibility、不包含其他 property condition、不包含分页。
- Current package：使用 `periodCode` 对应的自然月起止日期，并复用 Current package 现有 window resolver；不得读取 Scenario window。
- YEG-14 package：同样使用 `periodCode` 对应的自然月起止日期，并复用 YEG-14 现有 window resolver；YEG-14 不是 Scenario export。
- Scenario package：使用显式 scenario start/end，并完整复用现有 Scenario package window resolver 的 fallback/buffer 规则，不为 428 单独裁剪或扩张日期。
- 三类导出继续叠加各自现有 Base/Fleet/Division/Rank scope，在该 scope 内建立全局 active FLY Pairing cohort。

固定处理顺序：

1. 建立 period/scenario + scope cohort；
2. 为 cohort 中每个 Pairing 计算 Daily Credit；
3. 计算一次 Efficient / Inefficient cutoff；
4. 用 mode 选出目标 band；
5. 再与其他 Search Criteria 取 AND；
6. 再应用 per-crew eligibility（仅有 crew context 时）；
7. 最后计算 count、排序和分页，或生成 CSV。

禁止：

- 按 Crew 重算 cutoff；
- 按其他 Criteria 过滤后的结果重算 cutoff；
- 按当前页重算 cutoff；
- count 和 page 分别使用不同 cohort；
- 单条件搜索、Current Rules 和 exporter 各自定义不同的 Credit 表达式。

这保证同一 scope 内同一个 Pairing 的 Efficient / Inefficient 身份稳定。

### 8.3 百分位算法

只保留存在 active segment 且 `pairing.duration_days > 0` 的候选。缺失 duty credit 沿用当前 Search Pairings 卡片语义按 0 分钟计入，不从 cohort 排除：

```text
averageDailyCredit = pairingTotalCreditMinutes / pairing.duration_days
```

内部使用分钟计算，避免小时字符串和展示精度影响排序。

设有效 Pairing 数为 `n`，百分位为 `P`：

```text
k = max(1, round(n * P / 100))
```

- Efficient cutoff：升序数组的第 `n - k` 个值；
- Inefficient cutoff：升序数组的第 `k - 1` 个值；
- Efficient 命中：`averageDailyCredit >= efficientCutoff`；
- Inefficient 命中：`averageDailyCredit <= inefficientCutoff`。

边界值包含并列项。因此最终命中数可以大于严格的 `P%`，但不会随机拆开相同平均每日 Credit 的 Pairing。

无有效 Pairing 时：

- Search Pairings 返回 0 个结果；
- `PAIRING_SCORE.csv` 不产生该条件的 score 行；
- 导出记录明确 warning/skip reason，不伪造阈值。

### 8.4 查询实现与性能

- 使用 set-based CTE / window query 一次生成 cohort、Daily Credit、rank/cutoff 和 band；
- 禁止 Crew × Pairing 循环查询或每个 property 重复加载同一 cohort；
- 同一次请求/导出中，相同 scope + percentile 的 cutoff 可在请求生命周期内复用，不新增跨请求业务缓存；
- count 和 page 必须复用同一个 cohort SQL/参数构造器；
- 代表性远端 PostgreSQL 上执行只读结果核对与 `EXPLAIN (ANALYZE false, COSTS true)`；
- SQL 验证同时覆盖 Base/Fleet/Division/Rank/scenario scope，确认 scope predicate 在 cohort 内生效；
- 性能验收记录 Search count、第一页和 algorithm export 的 SQL 计划，不能引入 Crew×Pairing N+1。

## 9. Search Pairings 与摘要

### 9.1 Search Pairings

Search Pairings 使用与算法导出相同的：

- period/scenario pairing 集合；
- company percentile；
- average daily credit；
- cutoff 和并列规则。

不能由 Portal 自己计算一个阈值、导出端再计算另一个阈值。

Single Property、组合 Search Criteria、Current Rules count、Current Rules page 必须调用同一个服务端 cohort builder；Portal 只提交 428 payload 和展示结果，不下载全量 Pairing 后自行排序。

### 9.2 统一摘要

Pairing Existing Bid、Search Criteria、Bid review/detail 使用同一 formatter：

```text
Efficient flying · Top 20% by average daily credit
Inefficient flying · Bottom 20% by average daily credit
```

摘要百分比来自当前保存/解析时的公司配置显示，但 payload 不复制百分比。配置后续变更时，条件自动使用最新公司定义。

## 10. `PAIRING_SCORE.csv`

不改变现有表头。

处理顺序：

1. 加载 428 Pairing Bid；
2. 加载公司百分位；
3. 在导出 scope 内计算 Efficient / Inefficient cutoff；
4. 找到目标区间 Pairing；
5. 继续使用当前 per-crew eligibility 过滤；
6. 对每个命中 Pairing，在员工所选 Tier 的 `Tn_Award_Counter` 上 `+1`；
7. 与员工其他 Pairing Bid 命中结果累加，不覆盖已有 counter。

`Inefficient flying` 仍然是“奖励低 Daily Credit Pairing”，不是写入 Avoid counter。

必须同步：

- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.ts`

两条路径对同一 fixture 必须输出相同的 Crew、Pairing、Tier 和 Award counter。

## 11. `LINE_RULES.csv`

- 428 不再作为 Line property 查询、校验或序列化。
- `pbs-server` 和 `live-server` 的 `LINE_RULES.csv` 均不得输出 428。
- 旧 Line 428 专用 metadata、README 描述和测试删除或改为 Pairing score 测试。

## 12. 数据迁移

新增一条幂等 migration：

1. 精确定位 `propertyCode = 428` 的旧 Line group、condition 和 favorite；
2. 删除 `pbs_bid_group` / `pbs_bid_condition` 中旧 Line 428 的相关开发期数据；
3. 删除 `pbs_bid_line_favorite`、`pbs_bid_property_favorite` 以及 Standing context 中引用旧 Line 428 的数据；
4. 对受影响 Tier 重新连续编号 `group_seq`，并按实际 group 数重算 `pbs_bid_tier.total_groups`；
5. 将 catalog 428 更新为 Pairing property 和新 validation JSON；
6. 更新 Pairing/Line 推荐顺序；
7. 新增/更新 `PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE = 20`；
8. 保留稳定 property 主记录时必须保证所有 FK/收藏关系已先清理；
9. 不触碰其他 property 或用户 Bid。

新环境的 `sql/seed/10-pbs-bid-property.sql` 和 `sql/seed/01-dictionary.sql` 必须同步更新，不能只修改 migration。实现审计必须从以下旧 Line 路径移除 428：

- `packages/contracts/pbs-line-bids.*`
- Line catalog、validation、summary、draft mapper、Standing Bid contract；
- Line Help 和旧 Line QA；
- `pbs-server` / `live-server` Line metadata、README 和 exporter。

并在 Pairing contracts、catalog、editor、summary、Help 和 tests 中建立唯一新定义。

执行前后验证：

- 428 只存在一个 active catalog 定义；
- `bid_type = Pairing`；
- Line 428 保存数据和收藏为 0；
- 不存在旧 flag payload；
- 字典配置唯一且值合法。

## 13. 导入

精确映射矩阵：

| 来源文本语义 | mode | 结果 |
|---|---|---|
| `Award Pairings If Most Flying In Least Days` | `efficient` | 接受 |
| `Award Pairings If Most Flying In Least Working Days` | `efficient` | 接受 |
| `Award Efficient Flying First` | `efficient` | 接受 |
| `Efficient Flying` / 明确正向 legacy flag | `efficient` | 接受，记录 legacy-normalized warning |
| `Award Inefficient Flying` / 明确最低 average daily credit | `inefficient` | 接受 |
| `Avoid Efficient Flying First` | — | 拒绝；旧 action 不能自动等价为 Inefficient |
| 只有 `Efficient Flying First` 且无法判断 action/mode | — | 拒绝并进入 review |
| 其他反向或含糊文本 | — | 拒绝并进入 review |

正向映射为：

```json
{
  "propertyCode": 428,
  "bidType": "Pairing",
  "action": "award",
  "bid": {
    "type": "efficient-flying-preference",
    "mode": "efficient"
  }
}
```

如果来源明确表达最低 Daily Credit / inefficient，映射为 `mode = inefficient`。来源含义不明确时阻断并进入 review，不猜测方向。

必须同步并对相同 fixture 断言相同 canonical payload：

- `pbs-server` Crew Bid importer；
- `live-server` Crew Bid importer；
- `e2e/utils/npbs` Playwright mapper。

拒绝统一使用稳定错误码：

```text
efficient_flying_mode_ambiguous
```

Playwright 模拟导入和 Live 批量导入不得一个接受、另一个产生 review-only legacy item。

## 14. 错误处理

- 配置缺失/非法：Portal 禁止保存；Search/导出返回明确配置错误。
- Pairing 缺 duty Credit：按现有 Search Pairings Total Credit 规则计为 0；不额外 warning。
- Pairing 无 active segment 或 `duration_days <= 0`：从 cohort 排除并记录可观测 warning，不让整次导出失败。
- 无有效 Pairing：正常返回空命中。
- payload 非法：API 返回 400，不能保存为 review-only legacy item。
- 两套导出结果不一致：测试失败，禁止交付。

## 15. 测试与验收

### 15.1 Contracts / Server

- 428 只属于 Pairing catalog；
- 接受 efficient/inefficient payload；
- 拒绝 flag、非法 mode 和 avoid action；
- 字典值加载、范围校验及缺失错误；
- 百分位 `k`、上下 cutoff、并列边界、空数据；
- Search Pairings Efficient / Inefficient 结果；
- eligibility 过滤继续生效。
- Single Property、组合 Criteria、Current Rules count/page 使用同一 cutoff；
- cutoff 不随 Crew、其他条件或分页变化；
- 配置 endpoint 成功、缺失、非法和按需加载；
- 无 428 的请求不依赖该配置。

### 15.2 Algorithm export

两套 exporter 使用同一 fixture 验证：

- Efficient 只命中 top band；
- Inefficient 只命中 bottom band；
- 并列值全部命中；
- 每个选中 Tier 的 Award counter `+1`；
- 多条件累加；
- 不写 Avoid counter；
- 428 不进入 `LINE_RULES.csv`；
- 字典值优先于任何旧值或调用方参数。
- Current package 与 scenario package 分别在各自 cohort scope 内计算；
- Current 与 YEG-14 使用 period 自然月，Scenario 使用现有显式场景 window resolver；
- 两套 exporter 对同一 scope 生成相同 cutoff 与命中 Pairing；
- 代表性远端 PostgreSQL 只读结果核对及 `EXPLAIN` 通过。

### 15.3 Portal Vitest

- Pairing catalog 展示 428，Line catalog 不展示；
- 初始 mode 为 Efficient，Tier 为空；
- mode state、视觉和 `aria-pressed` 一致；
- 配置 loading/unavailable 禁止保存；
- 新增和编辑回显；
- Existing Bid、Search Criteria 和 detail 摘要一致；
- footer 使用共享按钮与 pending 行为。
- 百分比配置按需加载，无 428 的页面不因配置异常受影响。

### 15.4 Playwright

真实 UI 覆盖：

1. Bid → Pairing 新增 Efficient；
2. 选择 Tier、保存并检查 Existing Bid；
3. 编辑为 Inefficient 并验证回显；
4. Search Pairings 使用相同条件并检查结果；
5. 删除条件；
6. Line 分类不再出现该入口；
7. 配置不可用时不能保存；
8. 导入后的 428 可直接编辑，不出现 review-only legacy item。
9. 组合 Criteria 和翻页前后，428 的 Efficient/Inefficient 身份保持稳定。

### 15.5 QA 文档

新增：

```text
docs/test-cases/pbs/pairing/2026-07-24-efficient-flying-pairing-bid.md
```

覆盖 UI、边界、搜索、导入和 CSV 对账。

## 16. 验收标准

1. 员工只在 Pairing 分类看到 `Efficient Flying First`。
2. UI 符合 PBS Preference 条件标准，使用 `Efficient flying / Inefficient flying`。
3. 员工不能修改公司百分位。
4. Search Pairings 与两套 `PAIRING_SCORE.csv` 命中集合一致。
5. 所有命中写对应 Tier 的 Award counter。
6. 428 不再进入任何 `LINE_RULES.csv`。
7. 旧 Line 428 数据、收藏和 flag payload 已清理。
8. 三个目标数据库完成 migration 并通过验证查询。
9. focused tests、Playwright、`npm run check:ui`、build、`git diff --check` 通过。

## 17. 影响与风险

- 风险等级：中高。该需求跨 property source of truth、Portal、PBS API、搜索、导入和两套算法导出。
- 最大风险是只移动 UI，却遗漏 Line contract 或其中一套 exporter。
- 第二风险是 Search 与 export 使用不同的 Pairing scope 或 cutoff。
- 第三风险是把 Inefficient 错误写到 Avoid counter。

实施前必须对准备修改的 symbols 执行 GitNexus upstream impact；若为 HIGH/CRITICAL，先向用户报告再编辑。提交前执行 `detect_changes --scope compare --base-ref main`。

## 18. Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: contracts/数据库、Portal UI、搜索/算法导出和测试可拆分，但共享 428 契约必须先固定。
- Suggested split:
  1. contracts + catalog + migration + dictionary；
  2. Portal Pairing editor、摘要与 Vitest/Playwright；
  3. Search Pairings + pbs-server/live-server exporter + 后端测试。
- Write boundaries:
  - Agent 1：`packages/contracts`、`sql/`
  - Agent 2：`pbs-portal/`、相关 `e2e/`
  - Agent 3：`pbs-server/`、`live-server/`
- Conflict risk: Medium。contracts 是所有分支的前置依赖，必须先合入或由主 Agent 建立。
- Execution gate: 本 spec 经审查并由用户明确批准实施后，才可启动并行实现。
