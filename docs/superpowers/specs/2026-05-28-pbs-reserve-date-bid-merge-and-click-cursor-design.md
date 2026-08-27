# PBS Reserve 日期 Bid 合并与可点击光标设计

日期：2026-05-28  
状态：待用户确认  
范围：Reserve 页面已有条件列表中日期类 bid 的新增合并规则，以及可点击元素的 cursor 反馈；本文件只定义需求和方案，不包含实现改动。

## 背景

当前 Reserve 页面点击 coverage 日历日期后，会新增日期类 Reserve 条件：

- Legacy 模式：`302 Reserve Day On`
- AA 模式：`311 Reserve Prefer Off`

截图中出现了两条 `Reserve Day On`，且两条都只作用在 `T1`：

```text
Reserve Day On | 2026-04-18, 2026-05-07 | T1
Reserve Day On | 2026-04-09             | T1
```

从业务语义看，这不是两个不同条件，而是同一个条件、同一个 Tx 上的多个日期。因此继续新增独立行会让用户误解，也会让后续编辑、删除、保存和校验变复杂。

另外，页面中 edit / delete icon、Tx 切换、日历日期、按钮等可点击区域应统一有小手光标反馈；不可点击的只读 bid 展示框不应显示小手，避免误导。

## 目标

1. 日期类 Reserve bid 在同一条件、同一 active Tx 组合下自动合并。
2. 合并时日期去重并排序。
3. 避免把不同 Tx 组合的规则误合并。
4. 保持 `301 Short Call Type` 不参与日期合并，只保留防重复逻辑。
5. 所有可点击元素统一显示 `cursor-pointer`。
6. 禁用状态统一显示 `cursor-not-allowed`。
7. 只读展示区域不显示小手。

## 合并规则

### 适用条件

只适用于日期列表 bid：

```text
302 Reserve Day On
311 Reserve Prefer Off
```

必须同时满足以下条件才合并：

```text
propertyCode 相同
bid.type = "tag-list"
active Tx 集合完全相同
```

示例：

```text
已有：302 | [2026-04-18, 2026-05-07] | T1
新增：302 | [2026-04-09]             | T1
结果：302 | [2026-04-09, 2026-04-18, 2026-05-07] | T1
```

不合并示例：

```text
已有：302 | [2026-04-18] | T1
新增：302 | [2026-04-09] | T2
结果：保留两行
```

```text
已有：302 | [2026-04-18] | T1
新增：302 | [2026-04-09] | T1, T2
结果：保留两行
```

原因：`T1` 与 `T1+T2` 的规则含义不同，自动合并会改变用户意图。

### 去重规则

如果新增日期已经存在：

- 不重复写入。
- 如果选择的 Tx 全部已经存在该日期，提示已存在，不调用 API。

如果部分日期或部分 Tx 可新增：

- 第一阶段仍按当前 popover 的一次选择处理。
- 对每个最终 Tx 组合，优先合并到完全同 Tx 组合的已有 property。

## 保存策略

新增日期时不再固定调用 add：

1. 找到当前 mode 对应日期类 propertyCode：
   - Legacy：`302`
   - AA：`311`
2. 根据用户选择的 Tx 生成 active Tx 集合。
3. 在已有 properties 中查找：
   - `propertyCode` 相同。
   - `bid.type = "tag-list"`。
   - active Tx 集合完全相同。
4. 如果找到：
   - 合并日期到该 existing property 的 `bid.values`。
   - 调用 `reserveService.patchCurrentDraftProperty(propertyGroupKey, mergedProperty, draftMeta)`。
5. 如果找不到：
   - 仍调用 `reserveService.addCurrentDraftProperty(newProperty, draftMeta)`。

成功后：

- patch 本地 query cache。
- invalidate coverage / tier query。
- 关闭日历 popover。
- toast 显示新增或合并成功。

失败后：

- popover 保持打开。
- toast 显示保存错误。

## `301 Short Call Type`

`301 Short Call Type` 不参与日期合并。

规则保持：

- 同一 call type + 同一 Tx 已存在时，不重复保存。
- 不同 call type 或不同 Tx 可以保留独立行。

## Cursor 反馈规则

应显示小手：

- edit icon 按钮。
- delete icon 按钮。
- Tx toggle 按钮。
- coverage 日历日期按钮。
- 日历 popover 的 Tx checkbox label。
- `ADD SHORT CALL TYPE`。
- dialog / popover 的 `ADD BID`、`CANCEL`。
- 其它真实可点击 button。

应显示禁用光标：

- 保存 pending 中的按钮。
- pending 中不可切换的 Tx / checkbox。

不显示小手：

- 只读 bid 展示框。
- 只读 property name 展示框。
- 普通文本、统计数字、标题。

## 组件影响

### `ReservePage`

新增或调整 helper：

- 获取 active Tx 集合。
- 比较两个 active Tx 集合是否完全相同。
- 合并日期列表并排序。
- 根据新增日期决定走 add 还是 patch。

### `RuleBidPropertyTable`

检查 edit / delete / Tx 按钮 cursor 样式。

如果共享组件已有可点击但缺少 `cursor-pointer`，应补齐；同时确认 disabled 样式不被覆盖。

### `ReserveCoverageCalendar`

当前日期按钮和 popover 内控件已有 cursor 样式时保持；缺失处补齐。

## 测试范围

前端 `reserve-page.test.tsx` 建议补充：

1. Legacy 下新增 `302`，若已有同 Tx 的 `302`，调用 patch 而不是 add。
2. 合并后日期去重、排序。
3. Legacy 下新增 `302`，若 Tx 组合不同，仍调用 add。
4. AA 下新增 `311` 同样按同 Tx 合并。
5. `301 Short Call Type` 不参与日期合并，保持当前防重复测试。

共享 table 样式若有测试价值，可补轻量断言；否则通过人工检查和 build 保证。

## 验收标准

1. 截图中的两条同 Tx `Reserve Day On` 场景，新增后会合并成一条日期列表。
2. `T1` 和 `T1+T2` 不会被误合并。
3. `Reserve Prefer Off` 在 AA 模式下也采用同样日期合并规则。
4. 重复日期不会被写入两次。
5. 所有可点击 icon / button / Tx 控件有小手反馈。
6. 禁用状态显示不可点击反馈。
7. Reserve 页面测试通过，portal build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Reserve 页面保存逻辑、少量共享表格 cursor 样式和 Reserve 测试；拆分并行容易碰同一文件，协调成本高。
- Suggested split: 不拆分。
- Write boundaries: 主要写 `pbs-portal/src/features/reserve/pages/reserve-page.tsx`、`reserve-page.test.tsx`，必要时轻微修改 `rule-bid-property-table.tsx` 的 className。
- Conflict risk: 中低。Reserve 文件当前已有连续改动，单人顺序改更稳。
- Execution gate: 用户确认本 spec 后再开始实现。

