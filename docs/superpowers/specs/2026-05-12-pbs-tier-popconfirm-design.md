# PBS Tier 详情底部操作 Popover 设计

## 目标

将 `/tier` 详情弹窗中的预览、编辑和删除动作统一收到底部操作区。`View Pairing Set` 放在底部左侧；`Edit Tx` 和 `Delete Bid` 放在底部右侧并使用 `Popover` 浮层交互。点击 `View Pairing Set` 时打开独立的 Pairing Set Preview 弹窗，避免把预览内容挤进详情弹窗里。

## 范围

- 仅调整 Tier detail 内 Pairing Set 预览入口、可编辑 bid 的底部操作区和浮层交互。
- 不改编辑/删除接口、不改 Tier summary contract、不改保存逻辑。
- 复用根目录 `packages/ui` 已存在的 `Popover` 基础组件。
- 复用现有 `TierPairingSetPreviewDialog`，不新增新的预览数据接口。
- 只更新相关前端测试。

## 交互设计

- 可编辑 bid 的正文区不再显示 `Edit Tx`、`Go to Pairing` 或其它来源跳转按钮。
- Pairing bid 的 `View Pairing Set` 放在详情弹窗底部左侧；非 Pairing bid 不显示。
- 详情弹窗底部右侧显示两个按钮：左侧 `Edit Tx`，右侧 `Delete Bid`。
- 点击 `View Pairing Set` 后，打开独立的 `Pairing Set Preview` 弹窗覆盖在详情弹窗上方。
- 关闭 `Pairing Set Preview` 后，底下的 Tier detail 保持打开。
- `Pairing Set Preview` 打开时按 `Escape` 只关闭预览弹窗，不关闭底下的 Tier detail。
- 点击 `Edit Tx` 后，在底部按钮上方打开 Tx 选择浮层。
- 编辑浮层显示 T1-T7 选择、`Cancel` 和 `Save Tx`。
- 保存中显示 `Saving...`，并禁用编辑/删除相关操作。
- 保存成功关闭编辑浮层，详情弹窗保持打开。
- 点击 `Delete Bid` 后，在底部按钮上方打开小确认浮层。
- 浮层显示：`Delete this bid from the current draft?`
- 操作按钮为 `Cancel` 和 `Delete`。
- 删除中显示 `Deleting...`，并禁用确认/取消按钮。
- 点外部、按 `Escape` 或点 `Cancel` 可关闭确认浮层；删除进行中不关闭。
- 打开编辑浮层时关闭删除确认；打开删除确认时关闭编辑浮层。
- 右上角 `X` 仍作为详情弹窗关闭入口；底部不显示 `Close`。

## 验收标准

- 可编辑 Pairing / Days Off / Line bid 底部右侧显示 `Edit Tx` 和 `Delete Bid`。
- Pairing bid 底部左侧显示 `View Pairing Set`。
- 点击 `View Pairing Set` 后出现独立 `tier-pairing-set-preview-dialog`，原 `tier-detail-dialog` 仍存在。
- `Go to Pairing` 不再显示。
- 底部不再显示 `Close` 按钮，右上角 `X` 可以关闭详情弹窗。
- 点击 `Edit Tx` 只出现小编辑浮层，不撑开详情弹窗内容。
- 点击 `Save Tx` 后仍调用原有 `patchTierSummaryItemTiers` 流程。
- 点击 `Delete Bid` 只出现小确认浮层，不撑开详情弹窗内容。
- 点击确认后仍调用原有 `deleteTierSummaryItem` 流程。
- legacy / unsupported / T8+ 仍不显示删除入口。
