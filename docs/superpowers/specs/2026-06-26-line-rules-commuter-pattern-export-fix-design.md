# Line Rules COMMUTER_PATTERN 导出修复设计

## 背景

算法反馈 `Set Condition Maximum Days On In A Row` 和 `Set Condition Minimum Days Off In A Row` 导出为 `COMMUTER_PATTERN` 时参数过窄，导致规则语义从“最多/最少”变成“刚好等于”。

当前 `live-server` 导出逻辑将：

- `Maximum Days On In A Row N` 导出为 `minDaysOn=N, maxDaysOn=N`
- `Minimum Days Off In A Row N` 导出为 `minDaysOff=N, maxDaysOff=N`

这会限制算法只能选择刚好 N 天，而不是允许 1..N 天上班或 N..月天数 天休息。

## 目标

只修复 `live-server` 的算法导出逻辑，保持 Rule ID / Rule Type 不变：

- `Code_ID=202` 仍导出为 `Rule_ID=408`、`Rule_Type=COMMUTER_PATTERN`
- `Code_ID=203` 仍导出为 `Rule_ID=408`、`Rule_Type=COMMUTER_PATTERN`

## 参数映射

### Maximum Days On In A Row N

修复后导出：

```json
{"minDaysOn":1,"maxDaysOn":N,"minDaysOff":0,"maxDaysOff":0}
```

### Minimum Days Off In A Row N

修复后导出：

```json
{"minDaysOn":1,"maxDaysOn":bidMonthDayCount,"minDaysOff":N,"maxDaysOff":bidMonthDayCount}
```

其中 `bidMonthDayCount` 根据导出 period 动态计算，例如 `Jun 2026 = 30`，`Mar 2026 = 31`。

## 不在本次范围

- 不修改 `Days Off / Days On Pattern`（Code_ID 205）语义。
- 不修改 `pbs-server` 的重复导出逻辑，后续以 `live-server` 为准。

## 验收

- `Jun 2026` 下 `Maximum Days On In A Row 5` 导出 `minDaysOn=1,maxDaysOn=5`。
- `Jun 2026` 下 `Minimum Days Off In A Row 7` 导出 `maxDaysOff=30`。
- `Mar 2026` 下同类 `Minimum Days Off In A Row` 导出 `maxDaysOff=31`。
- 对应测试覆盖以上映射，防止回退。
