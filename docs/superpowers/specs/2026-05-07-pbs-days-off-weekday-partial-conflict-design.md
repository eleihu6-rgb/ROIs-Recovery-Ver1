# PBS Days Off 星期表头部分冲突保存设计

## 背景

`Days Off` 页面左侧日历支持点击星期表头批量给当月同星期日期添加 Off。例如点击 `THU` 时，会打开一个选择 `T1-T7` 的弹窗。

当前交互存在明显歧义：如果某些 `tier/date` 已经有 pairing bid，弹窗仍然允许选择对应 tier，但保存时只会跳过被 pairing 占用的日期。用户希望保留这种“部分跳过”的语义，而不是因为某个 tier 的某一天有冲突就禁用整个 tier。

例如：

- `T2/T3` 在 `2026-04-09` 有 pairing。
- 当前 active tier 是 `T2`。
- 用户点击 `THU`。

期望弹窗默认勾选 `T2-T7`。保存时：

- `T2/2026-04-09` 和 `T3/2026-04-09` 不添加 Off。
- `T2/T3` 的其他 Thursday 仍然添加 Off。
- `T4-T7` 的所有未冲突 Thursday 都可以添加 Off，包括 `2026-04-09`。

## 目标

- 只处理 `Days Off` 页面点击星期表头的行为。
- 星期表头弹窗默认选择当前 active tier 到 `T7`。
- 星期表头弹窗中的 `T1-T7` 不因为 pairing 冲突被禁用。
- 保存时按 `date + tier` 精确跳过 pairing 冲突，只提交合法变化。
- 未勾选 tier 仍表示删除该 tier 在这些星期日期上的 Off，保持当前弹窗“勾选结果即最终状态”的操作习惯。
- 黄色提示继续保留，用于告诉用户有多少 `tier/date` 组合会被 pairing bid 跳过。
- 接口继续使用当前 `PATCH /api/calendar-days-off/current/dates` 增量保存链路，避免整份 draft 保存。
- 本次不改数据库、不改 pairing 页面、不改单日点击逻辑。

## 非目标

- 不做“某个 tier 任意一天有冲突就整列禁用”的方案。
- 不重构 Days Off / Pairing 整体日历架构。
- 不调整弹窗视觉布局。
- 不改后端接口契约。
- 不新增 SQL migration。
- 不把性能问题扩大成 Pairing Search 或 current draft 的专项优化。

## 交互规则

### 打开弹窗

用户点击星期表头时：

1. 目标日期集合来自当前日历月份中所有未 muted 的同星期日期。
2. 默认勾选从当前 active tier 到 `T7`。
3. 不读取这些目标日期里已有 Off 的 tier 来决定默认勾选，避免 active `T2` 时只勾 `T2`。
4. 不因为 pairing 冲突禁用 tier checkbox。
5. 可以展示阻塞提示，提示数量按当前已勾选 tier 中“准备新增但被 pairing 占用”的 `tier/date` 计算。

### 保存弹窗

用户点击 `SAVE BID` 时：

1. 对每个目标日期和每个 `T1-T7` 计算变化。
2. 如果该 tier 被勾选且该日期还没有 Off：
   - 如果同一个 `date + tier` 有 pairing bid，则跳过，不提交新增。
   - 如果没有 pairing bid，则提交新增。
3. 如果该 tier 未勾选且该日期已有 Off：
   - 提交删除。
4. 如果勾选状态和当前草稿一致：
   - 不提交变化。
5. 保存成功后本地草稿只应用实际提交成功的变化，避免 UI 乐观显示被跳过的 Off。

## 数据流

- 前端继续从 `biddingCalendar` 中构造 `blockedPairingTiersByDate`。
- 星期表头 action 使用专属默认选择逻辑：`buildDefaultSelectedTiers(activeTier)`。
- `buildCalendarDayOffDateChanges` 继续作为唯一 payload 生成入口，里面按 `date + tier` 精确过滤 pairing 冲突。
- `buildCalendarDraftAfterDatePatch` 应复用相同过滤规则，保证本地草稿与服务端保存语义一致。
- 后端继续接收增量 `changes`，无需新增字段。

## 性能约束

- 不增加额外接口请求。
- 保存仍然只调用一次 `PATCH /api/calendar-days-off/current/dates`。
- 前端只在最多 7 个 tier 和当月同星期日期范围内做小循环，数据量固定且很小。
- 验证时需要跑 PBS 性能基线，确保相关接口不超过 2 秒；如果偶发超时，先定位并记录，不盲目改 SQL。

## 测试计划

前端回归测试覆盖：

- active tier 为 `T2` 时，点击 `THU` 默认勾选 `T2-T7`，不因已有 Off 或 pairing 缩小默认选择。
- `T2/T3` 在某个 Thursday 有 pairing 时，弹窗里的 `T2/T3` 不禁用。
- 保存后 payload 不包含被 pairing 占用的 `T2/09`、`T3/09`，但包含同 tier 其他 Thursday 和其他未冲突 tier/date。
- 未勾选 tier 时，会删除该 tier 对应 weekday 上已有 Off。

后端本次只需要复用已有 `date + tier` 精确冲突测试；如果现有测试缺口明显，再补 calendar service 层测试。

## 验收标准

- 点击星期表头时，默认选择当前 active tier 到 `T7`。
- checkbox 不因 pairing 冲突被禁用。
- 有 pairing 的 `date + tier` 不新增 Off。
- 同一 tier 的其他无冲突日期仍新增 Off。
- 其他 tier 的同日期无冲突时仍新增 Off。
- 未勾选 tier 的已有 Off 能被删除。
- 保存接口只调用一次增量 patch。
- 相关前端测试、lint、build 通过。
- PBS server build/test 通过。
- 性能基线相关接口在 2 秒内。

