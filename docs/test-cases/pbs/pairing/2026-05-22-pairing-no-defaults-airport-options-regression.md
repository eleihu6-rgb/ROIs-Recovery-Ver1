# PBS Pairing 新增无默认值与机场候选回归测试用例

## 背景

本轮修改 Pairing 新增条件弹窗和机场/城市候选来源：

- 从 `ALL PROPERTIES` 点击加号新增 Configure Pairing Bid 时，不应预填示例 Pairing Number、机场、城市、日期、时间、文本或百分比。
- 已存在的 bid、已配置收藏、从收藏直接添加时，仍应回填并保存用户之前配置好的值。
- 机场/城市候选从 PBS 后端 `GET /api/pairing-bids/reference-options` 获取，后端只读 live schema 的 `airport` 表。

## 前置条件

- PBS Portal 能正常进入 Pairing 页面。
- 当前账号有可用 `Current` Pairing draft。
- 当前航司 live schema 存在 `airport` 表，例如 `f8.airport`。
- 浏览器 Network 面板可查看接口耗时。

## 自动化覆盖

- 后端单元/路由：
  - `pbs-server/src/services/pairing/pairing-reference-options.test.ts`
  - `pbs-server/src/routes/pairing-bids.test.ts`
- 前端单元/页面：
  - `pbs-portal/src/features/pairing/pairing-reference-autocomplete.test.ts`
  - `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`

## 手工回归用例

### 1. 新增 Pairing Number 不带默认值

1. 进入 Pairing 页面。
2. 在 `ALL PROPERTIES` 找到 `Pairing Number`，点击加号。
3. 查看 `Configure Pairing Bid` 弹窗。

预期：

- `BID` 输入为空，不显示 `M4959` 或其他示例值。
- `ADD BID` 与 `SAVE FAVORITE` 初始不可用。
- 输入并选择 Pairing Number 后，按钮可用。

### 2. 新增机场/城市类条件不带默认值

1. 在 `ALL PROPERTIES` 打开 `Any Landing In Airport`、`Layover at City` 或 `Prefer Landing at City`。
2. 查看弹窗里的 `BID` 输入。

预期：

- 输入框为空，不预填 `DFW`、`LAX`、`SAN` 等示例值。
- 未输入前 `ADD BID` 与 `SAVE FAVORITE` 不可用。
- 输入机场或城市关键字后，下拉候选来自真实接口返回。

### 3. 机场/城市候选接口性能

1. 打开任意机场/城市条件弹窗。
2. 在 Network 面板查看 `GET /api/pairing-bids/reference-options`。

预期：

- 响应格式为 `{ code, data, message }`。
- `data.airports` 和 `data.cities` 有真实候选数据。
- 正常情况下接口耗时 `< 2s`；缓存命中时应明显更快。

### 4. 已有 bid 编辑保持回填

1. 在 `EXISTING PAIRING PROPERTIES` 点击任意已有条件的编辑按钮。
2. 查看弹窗。

预期：

- 弹窗回填当前 bid 已保存的值、mode、quantifier、tiers。
- 修改后点击 `UPDATE BID`，页面展示和接口 payload 都使用新值。

### 5. 已配置收藏保持回填并可直接添加

1. 切换到 `FAVORITED PROPERTIES`。
2. 查看已收藏条件。
3. 点击收藏条件的加号。

预期：

- 收藏行展示保存过的 bid 值和禁用态 tiers。
- 点击加号后不再弹二次配置弹窗，直接添加到 Existing。
- 添加后的 Existing 条件值与收藏快照一致。

### 6. 左侧日历 Pairing Number 入口不被破坏

1. 从左侧日历选择某一天添加 Pairing Number。
2. 保存为 Award 或 Avoid。
3. 返回 Pairing 页面查看 Existing 和左侧日历展示。

预期：

- 左侧日历仍可添加 pairing。
- Award / Avoid 颜色语义保持现有规则。
- 页面刷新后左侧日历与右侧 Existing 数据一致。

### 7. 错误提示不重复

1. 人为制造保存失败场景，例如断开后端或使用无效 payload。
2. 操作新增或编辑。

预期：

- 页面使用统一 message 提示。
- 不出现额外的红色错误面板重复展示同一错误。
