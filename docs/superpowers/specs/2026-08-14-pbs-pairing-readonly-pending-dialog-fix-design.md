# PBS Pairing 关闭期弹窗误显示 UPDATING 修复设计

日期：2026-08-14  
状态：已确认，已实施  
范围：`pbs-portal` Pairing / Bid workbench 中 Pairing 条件编辑弹窗的只读与保存中状态区分

## 1. 背景

当当前 PBS period 已关闭时，页面顶部正确显示：

- `Bidding closed for Jun 2026`
- `Bidding closed at May 08, 22:59 · YYZ Local Time`

但用户点开已有 Pairing 条件后，弹窗底部按钮显示 `UPDATING...`，并且弹窗处于类似保存中的锁定状态。用户直观看到的是“系统一直在更新，关不掉”，但实际上并不一定有保存请求正在执行。

这是严重的状态语义错误：关闭期只读不等于正在保存。

## 2. 当前根因

`pbs-portal/src/features/pairing/components/pairing-right-panel.tsx` 当前把两个不同状态混在一起：

```ts
const isPeriodReadOnly = data.draftMeta.currentPeriod?.canEditBid !== true;
const draftActionDisabled = isDraftStructureMutationPending || isPeriodReadOnly;
```

随后 `draftActionDisabled` 被传给 `PairingPropertyConfigDialog`：

```tsx
isPending={draftActionDisabled}
confirmPendingLabel={t("pairing.dialog.updatingBid")}
```

因此只要当前 period closed：

1. `isPeriodReadOnly = true`
2. `draftActionDisabled = true`
3. 弹窗收到 `isPending = true`
4. 确认按钮显示 `UPDATING...`
5. 关闭按钮 / Cancel / Escape 也被 pending 状态禁用

这不是后端接口一直 pending，而是前端把 `read-only disabled` 错误渲染成了 `mutation pending`。

## 3. 目标行为

Pairing 条件弹窗必须区分以下两个状态：

1. **真实保存中**
   - 来源：`pendingDraftMutationKey !== null`
   - 按钮显示 `ADDING...` / `UPDATING...`
   - 禁止重复提交
   - 表单控件可按现有逻辑锁定

2. **Bid period 只读**
   - 来源：`currentPeriod.canEditBid !== true`
   - 不显示 `UPDATING...`
   - 不发起保存请求
   - 用户可以看到清晰的只读原因，例如 `Bidding closed at May 08, 22:59.`
   - 添加、编辑、删除入口应禁止或点击后提示只读原因
   - 如果因为状态刷新或入口遗漏打开了弹窗，确认按钮应显示正常文案但 disabled，不能显示 pending 文案

## 4. 非目标

- 不改变后端 closed period 保存门禁；后端仍必须返回 423 防止直接 API 写入。
- 不实现请求取消 / AbortController。
- 不改变 current period resolver 选择规则。
- 不重新设计 Pairing 弹窗样式。
- 不扩大到 Days Off / Line / Reserve / Standing Bid，除非实现时发现相同状态混用的直接 bug；本 spec 先锁定 Pairing 问题。

## 5. 设计方案

### 5.1 拆分状态命名

在 `PairingRightPanel` 中保留两个独立布尔值：

```ts
const isDraftStructureMutationPending = pendingDraftMutationKey !== null;
const isPeriodReadOnly = data.draftMeta.currentPeriod?.canEditBid !== true;
const actionDisabled = isDraftStructureMutationPending || isPeriodReadOnly;
```

传给普通列表、按钮、删除、tier toggle 的禁用态仍可使用 `actionDisabled`。

传给弹窗的 `isPending` 必须只使用真实 mutation pending：

```tsx
isPending={isDraftStructureMutationPending}
```

这样 closed period 下不会显示 `UPDATING...`。

### 5.2 编辑入口只读防护

已有编辑入口 `handleExistingEditRequest` 已经有只读检查：

```ts
if (isPeriodReadOnly) {
  message.warning(readOnlyMessage);
  return;
}
```

实施时需要确认所有能打开 existing Pairing 编辑弹窗的入口都经过这个检查，包括：

- Existing Bid Properties 行内编辑 / 条件配置入口
- 外部 presentation 请求打开指定 existing property 的路径
- Search Pairings 回到 Bid 后请求编辑 existing property 的路径（如有）

其中 `requestedExistingPropertyId` 的 `useEffect` 当前直接 `setPairingExistingPropertyDialog({ property })`，需要加只读判断，避免 closed period 下绕过入口防护打开弹窗。

### 5.3 弹窗层只读兜底

即使上游正常不打开只读编辑弹窗，`PairingPropertyConfigDialog` 也应该具备兜底能力：

- 新增可选 prop，例如 `readOnlyReason?: string | null` 或 `confirmDisabledReason?: string | null`。
- 当只读原因存在时：
  - 确认按钮 disabled。
  - 不显示 pending label。
  - 可以在 footer 上方显示轻量只读提示，复用现有 message 文案或本地 alert 样式。

如果为了最小改动，也可以先不新增 prop，只确保 closed period 不会打开编辑弹窗；但推荐保留弹窗兜底，避免未来新入口再次绕过。

### 5.4 pending 关闭行为

这次问题的主因不是“pending 时是否允许关闭”。为避免扩大行为面，本次不改变真实保存中 pending 的关闭策略。

