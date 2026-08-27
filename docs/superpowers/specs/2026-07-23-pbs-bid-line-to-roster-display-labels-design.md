# PBS Bid 工作台 Line 改名为 Roster 设计

## 1. 背景

PBS Portal 的 Bid 工作台目前使用 `LINE` 表示 Line Bid 分类。根据产品要求，该分类在
前端向用户展示时统一改为 `ROSTER`。

本次只修改 Bid 工作台相关的前端显示文案，不改变 Line Bid 的内部名称、数据结构或业务逻辑。

## 2. 目标

在 Bid 工作台中，将代表 Line Bid 分类的以下可见文案改为 Roster：

- 顶层分类 Tab：`LINE` → `ROSTER`
- 收藏条件分类标题：`Line` → `Roster`
- Existing Bid 行和只读详情中的类型 badge：`Line` → `Roster`
- Bid Review 的 chip 和 popover 模块标签：`Line` → `Roster`

当前合并工作台的区域标题本身是 `EXISTING BID PROPERTIES` 和 `ADD BID PROPERTIES`，
不包含 Line，因此保持不变。

## 3. 非目标

- 不修改内部分类 key `line`。
- 不重命名 `LinePage`、Line service、Line contract、类型、变量或文件。
- 不修改 API、路由、后端、数据库或算法。
- 不修改 Line Bid 条件名称、保存 payload 或交互流程。
- 不全局替换所有 `Line` 字样。
- 不修改其他含义中的 Line，例如 `Base Line Average`。
- 不修改 `Configure Line Bid`、`Forget Line` 等弹窗标题或具体 Line property 名称。
- 不修改 Standing Bid、Help Center 等非当前 Bid 工作台页面的 Line 文案。
- 不修改不可达的独立 Line 页面 loading/error fallback。

## 4. 方案

### 方案 A：只替换工作台显示标签（采用）

在现有 Bid 和 Line 前端展示配置中替换用户可见文案，内部仍以 `line` 识别分类。

优点：

- 改动最小。
- 不影响状态、路由、API 和数据。
- 不需要迁移已有 Bid。

### 方案 B：全前端统一替换 Line

会影响 Help、业务术语和其他包含 Line 的界面，容易误改 `Base Line Average` 等不同语义，
不符合本次范围。

### 方案 C：内部类型同步改为 Roster

需要修改 contract、service、路由和大量测试，存在不必要的兼容风险，因此不采用。

## 5. 前端设计

### 5.1 Bid 分类 Tab

`AVAILABLE_TABS` 继续使用：

```text
key: line
```

只将 label 从 `LINE` 改为 `ROSTER`。点击后仍进入现有 Line Bid 内容，不改变选中状态、
筛选、搜索或渲染分支。

### 5.2 工作台分类显示映射

内部 `TierBidType` 继续使用：

```text
Line
```

只在 Bid 工作台的类型 badge 和 Bid Review 模块标签中将其显示为：

```text
Roster
```

Existing Bid 行、非可编辑详情弹窗、Bid Review chip 和 popover 使用同一显示语义。类型判断、
颜色样式、数据映射及交互保持不变。

### 5.3 收藏分类

Bid 工作台的收藏分组标题从 `Line` 改为 `Roster`。收藏数量和内容仍来自现有 Line 数据。

### 5.4 保留合法 Line 文案

测试和实现必须使用 scoped/exact 定位，不允许全页断言不存在 `Line`。例如
`Forget Line`、`Configure Line Bid` 和其他具体 property 名称仍是合法文案。

## 6. 测试设计

### 6.1 组件测试

更新 Bid 页面、类型 badge 和 Bid Review 现有测试：

- 分类 Tab 顺序仍为 Favorited、Days Off、Pairing、Roster。
- Existing Bid 的 Line 类型 badge 显示 `Roster`。
- 非可编辑详情中的 Line 类型 badge 显示 `Roster`。
- Bid Review 的 Line chip/popover 模块标签显示 `Roster`。
- 收藏分组显示 `Roster`。
- 内部 Line Bid 内容和操作仍正常渲染。
- `Forget Line` 等合法 property 名称保持不变。

### 6.2 Playwright

更新现有 Bid 工作台真实 UI 用例：

- 第四个 Tab 显示 `ROSTER`。
- 点击 `ROSTER` 后 `aria-selected=true`，并显示现有 Line catalog 条件，证明仍走内部
  `line` 内容。
- Existing 行 badge、收藏分组和可构造的 Bid Review 标签显示 `Roster`。
- 不再按 `LINE` 定位该分类 Tab。
- 使用 scoped/exact selector，不做全页 `Line` 不存在断言。

同步更新共享 E2E page object 的纯显示映射：

```text
BID_TAB_LABEL.line = ROSTER
SUMMARY_BADGE.line = Roster
```

page object 的 `BidPageKind = "line"`、endpoint 和 workspace 逻辑保持不变。

### 6.3 QA 人工用例

新增或更新 PBS Bid 工作台 QA 用例，验证：

- Roster Tab 和分类标签显示正确。
- 点击 Roster 后仍可查看和添加原 Line Bid 条件。
- `Forget Line` 等 property 名称未被误改。

### 6.4 验证命令

- Bid 页面、类型 badge、Bid Review 的相关 PBS Portal Vitest。
- Bid 工作台相关 Playwright。
- PBS Portal lint。
- PBS Portal build。
- 根目录 `npm run check:ui`。

## 7. 验收标准

- Bid 工作台第四个 Tab 显示 `ROSTER`。
- 收藏条件区域使用 `Roster` 分类标题。
- Existing Bid 行、只读详情和 Bid Review 使用 `Roster` 类型标签。
- 点击 Roster 后仍展示现有 Line catalog 条件。
- 当前工作台不再用 `LINE` / `Line` 作为 Line Bid 的分类标签。
- `EXISTING BID PROPERTIES`、`ADD BID PROPERTIES`、`Configure Line Bid` 和具体 property
  名称保持不变。
- Line Bid 的读取、添加、编辑、删除和保存行为不变。
- 请求路径、payload 和后端实现没有变化。
- 相关组件测试、Playwright、lint、build 和 UI 标准检查通过。

## 8. Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：改动集中在同一前端显示链路和对应测试，并行开发的协调成本高于收益。
- Suggested split：不拆分。
- Write boundaries：Bid 页面、工作台类型显示映射、Bid Review、共享 E2E page object、对应测试和 QA 记录。
- Conflict risk：低，但实施时需避开工作区其他未提交改动。
- Execution gate：用户审核并明确批准本 spec 后才实施。
