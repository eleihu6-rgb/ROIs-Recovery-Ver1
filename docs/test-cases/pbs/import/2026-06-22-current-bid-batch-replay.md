# PBS Portal Current/Default Bid 批量回放测试案例

## 背景

本用例覆盖用户提供的 NPBS `Buddies / Bid Preferences` 文本在 PBS Portal 中的手动 UI 回放。来源数据是 `March 2026`，但本轮按既定规则录入到当前 Portal RP，即测试环境里的 `June 2026`。

自动化用例：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/npbs-current-bid-batch-replay.spec.ts --workers=1 --reporter=list
```

报告输出：

```text
e2e/results/npbs-issues/current-bid-batch-replay.json
```

## 选择规则

- 同一员工同时存在 `Default Bid` 和 `Current Bid` 时，只录入 `Current Bid`。
- 员工没有 `Current Bid` 时，使用 `Default Bid` 兜底。
- `Pairing Bid Group`、`Award Pairings`、`Reserve Bid Group` 是分组/流程文本，不占 tier。
- 每个选中的 bid context 只录入前 7 条真实 bid preference，对应 `T1` 到 `T7`。
- 超过 7 条的真实条件只记录为 `ignored`，不合并、不塞到已有 tier。
- `If A If B` 组合条件拆成同一个 tier 下的多条普通 UI condition，例如 `Departing On` 和 `Pairing Number` 分别新增，但都选同一个 tier。

## 覆盖员工

| Employee | Category | 选中 context | 原因 |
|---|---|---|---|
| `19` | `YYZ-737-IFD` | `Current Bid` | 有 Current，优先 Current |
| `73` | `YYZ-737-FO` | `Current Bid` | 有 Current，Default 跳过 |
| `96` | `YVR-737-IFD` | `Current Bid` | 有 Current，只录前 7 条真实条件 |
| `113` | `YVR-737-CA` | `Current Bid` | 有 Current |
| `169` | `YOW-737-CA` | `Current Bid` | 有 Current |
| `106` | `YYZ-737-IFD` | `Default Bid` | 来源中没有 Current，使用 Default 兜底 |

## 重点断言

1. 每个员工登录后，自动清空本次涉及的 Existing bids 页面，保证重复运行不会叠加旧草稿。
2. 成功录入的每个 UI property 必须出现在 Existing 区域。
3. 成功录入的每个 UI property 必须激活目标 tier，例如 T4 条件只应显示 T4 active。
4. 机场和 Pairing Number 类条件必须校验摘要包含来源值；当前 RP 没有候选项时记录 `value-not-available`。
5. `Limit 3`、`Counting Deadhead Legs` 这种 Portal 手动弹窗未完整表达的语义记录为 `partial-import`，不能当作完整成功。
6. Employee `96` 第 8 条及之后真实条件记录为 `ignored: exceeds T1-T7 capacity`。

## 条件预期

### Employee 19 / Current Bid

| Tier | 预期录入 |
|---|---|
| `T1` | Days Off / `Prefer Off` / Jun 3, 5, 6, 7, 8, 9, 11, 13, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 31 |
| `T2` | Pairing / `Any Landing In Airport` / Avoid / FLL, KIN, MBJ, MCO, MEX, PUJ, PVR, YEG, YHZ, YKF, YVR, YWG, YXX, YYC |
| `T3` | Pairing 组合：`Departing On` Jun 2, 4 + `Pairing Number` T4506 |
| `T4` | Pairing 组合：`Departing On` Jun 16, 20, 23, 27, 30 + `Pairing Number` T4545 |
| `T5` | Pairing 组合：`Departing On` Jun 12 + `Pairing Number` T4537 |

### Employee 73 / Current Bid

| Tier | 预期录入 |
|---|---|
| `T1` | Pairing / `Any Landing In Airport` / Avoid / CUN, FLL, KIN, MBJ, MCO, PVR, YEG, YHZ, YKF, YVR, YWG, YXX, YYC |
| `T2` | Pairing / `Pairing Number` / TB5355 |
| `T3` | Pairing 组合：`Departing On` Jun 16, 20, 23, 27, 30 + `Any Landing In Airport` GDL |
| `T4` | Pairing 组合：`Departing On` Jun 2, 6 + `Pairing Number` T4105 |

### Employee 96 / Current Bid

| Tier | 预期录入 |
|---|---|
| `T1` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 9 + `Pairing Number` V4521 |
| `T2` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 10 + `Pairing Number` V4522 |
| `T3` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 12 + `Pairing Number` V4522 |
| `T4` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 14 + `Pairing Number` V4531 |
| `T5` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 15 + `Pairing Number` V4522 |
| `T6` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 17 + `Pairing Number` V4522 |
| `T7` | Pairing 组合：`Any/Every Duty On Date / Day` Jun 19 + `Pairing Number` V4531 |

忽略项：

- `Prefer Off Mar 2, 3, 4, 5, 6, 7, 8, 20, 30, 31`
- `Avoid Pairings If Any Landing In CUN, LAS, LAX, MEX, SFO, YEG, YYC, YYZ`
- `Avoid Pairings If Pairing Check-In Time < 06:15`
- `Avoid Pairings If Any Duty Legs (Counting Deadhead Legs) > 2 legs`

### Employee 113 / Current Bid

| Tier | 预期录入 |
|---|---|
| `T1` | Days Off / `Prefer Off` / Jun 31，实际 date input 会按当前月 clamp 到 Jun 30 |
| `T2` | Pairing / `Pairing Number` / Avoid / V4102, V4106, V4107, V4111, V4115, V4127, V4132, V4134, V4138, V4145, V4148 |
| `T3` | Pairing / `Pairing Number` / Award / V4119 |
| `T4` | Pairing / `Pairing Number` / Award / V4114, V4131, V4137；`Limit 3` 记录为 `partial-import` |
| `T5` | Pairing / `Pairing Number` / Award / V4112, V4122, V4133, V4136, V4141, V4143, V4144, V4147, V4199 |

### Employee 169 / Current Bid

| Tier | 预期录入 |
|---|---|
| `T1` | Days Off / `Prefer Off` / Jun 10, 11, 12, 13, 14, 15 |
| `T2` | Pairing / `Pairing Number` / O4105 |
| `T3` | Pairing / `Pairing Number` / O4109 |
| `T4` | Pairing / `Pairing Number` / O4116 |

### Employee 106 / Default Bid 兜底

| Tier | 预期录入 |
|---|---|
| `T1` | Days Off / `Prefer Off` / Weekends |
| `T2` | Line / `Min Credit Window` |
| `T3` | Pairing / `Any Landing In Airport` / Avoid / FLL, KIN, MBJ, MCO, MEX, YHZ, YWG, YXX；`Counting Deadhead Legs` 记录为 `partial-import` |

## 报告分类说明

| Category | 含义 |
|---|---|
| `placed` | UI property 完整录入成功，且 Existing row/tier 断言通过 |
| `ignored` | 按规则忽略，例如超过 T1-T7 容量 |
| `partial-import` | 只录入了部分语义，例如 Pairing Number 可录但 `Limit 3` 缺少手动 UI 控件 |
| `condition-missing` | Portal 当前没有对应 property 或输入控件 |
| `condition-mismatch` | Portal 表达与来源语义不等价 |
| `value-not-available` | 当前 RP / 当前员工没有该 Pairing Number 或机场候选值 |
| `ui-operation-failed` | 登录、页面加载、点击、保存等操作异常，需要修复测试环境或 UI 流程 |

## 验收标准

- 自动化报告能列出每个员工选择了 `Current Bid` 还是 `Default Bid`。
- Employee `73`、`96` 的 Default Bid 被明确记录为 skipped，不参与录入。
- Employee `96` 只录前 7 条真实条件，后续条件进入 `ignored`。
- 组合条件在 Portal 中表现为同 tier 多行普通 condition。
- `current-bid-batch-replay.json` 能区分完整录入、缺失、不完整、当前月份候选值缺失和忽略项。
