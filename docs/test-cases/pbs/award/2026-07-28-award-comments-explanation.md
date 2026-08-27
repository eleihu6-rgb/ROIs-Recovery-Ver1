# PBS Award comments 解释链路测试用例

## 目标

验证优化结果中的受控 Award 解释能够沿
`Scenario roster_flight → Live roster_flight → roster_publish → Award API → Portal`
完整传递，同时普通备注、伪造内容和来源不完整的数据不会展示给机组。

## 前置条件

- 使用已发布的 PBS 排班周期。
- 测试机组至少有一个由 Scenario 优化生成的 Pairing。
- 该 Pairing 的全部航段使用相同受控值：
  `PBS_AWARD_V1|Matched your Tier 3 pairing preferences.`
- 数据来源为 `source=CR`、`request_source=SCENARIO`，且 `request_id` 非空。

## 用例

### 1. 有效解释正常展示

1. 打开 Bidding Portal 的 Award 页面。
2. 在 Roster Details 中选择带解释的 Pairing。
3. 检查 Selected Duty。

预期：

- 显示 `Award Explanation`。
- 正文显示 `Matched your Tier 3 pairing preferences.`。
- 页面不显示内部前缀 `PBS_AWARD_V1|`。

### 2. 切换到无解释 Duty

1. 先选择带解释的 Pairing。
2. 再选择 Day Off、Activity 或无解释 Pairing。

预期：

- `Award Explanation` 区块消失。
- 不保留上一个 Pairing 的解释。

### 3. 普通 comments 不展示

将发布快照中的 comments 设置为普通规划备注，并刷新 Award 页面。

预期：

- Award API 的对应 item `explanation` 为 `null`。
- Portal 不显示 `Award Explanation`。

### 4. 来源不完整不展示

分别验证 `source` 不是 `CR`、`request_source` 不是 `SCENARIO`、`request_id` 为空。

预期：

- 任一条件不满足时，Award API 的 `explanation` 为 `null`。

### 5. 多航段一致性保护

分别构造航段 comments 缺失、内容冲突、协议格式错误。

预期：

- Pairing 的 `explanation` 为 `null`。
- API 不向前端暴露原始 comments。

### 6. 手工备注前缀保护

通过 Roster 新建、编辑和 Ground Task 入口尝试写入以 `PBS_AWARD_` 开头的 comments。

预期：

- 请求返回 HTTP 400。
- 用户可见错误为 `Comments cannot use the reserved PBS_AWARD_ prefix.`。
- 普通备注仍可保存。

## 自动化覆盖

- Contract：协议严格解析、Tier 边界和保留命名空间。
- Live Server：Scenario 转录、重复 assignment 拒绝、手工写入保护、两段发布复制。
- PBS Server：来源校验、多航段一致性和仅查询登录机组。
- Portal：解释显示及切换 Duty 后消失。
- Playwright：真实 Award 页面交互回归。
