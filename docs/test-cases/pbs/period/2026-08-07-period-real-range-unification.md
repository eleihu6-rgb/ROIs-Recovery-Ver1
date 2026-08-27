# PBS Period 真实范围统一回归测试

## 测试目标

确认 PBS Portal、PBS Server 与 Live 发布/算法导出链路统一使用 `live.roster_period` 的真实范围和稳定主键，不再根据 `periodCode` 推导自然月。

## 前置条件

- 已存在一个非自然月或跨月 RP，例如：
  - `roster_period_id = 38`
  - `period_code = Jun 2026`（仅展示）
  - `rp_start = 2026-05-31 00:00:00`
  - `rp_end = 2026-07-01 23:59:59`
- RP 已配置完整的 Base 时区。
- PBS Portal 测试账号属于该 RP 可用的 Base、Division 和 Rank。

## 用例一：Portal 展示真实 RP 范围

1. 登录 PBS Portal。
2. 打开 Dashboard、Bid、Days Off、Reserve 和 Search Pairings。
3. 检查日期控件、日历和结果卡片。

预期：

- 可选日期从 `2026-05-31` 开始，到 `2026-07-01` 结束。
- 不出现 `2026-05-30` 或 `2026-07-02`。
- 页面标题仍可显示 `Jun 2026`，但该文字不参与日期计算。
- Search Pairings 请求携带精确 `rosterPeriodId`。

## 用例二：Pairing 归属与 carry-out

1. 准备一条在 Pairing Base 本地日期 `2026-07-01` 开始、结束时间跨到 `2026-07-02` 的 Pairing。
2. 在该 RP 中搜索 Pairing。

预期：

- Pairing 被保留，因为归属依据是 Pairing Base 本地的起始日期。
- Pairing 的结束日期可以超过 `rp_end`，不因 carry-out 被截断。
- 起始日期为 `2026-07-02` 的 Pairing 不属于该 RP。

## 用例三：缺失上下文时快速失败

分别移除以下任一条件后触发查询或导出：

- `rosterPeriodId`
- `rp_start` / `rp_end`
- Base 时区

预期：

- 请求明确失败，不回退到自然月、UTC 或 `periodCode` 推导。
- 用户界面显示产品化错误和下一步操作，不暴露异常堆栈或数据库信息。

## 用例四：算法包契约

1. 从 Gantt 管理工具选择具体 RP 并下载算法包。
2. 检查请求和生成的 CSV。

预期：

- 请求同时包含稳定的 `rosterPeriodId` 和展示用 `periodCode`。
- CSV 仅包含该真实 RP 归属范围内的 Pairing/crew 数据。
- 现有算法 CSV 字段契约不变化。

## 已知外部阻塞

- `engine-server` 当前场景算法包调用尚未转发 `rosterPeriodId`，会被 Live Server 的严格校验拒绝。该模块不在本阶段授权修改范围内，需要 Engine 维护方按同一契约补齐。
- `pbs-server` 已退役且返回 HTTP 410 的旧算法导出代码仍保留历史 `periodCode` 解析，不属于运行时链路。
- `live-server` 的旧 crew bid import 自然月解析不在本阶段范围内，后续若继续使用该入口，应单独按 Source-of-Truth 迁移门禁处理。
