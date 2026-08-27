# Crew 19 Pairing Specific Date Playwright E2E 设计

## 背景

用户要求新增与 `eleihu6-rgb` 既有 PBS Playwright 用例同类型的自动化测试，而不是只保留手工测试案例文档。

本次目标聚焦 `CLASS-BidsReport_June2026.txt` 中 Employee `19` 的 `Current Bid`，验证 Portal 通过真实 UI 手工添加后：

- `Pairing Number` 的 `Specific Date` 能加载 pairing occurrence。
- 保存后的 `CONFIRMED RUNS` 能重新回显。
- 左侧 `BIDDING CALENDAR` 上方 tier heatmap 能显示对应蓝色 pairing 色块。

## 范围

新增一个专用 Playwright spec：

- `e2e/tests/pbs-portal/npbs-crew-19-specific-date-pairing.spec.ts`

不修改产品代码，不修改导入逻辑，不兼容旧格式数据。

## 测试数据

来源文件：`CLASS-BidsReport_June2026.txt`

目标 crew：`19`

目标条件：

- `T1` Days Off / `Prefer Off`
- `T2` Pairing / `Any Landing In Airport` / `Avoid`
- `T3` Pairing 组合：`Departing On Jun 2, 6, 11, 13, 16, 18` + `Pairing Number T4520`
- `T4` Pairing 组合：`Departing On Jun 4` + `Pairing Number T4528`
- `T5` Pairing 组合：`Departing On Jun 9` + `Pairing Number T4542`

## 设计选择

### 推荐方案：专用 E2E spec

在新 spec 中复用 `PbsLoginPage` 与 `BidWorkbenchPage`：

1. 登录 crew `19`。
2. 清空 Days Off / Pairing。
3. 使用现有 `placeProperty` 添加普通条件。
4. 在新 spec 内通过真实 DOM 操作完成 `Pairing Number` 的 `Specific Date`、按运行日期选择 autocomplete option、run date 选择、保存和断言。
5. 刷新页面后重新打开已有 bid，断言 `CONFIRMED RUNS` 回显。
6. 断言左侧 `TIER-03/04/05` heatmap 在对应日期出现蓝色 pairing block。

优点：测试目标清晰，失败时能直接指向本次 bug；不会影响批量回放框架。

### 备选方案：扩展批量 NPBS 回放

把 `Specific Date` 逻辑塞进 `npbs-crew-bids-simulation.spec.ts`。

缺点：批量框架会把业务失败归类为 issue，定位当前 bug 不够直接，而且会拖慢整批回放。

## 断言

- `Specific Date` 模式下，`RUN DATE` 不能是 `No pairing runs found in this bid period`。
- 选择 run date 后，`CONFIRMED RUNS` 包含 pairing number 和目标日期。
- Existing row 中对应 tier 激活，摘要包含 pairing number。
- 重新打开编辑弹窗，`Specific Date` 保持选中，`CONFIRMED RUNS` 不丢失。
- 左侧上方 tier heatmap 能看到对应日期的蓝色 pairing block。

## 风险

- 真实远程数据库中某个 pairing occurrence 不存在时，测试应失败并暴露数据口径问题，而不是静默跳过。
- 当前 DOM 缺少部分稳定 test id，因此 spec 需要优先使用 role/name，必要时用现有可访问文本定位。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单个 E2E spec 和少量 helper，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `e2e/tests/pbs-portal/*`，必要时 `e2e/pages/pbs-portal/bid-workbench-page.ts`，测试文档。
- Conflict risk: 低。
- Execution gate: 用户已确认新增这种 Playwright 测试。
