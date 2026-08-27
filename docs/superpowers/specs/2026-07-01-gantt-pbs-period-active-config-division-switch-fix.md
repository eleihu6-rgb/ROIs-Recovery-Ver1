# Gantt PBS Period Active Config Division Switch 修复设计

## 背景

在 `Gantt > PBS > Period` 页面，`Portal Active Period` 卡片用于配置 PBS Portal 当前显示哪个 bid period。当前用户反馈：

- C 部门选择 `Manual Period` 后可以保存。
- P / A 部门选择 `Manual Period` 后看起来保存不上。
- 切换到 P 或 A 后，页面下方仍显示旧的 `Current config: F8/C MANUAL -> Jun 2026`。
- `Manual Period` 输入框看起来为空。

## 只读排查结论

后端数据不是没有保存。远端 `f8_pbs.dictionary` 里已经有三组配置：

- `F8/C -> Jun 2026`
- `F8/P -> Jun 2026`
- `F8/A -> Jun 2026`

对应的 `pbs_period` 也存在：

- C 的 `Jun 2026` period id 是 `38`
- P 的 `Jun 2026` period id 是 `63`
- A 的 `Jun 2026` period id 是 `75`

所以这个问题不是“P/A 写不进数据库”，而是 Gantt 管理页切换 division 后，前端仍保留了上一组 C 配置状态。

## 根因

当前 `gantt/src/components/pbs/pbs-period-view.tsx` 的状态链路是：

1. 页面初始默认 `portalDivision = C`。
2. 页面自动加载 C 的 active period config。
3. 用户把 `Division` 从 C 改成 P 或 A。
4. 前端只更新 `portalDivision`，没有清理或重新加载 `portalConfig / portalPeriodId`。
5. 页面继续显示 C 的 `Current config`。
6. `Manual Period` 当前 value 仍可能是 C 的 `periodId`，但 P/A 下拉选项不包含这个 id，所以看起来为空。
7. 如果此时直接保存，payload 会变成 `division=P/A + periodId=C的id`，后端会正确拒绝，因为 period 的 division 不匹配。

同类风险也存在于 `Filiale` 输入：如果页面初始加载请求还没结束，用户已经修改 `Filiale`，旧请求返回后可能把输入值和配置状态覆盖回旧 scope。因此本次修复需要让 `Filiale` 修改也清空旧配置，并让旧请求失效。

## 修复目标

切换 `Division` 后，页面必须进入当前 `filiale + division` 的配置上下文，不能继续携带旧 division 的 `periodId`。

## 推荐方案

采用“切换 division 自动加载当前 scope 配置”的方案：

1. 新增 `handlePortalDivisionChange(nextDivision)`。
2. 切换 division 时先清空旧的 `portalConfig` 和 `portalPeriodId`。
3. 自动加载当前 `filiale + nextDivision` 的配置。
4. 新增请求序号保护，避免较早的配置请求晚返回后覆盖当前 UI 状态。
5. `Filiale` 输入变化时清空旧配置、旧 `periodId`，并让未完成的旧请求失效。
6. `Current config` 只显示当前 scope 的配置；未加载时显示 `Not loaded`。
7. 保留 `Load` 按钮，作为手动重新加载入口。

这样用户从 C 切到 P/A 后，会自动看到 P/A 的真实配置，不需要手动点 `Load` 才知道当前状态。

## 不做范围

- 不改后端保存语义。
- 不放宽后端 `filiale/division` 匹配校验。
- 不修改 period 生成逻辑。
- 不修改 PBS Portal 员工端周期选择逻辑。
- 不修改 business time 逻辑。

## 验收标准

1. 页面初始仍加载 `F8/C` 配置。
2. 从 C 切到 P 后，`Current config` 更新为 `F8/P`，不再显示 `F8/C`。
3. 从 C 切到 A 后，`Current config` 更新为 `F8/A`，不再显示 `F8/C`。
4. 切换 division 后，不会把旧 division 的 `periodId` 带入保存请求。
5. 当前 division 是 `MANUAL` 且已有 period 时，`Manual Period` 显示对应 period。
6. 当前 division 没有配置时，页面显示未加载或默认状态，保存仍走后端严格校验。
7. 修改 `Filiale` 时，旧 scope 的异步加载结果不能覆盖新输入。

## 测试计划

- 增加或更新 Gantt PBS Period E2E：
  - 打开 PBS Period 页面。
  - 切换 `Portal Active Period` 的 `Division`。
  - 断言 `Current config` 不再显示旧 division。
  - 保存当前 division 的 manual period 成功。
- 运行相关 Gantt 测试和构建。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 Gantt 页面状态管理点，后端不需要改；多 agent 协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `gantt/src/components/pbs/pbs-period-view.tsx` 和对应 E2E/测试。
- Conflict risk: 低。
- Execution gate: 用户确认后再实现。
