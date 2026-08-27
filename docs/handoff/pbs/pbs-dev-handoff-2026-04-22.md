# PBS 开发交接上下文（2026-04-22）

> 这份文档用于给后续新窗口的 AI / 开发者提供 2026-04-22 这一轮 PBS 最新结论。
> 只记录开发侧上下文，不写数据库密码、明文账号密码或其他运行时敏感信息。

## 这一轮先读什么

继续做 PBS 前，建议按这个顺序读：

1. `pbs-portal/AGENTS.md`
2. `pbs-server/AGENTS.md`
3. `docs/handoff/pbs/pbs-dev-handoff-2026-04-21.md`
4. 本文档
5. `docs/superpowers/specs/2026-04-22-lineholder-bidding-design.md`

## 本轮最重要的产品口径

- 第一阶段先不做 `Reserve`。
- 当前要打通的是一条完整的 `Lineholder` 主业务线：
  - `Calendar`
  - `Pairing`
  - `Line`
  - `Days Off`
- 这 4 个入口不是 4 份独立草稿，而是同一份当前用户、当前 PBS 周期的 `Lineholder draft`。
- 当前阶段只做：
  - `bid_context = Current`
- 当前阶段不做：
  - `Default`
  - 最终 PBS award / result 计算

## 业务语义已经定下来的边界

### 1. `Days Off` 页面和左侧 `Calendar` 不是一回事

- 左侧 `Calendar` 表示：
  - `Lineholder` 的“具体日期休”点选
- 右侧 `Days Off` 页面表示：
  - `Lineholder` 的“泛化休息偏好规则”

不要再把这两者混成一个接口或一个数据源。

### 2. `Lineholder` 和 `Reserve` 要分开理解

- 当前这套共享工作台骨架更像 `Lineholder monthly bid`
- `Reserve` 是另一条平行业务线，不是当前 `Lineholder` 缺的某一页

因此当前默认理解应该是：

- `/pairing` = `Lineholder Pairing`
- `/line` = `Lineholder Line`
- `/days-off` = `Lineholder Days Off`
- 左侧共享日历 = `Lineholder Calendar`

## 接口分工结论

### 1. 右侧 `Days Off` 规则页的主读接口

- `GET /api/days-off-bids/current`

它的职责是：

- 读取当前用户、当前周期、`Current` 上下文下的 `Days Off` 规则草稿
- 返回 `draft + propertyCatalog`
- 如果用户还没存过，则返回空 draft

它不是：

- 轮询接口
- calendar 具体日期点选接口
- 前端兜底刷新接口

如果看到它持续重复请求，默认先当成性能问题或 remount 问题查，不要当成业务预期。

### 2. 左侧 `Calendar` 具体休息日点选的接口

- `GET /api/calendar-days-off/current`
- `PUT /api/calendar-days-off/current`

它的职责是：

- 保存和读取按 layer 组织的具体 `day off` 日期

### 3. 统一汇总接口

- `GET /api/lineholder-bids/current/summary`

`Layer` 页面读的是这份统一 summary，不是最终 PBS award 结果页。

## 后端与数据模型结论

- `Lineholder draft` 继续复用现有 PBS 主骨架：
  - `pbs_bid`
  - `pbs_bid_layer`
  - `pbs_bid_group`
  - `pbs_bid_condition`
- `Pairing / Line / Days Off` 规则型数据继续挂在 `pbs_bid_group`
- 左侧 `Calendar` 的具体日期休单独落明细表：
  - `pbs_bid_day_off`
- 对应 migration 文件是：
  - `sql/migration/2026-04-22-add-pbs-bid-day-off.sql`

一个容易踩坑的点：

- 如果运行环境没有应用这条 migration，`calendar-days-off/current` 和 `lineholder-bids/current/summary` 可能因为缺表直接 500

## 当前前端状态结论

### 1. 共享工作台已经切到真实 `Lineholder` 方向

- 左侧 `BIDDING CALENDAR` 继续跨 `Pairing / Line / Days Off / Layer` 共享
- 切页不应重置当前 layer
- `dashboard` 的 UI 结构仍独立，但其中的 `BIDDING CALENDAR` 继续共享同一套 layer 选中状态

### 2. `Pairing` 已经是真实后端保存链路

- 已支持现有规则的真实新增 / 删除 / 修改
- 没有单独保存按钮
- 自动保存到 `pbs-server`

### 3. `Days Off` 与 `Line` 已接入真实前后端链路

- `Days Off` 不再只是 UI mock 壳
- `Line` 也不再是占位
- 它们都属于同一份 `Lineholder draft`

### 4. `Layer` 当前读的是 draft 映射页

- 会显示真实 summary / statistics
- 但它不是最终 PBS pairing result 页面

## 这一轮做过的体验与性能收口

### 1. 首屏 loading 已补齐

共享工作台主链相关页面都已经补了显式 loading，避免先空一下再瞬闪真实数据。

### 2. 不必要的控制台打印已清理

- `pbs-portal` 这轮已经把无意义的调试 `console` 清掉
- 同时把“首屏异步必须有 loading、禁止遗留调试日志”写进了 `pbs-portal/AGENTS.md`

### 3. 共享左日历已收成共享查询

这轮最重要的性能收口是：

- 左侧共享日历不再走组件内手写请求
- 已改成 React Query 共享查询
- 日历保存后直接同步 query cache，再定向刷新 `Layer` summary

对应文件：

- `pbs-portal/src/features/dashboard/hooks/use-calendar-days-off-draft.ts`
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-portal/src/shared/query/workbench-query-defaults.ts`

### 4. 重复请求不是默认合理行为

当前已经做过一轮去重收口：

- `Pairing / Line / Days Off / Layer` 都吃统一的 workbench query 默认配置
- 共享左日历也进入缓存体系
- `StrictMode` 下的“同接口只请求一次”已经补了回归测试

如果后续又看到这些接口频繁重复打：

- `/api/calendar-days-off/current`
- `/api/pairing-bids/current`
- `/api/days-off-bids/current`
- `/api/line-bids/current`

优先从这些方向查：

- React StrictMode 开发态双挂载
- 路由 remount
- query key 不稳定
- 保存后不必要的 invalidate / refetch

不要默认把它解释成业务需要。

## 当前验证状态

本轮 `pbs-portal` 已跑通：

- `npm test`
- `npm run lint`
- `npm run build`

本轮新增的重点回归包括：

- 共享工作台在 `StrictMode` 下共享日历只请求一次
- `Pairing` 页面在 `StrictMode` 下页面数据只请求一次
- 共享日历具体 `day off` 点选可保存
- 首屏 loading 状态存在，不再直接白屏闪烁

## 给下一个上下文的最短说明

如果只是要让另一个上下文快速接手 PBS，可以直接告诉它：

- 当前 PBS 一期主线只做 `Lineholder`
- 主链是 `Calendar + Pairing + Line + Days Off`
- 只做 `Current`，不做 `Default`
- `Calendar` 的具体日期休和 `Days Off` 页面规则不是一回事
- `/api/days-off-bids/current` 是右侧 `Days Off` 规则页真源，不是轮询接口
- 左侧共享日历已经进 React Query 缓存，正在持续收重复请求
- 本轮 `pbs-portal` 的 test / lint / build 已通过
