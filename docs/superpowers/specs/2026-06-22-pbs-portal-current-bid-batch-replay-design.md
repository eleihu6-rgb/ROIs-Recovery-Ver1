# PBS Portal 多员工 Current Bid 批量回放测试设计

> 日期：2026-06-22  
> 状态：Approved / Implemented in E2E，用户已确认“Current 优先、Default 兜底、超过 7 个只看前 7 个”后实现  
> 范围：PBS Portal Playwright / 多员工 Current Bid 优先回放 / QA 测试案例与缺口报告

## 1. 目标

基于用户提供的 NPBS bid 文本，新增一组 PBS Portal Playwright 回放测试：

- 按员工登录 Portal，通过真实 UI 录入 bid 条件。
- 选择 bid context 时遵循：**Current Bid 优先；如果员工没有 Current Bid，才使用 Default Bid 兜底**。
- 每个选中的 bid context 最多录入前 7 条真实 bid preference，对应 Portal `T1` 到 `T7`。
- `Pairing Bid Group`、`Award Pairings`、`Reserve Bid Group` 是分组/流程文本，不算真实条件，不占 tier。
- 超过第 7 条的真实条件不录入、不合并、不塞到已有 tier，只在报告中记录为 `ignored: exceeds T1-T7 capacity`。
- 组合条件继续使用之前确认的方式：拆成同一个 tier 下的多条普通 UI condition，不新增产品条件结构，不改页面代码来适配文本。
- 对无法完整表达的条件，必须记录原因、分类和截图；不能用语义相近但不等价的条件替代。

## 2. 数据来源与时间口径

来源文件：

`/Users/lei/.codex/attachments/a0db637e-8921-4836-8a0b-4a7d100dd7bf/pasted-text.txt`

来源文本里的日期都是 `March 2026`。本次仍沿用之前规则：

- 来源日期只作为 day-of-month / day-of-week 参考。
- Playwright 录入时映射到当前 Portal RP 月份。
- 如果当前 RP 月份没有对应日期，例如 31 号，则按现有 `BidWorkbenchPage.toIso()` 规则 clamp 到当前月最后一天。
- Pairing Number、Airport、Counting Deadhead、Limit 等值必须以当前 Portal UI 可选项为准；如果当前月份/当前员工不可选，记录为缺口。

## 3. 选中员工与 Bid Context 规则

### 3.1 实际录入

| Employee | Category | 选中 context | 原因 |
|---|---|---|---|
| `19` | `YYZ-737-IFD` | `Current Bid` | 有 Current，优先 Current |
| `73` | `YYZ-737-FO` | `Current Bid` | 有 Current，Default 不录 |
| `96` | `YVR-737-IFD` | `Current Bid` | 有 Current，Default 不录 |
| `113` | `YVR-737-CA` | `Current Bid` | 有 Current |
| `169` | `YOW-737-CA` | `Current Bid` | 有 Current |
| `106` | `YYZ-737-IFD` | `Default Bid` | 没有 Current，使用 Default 兜底 |

### 3.2 明确不录入

| Employee | Context | 不录原因 |
|---|---|---|
| `73` | `Default Bid` | 同员工已有 Current Bid |
| `96` | `Default Bid` | 同员工已有 Current Bid |

## 4. 条件映射

### 4.1 Employee 19 Current Bid

| Tier | 来源条件 | Portal 表达 |
|---|---|---|
| `T1` | `Prefer Off Mar 3, 5, 6, 7, 8, 9, 11, 13, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 31` | Days Off / `Prefer Off` / explicit dates |
| `T2` | `Avoid Pairings If Any Landing In FLL, KIN, MBJ, MCO, MEX, PUJ, PVR, YEG, YHZ, YKF, YVR, YWG, YXX, YYC` | Pairing / `Any Landing In Airport` / Avoid / airport list |
| `T3` | `Award Pairings If Departing On Mar 2, Mar 4 If Pairing Number T4506` | Pairing 组合：`Departing On` dates + `Pairing Number` T4506 |
| `T4` | `Award Pairings If Departing On Mar 16, 20, 23, 27, 30 If Pairing Number T4545` | Pairing 组合：`Departing On` dates + `Pairing Number` T4545 |
| `T5` | `Award Pairings If Departing On Mar 12 If Pairing Number T4537` | Pairing 组合：`Departing On` date + `Pairing Number` T4537 |

### 4.2 Employee 73 Current Bid

