# Pairing Existing Properties Tier Toggle 与 Count 刷新回归测试

## 目标

验证 Pairing 页面 existing condition 的 tier 多选语义、顶部当前 Tx summary 自动刷新，以及行级 `COUNT` 稳定显示。

## 前置条件

- PBS Portal、PBS Server 可正常运行。
- 使用测试账号登录，例如 `PBS_TIER_TEST_USER` 或 `PBS_TEST_USER`，密码默认 `rois`。
- 测试会清空该账号当前 Pairing existing properties，因此只应用于测试环境。

## 自动化覆盖

Playwright 用例：

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/pairing-tier-counts.spec.ts
```

覆盖点：

- 左侧日历选择 `T4` 后，顶部 `EXISTING PAIRING PROPERTIES` 下方 current Tx 显示 `T4`。
- 新增 `T4` condition 后，顶部 summary 自动刷新。
- 只有一个 active tier 时，点击该 tier 不能取消。
- 点击 `T5` 后，同一 condition 同时作用于 `T4 + T5`。
- 再点击 `T4` 后，该 condition 只作用于 `T5`，当前 `T4` summary 自动刷新。
- 行级 `COUNT` 在新增、非当前 tier 切换、当前 tier 移除刷新期间始终不消失，数值保持 condition 自身 count。

## 人工测试步骤

1. 登录 PBS Portal，进入 `Pairing` 页面。
2. 清空当前 Pairing existing properties，或使用干净测试账号。
3. 在左侧 `BIDDING CALENDAR` 点击 `TIER-04`。
4. 在右侧新增一条 Pairing condition，并只选择 `T4`。
5. 确认顶部 summary 当前 Tx 显示 `T4`，rules / pairings 数量自动刷新。
6. 记录该 condition 右侧 `COUNT`，例如 `N pairings`。
7. 点击该 condition 的 `T4` tier。
8. 预期：`T4` 仍保持选中，因为至少需要保留一个 tier；顶部 summary 不变；右侧 `COUNT` 仍为 `N pairings`。
9. 点击该 condition 的 `T5` tier。
10. 预期：`T4` 和 `T5` 同时选中；顶部 summary 不变；右侧 `COUNT` 仍为 `N pairings`。
11. 再点击该 condition 的 `T4` tier。
12. 预期：`T4` 取消，只剩 `T5`；顶部 `T4` summary 自动刷新；刷新中右侧 `COUNT` 不消失；刷新后右侧 `COUNT` 仍为 `N pairings`。

## 回归范围

- Pairing existing property tier toggle。
- Pairing pool-count toolbar。
- Pairing row-level count display。
- Add / patch current pairing draft property 的保存后刷新行为。
