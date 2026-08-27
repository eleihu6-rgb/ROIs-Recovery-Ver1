# Crew Bid Import 与手动录入一致性测试

## 目标

验证 Crew Bid Import 导入后的 bid 数据，与用户在 Portal 手动录入相同条件并保存后的数据一致。

## 前置条件

- 使用 `CLASS-BidsReport_June2026.txt`。
- Period 选择 `Jun 2026`。
- 执行 `Dry Run` 后确认 `Unsupported` 为 0，系统写入错误为 0。
- 如环境中已有旧格式导入数据，先回滚或清理后重新导入；本次不验证旧数据兼容。

## 操作步骤

1. 在 Admin Tools 上传 `CLASS-BidsReport_June2026.txt`。
2. 点击 `Dry Run`，确认导入报告没有 unsupported 条件。
3. 点击 `Import` 执行正式导入。
4. 打开 crew 19 的 Portal 页面。
5. 进入 Days Off，打开 `Prefer Off` 的编辑弹窗。
6. 进入 Pairing，分别打开 T3/T4/T5 的 `Pairing Number` 相关条件。
7. 抽查整份导入文件中其他包含 `Prefer Off`、`Pairing Number + Specific Date`、组合条件的 crew。
8. 对抽查到的条件执行一次 `UPDATE BID` 或取消后重新打开，确认数据不变。

## 预期结果

- `Prefer Off` 列表不显示原始 JSON。
- `Prefer Off` 编辑弹窗完整显示导入日期或星期，例如 crew 19 的 18 个 June 日期。
- `Pairing Number` BID 区显示 `T4528` 这类 pairing number，不显示内部 `pairing_id`。
- `Specific Date` 模式按 pairing number 加载 runs。
- `Confirmed Runs` 显示 pairing number + 日期。
- 保存后重新打开，日期、tiers、mode、confirmed runs 不丢失。
- 所有成功导入 crew 的同类条件都满足以上规则。

## 异常与边界

- Missing Pairing / Missing Airport 属于目标期数据缺失，不属于本测试失败。
- Over T7 属于导入容量规则，不属于本测试失败。
- Crew / User 警告不阻止 bid 导入，但应在导入报告中保留原因。
- 旧导入格式不做运行时兼容；发现旧格式数据时应回滚重导或单独清理。

## 回归范围

- Admin Tools Crew Bid Import。
- Days Off `Prefer Off` 列表、编辑弹窗、保存。
- Pairing `Pairing Number` Entire Month / Specific Date 弹窗。
- Tier 页面读取导入后的条件。
- Bidding Calendar 中对应 bid 的展示。
