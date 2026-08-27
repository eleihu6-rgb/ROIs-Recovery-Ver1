# PBS Days Off 日历新增 DO 默认空选设计

日期：2026-06-09  
范围：PBS Portal `/days-off` 页面左侧 `BIDDING CALENDAR` 的 Day Off 日历编辑弹层

## 背景

当前 `/days-off` 页面左侧日历支持点击日期创建或编辑 Day Off bid。打开 `Apply to Tiers` 弹层时，如果目标日期没有已有 Day Off，前端会根据左侧当前 active tier 自动预选一组 tier：

- active tier 是 `T1` 时，默认勾选 `T1-T7`。
- active tier 是 `T4` 时，默认勾选 `T4-T7`。

客户反馈不喜欢这个默认关联行为。客户期望打开新增 Day Off 弹层时不要自动选择任何 tier，由用户自己决定点击哪些 tier。

## 目标

- 对没有已有 Day Off 的日期，打开弹层时 `T1-T7` 默认全部不勾选。
- 对已经保存过 Day Off 的日期，打开弹层时继续回显已有 Day Off 所属 tier，方便用户取消或调整。
- 不再把左侧当前 active tier 用作新增 Day Off 的默认 tier 选择来源。
- 用户必须手动勾选至少一个有效 tier 后，才能保存新增 Day Off。
- 保持已有 Day Off 的删除、清空、保存和 pairing blocked tier 保护逻辑不变。

## 非目标

- 不修改后端 API。
- 不修改数据库、schema、migration。
- 不修改 Days Off 右侧 property 列表的新增/编辑逻辑。
- 不修改 Pairing 日历新增 pairing bid 的默认 tier 行为。
- 不修改左侧 calendar 的 active tier 跨页面保持逻辑。
- 不引入新的全局配置项或新依赖。

## 当前实现定位

当前默认预选逻辑位于：

- `pbs-portal/src/features/dashboard/hooks/use-days-off-calendar-actions.tsx`
- `pbs-portal/src/features/dashboard/dashboard-calendar-state.ts`

核心行为是 `openCalendarAction()` 在没有已有 date/tier 时调用 `buildDefaultSelectedTiers(activeDraftTierLabel)`。

相关旧行为已有测试覆盖：

- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`

因此本次需要同步更新测试预期，避免继续锁定旧的 `Tn-T7` 自动预选行为。

## 推荐方案

只修改 Day Off 日历弹层打开时的初始选择策略：

```text
if 目标日期已有 Day Off tier:
  selectedTiers = 已有 Day Off tier
else:
  selectedTiers = []
