# PBS Portal Pairing 页面设计文档

**日期：** 2026-04-20  
**作者：** Codex + lei  
**状态：** 已确认，待实现  
**优先级：** 页面落地 → 前端交互完整 → 后续数据层替换

---

## 背景

`pbs-portal` 当前已经完成 `dashboard / days-off / reserve / layer / award` 等核心门户页面的 React 重建，并形成了稳定的页面组织方式：

- 页面使用 `ScaledPageCanvas`
- 左侧 `BIDDING CALENDAR` 使用共享日历面板
- 右侧使用各 feature 自己的业务面板
- 数据当前仍以本地 mock 为主

用户本次要求继续开发 `Pairing` 页面，并明确约束如下：

- 参考项目为 `/Users/lei/Codehub/Royce-Flair/`
- **只参考功能和交互编排**
- **UI、布局规则、组件质感、视觉语言以当前 `pbs-portal` 为主**
- 左侧继续使用当前项目已经在多个页面复用的 `BIDDING CALENDAR`
- 右侧参考 `Royce-Flair/pairing.html` 的卡片结构和交互
- 第一版做成完整前端交互版，使用本地 mock，不接真实 API

这意味着本次工作不是把参考页 1:1 复制进来，而是把 `Royce-Flair` 的 pairing 功能编排翻译到当前 `pbs-portal` 的页面体系中。

---

## 目标

1. 为 `pbs-portal` 新增真实可访问的 `/pairing` 页面
2. 继续沿用门户当前的左侧共享日历面板，不新建另一套日历 UI
3. 在右侧实现参考页的 pairing 属性工作台结构
4. 第一版完成完整本地交互：
   - existing pairing properties 可编辑、删除、切 layer
   - available pairing properties 可搜索、筛选、加入、设置 bid、切 layer
   - `Search Pairings` 弹窗可打开、关闭、提交本地过滤
   - `Reset All` 可恢复初始状态
5. 为后续真实接口接入保留稳定的数据结构和组件边界

---

## 非目标

- 本阶段不接真实 `pbs-server` 或其他后端接口
- 本阶段不做跨页状态持久化
- 本阶段不把 `Line` 一起实现
- 本阶段不把属性工作台提前抽象成跨 feature 的万能组件
- 本阶段不改变现有门户整体视觉方向
- 本阶段不把参考项目里的错误文案、错误语义或笔误原样照搬

---

## 参考来源与约束

### 功能参考

以以下参考文件为主：

- `/Users/lei/Codehub/Royce-Flair/pairing.html`
- `/Users/lei/Codehub/Royce-Flair/js/pairing.js`
- `/Users/lei/Codehub/Royce-Flair/css/pairing.css`

重点参考内容：

- 页面右侧两张主卡片的层级
- `Search Pairings` 按钮与弹窗结构
- `All / Favorited` 标签切换
- 不同 `BID` 控件类型
- 本地搜索和筛选行为

### 当前项目实现约束

页面必须遵守 `pbs-portal` 当前约束：

- 左侧日历面板继续使用共享 React 组件
- 页面布局继续使用 `ScaledPageCanvas`
- 顶部导航继续使用当前门户导航组件
- 圆角、阴影、间距、按钮、表单和字体规则继续遵循当前 `pbs-portal`
- 组件优先走 `feature local -> shared -> packages/ui`

---

## 总体方案

选择 **独立 Pairing feature + 共享左侧日历面板 + 本地交互右侧工作台**。

### 为什么不直接复制 `DaysOffRightPanel`

- `DaysOff` 的右侧已经绑定了 days-off 语义
- `Pairing` 的 `BID` 类型更复杂，包含时间、时间范围、日期范围、下拉、百分比等控件
- 如果直接基于 `DaysOff` 改，会让 feature 语义变得混乱

### 为什么不先做通用属性编辑框架

- 当前目标是尽快把 `Pairing` 页面完整交付
- 现有 `days-off / reserve / layer` 右侧面板形态差异仍然较大
- 过早抽象会显著增加本轮复杂度

### 推荐原则

- 左侧共享组件继续复用
- 右侧页面级交互独立实现
- 底层按钮、输入、layer toggle 等共享组件继续复用
- 数据结构为后续接口接入预留空间

---

## 路由与导航

### 新增路由

新增真实页面路由：

- `/pairing`

### 顶部导航变更

更新顶部导航配置：

- `Pairing` 从 `/404` 改为 `/pairing`

以下导航项保持不变：

- `Line` -> `/404`
- `Standing Bid` -> `/404`

### 页面级行为

