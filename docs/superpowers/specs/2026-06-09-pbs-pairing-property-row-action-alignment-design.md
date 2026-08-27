# PBS Pairing Property 行操作与 Tiers 对齐修正设计

## 背景

Pairing 页面 `EXISTING PAIRING PROPERTIES` 表格中，行操作按钮当前分布不一致：

- 删除按钮在 `PROPERTY` 输入框右侧。
- 编辑和预览小眼睛在 `BID` 与 `TIERS` 中间的独立空列。
- `TIERS` 表头和 T1-T7 色块之间存在视觉错位，尤其在不同视口宽度下更明显。

这会让用户觉得按钮“乱七八糟”，也不容易判断这些按钮到底作用于 property、bid，还是 tiers。

## 目标

- Existing property 行的删除、编辑、预览操作统一放在 `PROPERTY` 输入框右侧。
- `BID` 列只显示 bid 内容，不夹杂行操作按钮。
- `TIERS` 表头与每行 T1-T7 色块左边缘对齐。
- `ADD PAIRING PROPERTIES` / favorite 行继续保持行操作按钮紧跟 property 输入框右侧，和 existing 行形成一致规则。
- 保持现有删除、编辑、预览、tier toggle 行为不变。

## 非目标

- 不改变 property / bid / tiers 的业务语义。
- 不改变按钮图标、aria label 或权限逻辑。
- 不改变 Search Pairings preview 的来源同步行为。
- 不重做整个 Pairing 页面视觉风格。

## 方案

### Existing Properties 表格

将 existing property 行从当前 4 列结构：

```text
PROPERTY + delete | BID | edit/preview | TIERS
```

调整为 3 列结构：

```text
PROPERTY + delete/edit/preview | BID | TIERS
```

具体规则：

- `PROPERTY` cell 内部使用 `flex` 横向布局：
  - 左侧是固定宽度 property name display。
  - 右侧是统一 action button group。
- action button group 顺序为：
  - Delete
  - Edit
  - Preview
- `BID` cell 保持 read-only bid control。
- `TIERS` cell 直接放 `TierToggleGroup`，不再依赖中间空列占位。

### Available / Favorite Properties 表格

Available rows 当前已经把 add/delete/preview 放在 property 输入框右侧，本次保持这个方向，只确保 layout 配置和 header 在隐藏 tiers 时不受 existing 表格变更影响。

### Layout 配置

`PairingPropertyTableLayout.gridTemplateColumns` 改为三列：

```text
PROPERTY_COLUMN BID_COLUMN TIER_COLUMN
```

`PairingPropertyTableHeader` 在 `showTiers=true` 时直接渲染：

```text
PROPERTY | BID | TIERS
```

不再渲染 tiers 前的空 `<span />`。

## 测试

- 更新 Pairing 页面测试中对 existing 表格 grid column 的断言。
- 保留并通过现有行为测试：
  - 删除 existing property。
  - 编辑 existing property。
  - 预览 existing property。
  - toggle existing tier。
- 运行 pairing feature 测试和 TypeScript 检查。

## 验收标准

- `EXISTING PAIRING PROPERTIES` 中删除、编辑、小眼睛都在 property 输入框右侧。
- `BID` 和 `TIERS` 中间不再出现零散图标。
- `TIERS` 表头和 T1-T7 色块左边缘对齐。
- Available/favorite property 行操作仍在 property 输入框右侧。
- 现有 pairing 行为回归测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在单个表格组件和右侧 panel layout 配置，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pairing-property-table.tsx`、`pairing-right-panel.tsx`、Pairing 页面相关测试。
- Conflict risk: 低。
- Execution gate: 用户已确认后执行。
