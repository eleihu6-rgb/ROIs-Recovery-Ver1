# PBS Award Reason Report 第一阶段测试案例

## 测试目标

验证 Award 页面只展示后端确认有效的获奖 Pairing explanation，并能从 Preview 查看完整报告。

## 前置条件

- 使用已登录的 crew 账号。
- 当前 Award period 已发布 roster。
- 准备至少 4 个包含有效 `PBS_AWARD_V1` explanation 的 Pairing。
- 同期包含 Day Off、ILL、VAC、CGS 或其他无 explanation 的地面任务。

## 主流程

1. 打开 PBS Portal 的 `/award`。
2. 查看 `Reason Report Preview`。
3. 点击 `View Reason Report`。
4. 检查完整弹窗内容。
5. 使用右上角关闭按钮关闭弹窗。
6. 再次打开弹窗并按 `Esc` 关闭。

## 预期结果

- Preview 只显示前 3 条 Pairing explanation。
- Preview 显示 `+ 1 more explanation`。
- Preview 和弹窗均显示日期、Pairing Code 和 explanation 正文。
- 弹窗标题为 `Award Reason Report`，完整显示全部 4 条 explanation。
- 关闭弹窗后焦点返回 `View Reason Report`。
- 页面不展示 `PBS_AWARD_V1|` 协议前缀。
- Day Off、ILL、VAC、CGS 和其他无 explanation 的任务不进入报告。

## 空状态

1. 使用当前 period 没有有效 explanation 的 crew 账号打开 `/award`。
2. 查看 Preview 和 `View Reason Report`。

预期：

- 按钮禁用。
- Preview 显示 `No award explanations are available for this period.`。
- 页面不出现 `Missing`，不打开空弹窗。

## 异常与边界

- 普通 planner comments 不进入报告。
- 协议格式错误、Tier 超范围或 provenance 不一致的 comments 不进入报告。
- 同一 Pairing 多航段只生成一条 explanation。
- 有 Award Result 但没有有效 comments 时，报告仍不可用。
- 没有 Award Result 但存在有效 comments 时，报告可用。
- `/award/current` 请求失败时沿用现有页面级错误状态，不显示原始异常、数据库信息或重复 toast。

## 回归范围

- Award Summary、Calendar、Roster Details 和 Selected Duty 保持原行为。
- Selected Duty 的既有 `Award Explanation` 保持可见。
- Credit、Block、Fleet 和地面任务展示不受影响。
