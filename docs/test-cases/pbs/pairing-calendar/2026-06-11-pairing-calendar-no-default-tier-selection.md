# PBS Pairing Calendar 新增 Pairing 不默认选择 Tier QA 用例

日期：2026-06-11  
范围：PBS Portal 左侧 `BIDDING CALENDAR` 在 Pairing 页面点击日期新增 Pairing bid

## 前置条件

- 使用有 Pairing bid 权限的 PBS 用户登录。
- 当前 bid period 已加载。
- `/pairing` 页面左侧日历存在可点击新增 Pairing bid 的日期。
- 该日期能搜索到至少一个 Pairing occurrence。

## 主流程

1. 进入 `/pairing` 页面。
2. 在左侧 `BIDDING CALENDAR` 切换当前 active tier 到 `T3`。
3. 点击一个没有已有 Pairing bid 的日期，例如 `2026-04-04`。
4. 查看 Pairing bid popover 中的 tier checkbox。
5. 选择一个 Pairing occurrence，但不勾选 tier。
6. 勾选 `T3` 和 `T7`。
7. 点击 `ADD BID` 保存。

## 预期结果

- popover 打开时，`T1-T7` 都不应默认勾选。
- 当前 active tier 是 `T3` 时，也不应自动勾选 `T3-T7`。
- 未选择 tier 时，`ADD BID` 保持 disabled。
- 手动勾选 `T3` 和 `T7` 后，保存结果只包含 `T3` 和 `T7`。
- 不应把 Pairing bid 自动扩展到 `T3-T7`。

## 回归场景

- 点击已有 Pairing bid 事件时，详情弹窗仍应显示该 bid 已有的 active tier。
- Days Off 新增日期仍默认不选 tier。
- Days Off 已有日期仍显示已有 tier。
- 如果某个 tier 被 Day Off 冲突 block，该 tier 仍应 disabled 且不能保存到该 tier。

## 回归范围

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
