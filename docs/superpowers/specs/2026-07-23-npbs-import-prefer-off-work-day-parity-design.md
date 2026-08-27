# NPBS 导入 Prefer Off 时间窗口与 Any Duty On 对齐设计

## 背景

2026 年 7 月 YEG Crew Bid Import Dry Run 中，以下两类旧 NPBS 条件被错误阻断：

1. `Prefer Off Jul 1, 2026 Between 03:00 And 23:59`
   - 当前错误码：`prefer_off_time_window_not_supported`
   - Portal 手动填写的 `Prefer Off` 已支持日期与时间窗口组合，因此这是导入映射缺失。
2. `Award Pairings If Any Duty On Jul 2, 2026, Jul 9, 2026`
   - 当前错误码：`work_day_preference_requires_complete_check_in_windows`
   - 当前 `Work Day Preference` 要求每个选中星期都有完整 Check-In 窗口；旧条件表达“全天任意 Duty”，可用 `00:00–23:59` 忠实表示。

本设计只修复这两个映射，不改变 `Pairing Total Credit`、`Enroute Check-In Time` 或其他旧条件的支持状态。

## 目标

- 让上述两类 NPBS 条件生成与 Portal 手动填写完全相同的现有 Bid 数据结构。
- 保留源文件的日期、星期、时间窗口和 Award 语义。
- 修复后重新执行相同 July/YEG Dry Run，两类错误不再出现，可导入条件数相应增加。
- 导入后的条件可以在 Bid 页面正常显示、编辑和删除。

## 非目标

- 不新增 Bid Property、页面控件、API 或数据库字段。
- 不修改数据库 schema，不新增 Migration。
- 不支持 `Pairing Total Credit`。
- 不支持 `Enroute Check-In/Check-Out Time`。
- 不把 `Avoid Pairings If Any Duty On ...` 强行映射到只支持 Award 的 `Work Day Preference`。
- 不自动执行正式 Import；实现验证只运行 Dry Run 和测试。

## 方案选择

### 采用：复用当前 Portal 合同

导入器直接生成现有 `Prefer Off` 和 `Work Day Preference` 的标准序列化结构。导入数据与页面手动填写保持同构，继续复用现有摘要、编辑、删除、算法导出和校验路径。

### 不采用：导入专用兼容 JSON

该方案会产生页面无法完整回填的第二种结构，再次造成导入数据与手动数据分叉。

### 不采用：丢弃时间或日期信息

忽略时间窗口或日期范围会改变用户投标语义，不符合忠实导入要求。

## 详细设计

### 1. Prefer Off 时间窗口

#### 输入

支持现有 `Prefer Off` 日期表达式末尾附加一个时间窗口：

```text
Prefer Off Jul 1, 2026 Between 03:00 And 23:59
Prefer Off Between Jul 1, 2026 And Jul 5, 2026 Between 08:00 And 18:00
Prefer Off Weekends Between 08:00 And 18:00
```

#### 解析

1. 从条件末尾解析 `Between HH:MM And HH:MM`。
2. 移除时间窗口后，继续使用现有日期/星期解析器处理主体。
3. 时间必须是有效的 24 小时制 `HH:MM`。
4. `from` 必须早于 `to`；不支持跨夜窗口。
5. 日期必须属于目标 Period；继续沿用现有“不平移源日期”规则。

#### 输出

继续使用 Property `201 Prefer Off` 的 `tag-list` 表达：

```json
{
  "type": "tag-list",
  "values": [
    "2026-07-01",
    "Window 03:00-23:59"
  ]
}
```

日期范围和 Weekends 继续使用现有标签格式，只在末尾增加一个 `Window HH:MM-HH:MM` 标签。该结构与 `buildPreferOffBidValues()` 的页面手动保存结果一致。

导入 mapper 不直接写上述 UI JSON。它继续输出当前写入链路使用的标准字段：

- `operator = "In"`
- `paramA = "<现有日期/星期标签>,Window HH:MM-HH:MM"`

现有导入写入和读取链路负责将该序列化形态还原为页面的 `tag-list`。测试必须同时断言 mapper 存储形态和读取后的 UI 形态，避免引入第二套数据结构。

#### 错误处理

- 时间格式非法：返回明确的 `invalid_prefer_off_time_window`。
- `from >= to` 或跨夜：返回明确错误，不交换时间、不扩展为次日。
- 日期主体非法：保留现有日期错误码。

### 2. Any Duty On → Work Day Preference

#### 支持范围

仅支持：

```text
Award Pairings If Any Duty On <日期/日期范围/星期表达式>
```

`Every Duty On` 和 `Avoid Pairings If Any Duty On` 不在本次范围内，避免改变语义。

#### 日期与星期转换

复用现有日期解析规则，然后生成 Property `110 Work Day Preference`：

- 明确日期列表：
  - `dateScope.mode = "specific_dates"`
  - `dateScope.dates` 保存去重、升序后的原始目标 Period 日期。
  - 从每个日期推导星期，按 `MON` 到 `SUN` 去重排序。
