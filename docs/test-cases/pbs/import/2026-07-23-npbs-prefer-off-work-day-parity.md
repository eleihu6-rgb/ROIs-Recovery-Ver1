# NPBS Prefer Off / Any Duty On 导入对齐回归

## 范围

- 文件：`CLASS-BidsReport_July2026.txt`
- Period：`Jul 2026`
- Base：`YEG`
- 模式：Dry Run
- 禁止点击正式 Import

## 基线

| 指标 | 修复前 |
|---|---:|
| Selected Crew | 79 |
| Parsed Preferences | 867 |
| Importable Preferences | 348 |
| Skipped Preferences | 455 |
| Failed Preferences | 64 |

目标源条件：

- 有效 `Prefer Off ... Between HH:MM And HH:MM`：6 条。
- 支持范围内的 `Award Pairings If Any Duty On ...`：18 条。

## 自动化验收

- Mapper：
  - Property 201 输出 `operator = In` 和 `Window HH:MM-HH:MM` tag。
  - Property 110 输出标准 `work-day-preference` JSON。
  - Prefer Off tag 能被当前共享合同解析。
  - Work Day JSON 经当前共享合同 normalize 后保持一致。
- Service：
  - 两项条件写入现有 Property 201/110 结构。
  - Dry Run 不写 Bid。
- 边界：
  - Prefer Off 非法、相同起止、跨夜窗口继续失败。
  - `Every Duty On` 和 `Avoid ... Any Duty On` 继续失败。

## 实际 Dry Run 结果

| 指标 | 修复后 | 变化 |
|---|---:|---:|
| Selected Crew | 79 | 0 |
| Parsed Preferences | 867 | 0 |
| Importable Preferences | 372 | +24 |
| Skipped Preferences | 455 | 0 |
| Failed Preferences | 40 | -24 |

结果符合 `6 + 18 = 24` 的精确增量；未执行正式 Import。

## 页面人工复核

后续如经用户授权执行小范围正式 Import：

1. 选择一名包含 Prefer Off 时间窗口的 Crew。
2. 选择一名包含 Award Any Duty On 的 Crew。
3. 确认 Existing Bid Properties 摘要可读。
4. 打开编辑弹窗，确认日期、星期及时间窗口完整回填。
5. 确认删除可用。
6. 按既有 rollback 流程恢复测试前数据。
