# Search Pairings 条件卡片化展示测试用例

## 目的

验证 `Search Pairings` 页面中普通 `SEARCH CRITERIA` 区域已从表格展示改为只读条件卡片，并且原有 edit / remove / favorite / tier 行为不回归。

## 前置条件

- PBS Portal 可正常访问。
- 测试用户可登录并进入 `Pairing` 页面。
- 当前 bid period 有 Pairing 数据。
- 用户至少有一个可用于预览的 Pairing property，例如：
  - `Any Landing In Airport`
  - `Pairing Number`

## 测试步骤

### 场景 1：普通 property 条件展示

1. 登录 PBS Portal。
2. 进入 `Pairing` 页面。
3. 在 `ADD PAIRING PROPERTIES` 中选择一个普通 property，例如 `Any Landing In Airport`。
4. 配置 bid 值，例如 `Award · Any · EWR`。
5. 点击该 property 的 preview / search 入口进入 `Search Pairings`。

## 预期结果

- 页面标题显示 `Search Pairings`。
- `SEARCH CRITERIA` 区域展示为只读卡片。
- 不再显示表格表头 `PROPERTY / BID / ACTIONS`。
- 卡片标题显示 property 名称。
- bid 内容完整可读，例如 `Award · Any · EWR`。
- edit 图标位于卡片右上角。
- 点击 edit 后仍打开原有配置弹窗。
- 搜索结果区域正常展示或显示合理空态。

## 场景 2：Pairing Number 长条件展示

1. 回到 `Pairing` 页面。
2. 使用 `Pairing Number` property 选择多个 pairing/date。
3. 点击 preview / search 入口进入 `Search Pairings`。

## 预期结果

- `SEARCH CRITERIA` 中显示 `Pairing Number` 条件卡片。
- bid 摘要显示 selected count，例如 `Award · Pairing Number · 8 selected`。
- pairing/date 按分组摘要展示，不显示长串 `E4101 on 2026-06-05; E4103 on ...`。
- 折叠态显示 `+N more` / `+N more pairings`。
- 点击 `Show all N selected` 后可展开完整列表。
- 点击 `Show less` 后可恢复折叠态。

## 场景 3：带 tiers 的条件

1. 从可添加条件入口进入 `Search Pairings`。
2. 添加一个支持 tiers 的 property。
3. 切换 T1-T7。

## 预期结果

- tier buttons 显示在条件卡片内，不再依赖 `TIERS` 表头。
- active tier 状态正确。
- 切换 tier 后搜索条件仍可更新或保存。
- action icons 不被 tier buttons 或 bid 摘要挤出卡片。

## 回归范围

- Pairing 主页面 `EXISTING PAIRING PROPERTIES` 展示。
- Pairing `VIEW RULES` 展示。
- `Search Pairings` current-rules preview。
- `Search Pairings` result cards。
- Pairing Number 配置弹窗。