也就是说：

- 真实保存中仍按当前逻辑禁用关闭，防止用户误以为请求已取消。
- closed period 不再进入 pending 状态，所以不会出现 `UPDATING...` 锁死。

后续如果要优化“真实 pending 时接口超慢如何退出”，单独写 spec 讨论请求取消、乐观状态回滚和完成后提示。

## 6. 测试策略

### 6.1 单元 / 组件测试

更新 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx` 或更聚焦的 Pairing right panel 测试。

必须覆盖：

1. **closed period 下点击 existing property 编辑入口**
   - mock `currentPeriod.canEditBid = false`
   - 点击已有 Pairing 条件编辑入口
   - 期望不打开 `Configure ...` 弹窗
   - 期望显示 `readOnlyReason` warning
   - 期望 `patchCurrentDraftProperty` 未调用

2. **closed period 下 presentation/requestedExistingPropertyId 不应绕过只读**
   - 设置 `requestedExistingPropertyId`
   - mock period closed
   - 期望不打开编辑弹窗
   - 期望不会显示 `UPDATING...`

3. **真实 mutation pending 仍显示 UPDATING**
   - 保留现有 pending 测试
   - open period 下点击 `UPDATE BID`
   - promise 未 resolve 前按钮显示 `UPDATING...`
   - `patchCurrentDraftProperty` 被调用一次

4. **closed period 下不显示 UPDATING**
   - 在只读状态下渲染 Pairing 工作台
   - 页面不存在 `UPDATING...`
   - existing 行操作不可触发保存

### 6.2 Playwright 回归

新增或更新 PBS Portal E2E：

1. 设置或使用 closed period 的真实后端状态。
2. 打开 Bid 页面。
3. 断言顶部状态是 `Bidding closed for Jun 2026`。
4. 尝试打开已有 Pairing 条件编辑入口。
5. 期望：
   - 不出现 `UPDATING...`
   - 不发出 `PATCH /api/pairing-bids/current/properties/...`
   - 页面给出只读提示或编辑入口不可用

如果真实 E2E 数据准备成本过高，至少先补组件测试；最终交付需要说明 E2E 未覆盖原因和人工验证步骤。

### 6.3 QA 人工测试用例

按项目规范新增：

`docs/test-cases/pbs/pairing/<YYYY-MM-DD>-closed-period-no-updating-dialog.md`

内容覆盖：

- 前置：Business Time 在 bid close 之后。
- 操作：进入 Bid 页面，点击 existing Pairing 条件。
- 预期：不能保存，不显示 `UPDATING...`，不会卡死。
- 回归：open period 下正常编辑保存仍显示 `UPDATING...` 并完成关闭。

## 7. 验收标准

1. 当前 period closed 时，Pairing 编辑不会显示 `UPDATING...`。
2. closed period 下不会发起新增、编辑、删除 Pairing bid 的保存请求。
3. closed period 下用户能看到只读原因，而不是保存中状态。
4. open period 下真实保存 pending 仍显示 `ADDING...` / `UPDATING...`，防重复提交逻辑不回退。
5. 后端 423 门禁保持不变。
6. 相关组件测试通过，且至少有人工 QA 测试用例覆盖。

## 8. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 把真实 pending 状态误放开导致重复提交 | `isPending` 继续只绑定 `pendingDraftMutationKey !== null` |
| closed period 仍可通过隐藏入口打开弹窗 | 对 `requestedExistingPropertyId` 等绕路入口加只读判断 |
| 只修 Pairing，其他模块存在类似问题 | 本次验收聚焦 Pairing；实现时用 `rg "isPending=.*ReadOnly|draftActionDisabled"` 快速扫描并报告相同风险 |
| 测试只覆盖 mock，不覆盖真实 closed 状态 | 增加组件回归；条件允许再补真实 Playwright / 手工 QA |

## 9. Multi-Agent Parallelism Assessment

- Recommendation：No。
- Rationale：改动集中在 Pairing right panel 的状态传参和对应测试，拆分会增加状态口径不一致风险。
- Suggested split：不拆分。单 agent 完成实现、组件测试和 QA 测试用例。
- Write boundaries：`pbs-portal/src/features/pairing/**` 和 `docs/test-cases/pbs/pairing/**`。
- Conflict risk：中等。Pairing 页面测试较大，需要避免顺手改无关断言。
- Execution gate：用户确认本 spec 后再进入实现。

## 10. 实施记录

- `PairingRightPanel` 继续用 `draftActionDisabled` 禁用 closed period 下的列表操作，但弹窗 `isPending` 只绑定真实 draft mutation pending。
- `requestedExistingPropertyId` 外部打开 existing property 的路径增加只读拦截，closed period 下只提示 `readOnlyReason`，不打开编辑弹窗。
- 同一个 `requestedExistingPropertyId` 在父级清空前只处理一次，避免重复 warning / handled 回调。
- 本次未新增弹窗 `readOnlyReason` prop，因为 closed period 下编辑弹窗已不会打开；保留真实保存中 pending 的关闭策略不变。
- 增加 mock API Playwright 回归，覆盖 Bid 页面 closed period 下点击 existing Pairing summary row 后不显示 `UPDATING...` 且不发 PATCH。
