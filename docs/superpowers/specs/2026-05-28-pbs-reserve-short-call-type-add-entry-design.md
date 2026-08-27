# PBS Reserve Short Call Type 新增入口设计

日期：2026-05-28  
状态：待用户确认  
范围：Reserve 页面 `301 Short Call Type` 的新增入口与 Legacy / AA 两种模式的条件添加边界；本文件只定义需求和方案，不包含实现改动。

## 背景

Reserve 页面已经拆成两个模式：

- `Legacy Reserve`：旧库语义。
- `AA Prefer Off`：AA 文档语义。

当前页面已经去掉旧的通用 `ADD RESERVE BID` 区域，并改成：

- 点击 coverage 日历日期，在弹窗里选择 Tx 后新增日期类 bid。
- Legacy 模式日历新增 `302 Reserve Day On`，表示“我想这天上 reserve / on duty”。
- AA 模式日历新增 `311 Reserve Prefer Off`，表示“我想这天休息 / 不上 reserve”。

这个方向是对的，但它带来一个遗漏：`301 Short Call Type` 不是日期条件，不能通过点击日历添加；旧的通用 `ADD RESERVE BID` 又已经删除，所以目前 Legacy 模式缺少新增 `301` 的入口。

## 目标

1. 不恢复旧的通用 `ADD RESERVE BID` 区域。
2. 保持日历只负责日期类 Reserve 条件。
3. Legacy 模式补一个专门的 `301 Short Call Type` 新增入口。
4. AA 模式不显示 `Short Call Type` 新增入口。
5. 新增入口要支持选择 Tx / Tier，和现有 Reserve 条件保存模型一致。
6. 已有 bid 的修改仍走 `EXISTING RESERVE PROPERTIES` 中的 edit icon 弹窗，不允许在表格里直接改 bid 值。

## 两种模式的添加规则

### Legacy Reserve

Legacy 模式支持两个条件：

| 条件 | 添加方式 | 语义 |
| --- | --- | --- |
| `301 Short Call Type` | 专门的小入口 / 按钮打开弹窗添加 | 我想要某种 reserve call type |
| `302 Reserve Day On` | 点击 coverage 日历日期后，在日期弹窗里选择 Tx 添加 | 我想这天上 reserve / on duty |

`301 Short Call Type` 可选值沿用旧库：

```text
CRAM, CRPM, PRAM, PRMM, PRPM, RESA, RESB
```

### AA Prefer Off

AA 模式第一阶段只支持日期类：

| 条件 | 添加方式 | 语义 |
| --- | --- | --- |
| `311 Reserve Prefer Off` | 点击 coverage 日历日期后，在日期弹窗里选择 Tx 添加 | 我想这天休息 / 不上 reserve |

AA 模式不显示 `301 Short Call Type`，避免把旧库 call type 语义混入 AA Prefer Off。

## 推荐交互方案

在 Reserve 右侧面板顶部区域保留：

```text
Legacy Reserve | AA Prefer Off
```

Legacy 模式下，在 mode toggle 附近增加一个小型操作按钮：

```text
Short Call Type
```

点击后打开一个专门弹窗，内容包括：

- 标题：`Add Short Call Type`
- Bid：选择 call type。
- Apply to Tx：选择 `T1` 到 `T7`。
- 操作：
  - `Cancel`
  - `Add Bid`

保存后生成：

```text
propertyCode = 301
bid.type = select
bid.value = selected call type
tiers = selected Tx active
```

然后调用现有 `reserveService.addCurrentDraftProperty`，成功后更新右侧已有条件列表和 tier cache。

## 不做范围

- 不恢复旧的 `ADD RESERVE BID` 通用区。
- 不把 `301 Short Call Type` 放到 coverage 日历点击弹窗里。
- 不改变 `302 Reserve Day On` 和 `311 Reserve Prefer Off` 的日历添加方式。
- 不新增后端 API。
- 不改变后端 `301/302/311` 校验语义。
- 不实现更多 AA Reserve 条件。

## 组件边界

建议新增或调整以下前端边界：

### `ReserveShortCallTypeAddButton`

职责：

- 只在 Legacy 模式渲染。
- 找到 `propertyCode=301` 的 available property template。
- 打开新增弹窗。
- 不直接持有页面级保存逻辑。

### `ReserveShortCallTypeDialog`

职责：

- 展示 call type 选择和 Tx 多选。
- 校验必须选择 call type，且至少选择一个 Tx。
- confirm 时返回构造好的 `RuleBidAvailableProperty` 或返回最小表单值给页面组装。
- 不直接调用 API。

### `ReservePage`

职责：

- 决定 Legacy / AA 模式下哪些入口显示。
- 复用现有 `handleAddProperty`。
- 保存成功后 invalidate tier query。
- 保持日历新增逻辑只处理 `302/311`。

## 数据流

1. 用户处于 `Legacy Reserve`。
2. 点击 `Short Call Type`。
3. 弹窗选择 call type 和 Tx。
4. 前端基于 available property template 组装 `301`。
5. 调用 `reserveService.addCurrentDraftProperty`。
6. 成功后：
   - patch `reservePageDataQueryKey` cache。
   - invalidate `tierPageDataQueryKey`。
   - 关闭弹窗。
   - toast 成功。
7. 失败后：
   - 弹窗保持打开。
   - toast 显示保存错误。

## 重复处理

第一阶段建议采用前端轻量检查：

- 同一 `propertyCode=301`、同一 call type、同一 Tx 已存在时，不重复保存该 Tx。
- 如果用户选择的 Tx 全部已存在，提示已存在，不调用 API。
- 如果部分 Tx 已存在，只保存未存在的 Tx。

后端仍保留最终校验，避免绕过前端造成非法数据。

## 测试范围

前端 `reserve-page.test.tsx` 建议补充：

1. Legacy 模式显示 `Short Call Type` 新增入口。
2. AA 模式不显示 `Short Call Type` 新增入口。
3. 点击 `Short Call Type` 打开新增弹窗。
4. 未选择 call type 或 Tx 时不能提交。
5. 选择 call type 和 Tx 后调用 add API，payload 为 `propertyCode=301`。
6. Legacy 日历点击仍新增 `302 Reserve Day On`。
7. AA 日历点击仍新增 `311 Reserve Prefer Off`。

若实现只改前端且复用已有后端校验，本轮不强制新增后端测试；如果实现时发现后端 `301` add payload 校验覆盖不足，再补 `pbs-server/src/services/reserve/reserve-validation.test.ts`。

## 验收标准

1. `Legacy Reserve` 下可以新增 `301 Short Call Type`。
2. `Legacy Reserve` 下点击日历只新增 `302 Reserve Day On`。
3. `AA Prefer Off` 下点击日历只新增 `311 Reserve Prefer Off`。
4. `AA Prefer Off` 下看不到 `Short Call Type` 新增入口。
5. 旧的通用 `ADD RESERVE BID` 不出现。
6. 已有 bid 值仍通过 edit icon 弹窗修改。
7. 页面高度和右侧面板滚动行为不破坏 Pairing / Line 对齐后的结构。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动范围很窄，主要集中在 Reserve 前端页面和少量测试；拆给多个 agent 的协调成本高于收益。
- Suggested split: 不建议拆分。由一个实现者完成组件、页面接线和测试更新即可。
- Write boundaries: 预计只触碰 `pbs-portal/src/features/reserve/*`，必要时不改共享 `rule-bids` 组件。
- Conflict risk: 低，但当前 Reserve 相关文件已有连续改动，仍应避免并行编辑同一批文件。
- Execution gate: 用户确认本 spec 后再开始实现。

