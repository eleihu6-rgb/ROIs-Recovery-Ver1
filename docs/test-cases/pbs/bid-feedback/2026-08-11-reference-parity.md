# PBS Bid Feedback 参考原型对齐测试用例

## 1. 测试目标

验证 PBS Portal 的 Bid Feedback 第一阶段清理后仍保留参考原型的主界面结构，并确认 Eligibility 在 Rule Engine 接入前统一显示 unavailable。

## 2. 前置条件

- Crew 已登录 PBS Portal；
- 当前 Bid Period 已配置；
- Crew 至少存在 Award、Avoid、Days Off 中的一类 Bid；
- Rank、Base、Pre-assignment 和 Team Rule 边界用例应准备对应 Pairing 和 Crew 数据，用于确认这些 Pairing 不被静默过滤。

## 3. 主流程

1. 进入 Bid 页面，点击 `Feedback`。
2. 确认弹窗标题显示 Crew 和当前 Bid Period。
3. 检查 `Award / Avoid / Days Off` Tab 及 `Bids / Calendar` 切换。
4. 在 Award Tab 选择 Pairing。
5. 检查表格字段依次为 `Pairing / Base / Start / End / Days / Credit`。
6. 检查 Start/End 显示为 `MM-DD`。
7. 检查详情字段为 `Rank / Base / Days / Credit / TAFB`；Route 至少有两个机场节点时才显示。
8. 确认详情不存在 Score 和 Matched Bids。
9. 对所有 Award Pairing，确认 Eligibility 为 `N/A`，顶部显示 `Eligibility unavailable`，并显示 Rule Engine eligibility 尚未运行的中性文案。

## 4. Eligibility 边界场景

### 4.1 Rank

- Crew Rank 属于或不属于 Pairing composition 时，Award Pairing 均保留；
- 不显示 Rank mismatch、PASS 或 FAIL。

### 4.2 Base

- Crew Base 与 Pairing Base 相同、不同或为空时，Award Pairing 均保留；
- 不显示 Base mismatch、PASS 或 FAIL。

### 4.3 Team Rule

- `not_do` / `only_do` 原本会阻止的 Pairing 在第一阶段均保留；
- 不读取 Scenario 发布快照，不显示 Team Rule 原因；
- 统一显示 `Eligibility unavailable` / `N/A`，不得显示为已检查通过。

### 4.4 Pre-assignment

- 时间区间真实重叠、端点相接或时间无法解析时，Award Pairing 均保留；
- 不显示 Pre-assignment 冲突原因、红叉或浅红失败背景。

## 5. Period 与交互

- Award、Avoid、Days Off 和 Calendar 均只显示与当前 Period 有重叠的数据；
- 跨 Period 起止边界的 Pairing 必须保留；
- 完全不重叠的数据不显示；
- 日期无法解析时 fail-open，记录仍保留；
- 切换 Tab 后清空 Pairing/Days Off 选择，右侧显示选择提示；
- Calendar 只显示 Award Pairing 和 Days Off，不显示 Avoid Pairing。

## 6. 性能与错误恢复

- 连续采样至少 20 次 `/api/bid-feedback/current`，记录 p95，要求小于 2 秒；
- 分别验证冷缓存和热缓存；
- 接口失败时显示持久错误状态和 `TRY AGAIN`，不得暴露异常对象、堆栈或数据库信息；
- Retry 成功后应恢复正常内容。

## 7. 回归范围

- Bid Feedback 冲突数量徽章；
- Current/Standing Bid 取值优先级；
- Draft Version 并发复核；
- Rule Engine eligibility unavailable 状态；
- Pairing Search SQL 参数完整性；
- PBS Portal 桌面与窄视口布局。
