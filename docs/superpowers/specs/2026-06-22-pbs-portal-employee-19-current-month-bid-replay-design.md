# PBS Portal Employee 19 当前月份 Bid 回放测试设计

> 日期：2026-06-22  
> 状态：用户已确认，已进入实现 / 验证  
> 范围：PBS Portal E2E / Playwright / Employee `19` 专项 bid 回放

## 1. 目标

基于 `docs/test-cases/CLASS-BidsReport_March2026.txt` 中 Employee `19` 的 NPBS-Legend bid 记录，新增一个 PBS Portal Playwright 回归测试：

- 使用真实 portal UI 登录 Employee `19`。
- 允许清空该员工在相关 bid 页面上的现有数据。
- 将来源记录中的 5 个有效 bid 条件录入到当前月份，即当前运行口径下的 **June 2026** roster period。
- `T1` 到 `T5` 按原始偏好顺序映射；其中 T5 的 legacy 复合文本通过两条普通 `T5` UI bid row 表达。
- 对每个条件执行 UI 回放；能完整表达的条件断言 Existing 区域出现对应 property 且目标 tier active，不能完整表达或当前月份取值不可用的条件必须写入报告并分类。

这次工作重点是补强 `pbs-portal` 的 Playwright 覆盖，不改产品代码，不改业务规则。

## 2. 来源数据与时间口径

来源片段：

- 文件：`docs/test-cases/CLASS-BidsReport_March2026.txt`
- 记录：`Employee # 19`
- 分类：`YYZ-737-IFD`
- 来源 period：`March 2026`
- confirmation 时间：`2026-02-12T13:41:53 UTC`

时间解释：

- `2026-02-12T13:41:53 UTC` 只是 legacy 系统里的提交/确认时间，用作来源证据，不作为 portal 录入月份。
- `Period: March 2026` 也是 legacy export 的来源 period，本次不按 March 录入。
- 当前项目运行口径是 **June 2026**，因此测试应在 portal 当前 RP / 当前月份上下文中录入。若页面使用当前 bidding calendar 自动决定 RP，测试只依赖当前 portal 环境；若后续需要显式设置 RP，应单独设计，不混入本用例。

## 3. 录入条件与 Tier 映射

`Pairing Bid Group`、`Award Pairings`、`Reserve Bid Group` 都是 NPBS 分组/流程文本，不算真实 bid 条件。

本次只录入 5 个真实条件：

| Tier | NPBS 原始条件 | Portal 页面 | Portal property | Action / Bid |
|---|---|---|---|---|
| `T1` | `Set Condition Maximum Credit Window` | `line` | `401 Max Credit Window` | `award` / flag |
| `T2` | `Prefer Off Friday, Saturday, Sunday` | `days-off` | `201 Prefer Off` | `award` / days of week: Friday, Saturday, Sunday |
| `T3` | `Avoid Pairings If Pairing Check-In Time > 15:00` | `pairing` | `103 Pairing Check-In Time` | `avoid` / `> 15:00` |
| `T4` | `Avoid Pairings If Any Landing In AZA, CUN, FLL, JFK, LAS, PSP, SFB, YHZ, YQG, YQT, YUL, YWG, YXE, YYC, YYG` | `pairing` | `101 Any Landing In Airport` | `avoid` / airport multi-select |
| `T5` | `Award Pairings If Departing On Monday, Wednesday If Any Landing In YVR` | `pairing` | `106 Departing On` | `award` / Monday, Wednesday |
| `T5` | 同上，第二个同 tier 条件 | `pairing` | `101 Any Landing In Airport` | `award` / `YVR` |

### T5 同 Tier 多条件处理

用户澄清后，本次不把 T5 做成代码层面的 nested `conditions[]`，也不新增 `AND CONDITIONS` 子配置区。

正确做法是使用现有 UI 能力录入两条独立 bid row，并把两条都放在 `T5`：

- `Departing On`：`Award · Mon, Wed`
- `Any Landing In Airport`：`Award · Any · YVR`

来源条件数量仍为 5 条；由于 T5 拆成两条普通 UI bid，测试实际 replay property 数量为 6 条。

## 4. 推荐实现方案

新增一个专项 E2E 文件：

`e2e/tests/pbs-portal/npbs-employee-19-current-month-bid.spec.ts`

复用已有测试资产：

- `e2e/pages/pbs-portal/pbs-login-page.ts`
- `e2e/pages/pbs-portal/bid-workbench-page.ts`
- 现有 `BidWorkbenchPage.goto()`、`clearExisting()`、`placeProperty()`、`assertExisting()` 流程

测试不新增产品依赖，不新增 npm 包。

## 5. 测试流程

1. 使用 `PbsLoginPage` 打开 `/login`。
2. 使用 Employee `19` 和密码 `rois` 登录。
3. 等待跳转到 `/dashboard`。
4. 依次进入以下页面并清空 Existing bids：
   - `line`
   - `days-off`
   - `pairing`
