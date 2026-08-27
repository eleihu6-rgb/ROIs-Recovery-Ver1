# PBS Crew Bid Import：Departure Time 条件测试案例

## 前置条件

- 已切换到目标航司 schema，例如 `f8`。
- 已执行 `2026-06-23-pbs-departure-time-property.sql` 或等效 seed，`pbs_bid_property` 中存在：
  - `106 Departure Date / Day`
  - `164 Departure Time`
- Portal / live-server 使用最新代码。
- 导入页面可访问：`/fpqe/live/api/admin/crew-bid-imports/dry-run` 对应的管理页面。

## 用例 1：日期版 Departing On 不受影响

### 操作步骤

1. 准备包含如下 preference 的 CLASS txt：

   ```text
   Award Pairings If Departing On Mar 9, 2026
   ```

2. 选择目标 period，例如 `Mar 2026`。
3. 执行 `Dry Run`。

### 预期结果

- 该 preference 可导入。
- 导入结果 property 为 `Departure Date / Day`。
- 参数保留日期 / 星期语义，不出现 `Departure Time`。
- 不出现 `unsupported_date_clause`。

## 用例 2：时间版 Departing On 导入为 Departure Time

### 操作步骤

1. 准备包含如下 preference 的 CLASS txt：

   ```text
   Award Pairings If Departing On Between 06:00 And 06:45 If Any Landing In PVR
   ```

2. 选择目标 period，例如 `Mar 2026`。
3. 执行 `Dry Run` 或正式 `Import`。

### 预期结果

- 该 preference 不再报 `unsupported_date_clause`。
- 同一个 tier 下生成两条 pairing 条件：
  - `Departure Time · Award · Between 06:00 - 06:45`
  - `Any Landing In Airport · Award · Any · PVR`
- 如果 `PVR` 在当前 base / period pairing 内不存在，失败原因应归类为机场不可用，而不是 Unsupported。

## 用例 3：Portal 手动新增 Departure Time

### 操作步骤

1. 打开 Pairing 页面。
2. 在新增 Pairing property 中选择 `Departure Time`。
3. 选择 `Award`。
4. 操作符选择 `Between`。
5. 输入 `06:00` 和 `06:45`。
6. 保存或搜索 pairing。

### 预期结果

- 页面可以正常编辑并保存 `Departure Time`。
- 保存后的 summary 显示 `Award · Between 06:00 - 06:45`。
- Pairing count / search 使用首个航班计划起飞时间筛选，不使用 check-in / report time。

## 回归范围

- `Departure Date / Day` 的日期、星期、日期范围。
- `Pairing Check-In Time` 的原有签到时间筛选。
- CLASS 组合条件 `If A If B` 的同 tier 拆分。
- 导入失败分类：Unsupported、机场缺失、pairing 缺失、超过 T7。
