# Flight Legs per Duty 原型生成计划

关联设计：`docs/superpowers/specs/2026-07-13-pbs-flight-legs-per-duty-prototype-design.md`

## 1. 生成隔离的可视化原型

- 在受控的 `.superpowers/brainstorm/` 会话目录中生成一个新的 HTML 原型。
- 使用全量 PBS Portal 风格，不读取、不写入实际 Portal 状态或 API。

## 2. 实现纯前端演示交互

- Tier、Preference、Duty match、operator 和 legs 输入均从空白开始。
- 根据填写完整度仅切换 `ADD BID` / `SAVE FAVORITE` 的视觉状态。
- 底部按钮不触发提交、保存、网络请求或数据写入。

## 3. 浏览器检查

- 打开原型，检查初始空白态、控件选择、数值输入与按钮视觉状态。
- 由用户在浏览器查看并反馈；不进入产品实现或 Git 提交。
