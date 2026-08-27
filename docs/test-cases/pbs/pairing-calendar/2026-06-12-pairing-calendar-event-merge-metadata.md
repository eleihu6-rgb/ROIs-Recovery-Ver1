# Pairing Calendar Event 合并元数据回归测试

日期：2026-06-12  
模块：PBS / Pairing Calendar  
类型：性能重构回归 + QA 人工测试案例

## 背景

`pbs-server` 对 Pairing Calendar 中同一 tier、同一 tone、日期重叠的 pairing bid events 会做合并展示。本次重构将 metadata 分割、读取和去重逻辑抽到独立 helper，并用 `Set` 合并去重，避免重复 pairing event 增多时反复用数组 `includes` 扫描。

## 前置条件

- `pbs-server` 已启动并连接测试或本地 PBS 数据库。
- `pbs-portal` 可访问 Pairing / Calendar 相关页面。
- 测试账号存在当前 bid period，并有可编辑 Pairing bid draft。

## 自动化回归

在 `/Users/lei/Codehub/rois-ai/pbs-server` 执行：

```bash
npm test
npm run build
```

重点覆盖：

- `buildPairingEvents merges overlapping same-tier pairing events across property rows`
- `buildPairingEvents de-duplicates metadata while merging repeated overlapping pairing events`
- `GET /api/bidding-calendar/current returns the current AA-style bidding calendar`

## 人工测试步骤

1. 登录 PBS Portal，进入 Pairing 或共享 bidding calendar 页面。
2. 在同一 Tx 添加两个日期重叠、action 相同的 Pairing Number bid。
3. 返回 calendar 视图，观察重叠日期区间是否合并为一个 pairing bid event。
4. 打开该 event 的详情或相关只读展示，检查 pairing number、property group、origin date 等信息没有重复堆叠。
5. 再添加一个 action 不同的 Avoid Pairing Number，日期与上一步重叠。
6. 返回 calendar 视图，确认 Award 与 Avoid 仍分开展示，颜色语义不被合并。

## 预期结果

- 同一 Tx、同一 action、日期重叠的 pairing events 合并展示。
- 合并后的 `pairingNumbers`、`propertyGroupKeys`、`pairingBidEntries` 不出现重复项。
- `pairingCount` 反映去重后的 pairing 数量。
- action 不同的 events 不合并，Award / Avoid 颜色语义保持不变。
- Calendar API 返回 `{ code, data, message }` 格式不变。

## 异常与边界场景

- 重复添加同一个 Pairing Number / origin date 时，calendar 不应显示重复 pairing metadata。
- 不同 tier 的重叠 pairing events 不应互相合并。
- 同 tier 但 tone 不同的 pairing events 不应互相合并。
- 缺失 pairing occurrence 的 bid 应继续进入 `missingPairingIds`，不影响已有 event 合并。

## 回归范围

- Pairing Number entire-month 和 specific-date bid 的 calendar 展示。
- Days Off 与 Pairing event 覆盖冲突过滤。
- `/api/bidding-calendar/current` 接口响应。
- Pairing calendar event 详情展示和只读 bid 摘要。
