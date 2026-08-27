# PBS Standing Prefer Off 周末展示修复设计

日期：2026-07-29
状态：已实施并验证

## 1. 问题

Prefer Off 的 `Weekends` 是合法的周期性条件，但当前存在三类展示问题：

1. Current Bid 保存后被摘要组件错误显示为 `Prefer Off needs review`。
2. Standing Bid 不属于具体月份，却调用月份展开逻辑并显示 `0 weekends`。
3. Standing Existing 没有复用 Current Bid 的分类标签和语义摘要：
   - `Days Off` 被改成紫色，而 Current Bid 的标准颜色是绿色。
   - Standing 使用“属性名称 + 原始值”两行展示，Current Bid 使用一行完整业务语句。
   - 星期顺序和时间窗口文案不统一，例如 `Friday, Tuesday, Saturday`、`Window 18:00-23:59`。

## 2. 目标与范围

- Current Bid 弹窗继续按当前 Bid Period 显示实际周末数量，例如 `4 weekends`。
- Standing Bid 弹窗不计算具体月份数量，显示 `Every weekend`。
- Current Bid Existing 摘要将合法的 `Weekends` 显示为 `Prefer off on weekends`。
- 合法的多个星期与合法时间窗口也生成正常摘要。
- Standing Existing 的 Prefer Off 复用 Current Bid 的 `Days Off` 绿色分类标签和同一份语义摘要。
- Standing Existing 仅保留自身需要的 `EDIT` / 删除操作；展示文案和颜色不产生新的 Context 差异。
- 只有无法解析、配置失效或时间格式非法的数据才显示 `needs review`。
- 不修改数据库、API、保存结构、Standing/Current 数据隔离或条件可见性。

## 3. 方案比较

### 方案 A：在现有共享组件中按 Context 展示（推荐）

- `PreferOffEditor` 已有 `dialogContext`，仅用它决定周末徽标文案。
- Current 继续使用 `periodCount`；Standing 显示 `Every weekend`。
- 扩展现有 Days Off 摘要格式化分支，识别 `weekends`、多个 `days_of_week` 和合法时间窗口。
- Standing Existing 的 property 201 调用 Current Bid 已有的摘要生成器和分类样式；不复制新的 Prefer Off 文案格式化器。

优点：改动最小，继续复用统一 UI 与解析器，不改变数据；同一条件以后不会在两页继续漂移。
缺点：共享组件中仅保留“Current 显示月份周末数、Standing 显示 Every weekend”这一处必要的 Context 差异。

### 方案 B：为 Standing 传入虚拟月份

可以让计数不再是 0，但会把跨月份规则错误伪装成某个月份的数量，语义不正确。

### 方案 C：由后端返回 Standing 周末数量

Standing 没有固定月份，后端也无法给出稳定数字；同时会扩大 API 与后端改动范围。

结论：采用方案 A。

## 4. 展示规则

| 场景 | 展示 |
|---|---|
| Current 弹窗，Weekends | 当前 Period 的实际数量，如 `4 weekends` |
| Standing 弹窗，Weekends | `Every weekend` |
| Current Existing，Weekends | `Prefer off on weekends` |
| Current / Standing Existing，多个星期 | `Prefer off on Tuesday, Friday, Saturday`（按周一至周日顺序） |
| Existing，合法时间窗口 | 在基础摘要后追加 `from HH:mm to HH:mm` |
| Current / Standing Existing，Days Off 标签 | 使用同一绿色分类标签 |
| 非法或无法识别的旧数据 | `<Property> needs review` |

Standing Existing 不显示原始值 `Weekends` 或 `Window HH:mm-HH:mm`，而是显示与 Current Bid 相同的完整业务语句：

- `Prefer off on Tuesday, Friday, Saturday`
- `Prefer off on Tuesday, Saturday from 18:00 to 23:59`
- `Prefer off on weekends`
- `Prefer off on weekends from 18:00 to 23:59`

Standing 的 `EDIT` / 删除按钮仍然保留，这属于操作能力差异，不属于条件展示差异。

## 5. 测试与验收

- 组件测试：Current 显示具体周末数量；Standing 显示 `Every weekend` 且不出现 `0 weekends`。
- 摘要测试：Weekends、多个星期、合法时间窗口均不显示 `needs review`。
- Standing 页面测试：property 201 使用绿色 `Days Off` 标签；四种代表性摘要与 Current Bid 完全一致。
- Standing 页面测试：仍保留 `EDIT` / 删除操作。
- 回归测试：非法值仍显示 `needs review`。
- 运行相关 Vitest、PBS Portal build、lint、`npm run check:ui`。
- 使用 Playwright 以员工 19 的真实 UI 验证 Current 与 Standing 的 Existing Prefer Off 回显。

## 6. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 仅涉及同一共享编辑器、摘要格式化器和 Standing Existing 行组件，改动紧密且规模很小。
- Suggested split: 不拆分。
- Write boundaries: Prefer Off 编辑器、Bid 摘要、Standing Existing 的 property 201 展示及其测试。
- Conflict risk: 并行修改共享摘要逻辑容易产生冲突。
- Execution gate: 用户确认本设计后由单一实现者修改并验证。
