# PBS Search Pairings Search Criteria 摘要展示回归

## 目标

验证 `Search Pairings` 页面顶部 `SEARCH CRITERIA` 不再以 input-like 单行控件展示搜索条件，而是以用户可读的摘要卡片展示，尤其是 `Pairing Number` 多值条件。

## 前置条件

- PBS Portal 可正常登录。
- 当前 period 处于可编辑状态。
- Pairing 页面存在可进入 Search Pairings 的条件，或可通过 `ALL PAIRINGS` 添加一条 pairing 作为 criteria。

## 操作步骤

1. 进入 PBS Portal 的 `Pairing` 页面。
2. 点击 `SEARCH PAIRINGS`，或点击 `ALL PAIRINGS` 后添加一条 pairing 到任意 tier。
3. 在 `Search Pairings` 页面查看 `SEARCH CRITERIA`。
4. 检查 `PROPERTY`、`BID`、`ACTIONS` 表头是否完整显示。
5. 检查 `BID` 是否为只读摘要卡片，而不是单行 input。
6. 如果 criteria 是 `Pairing Number` 且有多条 pairing / 日期，点击 `Show all ... selected`。
7. 点击 `Edit search criteria ...` 图标。

## 预期结果

- `PROPERTY` 不显示为可输入框。
- `BID` 不显示为单行被截断的 readonly input。
- `Pairing Number` 显示类似 `Award · Pairing Number · N selected`。
- `Pairing Number` 摘要按 pairing number 分组展示日期，折叠态显示 `+ more`。
- 点击 `Show all ... selected` 后能看到隐藏日期或隐藏 pairing。
- `ACTIONS` 独立在右侧，edit / remove / favorite / add 图标不会夹在 property 和 bid 中间。
- 点击 edit 后仍打开原有配置弹窗，搜索结果和分页不受影响。

## 边界场景

- 单条普通 criteria，例如 `Any Landing In Airport`，应显示 `Award · Any · EWR` 这类完整摘要。
- 单条 `Pairing Number` 也应显示 `Award · Pairing Number · 1 selected`，而不是老的 `Award · <pairing>` 单行控件。
- 多条 criteria 连续显示时，`ACTIONS` 列保持对齐。
- 没有 criteria 时，仍显示原有空状态文案。

## 回归范围

- Pairing Search Criteria 展示。
- Pairing Search Criteria edit/remove/favorite/add 动作。
- Search Pairings 结果列表和分页。
- Pairing existing properties 的 bid summary 复用展示。