- 未认证访问 `/pairing` 时，仍按现有 `ProtectedRoute` 逻辑回到登录页
- 进入 `/pairing` 后，顶部导航 `Pairing` 应正确高亮

---

## 页面结构

`PairingPage` 继续采用当前门户已经成熟的双栏结构：

```text
ScaledPageCanvas
└── grid
    ├── 左侧：DashboardSchedulePanel（新的 pairingScheduleData 实例）
    └── 右侧：PairingRightPanel
```

### 左侧

左侧继续复用当前共享日历面板组件，而不是新做一套 pairing 日历：

- `DashboardSchedulePanel`
- `ScheduleLayerMatrix`
- `ScheduleEventCalendar`

这意味着 `Pairing` 使用的是 **共享组件的新实例**，而不是全站共享单例状态。

每个页面都各自创建自己的左侧实例：

- 组件实现相同
- state 独立
- 输入数据可不同

### 右侧

右侧新增独立的 `PairingRightPanel`，内部包含：

1. `EXISTING PAIRING PROPERTIES`
2. `ADD PAIRING PROPERTIES`
3. `Search Pairings` modal
4. 底部操作区 `Cancel / Reset All`

右侧结构参考 `Royce-Flair`，但视觉实现属于当前 `pbs-portal`。

---

## 左侧设计

### 组件复用策略

继续沿用现有模式：

- `Days Off / Reserve / Layer / Award` 都通过共享左侧日历组件渲染页面左侧
- `Pairing` 也采用同样模式

### 数据来源

新增 `pairingScheduleData`，类型沿用现有 `DashboardScheduleData`。

其内容应体现 pairing 页面自身语义，例如：

- 页面标题：`BIDDING CALENDAR - PAIRING`
- 月份标题
- layer 色块分布
- 月历中的 pairing / off / leave 等展示事件

这样后续如果 `Pairing` 接真实接口，只替换输入数据，不需要改左侧组件结构。

---

## 右侧设计

## 1. Existing Pairing Properties

第一张卡片负责展示和维护当前已经加入的 pairing properties。

### 结构

每行包含：

- `Priority`
- `Bid`
- `Layers`

### 行级动作

每条 existing property 支持：

- `Edit`
- `Delete`
- `Toggle Layer`

### 编辑方式

第一版采用 **行内编辑**，不新增额外编辑弹窗。

原因：

- 交互更直接
- 更贴合本地 mock 第一版目标
- 可以快速覆盖参考页的交互丰富度

### Bid 编辑能力

`Bid` 支持多种控件类型，具体见数据结构章节。

### Layer 编辑能力

`LAYERS` 直接复用 `LayerToggleGroup`，但不使用只读模式。

---

## 2. Add Pairing Properties

第二张卡片保持参考页的结构节奏。

### 主体结构

- 标题栏
- `All Properties / Favorited Properties`
- 搜索框
- 属性列表

### 列表交互

每条 available property 支持：

- `Add`
- `Preview / View`
- 编辑 `Bid`
- 切换 `Layers`

### Tab 行为

- `Favorited`：只显示 `favorited = true` 的可选属性
- `All`：显示全部可选属性

### 搜索行为

- 搜索关键字按属性名过滤当前列表
- 搜索作用于当前 tab 的结果集

---

## 3. Search Pairings Modal

保留参考页的弹窗结构，但用 React 状态驱动。

### 字段

- `Pairing Number`
- `Date Range`
- `Pairing Type`

### 行为

- 点击 `SEARCH PAIRINGS` 打开弹窗
- `Cancel` 或关闭按钮关闭弹窗且不提交
- `Search` 将当前表单值应用为本地过滤条件

### 第一版过滤范围

首版搜索结果不直接查询后端，而是本地过滤 available pairing properties。

过滤规则可按以下原则实现：

- `Pairing Number`：匹配 property 的 mock pairing 编号或关键字
- `Pairing Type`：匹配 property 的 type 字段
- `Date Range`：匹配 property 的 mock 生效日期范围

---

## BID 控件设计

为支持参考页中的多种 `BID` 交互，`Pairing` 的 `bid` 不使用简单字符串，而采用判别式类型。

### 支持的控件类型

- `stepper`
- `time`
- `time-range`
- `date-range`
- `select`
- `percent`
- `text`

### 控件表现

- `stepper`：数字上下切换
- `time`：单时间输入
- `time-range`：起止时间
- `date-range`：起止日期
- `select`：固定选项
- `percent`：百分比输入
- `text`：只读或自由文本

### 使用范围

- existing properties 可以使用这些控件
- available properties 也可以使用这些控件

