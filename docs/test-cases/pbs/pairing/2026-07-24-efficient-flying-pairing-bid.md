# Efficient Flying Pairing Bid 验收用例

## 测试范围

- Bid 页 Pairing 条件新增、编辑、收藏与删除。
- Search Pairings 条件展示、计数和分页。
- Current Rules 的计数与 Pairing Pool。
- `pbs-server` 和 `live-server` 的 `PAIRING_SCORE.csv`。
- `LINE_RULES.csv` 不再包含 property 428。

## 前置条件

1. 已执行
   `2026-07-24-pbs-efficient-flying-pairing-bid.sql`。
2. `PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE` 为有效整数，默认 `20`。
3. 测试周期内存在多个 `assignment_group = FLY` 且含 active segment 的 Pairing。

## PBS-EF-01：条件分类与统一 UI

1. 打开 Bid 页面。
2. 检查 `LINE` 分类。
3. 打开 `PAIRING` 分类并选择 `Efficient Flying First`。

预期：

- `LINE` 中不再显示该条件。
- `PAIRING` 中显示该条件。
- 弹窗使用统一 Pairing Bid 样式。
- Tier 初始未选择，且至少选择一个 Tier 才能保存。
- Preference 只有 `Efficient flying` 和 `Inefficient flying`。
- 默认选择 `Efficient flying`。
- 说明显示当前公司百分位，例如
  `Top 20% by average daily credit`。

## PBS-EF-02：新增、回读与编辑

1. 选择 `Efficient flying` 和 T2，点击 `ADD BID`。
2. 在 Existing Bid 中检查摘要并打开详情。
3. 编辑为 `Inefficient flying` 和 T4，点击 `UPDATE BID`。
4. 刷新页面后再次检查。

预期：

- 新增后摘要显示 `Efficient flying · Top 20% by average daily credit`。
- 编辑后摘要显示 `Inefficient flying · Bottom 20% by average daily credit`。
- 刷新后 mode 与 Tier 保持不变。
- 保存 payload 使用
  `{"type":"efficient-flying-preference","mode":"efficient|inefficient"}`，
  action 固定为 `award`。

## PBS-EF-03：配置不可用门禁

1. 在测试库临时令百分位缺失或非法。
2. 打开该条件弹窗。

预期：

- 显示 `Efficient flying configuration is unavailable.`。
- `ADD BID` / `UPDATE BID` 不可用。
- 系统不静默使用硬编码百分位。
- 其他不包含 428 的 Pairing 条件仍可正常使用。

## PBS-EF-04：Search Pairings 与 Current Rules 一致

1. 使用 `Efficient flying` 搜索并记录总数和前两页 Pairing。
2. 返回 Bid 页面保存相同条件。
3. 检查 Current Rules count 和 Pairing Pool。
4. 对 `Inefficient flying` 重复以上步骤。

预期：

- Search Criteria、Existing Bid 和详情摘要文案一致。
- Search count、分页结果、Current Rules count 和 Pool 使用相同 Pairing 集合。
- 换页不会重新按当前页计算前/后百分位。
- cutoff 边界同分 Pairing 全部纳入。

## PBS-EF-05：Daily Credit 计算

选取包含多个 duty、每个 duty 包含多个 segment 的 Pairing。

预期：

- 每个 duty 只取按 `duty_seq, seg_seq` 排序后的第一条 active segment。
- 使用该行 `duty_act_credited_minutes`，null 按 0。
- Pairing Total Credit 为各 duty Credit 之和。
- Average Daily Credit 为 Total Credit 除以 `pairing.duration_days`。
- 不按 segment 重复累加 duty Credit。

## PBS-EF-06：两套算法导出一致

1. 为同一 crew 在同一 Tier 保存 Efficient 和 Inefficient 测试条件。
2. 分别通过 `pbs-server` 和 `live-server` 生成算法包。
3. 对比 `PAIRING_SCORE.csv` 与 `LINE_RULES.csv`。

预期：

- 两套 `PAIRING_SCORE.csv` 对相同 crew、pairing、tier 的 counter 完全一致。
- 命中 Pairing 的所选 Tier Award counter `+1`。
- Inefficient 也写 Award counter，不写 Avoid counter。
- `LINE_RULES.csv` 不包含 property 428。

## PBS-EF-07：Legacy NPBS 导入

分别导入：

- `Award Pairings If Efficient Flying First`
- `Award Pairings If Inefficient Flying`
- `Avoid Pairings If Efficient Flying First`

预期：

- 前两项转换为 Pairing 428 的 canonical payload。
- Avoid 表达不明确，导入明确阻断，不生成错误的 Pairing 或 Line 条件。
- 导入数据在 Portal 可正常显示、编辑和删除。