5. 按 T1-T5 录入 5 个 properties。
6. 每个页面录入后，在同一页面断言对应 property 已出现在 Existing 区域。
7. 断言每个 property 所在 row 的目标 tier button 为 `data-active="true"`。
8. 如果登录、页面加载、控件选择或 `ADD BID` 失败，保留现有 page object 的 blocker 记录方式：失败截图写入 `image/pbs/`，错误原因写入测试输出或 issues 文件。
9. 操作过程中只要发现条件无法清晰映射、页面条件与 NPBS 原条件语义明显不一致、或系统缺少对应 bid 条件，必须记录失败原因；不能用相近但语义不同的条件替代，也不能让测试静默通过。

## 6. 数据影响

用户已确认允许清空，因此测试会修改本地/测试环境中的 Employee `19` portal bid 数据。

影响范围：

- Employee：`19`
- 目标月份：当前 portal RP，当前口径为 `June 2026`
- 页面：`line`、`days-off`、`pairing`
- 操作：先删除 Existing bids，再添加本测试定义的 T1-T5 bids

不影响范围：

- 不修改生产代码
- 不修改数据库 schema
- 不修改 seed 数据
- 不修改现有 24 人 `npbs-bids-jun2026.json` 批量 fixture
- 不改变现有 `Current Bid beats Default Bid` 的 generator 规则

## 7. 验收标准

实现完成后应满足：

- 新增 PBS Portal Playwright 测试文件，并使用 `PBS-33xx` 后续未占用编号或清晰命名。
- Employee `19` 能通过 UI 登录。
- 测试运行前会清空 `line`、`days-off`、`pairing` 的 Existing bids。
- 5 个来源条件都必须通过 UI 回放流程处理，结果只能是“完整录入成功”或“明确分类记录缺口”；T5 来源条件会拆成 2 个 UI property。
- 完整录入成功的条件都要断言 property row 存在且对应 tier active：
  - `T1 Max Credit Window`
  - `T2 Prefer Off`
  - `T3 Pairing Check-In Time`
  - `T4 Any Landing In Airport`
  - `T5 Departing On`
  - `T5 Any Landing In Airport`
- 对每个无法完成的条件，都必须有明确失败分类和说明：
  - `condition-unclear`：NPBS 文本无法可靠理解或参数不完整。
  - `condition-mismatch`：portal 可选条件与 NPBS 原条件语义不一致，不能等价表达。
  - `condition-missing`：portal 当前没有对应 property / 控件 / 输入能力。
  - `value-not-available`：property 存在，但当前 June 2026 可选值集合中没有对应值，例如某些机场不在 airport options 中。
  - `ui-operation-failed`：语义可映射，但 Playwright 操作 UI 失败。
- 测试失败策略：
  - `condition-unclear`、`condition-mismatch`、`condition-missing`、`ui-operation-failed` 属于阻断类问题，测试应失败。
  - `value-not-available` 属于当前月份取值集合缺口；当 property/tier 已经通过 UI 添加，只是现有 bid 摘要缺少某些 legacy 值时，测试可通过，但必须写入 `e2e/results/npbs-issues/19-current-month.json` 并保留截图证据。
- Playwright 命令至少运行该单测并给出结果：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal \
  --no-deps tests/pbs-portal/npbs-employee-19-current-month-bid.spec.ts \
  --workers=1 --reporter=list
```

## 8. 风险与处理

- **Employee 19 登录失败**：记录为测试环境/账号 blocker，不改产品代码绕过。
- **机场不在当前 June 2026 可选集合**：airport multi-select 可能无法选中所有 legacy airport。测试按页面真实能力记录为 `value-not-available`，不使用语义不同的机场或条件替代。
- **Line flag 控件行为差异**：`Max Credit Window` 是 line 页 flag 型 property，若 page object 无法驱动，应优先扩展 E2E page object，而不是改产品 UI。
- **同名 property 断言误命中**：T4 和 T5 都会出现 `Any Landing In Airport`，断言必须定位“同名且目标 tier active”的 row，不能只取第一行。
- **条件语义不一致**：如果实现或操作过程中发现某个 portal property 只是名称相近、但和 NPBS 原条件不等价，应按 `condition-mismatch` 记录，不录入该条件。
- **系统条件缺失**：如果 portal 没有对应 property、控件或输入方式，应按 `condition-missing` 记录，并作为后续产品/映射缺口，而不是修改产品代码临时补条件。
- **测试数据破坏性**：由于清空 Employee `19` 的 Existing bids，本测试不应并行运行；使用 `--workers=1`。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 范围集中在一个员工、一个专项 Playwright spec 和少量 page object 复用；拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 后续实现只写 `e2e/tests/pbs-portal/`，必要时小幅扩展 `e2e/pages/pbs-portal/bid-workbench-page.ts`。
- Conflict risk: 低；主要风险是 Playwright 改测试环境数据。
- Execution gate: 用户已通过“开始做”确认进入实现。

## 10. 待确认事项

已按用户确认实现：

1. T5 录入两条普通同 tier bid：`Departing On Monday, Wednesday` 与 `Any Landing In YVR`。
2. T4 若出现当前 June 2026 airport options / bid 摘要无法完整表达 legacy 机场集合，则记录为 `value-not-available`，不静默替换条件。