| Tier | 来源条件 | Portal 表达 |
|---|---|---|
| `T1` | `Avoid Pairings If Any Landing In CUN, FLL, KIN, MBJ, MCO, PVR, YEG, YHZ, YKF, YVR, YWG, YXX, YYC` | Pairing / `Any Landing In Airport` / Avoid / airport list |
| `T2` | `Award Pairings If Pairing Number TB5355` | Pairing / `Pairing Number` / Award / TB5355 |
| `T3` | `Award Pairings If Departing On Mar 16, 20, 23, 27, 30 If Any Landing In GDL` | Pairing 组合：`Departing On` dates + `Any Landing In Airport` GDL |
| `T4` | `Award Pairings If Departing On Mar 2, Mar 6 If Pairing Number T4105` | Pairing 组合：`Departing On` dates + `Pairing Number` T4105 |

### 4.3 Employee 96 Current Bid

只录前 7 条真实条件，映射到 `T1` 到 `T7`。

| Tier | 来源条件 | Portal 表达 |
|---|---|---|
| `T1` | `Award Pairings If Any Duty On Mar 9 If Pairing Number V4521` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4521 |
| `T2` | `Award Pairings If Any Duty On Mar 10 If Pairing Number V4522` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4522 |
| `T3` | `Award Pairings If Any Duty On Mar 12 If Pairing Number V4522` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4522 |
| `T4` | `Award Pairings If Any Duty On Mar 14 If Pairing Number V4531` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4531 |
| `T5` | `Award Pairings If Any Duty On Mar 15 If Pairing Number V4522` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4522 |
| `T6` | `Award Pairings If Any Duty On Mar 17 If Pairing Number V4522` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4522 |
| `T7` | `Award Pairings If Any Duty On Mar 19 If Pairing Number V4531` | Pairing 组合：`Any Duty On` date + `Pairing Number` V4531 |

忽略并记录：

| 来源条件 | 记录原因 |
|---|---|
| `Prefer Off Mar 2, 3, 4, 5, 6, 7, 8, 20, 30, 31` | `ignored: exceeds T1-T7 capacity` |
| `Avoid Pairings If Any Landing In CUN, LAS, LAX, MEX, SFO, YEG, YYC, YYZ` | `ignored: exceeds T1-T7 capacity` |
| `Avoid Pairings If Pairing Check-In Time < 06:15` | `ignored: exceeds T1-T7 capacity` |
| `Avoid Pairings If Any Duty Legs (Counting Deadhead Legs) > 2 legs` | `ignored: exceeds T1-T7 capacity` |

### 4.4 Employee 113 Current Bid

| Tier | 来源条件 | Portal 表达 |
|---|---|---|
| `T1` | `Prefer Off Mar 31` | Days Off / `Prefer Off` / explicit date |
| `T2` | `Avoid Pairings If Pairing Number V4102, V4106, V4107, V4111, V4115, V4127, V4132, V4134, V4138, V4145, V4148` | Pairing / `Pairing Number` / Avoid / list |
| `T3` | `Award Pairings If Pairing Number V4119` | Pairing / `Pairing Number` / Award / V4119 |
| `T4` | `Award Pairings If Pairing Number V4114, V4131, V4137 Limit 3` | Pairing / `Pairing Number` / Award / list + `Limit 3` if UI supports it |
| `T5` | `Award Pairings If Pairing Number V4112, V4122, V4133, V4136, V4141, V4143, V4144, V4147, V4199` | Pairing / `Pairing Number` / Award / list |

`Limit 3` 处理原则：

- 如果 Portal 有明确 Limit 控件，按 UI 录入。
- 如果没有 Limit 控件，不把它静默丢掉后标记成功；记录为 `condition-missing` 或 `partial-import`，说明 pairing number list 可表达但 `Limit 3` 缺失。

### 4.5 Employee 169 Current Bid

| Tier | 来源条件 | Portal 表达 |
|---|---|---|
| `T1` | `Prefer Off Mar 10, 11, 12, 13, 14, 15` | Days Off / `Prefer Off` / explicit dates |
| `T2` | `Award Pairings If Pairing Number O4105` | Pairing / `Pairing Number` / Award / O4105 |
| `T3` | `Award Pairings If Pairing Number O4109` | Pairing / `Pairing Number` / Award / O4109 |
| `T4` | `Award Pairings If Pairing Number O4116` | Pairing / `Pairing Number` / Award / O4116 |

### 4.6 Employee 106 Default Bid 兜底

