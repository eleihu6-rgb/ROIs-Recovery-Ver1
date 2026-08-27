# PBS Pairing Property List Helper 清理记录

## 背景

本轮继续只围绕 `pairing` 与 `days-off` 做小步清理。上一轮已经把 Pairing 的 property equality 逻辑从 `PairingRightPanel` 中抽出，本轮继续抽出 Pairing 可用属性列表的过滤与分页纯函数。

## 本轮改动

- 新增 `pbs-portal/src/features/pairing/pairing-property-list.ts`：
  - `buildPairingPaginationItems`
  - `filterPairingAvailableProperties`
  - `doPairingDateRangesOverlap`
  - `normalizePairingSearchText`
- 更新 `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`：
  - 删除本地 `normalizeText`、`dateRangesOverlap`、`buildPaginationItems`。
  - 可用属性过滤改为调用 `filterPairingAvailableProperties`。
  - 分页窗口生成改为调用 `buildPairingPaginationItems`。
- 新增 `pbs-portal/src/features/pairing/pairing-property-list.test.ts`：
  - 覆盖分页窗口生成。
  - 覆盖日期区间 overlap 语义。
  - 覆盖 tab、keyword、pairing number、pairing type、date filter 组合过滤。

## 价值

- `PairingRightPanel` 更专注于状态与渲染，减少列表规则细节。
- 搜索过滤逻辑可单独测试，后续改 Pairing 搜索规则时更安全。
- 过滤函数中复用标准化后的 `pairingNumber`，避免每个 property 重复标准化同一个搜索值。

## 验证

- 定向测试通过：
  - `pnpm vitest run src/features/pairing/pairing-property-list.test.ts src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal` build 通过。
- 完整 PBS 回归通过：
  - `npm run verify:pbs`
  - `pbs-server`: 33 tests passed，build passed，`sync:pbs-users -- --dry-run` passed。
  - `pbs-portal`: 34 test files / 152 tests passed，lint passed，build passed。

## 后续建议

- 继续只做小步纯函数外移。
- 下一步可以考虑抽出 `PairingRightPanel` 中的 clone/build helpers，或者抽出 search navigation state 构造 helper。
