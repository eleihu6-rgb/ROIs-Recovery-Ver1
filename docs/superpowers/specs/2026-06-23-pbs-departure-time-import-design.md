# PBS 导入新增 Departure Time 条件设计

## 背景

CLASS bid report 中出现如下条件：

```text
Award Pairings If Departing On Between 06:00 And 06:45 If Any Landing In PVR
```

当前导入器把 `Departing On` 固定解析为日期 / 星期条件，因此遇到 `Between 06:00 And 06:45` 会报 `unsupported_date_clause`。

经过语义确认，`Pairing Check-In Time` 是签到 / brief / report 时间，不等于航班起飞时间；不能把这类条件映射到 `Pairing Check-In Time`。

## 目标

- 新增独立的 `Departure Time` pairing 条件，用于表达“首个航班计划起飞时间”。
- 原有日期 / 星期条件继续保留，不改变行为，只把展示名称从 `Departing On` 调整为更清晰的 `Departure Date / Day`。
- 导入器兼容 CLASS 文本里的 `Departing On Between HH:MM And HH:MM`，并映射到新 `Departure Time` 条件。
- 组合条件继续沿用当前同 tier 多条件模型，不新增复合 property。

## 非目标

- 不把时间参数塞进现有 `Departing On` / `Departure Date / Day` 条件。
- 不把起飞时间条件映射为 `Pairing Check-In Time`。
- 不改变 `Departing On Mar 9, 2026`、`Departing On Monday` 等现有日期 / 星期导入逻辑。
- 不改变 pairing airport / pairing number 等其他条件语义。

## 语义定义

### Departure Date / Day

原 `Departing On` 条件，仍使用现有 `propertyCode 106`。

- 输入：日期、星期、日期范围。
- 示例：
  - `Departing On Mar 9, 2026`
  - `Departing On Monday`
  - `Departing On Mar 1, 2026 Through Mar 7, 2026`
- 业务语义：pairing occurrence 的开始日期 / 星期。

### Departure Time

新增 pairing 条件。

- 输入：时间，支持 `<`、`=`、`>`、`Between`。
- 示例：
  - `Departure Time Between 06:00 And 06:45`
  - `Departure Time > 15:00`
- 业务语义：pairing 首个有效航班段的计划起飞时间。
- 数据来源：`pairing_segment.sch_str_dt_utc` 的 time 部分，按现有 PBS pairing search 时区处理规则转换后比较。

## 导入映射

CLASS 原文：

```text
Award Pairings If Departing On Between 06:00 And 06:45 If Any Landing In PVR
```

导入结果应拆成同一 tier 下两条 pairing 条件：

```text
Departure Time · Award · Between 06:00 And 06:45
Any Landing In Airport · Award · Any · PVR
```

现有日期文本继续映射到 `Departure Date / Day`：

```text
Award Pairings If Departing On Mar 9, 2026
```

导入结果：

```text
Departure Date / Day · Award · Mar 9, 2026
```

## 方案比较

### 方案 A：新增 `Departure Time`，原条件改名

推荐。

优点：
- 语义最清晰，避免把日期和时间塞进同一个 property。
- 不影响现有 `Departing On` 的日期 / 星期导入和搜索逻辑。
- UI 上用户能明确区分起飞日期和起飞时间。

代价：
- 需要新增 property catalog、validation、search condition、导入映射和测试。

### 方案 B：扩展现有 `Departing On`

不推荐。

优点：
- property 数量少一个。

问题：
- 一个条件同时支持日期 / 星期 / 时间，UI 和 validation 会变复杂。
- 容易让用户把 `Departing On` 和 `Departure Time` 语义混在一起。
- 时间比较不能复用现有 `Departing On` 的日期字段，否则会错误使用 check-in/report fallback。

### 方案 C：保持 Unsupported

不推荐。

优点：
- 改动最小。

问题：
- CLASS 文件里这个条件实际可表达，继续 Unsupported 会降低导入完整度。

## 实现范围

预计需要修改：

- pairing bid property contract / catalog：新增 `Departure Time`，重命名旧展示名。
- SQL seed / property metadata：补充新 property，调整展示名称。
- pairing search condition builder：按首个有效 `pairing_segment.sch_str_dt_utc` 的 time 匹配。
- crew bid import mapper：把 `Departing On Between HH:MM And HH:MM` 识别为 `Departure Time`。
- validation / serializer / formatter：保证 UI、保存、规则展示一致。
- Playwright / Vitest 测试：覆盖导入映射、UI 展示、组合条件、搜索条件。

## 验收标准

- 原有 `Departing On Mar 9, 2026`、`Departing On Monday` 导入成功，显示为 `Departure Date / Day`。
- 新文本 `Award Pairings If Departing On Between 06:00 And 06:45 If Any Landing In PVR` 导入成功。
- 导入后同一 tier 内出现：
  - `Departure Time · Award · Between 06:00 And 06:45`
  - `Any Landing In Airport · Award · Any · PVR`
- 现有 `Pairing Check-In Time` 逻辑不受影响。
- pairing 搜索 / count 使用首个航班计划起飞时间，不使用 check-in/report 时间。
- 全量 dry-run 中该 `unsupported_date_clause` 不再出现；如果还有失败，应归类为其他原因。

## 风险与注意事项

- 需要明确 `Departure Time` 的时区转换与现有 pairing search 保持一致，避免 UTC/local time 偏差。
- 如果旧 seed 里存在历史 `Departure Time` code，不能直接复用被现行 catalog 占用的 code。
- 新 propertyCode 应选择当前 active catalog 未使用的稳定编号，并同步 SQL / contract / tests。
- 如果 pbs-server 和 live-server 有重复 mapper 或 search 逻辑，需要保持一致，避免 portal 与 live dry-run 行为不一致。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务跨 contract、mapper、search、测试，但同一语义链路高度耦合，拆 agent 容易改出不一致。
- Suggested split: 不拆分；由一个实现流程完成。
- Write boundaries: pairing property contract、SQL seed、import mapper、pairing search、相关 tests。
- Conflict risk: Medium，主要风险在 propertyCode 和双 server 逻辑同步。
- Execution gate: 本 spec 经用户确认后再进入实现。
