# Pairing Check-In / Check-Out Time — Event Date 对齐测试

## 目标

验证 `Pairing Check-In / Check-Out Time` 与 `Airport Preference` 使用同一套可选事件日期交互和语义：默认不限日期；启用后可选多个具体日期或日期范围；日期和时间均按 Check-In / Check-Out 事件机场当地时间匹配。

## 前置条件

- 使用 `Jun 2026` 投标期。
- 测试账号可进入 Pairing bidding 页面。
- 测试数据至少包含跨时区 pairing，且 segment 有 `brief_start_utc` / `debrief_end_utc` 和出发、到达机场。

## 用例

### 1. 默认 Any date

1. 新增 `Pairing Check-In / Check-Out Time` 条件。
2. 检查 `LIMIT TO EVENT DATE`。
3. 选择完整的时间条件并保存。

预期：

- 开关默认关闭。
- 不显示日期模式和日期选择器。
- 保存值的 `dateScope` 为 `null`，时间条件匹配任意事件日期。

### 2. Specific Dates 多选

1. 打开 `LIMIT TO EVENT DATE`。
2. 保持 `Specific Dates`。
3. 选择 `2026-06-15` 和 `2026-06-18`。
4. 保存并重新打开条件。

预期：

- 未选择日期时条件不可保存。
- 两个日期均被保留并回显。
- 摘要显示两个日期。
- Search Pairings 仅返回事件当地日期为任一所选日期且满足时间条件的 pairing。

### 3. Date Range

1. 打开 `LIMIT TO EVENT DATE`。
2. 切换到 `Date Range`。
3. 选择 `2026-06-10` 至 `2026-06-20`。
4. 保存并重新打开条件。

预期：

- 起止日期完整后可保存。
- 日期范围正确回显。
- Search Pairings 仅返回事件当地日期落在闭区间内且满足时间条件的 pairing。

### 4. 关闭日期限制

1. 已配置 Specific Dates 或 Date Range。
2. 关闭 `LIMIT TO EVENT DATE` 并保存。

预期：日期限制清除，`dateScope` 变为 `null`，恢复 Any date。

### 5. 投标期边界

尝试通过前端或 API 提交 `Jun 2026` 以外的具体日期或范围端点。

预期：前端日期选择器不允许跨月选择；服务端拒绝越界数据，Search Preview 也不能绕过校验。

### 6. 当地时间语义

分别验证 Check-In 和 Check-Out：

- Check-In 使用最早非空 `brief_start_utc`，事件机场为该 segment 的 `dep_arp`。
- Check-Out 使用最晚非空 `debrief_end_utc`，事件机场为该 segment 的 `arv_arp`。
- 日期和时间使用事件机场有效 IANA timezone 转换；机场时区缺失或无效时回退 UTC。

预期：日期与时间来自同一事件和同一时区；跨 UTC 日期边界时按机场当地日期匹配。

### 7. 旧数据兼容

打开旧格式 `dateScope: { mode: "specific_date", date: "2026-06-15" }` 的条件。

预期：自动显示为 `Specific Dates` 且选中 `2026-06-15`；再次保存时写入 `specific_dates` 新格式。

### 8. PAIRING_SCORE 导出

为 property 103 配置 Specific Dates 或 Date Range 后执行算法导出。

预期：`PAIRING_SCORE.csv` 仅包含满足当地事件日期与时间条件的 pairing；该属性不会被标记为不支持。

## 自动化覆盖

- Portal Vitest：默认关闭、多日期、日期范围、关闭恢复 Any date。
- Server node:test：序列化兼容、周期校验、当地事件 SQL、导入兼容、PAIRING_SCORE 导出。
- Playwright：通过真实 Pairing 页面新增、选择多日期、保存并验证摘要。