| Tier | 来源条件 | Portal 表达 |
|---|---|---|
| `T1` | `Prefer Off Weekends` | Days Off / `Prefer Off` / weekends mode |
| `T2` | `Set Condition Minimum Credit Window` | Line / `Minimum Credit Window` |
| `T3` | `Avoid Pairings If Any Landing In (Counting Deadhead Legs) FLL, KIN, MBJ, MCO, MEX, YHZ, YWG, YXX` | Pairing / `Any Landing In Airport` / Avoid / airport list + `Counting Deadhead Legs` if UI supports it |

`Counting Deadhead Legs` 处理原则：

- 如果 Portal 有同语义开关，必须设置。
- 如果 Portal 没有同语义开关，不用普通 `Any Landing In Airport` 冒充完整导入；记录为系统条件缺失或不完整导入。

## 5. Playwright 设计

建议新增专项 E2E：

`e2e/tests/pbs-portal/npbs-current-bid-batch-replay.spec.ts`

复用：

- `e2e/pages/pbs-portal/pbs-login-page.ts`
- `e2e/pages/pbs-portal/bid-workbench-page.ts`

执行流程：

1. 对每个选中员工串行执行，禁止并行。
2. 登录员工账号，默认密码 `rois`。
3. 根据该员工要录入的页面清空 Existing bids：
   - 涉及 days-off 时清空 Days Off。
   - 涉及 line 时清空 Line。
   - 涉及 pairing 时清空 Pairing。
4. 按映射表录入 `T1-T7` 条件。
5. 组合条件拆成多个同 tier property row。
6. 每个成功录入的 property 必须断言：
   - row 出现在 Existing 区域。
   - 目标 tier button 为 active。
   - bid 摘要包含关键值。
7. 每个失败或不完整条件必须记录：
   - employee
   - selected context
   - tier
   - source text
   - attempted portal page/property
   - category
   - reason
   - screenshot path

## 6. 报告与测试案例产物

建议生成：

- 自动化用例：`e2e/tests/pbs-portal/npbs-current-bid-batch-replay.spec.ts`
- 运行报告：`e2e/results/npbs-issues/current-bid-batch-replay.json`
- QA 测试案例：`docs/test-cases/pbs/import/2026-06-22-current-bid-batch-replay.md`

报告分类：

| Category | 含义 |
|---|---|
| `placed` | 完整录入成功 |
| `ignored` | 按规则忽略，例如超过 `T1-T7` |
| `condition-unclear` | 来源文本无法可靠理解 |
| `condition-missing` | Portal 没有对应 property / 控件 / 参数 |
| `condition-mismatch` | Portal 条件与来源语义不等价 |
| `value-not-available` | property 存在，但当前 RP / 当前员工可选值没有该机场、pairing number 或日期 |
| `partial-import` | 只能录入部分语义，例如 Pairing Number 可录但 `Limit 3` 不支持 |
| `ui-operation-failed` | 语义可映射，但 Playwright 操作失败 |

## 7. 非目标范围

- 不新增产品条件。
- 不修改 Pairing / Days Off / Line 页面业务代码。
- 不改变 tier toggle 语义。
- 不把组合条件做成新的嵌套数据结构。
- 不把超过 `T7` 的条件合并到现有 tier。
- 不把 Default Bid 覆盖到已有 Current Bid 员工上。
- 不改数据库 schema / seed。

## 8. 验收标准

- Spec 经用户确认后再进入实现。
- Playwright 通过真实 UI 完成选中员工 bid replay。
- Current 优先 / Default 兜底规则被报告体现。
- 每个选中 context 只处理前 7 条真实条件。
- 组合条件以同 tier 多条普通 UI condition 表达。
- 不支持的能力有明确失败/缺失/不完整原因，不静默通过。
- 生成自动化测试、QA 测试案例、缺口 JSON 报告。
- 至少运行目标 Playwright spec，并说明通过或阻塞原因。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务核心是一个数据映射规则和一个 Playwright replay 流程，拆分会增加协调成本，且多个 agent 可能同时改同一个 E2E page object。
- Suggested split: 不拆分。
- Write boundaries: 后续实现主要写 `e2e/tests/pbs-portal/`、`docs/test-cases/pbs/import/`，必要时小幅扩展 `e2e/pages/pbs-portal/bid-workbench-page.ts`。
- Conflict risk: 中等；风险来自测试会清空多个员工的 bid 草稿，必须串行。
- Execution gate: 用户 review 本 spec 并明确确认后，才能开始 Playwright 录入与测试文件实现。
