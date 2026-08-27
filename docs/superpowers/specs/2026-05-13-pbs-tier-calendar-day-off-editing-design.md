# PBS Tier Calendar Day Off 编辑设计

日期：2026-05-13  
范围：PBS Portal `/tier` 页面 Calendar Day Off detail 的 Tx 编辑与移除能力

## 背景

当前 `/tier` 已支持对可追溯来源的 `Pairing / DaysOff / Line` bid 执行 `Edit Tx` 和 `Delete Bid`。但从日历保存出来的 `Calendar Day Off` 仍是只读，详情弹窗只显示 `Edit this bid from its source page.`。

用户在 Tier 页面 review 时，如果发现某个 calendar day off 应该只应用到部分 Tx，或需要从当前 bid 中移除，目前必须回到 Calendar 来源页处理，体验不连贯。

## 目标

- `Calendar Day Off` 在 Tier detail 中支持 `Edit Tx`。
- `Calendar Day Off` 在 Tier detail 中支持移除，按钮文案使用 `Remove Day Off`，不使用 `Delete Bid`。
- 保存和移除必须走真实 Calendar days off current draft API，不做前端假状态。
- 成功后刷新 Tier summary / review，并同步清理 Calendar / Dashboard 相关缓存。
- 保持 PBS 边界：这里只修改用户保存的 day off rules，不做最终 Award、RO/PO、法规或 coverage 算法。

## 非目标

- 不新增数据库表或字段。
- 不新增后端 API。
- 不修改最终提交流程，提交/锁定/截止状态后续单独设计。
- 不做 Award / Reason Report。
- 不把 AA 原文 `Layer` 带回 UI/API/代码，继续使用 `Tier / Tx / T1-T7`。
- 不允许 legacy / T8+ / unsupported 数据在 Tier 中被误编辑。

## 推荐方案

复用现有 `calendarDaysOffService.patchCurrentDraftDates()`。

Calendar Day Off summary item 已能表达日期和 Tx 集合，例如：

- readable text: `Calendar Day Off 2026-04-01: Off`
- tiers: `T1..T7`
- group key: `Calendar:2026-04-01`

本次需要让 summary contract 给 Calendar item 也返回可编辑来源身份，前端据此启用操作：

```ts
editableSource: {
  module: "Calendar",
  propertyGroupKey: "Calendar:2026-04-01"
}
```

前端从 `propertyGroupKey` 中解析日期，并通过 Calendar current draft 获取 `draftMeta` 后调用 patch dates。

## 交互设计

### Edit Tx

用户点击 Calendar Day Off detail 的 `Edit Tx`：

- 弹出和现有 bid 一致的 T1-T7 toggle。
- 当前包含该日期的 Tx 默认选中。
- 至少选择一个 Tx；全取消时不能保存。
- 点击 `Save Tx` 后：
  - 对原本包含该日期但新选择中没有的 Tx，发送 `selected: false`。
  - 对新选择中包含但原本没有的 Tx，发送 `selected: true`。
  - 未变化的 Tx 不发送，减少 patch 负担。

### Remove Day Off

用户点击 `Remove Day Off`：

- 使用 Popover 二次确认，文案明确这是从 current draft 移除该日期的 day off。
- 确认后，对当前 item 的所有 Tx 发送 `selected: false`。
- 成功后关闭 detail。

### 只读边界

以下情况继续只读：

- item 没有 `editableSource`。
- item 带 legacy / unsupported warning。
- item 包含 `T8+`。
- 日期无法从 source key 解析。

## 数据流

1. 后端 `lineholder-summary-service` 为 T1-T7 范围内的 Calendar Day Off 返回 `editableSource.module = "Calendar"`。
2. 前端 mapper 将 Calendar item 标为 `isEditable = true`。
3. 用户在 Tier detail 操作 `Edit Tx` 或 `Remove Day Off`。
4. `tier-editing-actions`：
   - fetch 当前 Calendar days off draft。
   - 计算需要 patch 的 date changes。
   - 调用 `calendarDaysOffService.patchCurrentDraftDates()`。
5. 成功后：
   - invalidate Tier query。
   - invalidate Calendar days off / dashboard calendar 相关 query。
   - 清空 Tier pairing pool snapshot，避免 review 里留下旧状态。

## 错误处理

- draft version 过期：沿用后端 409，展示 `Current draft has changed. Please refresh before saving again.`。
- 日期不合法或不在当前 period：展示后端错误，不做本地强行保存。
- API 失败：保留 detail，显示错误信息，不关闭弹窗。
- Remove Day Off 进行中禁用 `Edit Tx` 和关闭冲突操作。

## 测试计划

前端单元测试：

- Calendar Day Off detail 显示 `Edit Tx` 和 `Remove Day Off`。
- `Edit Tx` 保存时调用 Calendar patch API，发送正确的 add/remove changes。
- `Remove Day Off` 只对当前 item 的 Tx 发送 `selected: false`。
- 成功后刷新 Tier query，并关闭 detail 或退出编辑态。
- legacy / T8+ Calendar item 仍只读。
- Pairing / DaysOff / Line 原有 `Delete Bid` 文案不被改坏。

后端单元测试：

- T1-T7 Calendar summary item 返回 `editableSource.module = "Calendar"`。
- T8+ Calendar summary item 不返回 editable source，并保留 warning。

回归验证：

- `npx vitest run` 覆盖 Tier 和 lineholder summary 相关测试。
- `npx tsc --noEmit`
- `npm run lint`
- `npm run verify:pbs`

## 验收标准

- 用户在 Tier detail 中能直接修改 Calendar Day Off 所属 Tx。
- 用户能通过 `Remove Day Off` 从当前 draft 移除该日期 day off。
- 保存后 Tier 页面展示立即与真实 draft 保持一致。
- 非 Calendar 的现有编辑/删除体验不回退。
- 提交流程仍不在本轮实现。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Tier 编辑 helper、Calendar summary source 和少量测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/lineholder/*`、`pbs-portal/src/features/tier/*`、相关测试文件。
- Conflict risk: 中低。当前 Tier 文件已有未提交改动，应继续串行处理。
- Execution gate: 用户确认本 spec 后再进入代码实现。
