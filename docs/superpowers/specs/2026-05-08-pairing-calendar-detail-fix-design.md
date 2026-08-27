# PBS Pairing 日历蓝条详情一致性修复设计

## 背景

当前 PBS Pairing 左侧日历蓝条来自 `bidding-calendar/current`。蓝条可以显示，说明后端日历接口已经返回了该 pairing bid。

点击蓝条后，详情弹窗还会依赖 Pairing draft 数据，用蓝条 metadata 中的 `propertyGroupKey` 去 `pairing-bids/current` 映射后的 `existingProperties` 里找对应草稿属性。若这个查询没有启用、缓存缺失、接口失败，或真的找不到 key，现有 UI 都容易显示 `Unable to find this pairing bid in the current draft.`，导致用户误以为昨天保存的草稿丢了。

本轮排查确认：

- 数据库中 `V4119A` 草稿仍存在。
- `3002` 有效登录身份下，`bidding-calendar/current` 与 `pairing-bids/current` 都能返回同一个 `propertyGroupKey`。
- `pairing-search/preview` 能返回 `V4119A` 的 legs 详情。
- `/pairing` 页面当前代码路径可打开并展示详情。
- `/dashboard` 页面没有传 `pairingCalendarAwardBid`，会导致详情相关查询不启用，因此可能出现“蓝条有，详情找不到”的误导状态。

## 目标

- 点击 pairing 蓝条时，能稳定展示 Pairing Details。
- `/dashboard` 支持只读查看 pairing 蓝条详情。
- `/pairing` 保持查看详情与编辑 Tx 的闭环。
- 修复错误文案，让用户能区分“只读页面不可编辑”“接口失败”“token 失效”“草稿 key 真缺失”。
- 不用“每次点击强制全量刷新”绕过问题，避免破坏已有性能优化。
- 保持相关接口单次响应目标在 2 秒内。

## 非目标

- 不改变 Pairing bid 的保存 schema。
- 不改变后端草稿持久化逻辑。
- 不重做 Pairing Details 的视觉布局。
- 不扩大 Dashboard 为完整 Pairing 编辑入口。
- 不做无关大文件拆分或代码风格重构。

## 行为设计

### Dashboard 页面

- 点击 pairing 蓝条：打开 Pairing Bid 弹窗。
- 弹窗展示 summary 与 Pairing Details。
- Tx 区域只读，不允许保存。
- 若用户看到该弹窗，应能理解这是查看入口，不是编辑入口。

### Pairing 页面

- 点击 pairing 蓝条：打开 Pairing Bid 弹窗。
- 弹窗展示 summary 与 Pairing Details。
- 若蓝条只对应一个 `propertyGroupKey`，默认加载该草稿属性的 Tx。
- 若蓝条合并了多个 pairing bid，继续显示 edit selector，用户明确选择一个目标后才能编辑 Tx。
- 保存 Tx 后仍只 invalidate 需要刷新的 query：`pairingPageDataQueryKey`、`biddingCalendarQueryKey`、`tierPageDataQueryKey`。

## 数据流设计

### 蓝条展示

保持现有流程：

1. `useBiddingCalendar` 请求 `bidding-calendar/current`。
2. `buildDashboardScheduleDataFromBiddingCalendar` 构造日历渲染数据。
3. `mergeOverlappingPairingEvents` 保留并合并 pairing metadata，包括 `propertyGroupKey(s)`、`pairingBidEntries`、`pairingDateRanges`。

### 详情展示

调整为“点击 pairing 蓝条才启用详情查询”：

1. 用户点击 `pairing_bid` 蓝条。
2. 前端从 event metadata 解析 `pairingBidEntries` 或 pairing number/date。
3. 启用 `pairing-search/preview` 查询，加载 legs 详情。
4. 查询 key 以 `periodCode + detail target key` 为维度，复用 React Query 缓存。

### Tx 编辑数据

将“详情展示”和“Tx 可编辑”拆开：

