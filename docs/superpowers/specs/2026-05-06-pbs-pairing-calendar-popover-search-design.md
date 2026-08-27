# PBS Pairing 日历弹窗 Pairing Numbers 搜索设计

## 状态

- 日期：2026-05-06
- 模块：`pbs-portal`
- 状态：已确认并实施

## 背景

Pairing 页面左侧 `BIDDING CALENDAR` 点击日期后，会打开 `PAIRING BID` 弹窗。当前 `PAIRING NUMBERS` 列表直接展示当天所有可选 pairing runs，数据多时列表高度较高，用户需要在较长列表中寻找目标 pairing number。

## 目标

1. 在 `PAIRING NUMBERS` 标题下增加搜索输入框。
2. 搜索只过滤当前日期已经加载出来的 runs，不重新请求后端。
3. 搜索以 `pairingNumber` 为准，支持大小写不敏感的模糊匹配。
4. 列表区域固定为约 3 条记录高度，超过 3 条时内部滚动。
5. 保存中禁用搜索框，和 checkbox / Clear 的 pending 体验一致。
6. 不改变 Tx 选择、ADD BID 保存、loading/error/message 逻辑。

## 方案

- 在 `PairingCalendarBidPopoverContent` 内增加本地 `searchQuery` state。
- 使用 `useMemo` 根据 `occurrences` 和 `searchQuery` 计算 `filteredOccurrences`。
- 列表渲染从 `occurrences` 改为 `filteredOccurrences`。
- 搜索无结果时显示 `No matching pairings found.`。
- 列表容器从动态最大高度改为固定高度，例如 `h-[118px]`，用于稳定展示约 3 条。

## 测试

- 在共享工作台测试中打开 Pairing 日期弹窗。
- 输入搜索词后确认只显示匹配的 pairing number。
- 确认保存中状态下搜索框会被禁用。

## 不包含

- 不新增后端接口。
- 不按内部 pairing id 搜索。
- 不改变 Pairing Number 添加保存的数据结构。