这样数据层和 UI 层是一一对应的，后续接接口时无需重做控件框架。

---

## 数据模型

## 1. 左侧

新增：

- `pairingScheduleData`

类型沿用：

- `DashboardScheduleData`

## 2. 右侧

新增：

- `PairingRightPanelData`
- `PairingExistingProperty`
- `PairingAvailableProperty`
- `PairingBidValue`
- `PairingSearchForm`

建议结构：

```ts
type PairingBidValue =
  | { type: "stepper"; value: number; min?: number; max?: number }
  | { type: "time"; value: string }
  | { type: "time-range"; from: string; to: string }
  | { type: "date-range"; from: string; to: string }
  | { type: "select"; value: string; options: string[] }
  | { type: "percent"; value: string }
  | { type: "text"; value: string }
```

每条 property 至少包含：

- `id`
- `name`
- `bid`
- `layers`

available property 额外包含：

- `favorited`
- `pairingNumber`
- `pairingType`
- `effectiveDateRange`
- `actions`

---

## 状态管理

`PairingRightPanel` 内部使用本地 React state。

### 本地状态

- `existingProperties`
- `availableProperties`
- `activeTab`
- `searchKeyword`
- `isSearchModalOpen`
- `searchDraft`
- `appliedSearch`

### Reset All

`Reset All` 恢复以下内容：

- active tab
- 搜索关键字
- modal draft
- 已应用搜索条件
- existing properties
- available properties

### 状态边界

- 状态仅属于当前 `Pairing` 页面实例
- 不进入全局 store
- 不污染其他页面

---

## 组件拆分建议

建议目录结构：

```text
src/features/pairing
├── components
│   ├── pairing-right-panel.tsx
│   ├── pairing-bid-control.tsx
│   ├── pairing-property-row.tsx
│   └── pairing-search-modal.tsx
├── pages
│   ├── pairing-page.tsx
│   └── pairing-page.test.tsx
├── mock.ts
└── types.ts
```

### 组件边界

- `pairing-page.tsx`：页面装配
- `pairing-right-panel.tsx`：右侧整体状态与组合
- `pairing-bid-control.tsx`：渲染不同 bid 控件
- `pairing-property-row.tsx`：减少表格行 JSX 重复
- `pairing-search-modal.tsx`：弹窗表单与操作

注意：

- 这些组件首版都留在 `pairing` feature 内部
- 不提前抽到 `shared`

---

## 错误处理与交互退化

由于本阶段不接后端，错误处理主要针对前端交互边界：

- 搜索字段为空时允许提交，表示放宽过滤
- 日期范围不完整时允许关闭但不应用无效过滤
- `Bid` 输入非法时保留上一个合法值
- 删除最后一条 existing property 后，卡片仍保持空状态可用

本阶段不需要复杂错误提示系统，但应保证：

- 页面不会因为空列表崩溃
- modal 开关行为稳定
- reset 后总能回到初始 mock 状态

---

## 测试策略

新增 `pairing-page.test.tsx`，至少覆盖以下场景：

1. `/pairing` 页面结构正常渲染
2. 顶部导航 `Pairing` 高亮正常
3. 左侧共享日历面板正常出现
4. existing / add 两张卡片都出现
5. `All / Favorited` 切换有效
6. 搜索输入可过滤可选属性
7. `Search Pairings` modal 可打开和关闭
8. modal 提交后能驱动本地过滤
9. existing property 的 bid 可修改
10. existing property 的 layer 可切换
11. existing property 可删除
12. `Reset All` 能恢复初始状态

同时更新现有路由测试，确保：

- `/pairing` 成为真实页面
- `Pairing` 导航不再跳 `/404`

---

## 性能与维护要求

- 不引入新的重量级依赖
- `Pairing` 本地状态保持在 feature 内
- 左侧共享组件不做无关改动
- 右侧组件拆分以可读性为先，不做过度抽象
- 后续接接口时，优先替换 `mock.ts` 与 service 层，不重写页面结构

---

## 交付结果

本次实现完成后，`pbs-portal` 将具备一个新的真实 `Pairing` 页面：

- 导航可达
- 左侧与现有门户一致
- 右侧功能编排参考 `Royce-Flair`
- 视觉和布局规则属于当前 `pbs-portal`
- 前端交互完整
- 后续可平滑接入真实数据层

---

## 实施范围总结

本轮只做：

- `/pairing` 页面
- 左侧 schedule data
- 右侧 pairing 工作台
- 本地交互
- 单元测试与路由更新

本轮不做：

- `Line`
- 接口联调
- 全局抽象重构
- 后端能力改造