- 日期范围：
  - `dateScope.mode = "date_range"`
  - 保留原始 `from`、`to`。
  - 推导范围内实际出现的星期，按 `MON` 到 `SUN` 去重排序。
- 仅星期：
  - `dateScope = null`
  - 直接使用源文件星期。

每个选中星期生成相同的全天 Check-In 窗口：

```json
{
  "type": "work-day-preference",
  "days": [
    {
      "dayOfWeek": "THU",
      "checkInFrom": "00:00",
      "checkInTo": "23:59"
    }
  ],
  "dateScope": {
    "mode": "specific_dates",
    "dates": [
      "2026-07-02",
      "2026-07-09"
    ]
  }
}
```

该结构必须通过现有 `isWorkDayPreferenceBidValueValid()` 校验，并与 Portal 手动填写后生成的结构完全一致。

#### Compound Pairing 条件

现有规则仍只导入一条旧 Pairing Preference 的 primary clause，并对 secondary clauses 给出 warning。本次不扩展为多 Property AND 组合。

若 primary clause 是支持范围内的 `Any Duty On`，生成 Property 110；其余 secondary clauses 仍按现有规则记录为 dropped warning。

#### 错误处理

- 日期不在目标 Period、日期非法或范围反向：沿用现有日期错误码。
- 无法得到任何有效日期或星期：保持失败，不创建空 `days`。
- `Every Duty On`：保持不支持并给出明确错误。
- `Avoid ... Any Duty On`：保持不支持并说明当前 Property 110 仅支持 Award。

## 数据流

```text
NPBS source line
  → parse current/default crew block
  → mapCrewBidPreference
  → parse date/time clause
  → build existing Property 201 or 110 payload
  → existing import write path
  → current Bid summary/edit/delete path
```

不新增旁路写入逻辑，正式 Import 仍使用现有事务、备份和 rollback 流程。

## 测试策略

### Mapper 单元测试

- Prefer Off：
  - specific dates + time window
  - date range + time window
  - Weekends + time window
  - 非法时间、相同起止、跨夜
  - 目标 Period 外日期
- Any Duty On：
  - 单日期
  - 多日期且星期去重
  - 日期范围
  - 仅星期
  - `Every Duty On` 不映射
  - `Avoid ... Any Duty On` 不映射

### Service/写入结构测试

- Property 201 写入后的值与页面手动 `tag-list` 结构一致。
- Property 110 写入完整 `work-day-preference` JSON。
- 使用现有 service/页面测试 fixture 验证两种数据能由读取、摘要和编辑回填路径识别。
- Dry Run 不产生 Bid 写入。

### 回归验证

1. 运行 Crew Bid Import focused Vitest。
2. 运行 `live-server` build。
3. 使用相同 July/YEG 文件重新 Dry Run。
4. 修改前先从 Dry Run 响应记录两个目标错误码各自对应的源 preference 集合和数量，记为：
   - `N1 = prefer_off_time_window_not_supported` 中符合本 spec 支持语法、时间格式有效且 `from < to` 的唯一源 preference 数量；非法、相同起止和跨夜窗口不计入 N1。
   - `N2 = work_day_preference_requires_complete_check_in_windows` 中符合本 spec Award/Any Duty On 支持范围的唯一源 preference 数量。
5. 对比基线：
   - 当前：867 条解析，348 条可导入，455 条跳过，64 条失败。
   - 修复后 `parsedPreferenceCount` 必须仍为 867。
   - 上述 `N1 + N2` 条源 preference 必须逐条成为 importable，不能变成 skipped。
   - `importablePreferenceCount` 必须增加 `N1 + N2`。
   - `failedPreferenceCount` 必须相应减少 `N1 + N2`。
   - 不得新增其他错误码；不在本 spec 范围内的同名错误仍可保留。
6. 页面兼容性通过现有真实页面数据结构对应的 component/page fixture 测试验证；本次不以 Dry Run 伪装真实写入结果。
7. 不点击全量或单 Crew 正式 Import。若后续需要真实页面核对导入结果，必须由用户另行授权一次小范围 Import，并沿用既有 rollback 流程。

## 验收标准

- `prefer_off_time_window_not_supported` 在符合格式的条件上不再出现。
- `work_day_preference_requires_complete_check_in_windows` 在支持范围内的 Award/Any Duty On 条件上不再出现。
- 生成的数据结构与页面手动填写一致。
- 读取、摘要和编辑回填测试证明页面能够消费两种标准结构；在未执行正式 Import 前不声称已完成真实写入后的页面验证。
- 非法输入仍被阻断，不进行静默修正。
- `Pairing Total Credit`、`Enroute Check-In Time` 的行为不变。
- 没有数据库或 Migration 改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两项修改集中在同一个 mapper 和同一组测试，拆分写入会增加冲突和集成成本。
- Suggested split: 不拆分；由单一实现流程完成 mapper、测试和 Dry Run。
- Write boundaries: `live-server` Crew Bid Import mapper、对应测试及必要测试文档。
- Conflict risk: 低。
- Execution gate: 本 spec 经用户确认后再编写实施计划和修改代码。
