# OR Seniority Pairing Score Portal 回放测试用例

## 目标

复现 Jen 给出的 OR seniority 测试输入准备步骤：只在 PBS Portal 录入 crew bids，不执行 Gantt scenario / optimizer。

来源文件为：

```text
/Users/lei/Downloads/_seniority_award_pairing_p1_p6/PAIRING_SCORE.csv
```

该文件中共有 5 个 crew、113 行 pairing score，来源场景期次为 `Jun 2026`。Portal 录入时按用户手工操作语义聚合：同一个 crew、同一个 tier 的多个 pairing occurrence，录入为一条 `Pairing Number` bid。

注意：CSV 的 `Interface_ID` 是算法 / ro_input 侧标识，Portal 手工搜索使用的是当前 live pairing 的 `pairing_label`。因为多个 `Interface_ID` 可能共享同一个 `pairing_label`，自动化会先把 `Interface_ID` 映射成 `pairing_label + origin date`，再使用 Pairing Number 的 `Specific Date` 模式精确选择 run。

## 录入对象

| Crew | 来源行数 | Portal 可录入 runs | 已知 blocker | Portal 条件 |
|---|---:|---:|---:|---|
| 247 | 27 | 25 | 2 | T1 `Pairing Number` |
| 274 | 28 | 24 | 4 | T1 `Pairing Number`；T2 `Pairing Number` |
| 383 | 30 | 30 | 0 | T1 `Pairing Number`；T2 `Pairing Number` |
| 499 | 16 | 13 | 3 | T1 `Pairing Number`；T2 `Pairing Number` |
| 536 | 12 | 9 | 3 | T1 `Pairing Number` |

总计应在 Portal 中创建 8 条 `EXISTING PAIRING PROPERTIES`。113 条来源 pairing score 中，101 条可通过 Portal `Jun 2026` 搜索选择；12 条在 live DB 中的 local origin date 是 `2026-05-24` 到 `2026-05-31`，不属于 `Jun 2026` 的 Pairing Number period filter，自动化记录为 `blockedRuns`，不强行写入。

## 前置条件

- `pbs-server` 可访问，例如 `http://localhost:3002/api/health` 返回 200。
- `pbs-portal` 可访问；当前本机 Vite base 为 `http://localhost:3030/pbs`。
- Portal 当前 bid period 必须解析为 `Jun 2026`；自动化会在清空旧条件前检查左侧日历标题为 `JUN 2026`，不满足时直接失败，避免误删其他期次数据。
- 允许清空 crew `247,274,383,499,536` 当前草稿中的 Days Off 条件和 Pairing 条件。
- Pairing Number 必须通过 UI autocomplete 选择真实 option，不能手动强填文本。

## Playwright 自动化

Fixture：

```text
e2e/fixtures/pbs/or-seniority-pairing-score-p1-p6.json
```

Spec：

```text
e2e/tests/pbs-portal/or-seniority-pairing-score-replay.spec.ts
```

运行命令：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
PBS_PORTAL_BASE_URL=http://localhost:3030/pbs \
npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/or-seniority-pairing-score-replay.spec.ts --workers=1 --reporter=list
```

## 操作步骤

1. 对每个 crew 串行登录 PBS Portal，密码使用测试环境共享密码。
2. 进入 `Days Off` 页面并清空当前 `EXISTING DAYS OFF PROPERTIES`。
3. 进入 `Pairing` 页面并清空当前 `EXISTING PAIRING PROPERTIES`。
4. 按 fixture 中的 tier 添加 `Pairing Number`。
5. 每个 pairing run 都必须从 autocomplete 下拉选项点击真实 `pairing_label`，再切到 `Specific Date` 选择对应 run date。
6. 保存后验证 existing row 的目标 tier 为 active。
7. 验证 existing bid 文本包含该 tier 下应录入的所有 `pairing_label` 和 run date。
8. 写入每个 crew 的执行结果 JSON。
9. 来源数据本身不能在 Portal 当前 period 中选择时，结果 JSON 记录在 `blockedRuns`，不计为自动化执行失败。

说明：Specific-date `Pairing Number` 与同 tier/date 的 Days Off 条件存在真实业务冲突，后端会返回 `409 Cannot add pairing because ... selected tier/date entries have days off.`。因此本回放测试先清 Days Off，再录入 Pairing，才能复现“这些 crew 只用 pairing bid 竞争同一批 pairing”的 OR seniority 输入准备。

## 预期结果

- 5 个 crew 均能登录。
- 5 个 crew 的 Pairing 页面旧条件被清空后，成功写入 8 条聚合后的 `Pairing Number` 条件。
- 每条条件的 tier 与 fixture 一致。
- 每条条件的 bid 内容包含来源 CSV 对应、且 Portal 当前 period 可选择的全部 `pairing_label + origin date`。
- `blockedRuns` 中列出的 12 条不会被写入 Portal；原因是来源数据与 Portal 当前 `Jun 2026` period filter 不一致。
- 失败时结果 JSON 记录 crew、tier、失败值、原因和截图路径。
- 本次验证结果：2026-06-30 使用真实 PBS Portal UI 跑 `PBS-3510`，5 个 crew 全部通过，命令总耗时约 7.6 分钟。

## 失败分类

| 类型 | 判定 |
|---|---|
| `login failed` | crew 账号无法登录 Portal。 |
| `property-not-found-in-workspace` | Portal 页面找不到 `Pairing Number` 属性入口。 |
| `wrong-period` / period heading mismatch | 当前 Portal 期次不是 `Jun 2026`，测试会在清空旧条件前停止。 |
| `add-bid-disabled` | pairing label / run date 没有被 autocomplete 或 Specific Date 接受，通常表示当前 crew base / period 下没有该 run。 |
| `verification-failed` | 保存后 existing row 中没有完整回显所有来源 `pairing_label + origin date`，可能是部分 pairing run 未选中或 UI 持久化不完整。 |

## 结果文件

```text
e2e/results/or-seniority-portal-replay/<crew>.json
```

该结果文件用于给后续 Gantt scenario / optimizer 阶段判断：Portal 是否已经准备好 seniority award 输入。
