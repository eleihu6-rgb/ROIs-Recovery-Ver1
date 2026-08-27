# Pairing Preference 日历 ID 往返修复测试

日期：2026-07-16

## 1. 目标

验证左侧 `BIDDING CALENDAR` 添加 `Pairing Preference` 时使用 stable Pairing IDs，并且保存、刷新后仍能从权威 Pairing 数据重建日期蓝色条和详情。

## 2. 前置条件

- 当前 bid period 可编辑。
- Pairing 页左侧日历某天存在至少两个可选 Pairing。
- 至少一个 Tier 未被 Days Off 阻挡。
- 浏览器 DevTools Network 可查看请求和响应。

## 3. 主流程

1. 打开 Pairing 页面。
2. 点击左侧日历某一天的 Add Pairing Bid 入口。
3. 选择两个 Pairing，例如 `CRPM` 和 `F8623`。
4. 选择一个可用 Tier。
5. 点击 `ADD BID`。

预期：

- `POST /api/pairing-bids/current/properties` 返回成功，不再返回 `Pairing Preference must use Pairing IDs selected from the list.`。
- 请求的 `propertyCode` 为 `102`。
- `bid.type` 为 `pairing-preference`。
- `bid.pairingIds` 是选中 Pairing 的 stable IDs。
- `bid.pairingLabels` 与 IDs 同序。
- payload 不包含 `occurrences`、`originDate`、`occurrenceId`、date scope 或 fulfilment 字段。

## 4. 回显与刷新

1. 保存成功后检查 Existing Pairing Properties。
2. 刷新页面。
3. 等待 Bidding Calendar 重新加载。
4. 点击对应蓝色 Pairing 条。

预期：

- Existing summary 显示选中的 Pairing labels。
- 蓝色条显示在 Pairing 权威数据中的实际日期范围。
- 刷新前后蓝色条一致，不出现“添加时有、刷新后消失”。
- 全屏详情能通过 stable Pairing ID 匹配正确 Pairing。

## 5. 异常与边界

### 5.1 API 失败后重试

1. 模拟第一次 Add Bid 返回错误。
2. 检查 popover 中选择和 Tier。
3. 再次点击 `ADD BID`。

预期：选择保持；第二次成功时仍发送 `pairing-preference` IDs/labels。

### 5.2 Pairing 数据不存在

让已保存 ID 在当前 period/base 查询不到。

预期：不生成错误日期蓝条，不删除用户 bid；calendar response 返回 missing ID warning。

### 5.3 布局回归

分别使用 `1920×1080`、`1440×900`、`1024×768` 检查 Pairing date popover。

预期：外层日历不出现意外纵向滚动条；Pairing Numbers 列表保留内部滚动；blocked/error 状态不超出面板。

## 6. 回归范围

- Pairing Preference 主 picker、Favorite、Existing edit。
- Search Pairings property 102 stable ID 过滤。
- Bidding Calendar days-off blocked Tier。
- Pairing 蓝色条全屏详情。
- Server 继续拒绝 property 102 的 `pairing-occurrence-list` 和 `pairing-id-list` 写入。
