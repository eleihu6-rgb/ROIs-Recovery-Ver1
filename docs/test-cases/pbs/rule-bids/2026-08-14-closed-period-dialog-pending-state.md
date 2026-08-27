# PBS Rule Bids 关闭期弹窗 Pending 状态回归测试

## 前置条件

- 使用 PBS Portal 本地或测试环境。
- 当前登录用户有 Current Bid 数据。
- Business Time 或真实时间处于某个 period 的 bid close 之后，使页面提示 `Bidding closed...`，且后端返回 `currentPeriod.canEditBid=false`。
- 至少准备以下已有 bid：
  - Days Off：`Prefer Off`
  - Line：`Commuter Pattern` 或任一需要弹窗编辑的 Line property
  - Bid -> ROSTER：`Reserve Preference`
  - Standing Bid：任一已保存 standing bid property

## 操作步骤与预期

1. 打开 `Bid -> Days Off`，点击已有 `Prefer Off` 的编辑入口，或通过左侧/外部入口定位到该 bid。
   - 预期：不会出现卡住的 `UPDATING...`。
   - 预期：不会发送 update/save 请求。
   - 预期：用户能看到当前 bidding closed / not open 的只读提示或入口禁用状态。

2. 打开 `Bid -> Line/Roster`，点击已有可配置 Line bid 的编辑入口。
   - 预期：不会出现 `UPDATING...` 假 pending。
   - 预期：不会发送 Line bid update 请求。

3. 打开 `Bid`，切到 `ROSTER`，检查 `Reserve Preference`。
   - 预期：关闭期按钮不可提交；不会打开可提交弹窗。
   - 预期：不会出现 `ADDING...` 假 pending。
   - 预期：不会发送 Reserve Preference add 请求。

4. 打开 `Standing Bid`，点击新增或编辑 standing bid property。
   - 预期：关闭期不出现 `ADDING...` / `UPDATING...` 假 pending。
   - 预期：不会发送 standing bid add/update 请求。

5. 将 Business Time 调回 bid open 窗口内，重复新增或编辑。
   - 预期：真实提交期间按钮显示 `ADDING...` / `UPDATING...`。
   - 预期：提交完成后弹窗关闭或刷新为保存后的 bid，行为与原来一致。

## 回归范围

- Days Off / Line / Reserve / Standing Bid 共享 `RuleBidRightPanel` 的新增、编辑、删除、favorite 入口。
- Bid -> ROSTER 下的 Reserve Preference 新增入口。
- Pairing 已有 closed-period no-pending 回归不能退化。
