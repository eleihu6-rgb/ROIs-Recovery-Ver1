# Flight Legs per Duty 回归测试

## 目标

验证 `Flight Legs per Duty` 与标准答案一致：支持单值和 `Between`、支持可选 Event Date，并按每个 duty 的本地 Check-In 事件日期筛选。

## 前置条件

- 进入 PBS Portal 的 Pairing 页面。
- 当前 bid period 内存在包含多 duty、普通飞行段和 Deadhead 段的 pairing。
- 测试人员知道至少一个 duty 起飞机场的时区和 `brief_start_utc`。

## 用例

1. 新增 `Flight Legs per Duty`，确认默认显示 `Award`、`Any duty`，Tier、比较符和腿数仍需用户明确选择。
2. 确认比较符包含 `<`、`=`、`>`、`Between`。
3. 选择 `Between`，输入 From `2`、To `4`；确认边界值 2 和 4 均视为匹配，From 大于 To 时禁止保存。
4. 打开 `LIMIT TO EVENT DATE`，确认默认进入 `Specific Dates`，可连续选择多个当前 period 内日期。
5. 切换到 `Date Range`，确认开始/结束日期都必须在当前 period 内，结束日期不得早于开始日期。
6. 保存后重新编辑，确认 action、Any/Every、比较符、From/To 和日期范围完整回显。
7. 使用同一条件执行 Search Pairings，并核对：
   - 每个 duty 独立计数；
   - 只统计 `seg_assignment` 为 `FLT` 或历史兼容值 `FLY` 的飞行段；
   - `DHD`、`DH`、`TRN` 和未知值不计入飞行腿数；
   - Deadhead-only duty 仍参与 Any/Every 判断，其飞行腿数为 0；
   - Event Date 使用该 duty 最早 Check-In 事件所在起飞机场的本地日期，不使用 Base 时区。
8. 核对 Current Bid、Search 条件摘要与算法导出采用同一条件和值。

## 通过标准

- UI、保存回显、搜索结果和算法导出语义一致。
- 旧的 `stepper` 历史记录可以读取为新结构；非法历史值不会被静默修正后保存。
- Airport Preference、Check-In / Check-Out Time、Flight Legs per Duty 使用同一个 Event Date 交互。
