# PBS Line 同条件不同 Tier 合并测试案例

## 目标

验证 Line 模块中相同 `property + BID + modifier`、仅 tier 不同的条件会合并成一行，且不会破坏上一轮逐条保存和并发控制。

## 前置条件

- 已登录 PBS Portal。
- 当前用户有可编辑的 Current Line draft。
- 打开 Line 页面。

## 用例 1：同条件不同 Tier 合并

步骤：

1. 在 Add Line Properties 中找到 `Min Credit Window`。
2. 确认 BID 为 `Enabled`。
3. 只选择 `T2`，点击 Add。
4. 再次找到 `Min Credit Window`。
5. 确认 BID 仍为 `Enabled`。
6. 只选择 `T1`，点击 Add。

预期：

- Existing Line Properties 中只出现一行 `Min Credit Window`。
- 该行 `T1` 和 `T2` 都处于选中状态。
- Network 中第二次操作调用的是 `PATCH /api/line-bids/current/properties/:propertyGroupKey`，不是新增第二条 `POST`。

## 用例 2：完全重复同 Tier 拦截

步骤：

1. 已存在 `Min Credit Window / Enabled / T1`。
2. 再次用同样 BID 和同样 `T1` 点击 Add。

预期：

- 页面提示 `This property already exists.`。
- Existing Line Properties 行数不变。
- 不发起新增或修改接口。

## 用例 3：BID 不同不合并

步骤：

1. 添加一个可编辑 BID 的 Line property，例如 `Forget Line / 12 / T1`。
2. 再添加同一个 property，但 BID 改为不同值，例如 `Forget Line / 13 / T2`。

预期：

- Existing Line Properties 中保留两行。
- 两行 BID 分别显示不同值。
- 不会因为 propertyCode 相同而误合并。

## 用例 4：刷新后旧分裂数据仍显示为一行

步骤：

1. 使用已有草稿中曾经分裂出的同条件多行数据。
2. 强制刷新页面。

预期：

- 页面加载后同条件不同 tier 自动合并显示为一行。
- 点击该行删除时，同条件分裂出的旧数据也应一起消失。
- 刷新后不会重新出现被删除的隐藏重复行。

## 用例 5：快速点击不产生请求风暴

步骤：

1. 对同一个 available Line property 快速连续点击 Add。
2. 对已有合并行快速点击多个 Tx。

预期：

- 同一时间只存在一个草稿结构 mutation。
- Add、existing Tx、available Tx 在 pending 期间禁用。
- 不出现连续 409。

## 回归范围

- Line 新增、删除、修改 Tx。
- Line favorite / unfavorite。
- Tier 页面读取 Line draft 汇总。
- Pairing / DaysOff 不应发生合并行为变化。
