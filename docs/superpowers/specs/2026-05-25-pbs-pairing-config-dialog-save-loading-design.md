# PBS Pairing Configure 弹窗保存 Loading 交互设计

## 背景

当前 `Configure Pairing Bid` 在新增 Pairing 条件时，点击 `ADD BID` 后弹窗会立即关闭，但 `addCurrentDraftProperty` 接口仍在发送。接口耗时 1-2 秒时，用户会看到页面没有明显反馈，容易误以为点击没有生效。

## 目标

- 点击 `ADD BID` 后，弹窗保持打开并进入保存中状态。
- 保存中禁用弹窗关闭、Cancel、Add、Save Favorite 等操作，避免重复提交。
- 接口成功后再关闭弹窗，并显示顶部成功 message。
- 接口失败时弹窗不关闭，显示统一错误 message，用户可以继续修改或重试。
- `UPDATE BID` 和 `SAVE FAVORITE` 保持同样的“成功后关闭，失败不关闭”体验。

## 非目标

- 不修改 Pairing 后端接口。
- 不修改 Days Off / Line 共享逻辑。
- 不改变 Pairing property payload 结构。
- 不新增全局 loading 组件。

## 方案

`PairingRightPanel` 中新增条件的 `handlePropertyDialogAdd` 不再点击后立刻关闭弹窗，而是把关闭动作传给 `persistAvailablePropertyAdd` 的成功回调。这样现有 `pendingDraftMutationKey` 会通过 `isPending` 传入 `PairingPropertyConfigDialog`，弹窗能够在接口 pending 期间展示禁用态。

`PairingPropertyConfigDialog` 增加确认按钮 pending 文案：

- 新增：`ADDING...`
- 编辑：`UPDATING...`
- 收藏继续使用现有 `SAVING...`

## 验收标准

1. 新增 Pairing 条件时，点击 `ADD BID` 后弹窗不立即关闭。
2. 保存中按钮禁用，并显示 `ADDING...`。
3. 新增成功后弹窗关闭并显示 `Pairing property added.`。
4. 新增失败后弹窗保持打开并显示 `Unable to add pairing property.`。
5. 编辑 existing 时，点击 `UPDATE BID` 后 pending 期间弹窗保持打开，成功后关闭。
6. 相关 Pairing 测试和前端 build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单一前端交互修复，文件范围集中，多 agent 协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/components/`、Pairing 页面测试、i18n 文案。
- Conflict risk: 低；重点避免触碰 Days Off / Line。
- Execution gate: 用户已确认后实施。