- 详情展示只需要蓝条 metadata 与 `pairing-search/preview`。
- Tx 编辑才需要 `pairing-bids/current` 的 `existingProperties`。
- `/dashboard` 不启用保存能力，但可按需加载 draft 用于显示当前 Tx 选中状态；若不加载 draft，也不能误报“找不到草稿”。
- `/pairing` 在需要编辑时加载 draft，并按 `propertyGroupKey` 匹配现有 property。

## 缓存与一致性策略

不采用每次点击强制 refetch。

推荐策略：

- 若当前 cache 中已有 `pairing-bids/current` 数据，先使用 cache。
- 若点击蓝条后 `propertyGroupKey` 在 cache 中找不到，并且当前页面允许编辑，则对 `pairingPageDataQueryKey` 做一次 targeted refetch。
- refetch 后仍找不到，才显示“当前草稿中确实没有找到该 pairing bid”的错误。
- `/dashboard` 只读详情不因为缺 draft 阻塞 Pairing Details 展示。

这样可以避免首屏增加请求，也避免每次点击都打后端。

## 错误处理设计

错误文案需要按原因区分：

- 详情接口失败：`Unable to load pairing details.`
- 编辑目标未选择：`Select one pairing bid to edit Tx.`
- 只读页面：不显示保存错误；保存按钮不可用或不出现。
- draft 查询中：显示 loading，不立即报错。
- draft 查询失败：显示 draft 加载失败，而不是草稿不存在。
- refetch 后仍缺 key：显示 current draft 中找不到该 bid。

## 性能要求

本修复不得增加日历首屏必要请求。

需要验证以下接口在本地有效 token 下单次响应小于 2 秒：

- `GET /api/bidding-calendar/current`
- `GET /api/pairing-bids/current`
- `POST /api/pairing-search/preview`

前端请求策略要求：

- 页面初始加载不因为 Dashboard 只读详情额外请求 `pairing-bids/current`。
- 点击蓝条才请求 Pairing Details。
- 只有 cache 缺 key 且需要编辑时，才对 Pairing draft 做一次 targeted refetch。
- 不引入轮询。
- 不引入重复并发请求。

## 回归测试设计

### 单元/组件测试

覆盖 `DashboardSchedulePanel`：

- `/dashboard` 模式点击 pairing 蓝条后能展示 Pairing Details，且不显示可保存编辑能力。
- `/pairing` 模式点击 pairing 蓝条后能展示 Pairing Details，并能加载当前 Tx。
- 合并蓝条多个 `propertyGroupKey` 时，仍要求用户选择 edit target。
- cache 中缺 `propertyGroupKey` 时，编辑模式只触发一次 draft refetch。
- draft 查询失败不会误报“current draft 找不到”。

### Mapper 测试

保留并补充：

- `pairingBidEntries` 优先用于详情 target 与 summary row。
- 合并蓝条 metadata 不丢 `propertyGroupKey(s)`。

### 接口性能验证

用本地有效 token 运行轻量脚本或命令，记录三类接口耗时。

验收标准：

- 三类接口均小于 2 秒。
- 若某次超时，需要区分是服务未启动、token 失效、数据库不可达，还是代码引入的回退。

## 代码边界

优先只触碰以下范围：

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
- 必要的 dashboard/pairing 测试文件
- 如有必要，小幅调整 query helper 或测试工具

不改：

- `pbs-server` 持久化逻辑
- SQL schema
- Pairing page 右侧现有大结构
- unrelated lint/format/refactor

## 验收标准

- 在 `/dashboard` 点击已有 pairing 蓝条，可以看到 Pairing Details。
- 在 `/dashboard` 不允许保存 Tx。
- 在 `/pairing` 点击同一蓝条，可以看到 Pairing Details，并保持 Tx 编辑能力。
- `V4119A` 这类已保存草稿不再被误报为找不到。
- 合并蓝条仍保持“选择一个 edit target 后才能编辑”的行为。
- 回归测试通过。
- 三个相关接口性能验证均在 2 秒内。
- 代码改动保持局部、可读，不引入新的大范围重构。