```

也就是说：

- 新增场景：默认空选。
- 编辑场景：默认回显已有 tier。
- 保存时仍使用现有 `canSaveCalendarAction()` 判断是否有真实变更。
- blocked tier 仍保持禁用，不允许新增到被 pairing bid 覆盖的 tier/date。

这个方案影响范围最小，只改变客户明确不喜欢的默认勾选行为，不触碰服务端和持久化契约。

## 备选方案

### 方案 A：仅改 Day Off 新增默认值（推荐）

对无已有 Day Off 的日期直接使用空数组作为 `selectedTiers`。

优点：

- 改动小。
- 不影响已有 Day Off 回显。
- 不影响 Pairing 日历。
- 测试可直接覆盖客户场景。

缺点：

- `buildDefaultSelectedTiers()` 仍会被其他日历入口使用，代码里需要明确 Day Off 新增不再调用它。

### 方案 B：增加日历默认选择模式参数

为日历 action 增加类似 `defaultTierSelectionMode = "active-tier-range" | "empty"` 的配置。

优点：

- 后续不同模块可配置默认策略。

缺点：

- 当前需求很小，引入模式参数会增加抽象和测试成本。
- 容易让共享日历逻辑变复杂。

### 方案 C：全局废弃 active tier range 默认行为

完全移除 `buildDefaultSelectedTiers()` 对所有日历新增动作的影响。

优点：

- 行为更一致，所有新增都由用户主动选择。

缺点：

- 可能影响 Pairing 日历等其他已确认流程，超出本轮客户反馈范围。

## 交互设计

### 无已有 Day Off 的日期

用户点击一个没有 Day Off 的日期：

- 弹层打开。
- `T1-T7` checkbox 全部未勾选。
- 如果存在被 pairing bid 阻挡的 tier，对应 checkbox 仍 disabled。
- `SAVE BID` 初始应 disabled，因为没有任何变更。
- 用户勾选一个或多个可选 tier 后，`SAVE BID` 才可点击。
- 保存后只把用户实际勾选的 tier/date 写入 current draft。

### 已有 Day Off 的日期

用户点击一个已有 Day Off 的日期：

- 弹层打开。
- 已保存的 tier 默认勾选。
- 未保存的 tier 默认不勾选。
- 用户取消已有勾选后保存，可删除对应 tier/date。
- 用户新增其他 tier 后保存，可追加对应 tier/date。
- 如果清空全部 tier 后保存，继续沿用现有删除该日期 Day Off 的行为。

### Weekday 批量入口

如果左侧日历存在点击 weekday 表头批量选择某一星期几的入口，本轮建议沿用同样原则：

- 不基于 active tier 自动预选 `Tn-T7`。
- 若没有明确可回显的已有 tier，默认空选。
- 用户手动选择 tier 后再保存批量 Day Off。

实现时应确认现有 weekday 行为测试，如有旧的自动预选断言，应同步更新。

## 数据流

1. 用户在 `/days-off` 点击左侧日历日期。
2. `DashboardSchedulePanel` 将点击事件交给 `useDaysOffCalendarActions()`。
3. `openCalendarAction()` 根据 current draft 查找目标日期已有 Day Off tier。
4. 如果查到已有 tier，作为弹层初始 `selectedTiers`。
5. 如果没有查到已有 tier，初始 `selectedTiers = []`。
6. 用户手动调整 checkbox。
7. 保存时继续调用现有 `saveDaysOffCalendarAction()`。
8. 保存成功后继续更新本地 draft、patch Days Off page data，并 invalidate 相关 calendar query。

## 错误处理

- 无已有 Day Off 且用户未选择任何 tier 时，`SAVE BID` 保持 disabled，不发起请求。
- blocked tier 继续 disabled；用户不能把新增 Day Off 保存到被 pairing bid 覆盖的 tier/date。
- 保存失败继续展示现有 `Unable to save days off calendar bid.`。
- draft version 冲突、后端错误和 query recovery 继续沿用现有处理。

## 测试计划

前端自动化测试：

- 新增或更新 `shared-bidding-workbench-layout.test.tsx`：
  - 无已有 Day Off 的日期打开弹层时，`T1-T7` 均未勾选。
  - 无已有 Day Off 的日期打开弹层时，`SAVE BID` 初始 disabled。
  - 用户手动勾选 `T2` 后保存，只写入 `T2` 对应日期，不写入 `T3-T7`。
  - 已有 Day Off 的日期打开弹层时，已有 tier 继续默认勾选。
  - 清空已有 tier 后保存，仍可删除该日期 Day Off。
  - blocked tier 在空选默认下仍 disabled 且不被写入。

回归验证建议：

- `npm test -- shared-bidding-workbench-layout.test.tsx`
- 如实现影响共享 helper，再补跑相关 dashboard calendar state 测试。
- 交付前按 PBS Portal 模块约定视改动范围选择 `npm run lint`、`npm run build` 或仓库根 `npm run verify:pbs`。

QA 人工测试建议：

1. 进入 `/days-off`。
2. 切换左侧 active tier 到 `T1`，点击一个没有 Day Off 的日期。
3. 确认弹层中 `T1-T7` 全部未勾选，保存按钮不可点击。
4. 手动勾选 `T2` 后保存。
5. 确认日历只在 `T2` 对应日期显示 Day Off，不自动填充 `T3-T7`。
6. 点击已有 Day Off 日期，确认已有 `T2` 会回显勾选。
7. 取消 `T2` 并保存，确认该日期 Day Off 被删除。
8. 切换 active tier 到 `T4`，重复新增操作，确认不会默认勾选 `T4-T7`。

## 验收标准

- Daysoff 无已有 DO 的日历日期打开后，不再默认选中任何 tier。
- 已有 DO 的日期打开后，仍显示已有 tier 勾选状态。
- 左侧 active tier 不再影响 Daysoff 新增 DO 的默认选择。
- 用户手动选择哪些 tier，保存后就只影响这些 tier。
- Pairing 日历、Tier 页面和 Days Off 右侧 property 编辑不出现行为回退。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个前端 hook 和少量共享工作台测试，串行处理更快、更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/dashboard/hooks/use-days-off-calendar-actions.tsx`、`pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`，必要时包含相关 helper 测试。
- Conflict risk: 低。主要风险是测试里旧预期较多，需要逐条改成新交互语义。
- Execution gate: 用户审核并确认本 spec 后，再进入代码实现。
