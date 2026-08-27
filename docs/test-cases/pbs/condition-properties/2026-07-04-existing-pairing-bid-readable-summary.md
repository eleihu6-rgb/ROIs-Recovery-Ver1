# PBS Existing Pairing BID 用户可读摘要测试用例

## 测试目标

验证 Pairing 页面 `EXISTING PAIRING PROPERTIES` 中的长 `Pairing Number` BID 不再显示为一大段原始文本，而是按 pairing number 和日期分组展示，用户可以默认扫读重点，也可以展开查看完整内容。

## 前置条件

- 登录 PBS Portal。
- 当前周期处于可查看 bid 的状态。
- 当前用户已有一条 `Pairing Number` existing bid。
- 该 bid 至少包含 4 个 pairing number，其中至少一个 pairing number 有 4 个以上日期。

## 操作步骤与预期结果

### 1. 查看 Pairing 页面 Existing 区

1. 打开 `Pairing` 页面。
2. 找到 `EXISTING PAIRING PROPERTIES`。
3. 查看 `Pairing Number` 这一行的 `BID`。

预期结果：

- `BID` 不显示一整段类似 `Award · E4101 on 2026-06-05; ...` 的原始长文本。
- `BID` 顶部显示摘要，例如 `Award · Pairing Number · 8 selected`。
- 下面按 pairing number 分组展示日期，例如：
  - `E4101  Jun 05`
  - `E4103  Jun 05, Jun 08, Jun 10, +2 more`
- 默认只展示前几组，超出的 pairing 显示 `+N more pairings`。
- `TIERS`、`COUNT`、`ACTIONS` 仍然在同一行右侧可见，没有被长文本挤乱。

### 2. 展开完整 BID

1. 点击 `Show all N selected`。

预期结果：

- 当前这一行展开完整分组列表。
- 原本隐藏的 pairing number 和日期可见。
- 展开后按钮变为 `Show less`。
- 展开只影响当前 bid 行，不改变保存状态，不触发重新保存。

### 3. 收起完整 BID

1. 点击 `Show less`。

预期结果：

- 当前 bid 行恢复默认摘要状态。
- 超出内容重新折叠。
- 编辑、预览、删除按钮仍然可点击。

### 4. 短 BID 不受影响

1. 查看 `Pairing Total Credit` 等短 BID。

预期结果：

- 短 BID 仍然以简洁文本展示，例如 `Award · 08:00`。
- 不出现 `Show all`。
- 不出现多余的分组布局。

## 回归范围

- Pairing Existing `BID` 展示。
- Pairing Existing `TIERS` 切换。
- Pairing Existing edit / preview / delete actions。
- `FAVORITED PROPERTIES` / `ALL PROPERTIES` 列表不受影响。

## 自动化覆盖

- Vitest：`pbs-portal/src/features/pairing/pairing-existing-bid-summary.test.ts`
- Vitest：`pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- Playwright：`e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
