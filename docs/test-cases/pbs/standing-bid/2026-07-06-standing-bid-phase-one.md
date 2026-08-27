# PBS Standing Bid Phase A 测试用例

## 背景

Standing Bid 是员工长期备用申请模板。Phase A 只支持员工在独立页面维护 Lineholder / Reserve 两类长期规则，不参与当前月 PBS 申请生命周期，也不做 Engine fallback 计算。

## 前置条件

- PBS Portal 已部署并可登录员工账号。
- 数据库已执行 Standing Bid migration，`pbs_bid.bid_context` 支持 `StandingLineholder` / `StandingReserve`。
- `pbs_bid_property` 中 Standing Bid 相关 property 已存在且 `is_visible_in_portal=1`：
  - `218 Day of Week Off`
  - `312 Reserve Day of Week Off`
  - `313 Reserve Work Block Size`
  - `314 Waive to Allow Carry over to be Days Off`

## 测试步骤

### 1. 顶部入口与页面骨架

1. 登录 PBS Portal。
2. 点击顶部导航 `Standing Bid`。
3. 检查页面进入 `/standing-bid`。
4. 检查页面展示 `Long-term backup bid`、`Lineholder Standing Bid`、`Reserve Standing Bid`。
5. 检查页面不展示左侧 `BIDDING CALENDAR`。

预期结果：

- `Standing Bid` 不再跳到 404。
- 页面是独立工作台，不依赖当前月日历。
- 首屏在不同窗口宽度下整体等比例适配，不出现横向滚动。

### 2. Lineholder Standing Bid 保存

1. 保持 `Lineholder Standing Bid` 模式。
2. 点击 `ADD STANDING BID`。
3. 在 `ALL STANDING PROPERTIES` 中添加 `Day of Week Off`。
4. 保持默认 `T1`，点击 `ADD BID`。
5. 刷新页面。

预期结果：

- 新增规则出现在 `EXISTING LINEHOLDER STANDING BID`。
- 规则保留在 `T1`。
- 刷新后规则仍然存在。
- 后端保存到 `pbs_bid.period_code='STANDING'` 且 `bid_context='StandingLineholder'`。

### 3. Reserve Standing Bid 保存

1. 切换到 `Reserve Standing Bid`。
2. 点击 `ADD STANDING BID`。
3. 添加 `Reserve Work Block Size`。
4. 保持默认范围，点击 `ADD BID`。
5. 刷新页面。

预期结果：

- 新增规则出现在 `EXISTING RESERVE STANDING BID`。
- Lineholder 模式下不显示 Reserve 规则。
- 后端保存到 `pbs_bid.period_code='STANDING'` 且 `bid_context='StandingReserve'`。

### 4. T1-T7 限制

1. 打开任意 Standing Bid 配置弹窗。
2. 检查 Tier 区域。

预期结果：

- 只显示 `T1` 到 `T7`。
- 至少选择一个 Tier 才允许保存。

### 5. 当前月申请隔离

1. 在 Standing Bid 页面新增规则。
2. 切换到 `Pairing`、`Days Off` 或 `Line` 当前月申请页面。
3. 检查当前月 Existing Bid。

预期结果：

- Standing Bid 规则不混入当前月申请。
- 当前月页面仍按当前 bidding period 显示数据。

## 异常与边界场景

- 没有 Standing Bid 历史记录时，页面应显示空状态并允许新增。
- 保存时发生版本冲突，应提示用户刷新后重试，不能静默覆盖。
- 不允许保存具体日期绑定的 Standing Bid，例如 specific date 或 specific pairing occurrence。
- Reserve 与 Lineholder 的保存上下文必须互相隔离。

## 回归范围

- PBS Portal 顶部导航。
- Standing Bid 页面自适应布局。
- Rule Bid 通用右侧面板新增 / 编辑 / 删除。
- PBS Server `GET /api/standing-bids/current`。
- PBS Server `PUT /api/standing-bids/current`。
- `pbs_bid`、`pbs_bid_group`、`pbs_bid_tier`、`pbs_bid_condition` 写入链路。
