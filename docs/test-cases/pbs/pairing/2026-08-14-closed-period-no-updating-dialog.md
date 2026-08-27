# Closed Period 下 Pairing 配置弹窗不显示 UPDATING

日期：2026-08-14  
模块：PBS Portal / Bid / Pairing  
关联设计：`docs/superpowers/specs/2026-08-14-pbs-pairing-readonly-pending-dialog-fix-design.md`

## 1. 测试目标

验证当前 PBS period 已关闭时，Pairing 已有条件不会被误渲染成保存中状态：

- 不显示 `UPDATING...`
- 不打开可编辑配置弹窗
- 不发起保存请求
- 用户看到关闭期只读原因

同时回归 open period 下真实保存中的 pending 行为仍正常。

## 2. 前置条件

- 使用一个已有 Pairing bid 的测试用户，例如已有 `Pairing Length` 或其他 Pairing 条件。
- PBS Business Time 设置到该 bid period 的 `bid close` 之后。
- Bid 页面顶部状态显示类似 `Bidding closed for Jun 2026`。
- 后端 closed period 写入门禁仍启用，直接保存请求应被拒绝。

## 3. 手工测试步骤

1. 打开 PBS Portal，进入 `Bid` 页面。
2. 进入 `PAIRING` tab。
3. 确认右侧 `EXISTING BID PROPERTIES` 中存在至少一个 Pairing 条件。
4. 尝试点击该 existing Pairing 条件的编辑 / 配置入口。
5. 观察页面和网络请求。

## 4. 预期结果

- 不出现 `Configure ...` 的可编辑弹窗。
- 页面不出现 `UPDATING...`。
- 不发送 `PATCH /api/pairing-bids/current/properties/...` 或其他 Pairing bid 保存请求。
- 页面展示关闭期只读提示，例如 `Bidding closed at May 08, 22:59.`
- 已有 bid 内容保持不变。

## 5. 外部打开路径回归

1. 从 Search Pairings / Preview 等可能返回 Bid 页面并请求编辑 existing property 的路径进入。
2. 保持当前 period 为 closed。
3. 触发返回后的 existing property 编辑请求。

预期：

- 不绕过只读保护。
- 不打开编辑弹窗。
- 不显示 `UPDATING...`。
- 不发起保存请求。

## 6. Open Period 回归

1. 将 PBS Business Time 设置回 bid open 和 bid close 之间。
2. 进入 `Bid` 页面和 `PAIRING` tab。
3. 打开已有 Pairing 条件编辑弹窗。
4. 修改一个有效配置并点击 `UPDATE BID`。

预期：

- 请求未完成时按钮显示 `UPDATING...`。
- 请求完成后弹窗关闭或显示成功反馈。
- `PATCH /api/pairing-bids/current/properties/...` 正常发送一次。
- 更新后的 bid 内容正确显示在 existing properties 中。

## 7. 自动化覆盖

已在 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx` 覆盖：

- closed period 下 existing Pairing 行内编辑入口保持只读，不显示 `UPDATING...`，不调用保存接口。
- closed period 下 `requestedExistingPropertyId` 不能绕过只读保护。
- open period 下已有 Pairing 编辑保存流程保持通过既有回归。
