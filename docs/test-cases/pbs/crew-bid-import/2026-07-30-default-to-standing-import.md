# NPBS Default Bid 导入 Standing Bid 测试用例

## 测试目标

确认 NPBS 文本中的 `Current Bid` 与 `Default Bid` 会分别导入正确的 PBS 上下文，并按规则处理明确年月日条件。

## 前置条件

- 三套 PBS schema 已执行 `2026-07-30-pbs-crew-bid-import-target-context.sql`。
- 使用包含同一员工 `Current Bid` 和 `Default Bid` 的 NPBS Bids Report。
- 通过 Gantt `PBS > Admin Tools > Crew Bid Import` 操作。

## Dry Run

1. 选择 July 2026 报告文件。
2. Crew IDs 输入 `19`。
3. 点击 `Dry Run`。

预期：

- 同一员工生成三个独立目标：
  - `Current → Current`
  - `Default → StandingLineholder`
  - `Default → StandingReserve`
- 页面明确展示 Source → Target。
- `Default` 中可长期复用的 Days Off、Pairing、Roster 条件进入 `StandingLineholder`。
- Reserve 条件只进入 `StandingReserve`。
- 明确年月日且没有可保留部分的条件被跳过并显示原因。
- 含明确年月日但仍有完整长期条件的条目只去掉日期部分。
- Specific Pairing / On Date 等无法形成长期条件的条目不导入。

## 正式导入

1. 先完成 Dry Run 并确认问题列表。
2. 点击正式导入。

预期：

- 提交期间弹窗内容和 Tier 选择保持不变，并显示明确的提交中状态。
- 同一员工的多个目标在同一事务中写入；任一目标失败时，该员工本次写入全部回滚。
- Current Bid 写入目标月份的 `Current`。
- Default Lineholder 写入 `STANDING / StandingLineholder`。
- Default Reserve 写入 `STANDING / StandingReserve`。
- 导入完成后列表刷新，不出现先清空表单再长时间无反馈的状态。

## 回归检查

- 普通 Bid 页面和 Standing Bid 页面仍分别读取各自 `bid_context`。
- 条件显示与隐藏仍只由 `pbs_bid_property_context` 控制。
- 旧 pbs-server 导入入口返回 `410 Gone`，避免双入口产生不一致行为。
