# PBS Line「Credit Window Preference」原型设计

## 背景

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 的 Line 第一条中定义：

- Final Bid Option：`Credit Window Preference`
- Purpose：Crew bids for lower or higher credit.
- Required Fields / Inputs：Low credit / high credit selector, min credit, max credit
- Rules / Defaults：Low credit 不能低于 MMG；High credit 不应超过 overtime threshold，除非 open time requires it。
- Notes for Developers：Combines min credit window and max credit window.

当前系统已有旧 Line 条件：

- `401 Max Credit Window`
- `402 Min Credit Window`

两者当前都是 legacy `flag`，不能表达 min / max credit 数值，也不能表达 Low / High credit selector。本原型只用于理解合并后的员工端表达，不是实现方案。

## 原型目标

1. 用一个紧凑弹窗表达 `Credit Window Preference`。
2. 展示 `Low credit / High credit / Custom` 三种选择。
3. `Low credit` 和 `High credit` 使用公司定义的固定 credit window，不让员工输入具体 credit。
4. 只有 `Custom` 展示 `Minimum credit / Maximum credit` 两个 `HH:MM` 输入。
5. 不在弹窗内展示解释段落；MMG / overtime threshold 作为后续正式 spec 的校验边界处理。

## 原型非目标

- 不修改 `pbs-portal/src`。
- 不修改 contracts、server、SQL、migration 或远端数据库。
- 不提交 Git。
- 不定义最终 property code 归属。
- 不决定旧 `401/402` 数据清理策略。
- 不实现真实保存、收藏、校验或算法导出。

## 视觉与交互

- 原型路径：`.superpowers/brainstorm/credit-window-preference-20260714/credit-window-preference-v1.html`
- 风格对齐 `docs/modules/pbs/pairing-condition-ui-standard.md`：白色紧凑弹窗、固定顺序 `TIERS` → `PREFERENCE` → 条件字段 → footer。
- 初始选择 `Low credit`，显示只读 `Company low window`；`TIERS` 为空，因此 `Add Bid` / `Save Favorite` 初始禁用。
- 切换到 `High credit` 时显示只读 `Company high window`。
- 切换到 `Custom` 时才显示 `Minimum credit / Maximum credit` 输入；输入为空时不自动填默认值。
- `Add Bid` / `Save Favorite` 只改变视觉禁用态，不发送请求：`Low/High` 只要求至少一个 tier；`Custom` 还要求 min / max 都是合法 `HH:MM` 且 min <= max。
- 2026-07-14 用户反馈原型啰嗦后，已简化为单弹窗：删除外层页面壳、示例卡片、快捷示例按钮、边界说明块和副标题。
- 2026-07-14 用户再次要求更简单后，已继续删除 guardrail、summary 和解释性文案。
- 2026-07-14 用户确认产品表达后，当前原型改为三段式：`Low credit` / `High credit` / `Custom`；前两者固定公司窗口，只有 `Custom` 展开 min / max 输入。

## 后续需要正式确认的问题

1. 合并后是否复用 `401` 作为新 `Credit Window Preference`，并隐藏 / 退役 `402`。
2. 旧 `401/402` saved bid / favorite 是否清空，不做兼容。
3. MMG 与 overtime threshold 的权威来源：dictionary、ruleset 参数，还是 PBS period 配置。
4. `Company low window` / `Company high window` 的权威配置来源、展示文案和实际 min / max 边界。
5. Standing Bid 是否同步暴露该合并条件。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 当前仅生成理解用原型，不涉及实现拆分。
- Suggested split: 不适用。
- Write boundaries: 只写 prototype 设计记录与 `.superpowers/brainstorm` 下 HTML。
- Conflict risk: 低；不触碰产品代码，也不触碰 Deadhead Flying 相关文件。
- Execution gate: 用户确认原型方向后，再进入正式 spec；正式 spec 经用户批准后才实现。
