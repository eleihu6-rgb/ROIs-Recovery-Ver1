# PBS Portal Crew 19 手工条件添加回归测试

## 目标

验证使用 `CLASS-BidsReport_June2026.txt` 中 Employee `19` 的 `Current Bid`，通过 Portal 手工录入条件时，保存结果与用户手动操作语义一致；同时覆盖本次 Pairing Number occurrence 修复：

- 右侧 `Configure Pairing Bid / Pairing Number / Specific Date` 能加载该 pairing number 在当前 bid period 的运行日期。
- 左侧 `BIDDING CALENDAR` 上方 tier heatmap 能显示同一批已保存 Pairing Number bid 的蓝色 pairing 色块。
- UI 展示使用 `T4520` 这类 pairing number，保存和查询使用内部稳定 `pairing_id`。

## 来源数据

文件：`CLASS-BidsReport_June2026.txt`

员工：`19`

使用 context：`Current Bid`，因为同一员工同时存在 `Default Bid` 和 `Current Bid` 时，Current 优先。

来源条件：

```text
2. Prefer Off Jun 1, 2026, Jun 3, 2026, Jun 5, 2026, Jun 7, 2026, Jun 8, 2026,
   Jun 10, 2026, Jun 12, 2026, Jun 14, 2026, Jun 15, 2026, Jun 17, 2026,
   Jun 19, 2026, Jun 20, 2026, Jun 21, 2026, Jun 22, 2026, Jun 23, 2026,
   Jun 24, 2026, Jun 25, 2026, Jun 26, 2026
3. Avoid Pairings If Any Landing In CUN, FLL, KIN, MEX, YHZ, YKF, YQB, YQM,
   YQT, YSJ, YVR, YWG, YXX, YYC, YYG, YYJ, YYT
4. Award Pairings If Departing On Jun 2, 2026, Jun 6, 2026, Jun 11, 2026,
   Jun 13, 2026, Jun 16, 2026, Jun 18, 2026 If Pairing Number T4520
5. Award Pairings If Departing On Jun 4, 2026 If Pairing Number T4528
6. Award Pairings If Departing On Jun 9, 2026 If Pairing Number T4542
```

## 前置条件

- Portal period 选择 `Jun 2026`。
- 登录或切换到 crew `19`，Category 为 `YYZ-737-IFD`。
- 测试前允许清空 crew `19` 当前草稿中的 Days Off / Pairing 条件。
- 当前 live pairing 数据中能在左侧日历或 pairing search 中看到 `T4520`、`T4528`、`T4542` 的目标运行日；如果某个 pairing number 或运行日不存在，应记录为数据缺失，不应误判为 UI 保存失败。

## Playwright 操作话术

1. 打开 PBS Portal，进入 crew `19` 的 `Days Off` 页面。
2. 清空 Existing Days Off 条件。
3. 新增 `Prefer Off`，选择 `T1`，添加来源中的 18 个 June 日期，保存。
4. 进入 `Pairing` 页面，清空 Existing Pairing 条件。
5. 新增 `Any Landing In Airport`，选择 `T2`，Mode 选择 `Avoid`，录入来源机场，保存。
6. 新增 UI 中的 `Departure Date / Day`（来源文本为 `Departing On`），选择 `T3`，Mode 选择 `Award`，录入 `Jun 2, 6, 11, 13, 16, 18`，保存。
7. 新增 `Pairing Number`，选择 `T3`，Mode 选择 `Award`，搜索 `T4520`，并按目标运行日选择对应的下拉 option。
8. 切换到 `Specific Date`，确认 `RUN DATE` 中能加载 `T4520` 的当前 period 运行日；选择与来源对应的 `Jun 2, 6, 11, 13, 16, 18` 可用运行日，保存。
9. 对 `T4` 重复组合录入：`Departing On Jun 4` + `Pairing Number T4528 / Specific Date Jun 4`。
10. 对 `T5` 重复组合录入：`Departing On Jun 9` + `Pairing Number T4542 / Specific Date Jun 9`。
11. 刷新页面，重新打开 T3/T4/T5 的 `Pairing Number` 编辑弹窗。
12. 查看左侧 `BIDDING CALENDAR` 上方的 `TIER-03/04/05` heatmap。

## 预期结果

- Days Off Existing 中存在 `Prefer Off`，激活 `T1`，编辑弹窗能回显 18 个日期。
- Pairing Existing 中存在 `Any Landing In Airport`，激活 `T2`，Mode 为 `Avoid`，摘要包含录入机场。
- Pairing Existing 中 T3/T4/T5 分别有同 tier 的 `Departing On` 和 `Pairing Number` 两类条件；这代表来源文本里的 `If Departing On ... If Pairing Number ...` 组合语义。
- `Pairing Number` 的 BID 区显示 `T4520`、`T4528`、`T4542`，不显示内部 numeric `pairing_id`。
- `Specific Date` 的 `RUN DATE` 不应显示 `No pairing runs found in this bid period`，除非当前 live pairing 数据确实没有对应运行日。
- `CONFIRMED RUNS` 显示 pairing number + date，例如 `T4520 2026-06-02`。
- 刷新后重新编辑，tiers、mode、pairing number、confirmed runs 均不丢失。
- 左侧 `BIDDING CALENDAR` 上方 tier heatmap 对已保存的 specific-date Pairing Number bid 显示蓝色 pairing 色块；大日历月视图仍主要显示 Days Off 的 `Off` 文本。
- 右侧弹窗能加载的 Pairing Number 运行日，与左侧日历可见的同一 pairing occurrence 保持一致。

## 失败分类

| 类型 | 判定 |
|---|---|
| `condition-missing` | Portal 没有对应 property 或控件。 |
| `value-not-available` | 当前 `Jun 2026` / crew base / rank 下没有对应机场、pairing number 或运行日。 |
| `occurrence-lookup-mismatch` | 左侧日历能看到 pairing occurrence，但右侧 Pairing Number Specific Date 加载不到同一运行日。 |
| `calendar-event-missing` | 右侧 confirmed runs 保存成功，但左侧日历没有蓝色 pairing 色块。 |
| `persistence-mismatch` | 保存后刷新或重新打开弹窗，tiers、mode、pairing number 或 confirmed runs 丢失。 |

## 自动化覆盖

Playwright E2E：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/npbs-crew-19-specific-date-pairing.spec.ts --workers=1 --reporter=list
```

对应文件：

- `e2e/tests/pbs-portal/npbs-crew-19-specific-date-pairing.spec.ts`

本次代码回归测试覆盖点：

- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts` 断言 occurrence 查询使用 `p.id = any($1::bigint[])`，不再用展示 label 查询。
- `pbs-server/src/services/calendar/bidding-calendar-service.test.ts` 断言左侧日历加载 Pairing Number 事件时同样使用稳定 `pairing_id`。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx` 覆盖 Pairing 页面弹窗和 Existing 基础交互回归。
