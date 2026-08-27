# PBS Bid 页面合并设计

## 背景

当前 PBS Portal 将当月 Lineholder 的申请条件拆分在三个顶部页面：

- `Days Off`
- `Pairing`
- `Line`

Jen 提出的最终条件目录已经明显收敛。以 `init-docs/Bidding Options V1(2).xlsx` 为准，本次合并范围共 19 个条件：

- Days Off：2 个
- Pairing：11 个
- Line：6 个

`Reserve` 仍保留为独立页面，不在本次合并范围内。

三个现有页面虽然使用不同的前端 service 和后端路由，但实际读写同一个 `Current` Lineholder Bid，使用相同的 `draftKey / bidId / draftVersion`。继续按页面拆分会增加导航成本，也使左侧日历必须依赖当前路由，在 Days Off 与 Pairing 两种点击行为之间二选一。

本设计将三个页面合并为一个 `Bid` 工作台，同时保留已经稳定的分类业务接口、配置弹窗和冲突检查。

## 目标

1. 将顶部 `Days Off / Pairing / Line` 三个入口合并为一个 `Bid` 入口。
2. 在同一页面展示全部已添加的 Days Off、Pairing、Line 条件。
3. 在 Add Properties 区域通过 Tab 分别浏览三类条件和收藏条件。
4. 删除 Available Properties 分页，每个 Tab 使用纵向滚动列表。
5. 统一左侧日期点击入口，让用户在同一浮层中选择 Days Off 或 Pairing 行为。
6. 集中维护 Current Bid 草稿身份和版本，避免跨分类连续操作产生版本冲突。
7. 复用现有业务接口、配置弹窗、Tier、Pairing Count、Preview 和冲突检查能力。

## 非目标

- 不合并 Reserve 页面。
- 不增加或删除 Jen 最终目录之外的条件。
- 不重写 Days Off、Pairing、Line 的业务规则和导出规则。
- 不修改数据库结构。
- 不把三个分类改成三个隐藏的子页面。
- 不保留 `All Properties` Tab。
- 不为旧数据结构增加兼容层；项目尚未上线。

## 已确认的产品决策

### 页面名称

- 顶部导航名称：`Bid`
- 页面主路由：`/bid`

### Available Properties Tabs

固定显示以下四个 Tab：

```text
FAVORITED PROPERTIES | DAYS OFF | PAIRING | LINE
```

- 删除现有 `ALL PROPERTIES`。
- 初次进入默认选中 `FAVORITED PROPERTIES`。
- 即使没有收藏，也保留 Favorite 空态，不自动跳转到其他分类。
- Days Off、Pairing、Line Tab 各自只显示本分类条件。
- Favorited Properties 集中显示三类收藏条件，并显示分类标识。
- Tab 只控制下方 Available Properties，不过滤上方 Existing Properties。

### Existing Properties

- 始终统一显示已经添加的三类条件。
- 每一行标识所属分类：`Days Off / Pairing / Line`。
- Existing Properties 不跟随 Available Properties Tab 隐藏。

### 日历行为

- 点击具体日期后，在同一个浮层中显示 `Days Off | Pairing` 两个选项。
- 浮层记住用户上次选择的选项。
- 点击星期标题仍直接执行 Days Off 批量操作。
- 点击已有日历事件时直接打开事件所属类型，不再次询问类型。

## 当前实现事实

### 路由与导航

当前路由分别为：

- `/days-off`
- `/pairing`
- `/line`
- `/pairing/search`

顶部导航配置位于 `pbs-portal/src/shared/constants/top-nav-items.ts`。

### 共享左侧日历

`SharedBiddingWorkbenchLayout` 当前根据 pathname 给 `DashboardSchedulePanel` 传入互斥能力：

- `/days-off`：`editableDaysOffCalendar`
- `/pairing`：`pairingCalendarAwardBid`

因此同一个日期点击只能进入一种行为。合并后的 `/bid` 页面需要同时启用两种能力，并由日期浮层中的类型 Tab 决定后续内容。

### 草稿存储

Days Off、Pairing、Line service 使用各自的契约和路由，但后端最终定位同一条：

- 当前 crew
- 当前 period
- `bid_context = Current`

的 `pbs_bid` 草稿。

三个页面分别缓存 `draftVersion`。如果在一个合并页面中仍让三个模块各自维护版本，跨分类连续修改可能使用旧版本，因此必须由共享 Bid 工作台统一协调。

### Existing Summary

现有 `/lineholder-bids/current/summary` 已提供：

- 统一的 `draftKey / bidId / draftVersion`
- 合并后的 `summaryItems`
- `bidType`
- `editableSource.module`
- `editableSource.propertyGroupKey`

该接口适合作为 Existing Properties 的统一展示顺序和草稿身份来源；具体编辑仍使用对应模块加载的完整 property 数据。

## 方案对比

### 方案 A：前端统一 Bid 工作台，复用现有分类接口（采用）

实现一个统一的 Bid 页面协调层：

- 合并 Existing Properties。
- 统一 Available Properties Tabs。
- 保留三类 service、弹窗和 mutation。
- 集中维护草稿身份与版本。

优点：

- 真正实现一个页面和一个 Existing 列表。
- 复用已经验证过的业务规则和接口。
- 不需要重写后端服务。
- 改动范围可控。

风险：

- 前端需要正确协调三类数据模型。
- Pairing 专属的 Count、Rules、Preview 行为需要保留而不能被通用列表削弱。

### 方案 B：新增统一 Bid 后端 API

后端新增综合查询和综合 mutation 接口，替代三个现有模块接口。

优点：

- 前后端模型最统一。
- 草稿版本天然只有一个来源。

缺点：

- 需要重构后端服务、契约和前端。
- 回归范围远大于本次 19 个条件的页面合并需求。
- 容易重复已有业务逻辑。

结论：不采用。

### 方案 C：新页面只作为三个旧页面的 Tab 外壳

Days Off、Pairing、Line Tab 分别挂载现有完整页面。

优点：

- 实现速度快。

缺点：

- Existing Properties 仍然分裂。
- 草稿版本和日历行为仍由子页面控制。
- 不符合已经确认的统一 Existing Properties 结构。

结论：不采用。

## 推荐页面结构

```text
┌──────────────────── Left Calendar ────────────────────┐
│ Month calendar                                         │
│ Date click → [Days Off | Pairing] action popover       │
└────────────────────────────────────────────────────────┘

┌──────────────────────── Bid ───────────────────────────┐
│ EXISTING BID PROPERTIES                                │
│ [Days Off] Prefer Off ...                              │
│ [Pairing] Pairing Length ...                           │
│ [Line] Commuter Pattern ...                            │
│                                                        │
│ ADD BID PROPERTIES                                     │
│ [FAVORITED PROPERTIES] [DAYS OFF] [PAIRING] [LINE]    │
│                                         [Search ...]   │
│ ┌──────────────── scrollable list ──────────────────┐ │
│ │ Property rows for the active tab                  │ │
│ └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

## 详细交互设计

### 1. 页面入口与旧路由

- 顶部导航移除 `Days Off / Pairing / Line`。
- 新增一个 `Bid`，指向 `/bid`。
- `/days-off`、`/pairing`、`/line` 统一重定向到 `/bid`，避免测试、内部链接和未更新收藏地址进入空页面。
- Pairing Search 调整为 `/bid/pairing/search`。
- 原 `/pairing/search` 可重定向到新地址。

### 2. Existing Bid Properties

- 标题使用 `EXISTING BID PROPERTIES`。
- 以 Lineholder Summary 的顺序渲染三类 Existing Properties。
- 使用 `editableSource.module` 将每一行路由到对应编辑器：
  - `DaysOff` → `DaysOffBidDialog`
  - `Pairing` → Pairing 配置/预览流程
  - `Line` → `LineBidDialog`
- 每行显示分类 badge。
- 保留 Tier 切换、编辑和删除能力。
- Pairing 行继续显示 Pairing Pool Count，并保留 Preview。
- Pairing Pool Counts Toolbar 保留在 Existing 标题下方。
- `VIEW PAIRING RULES` 打开独立的 `AppDialog`，不替换或隐藏统一 Existing 列表。
- Pairing Rules dialog 只基于 Pairing 条件计算，不把 Days Off 或 Line 混入规则表达式。
- Toolbar 中的 `SEARCH CURRENT RULES` 继续搜索当前 Tier 的完整 Pairing rules；每条 Pairing 行的 `PREVIEW` 仍只预览该条件。
- 空态统一为 `No bid properties have been added yet.`

#### 用户可读摘要

Existing 行只允许展示业务可读摘要，禁止把持久化参数或内部数据结构直接显示给用户：

- 不得显示 JSON、`pairingIds`、`pairingLabels`、`propertyGroupKey`、数据库 ID 或序列化 payload。
- Pairing Preference 单个 pairing 显示为 `Award pairing CRAM`；多个显示为 `Award pairings CRAM, ABC123`。`Avoid` 条件使用对应的 `Avoid` 开头。
- 用户可见名称必须使用 canonical payload 中的 pairing label；`pairingIds` 仅用于内部定位，任何情况下都不作为用户可见 fallback。
- 当前 canonical `pairing-preference` JSON payload 由后端 Lineholder Summary formatter 转换为可读语句；前端不重复解析或临时隐藏 JSON。
- 本次不增加旧 Pairing Preference 参数格式兼容层；项目尚未上线，非 canonical payload 按无法识别数据处理。
- Pairing、Days Off、Line 当前可见条件都必须具有对应 formatter。无法识别的数据使用明确的 review-only 文案并关闭写入，不得回退为原始 JSON。
- Tier 页面与 Bid 页面复用同一个 `readableText`，保证同一条件在不同入口显示一致。

#### 行布局与操作

Existing 行固定为四个视觉区域：

```text
TYPE | READABLE SUMMARY | TIERS | ACTIONS
```

- `TIERS` 与 `ACTIONS` 使用稳定列宽，不能因为是否存在 Preview 而左右跳动。
- 保留点击行主体打开对应编辑器的行为，不额外显示 Edit 按钮。
- 每个可编辑 Existing 行必须显示删除图标，并提供包含条件摘要的可访问名称。
- Pairing 行的 Actions 显示 `PREVIEW + 删除图标`；Days Off 与 Line 行只显示删除图标。
- 点击 Preview 或删除按钮不得同时触发行主体的编辑行为。
- 点击删除图标后显示确认浮层：`Delete this bid from the current draft?`；只有再次点击 `Delete` 才执行删除。
- 删除期间禁用该行操作并显示 pending 状态；失败时保留该行并展示可恢复错误。
- 删除成功后刷新统一 Existing Summary、对应分类数据、Tier 数据，以及受影响的 Calendar 或 Pairing Count。
- review-only 或无法精确关联到分类完整数据的行不显示删除按钮。

Summary 与完整编辑数据使用 `(editableSource.module, editableSource.propertyGroupKey)` 精确关联：

- 关联成功时使用对应分类的专用 renderer 和编辑器。
- Summary 行找不到完整数据时仍以只读形式展示，并提示重新加载；不得静默隐藏。
- 同一个 key 关联到多条完整数据时视为一致性错误，关闭所有写入并要求重新获取。
- 分类 badge 固定使用 `Days Off / Pairing / Line`；行顺序保持 Lineholder Summary 返回顺序，不按分类重新排序。

### 3. Available Properties

- 标题使用 `ADD BID PROPERTIES`。
- 默认 Tab 为 `FAVORITED PROPERTIES`。
- Favorite 为空时显示空态，不自动切换到 Days Off。
- 切换 Tab 时：
  - 清空当前搜索词，避免隐藏新分类全部结果。
  - 保持列表滚动位置重置到顶部。
- 搜索只作用于当前 Tab。
- Favorite Tab 中按 `Days Off / Pairing / Line` 顺序分组，并显示分类标题或 badge。
- 分类 Tab 中不重复显示分类标题。
- 删除分页组件和页码状态。
- 列表使用固定可用高度和 `overflow-y-auto`。
- 条件数量变化时不引入虚拟列表；当前最多约 19 条，没有性能收益。
- Pairing Tab 保留 `ALL PAIRINGS`，进入不带规则过滤的 Pairing Search。
- Existing 标题下方的 `SEARCH CURRENT RULES` 使用当前 Tier 和全部 Pairing Existing Properties 进入带规则条件的 Pairing Search。
- Pairing Existing 行的 `PREVIEW` 只预览该行条件。
- 从 `/bid/pairing/search` 返回时回到 `/bid` 并自动选中 `PAIRING` Tab。

#### 页面与滚动边界

Bid 工作台使用可用视口高度作为固定页面边界，不允许内容继续撑高浏览器页面：

- 顶部导航、左侧 `BIDDING CALENDAR`、右侧 `EXISTING BID PROPERTIES`、`ADD BID PROPERTIES` 标题、分类 Tab、Pairing 工具按钮和搜索框保持在固定工作台内。
- 页面最外层和右侧 Bid 面板使用明确的共享工作台高度、`min-height: 0` 与 `overflow: hidden`，浏览器页面本身不出现由 Bid 内容造成的纵向滚动。
- Available Property 行列表占用右侧面板的剩余高度，并作为主要纵向滚动区域。
- 切换 `FAVORITED PROPERTIES / DAYS OFF / PAIRING / LINE` 时，Available Property 列表滚动位置重置到顶部。
- `EXISTING BID PROPERTIES` 标题和 Pairing Pool Counts Toolbar 位于滚动容器之外并始终可见；只有 Existing Property 行容器允许滚动。
- Existing Property 行容器的 `max-height` 明确为 `330` 个设计坐标像素，并设置 `min-height: 0; overflow-y: auto`。已有条件超过该高度时只滚动属性行，不继续挤压下方 Available Property 列表。
- Available Property 行滚动区必须始终保留大于 `0` 的可用高度；无论 Existing 数量多少，`ADD BID PROPERTIES` 标题、分类 Tab、工具按钮和搜索框都必须可见。
- 不使用固定屏幕像素高度拼出红框区域；高度由共享 `--portal-page-shell-height` 和右侧面板的 flex 剩余空间计算，以兼容 Portal 现有缩放。
- `1920×1080` adaptive 基线、`1366×600` 高度受限 adaptive 视口，以及 `1024×768` full-fit 缩放视口下都必须保留上述滚动边界。
- 不裁切顶部导航、日历面板、Existing/Add 标题、分类 Tab、工具栏、搜索框及滚动容器本身；视口外的属性行必须能够通过对应局部滚动容器访问。

### 4. 日期点击浮层

日期点击浮层顶部使用二选一 Tab：

```text
[DAYS OFF] [PAIRING]
```

行为：

- 初次进入 Bid 页面默认选择 `Days Off`。
- 用户切换后，使用 `sessionStorage` 在本次浏览器会话内记住上次选择。
- 存储 key 使用稳定的产品级名称，不包含 crew、日期或草稿业务数据；值只允许 `days-off | pairing`。
- 刷新页面后继续使用本次会话的选择；新会话或无有效值时默认 `Days Off`。
- 重新点击其他日期时直接打开上次选择的内容，但用户仍可在浮层内切换。
- 切换类型时保留目标日期，不保留另一类型尚未保存的临时勾选。
- 如果存在未保存操作，切换类型前清除该临时状态，不产生 mutation。

Days Off 内容继续支持：

- 日期和 Tier 选择。
- 添加或移除 Prefer Off 目标。
- Pairing 冲突提示和禁用状态。
- 星期标题批量选择。

Pairing 内容继续支持：

- 加载该日期实际 Pairing occurrences。
- Pairing 多选。
- Tier 多选。
- 保存 Award Pairing Preference。
- Days Off 冲突提示和禁用状态。

### 5. 已有事件点击

- Days Off 日历事件直接进入 Days Off 编辑内容。
- Pairing 日历事件直接进入 Pairing 详情或编辑内容。
- 已有事件带有明确类型，不显示 Days Off / Pairing 选择步骤。

## 数据与状态设计

### 1. Bid 工作台查询

Bid 工作台并行获取：

- Lineholder Current Summary
- Days Off Current Draft
- Pairing Current Draft
- Line Current Draft

加载完成后检查：

- `periodCode` 一致。
- 已存在草稿时 `bidId / draftKey` 一致。
- `draftVersion` 以 Lineholder Summary 为统一权威值。

如果身份不一致：

- 不允许继续 mutation。
- 重新获取四组数据。
- 仍不一致时显示可恢复错误，要求用户刷新，不静默覆盖。

### 2. 统一 Draft Coordinator

Coordinator 不能只是 `BidPage` 的 local state。它必须位于 `SharedBiddingWorkbenchLayout` 级 Provider、共享 store，或以统一 TanStack Query cache 作为唯一来源，从而覆盖：

- `/bid`
- 左侧 `DashboardSchedulePanel`
- `/bid/pairing/search`

共享工作台维护一个统一 draft meta：

```ts
type BidDraftMeta = {
  draftKey?: string;
  bidId?: number;
  periodId?: number | null;
  periodCode: string;
  draftVersion: number;
  bidContext: "Current";
};
```

所有 Current Bid mutation 必须在真正提交时读取共享 meta，不能捕获页面或弹窗初次加载时的 `data.draftMeta`。这包括：

- Days Off、Pairing、Line Existing Properties 的添加、编辑、删除和 Tier 修改。
- 左侧日历的 Days Off、Pairing 写入。
- Pairing Search 的添加、编辑和删除。
- 三类 Favorite 的创建、编辑和删除。

每次 mutation 成功后：

1. 用响应更新共享 draft meta。
2. 更新受影响模块的 query cache。
3. 刷新 Lineholder Summary。
4. 刷新 Tier 数据。
5. Days Off 或 Pairing 影响日历时刷新 Bidding Calendar。
6. Pairing 规则改变时刷新 Pairing Pool Count。

### 3. Mutation 串行化

- 同一共享 Bid 工作台同时只允许一个携带 Current Bid reference/version 的 mutation。
- mutation 进行中暂时禁用其他分类、日历和 Pairing Search 的添加、编辑、删除、Tier 与 Favorite 修改。
- 不做自动重试写入，避免版本冲突后重复提交。
- 收到版本冲突时重新加载统一草稿，并提示用户重新确认操作。

### 4. Favorite

- Favorite 仍由对应分类 service 保存和删除。
- Favorite mutation 不改变 Current Bid 的 Existing Properties，但同样携带并校验 Current Bid reference/version。
- Favorite 创建、编辑和删除必须进入统一 mutation mutex。
- Favorite mutation 成功后必须使用响应同步共享 `draftKey / bidId / periodCode / draftVersion`。
- 如果某个 Favorite 接口不返回完整 identity，成功后必须刷新 Lineholder Summary，再开放下一次写入。
- 空草稿首次保存 Favorite 可能创建 Current Bid；该场景必须同步新身份，不能只更新分类 catalog cache。
- Favorite Tab 在 mutation 成功后更新对应分类 cache，并重新派生合并列表。

## 加载、错误与空态

- 四组主查询加载期间显示统一 Bid loading skeleton。
- 单个 catalog 查询失败时不展示部分可写页面，避免错误的草稿版本参与 mutation。
- Existing Summary 为空但 catalog 正常时，显示统一 Existing 空态。
- 当前 Tab 没有条件时：
  - Favorite：`No favorite properties match the current search.`
  - 分类：`No {Category} properties match the current search.`
- 当前 bidding period 只读时，沿用现有只读原因并禁用所有 mutation。

## 可访问性

- Available Properties Tab 使用标准 `role="tablist"`、`role="tab"` 和 `aria-selected`。
- 日期浮层中的 Days Off / Pairing 选择同样使用可键盘操作的 Tab。
- 分类 badge 不能作为唯一的信息来源；行的可访问名称应包含分类。
- 滚动列表保留可见 focus 状态。
- 浮层支持 `Escape` 关闭，并在关闭后将焦点返回原日期按钮。

## 性能要求

- 四组查询并行发起，不串行等待。
- 复用共享 workbench 的预取和 TanStack Query cache。
- 不对 19 条条件引入虚拟列表。
- 搜索使用本地派生过滤，不新增服务端请求。
- 切换 Available Tab 不重新请求数据。

## 预期影响范围

### 前端

- `pbs-portal/src/app/router/`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx`
- `pbs-portal/src/shared/constants/top-nav-items.ts`
- 新的 `pbs-portal/src/features/bid/`
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- Days Off、Pairing、Line 现有面板的可复用逻辑
- Rule Bid / Pairing Available Properties 列表与分页逻辑
- Help 中的页面入口和说明

### 后端与 Contract

- 预期不新增写接口、不改数据库。
- 优先复用现有 Lineholder Summary。
- 只有在实现中发现 Summary 缺少稳定排序或编辑来源时，才允许做最小的 additive contract 扩展，并补充后端测试。

## 测试设计

### 单元与组件测试

1. 初次进入默认选中 Favorite；Favorite 为空时保留空态，不自动切换。
2. 四个 Tab 正确过滤条件。
3. 页面不存在 `All Properties`。
4. Available Properties 不渲染分页 footer。
5. 切换 Tab 清空搜索并回到列表顶部。
6. Favorite Tab 合并三类收藏并显示分类。
7. Existing Properties 同时显示三类条件且不受 Tab 影响。
8. mutation 成功后统一 draft version 更新。
9. 跨分类连续 mutation 使用最新版本。
10. 草稿身份不一致时禁止写入并重新获取。
11. 日期浮层切换 Days Off / Pairing，并通过 `sessionStorage` 记住上次选择。
12. 星期标题只执行 Days Off 行为。
13. 已有事件直接打开对应类型。
14. Pairing Count、Preview、Rules 行为保持可用。
15. Favorite 首次创建 Current Bid 后正确同步共享草稿身份。
16. Favorite 与结构性 mutation 不会并发写入。
17. Summary 与完整编辑数据关联失败时显示只读行并关闭写入。
18. 旧 Days Off、Pairing、Line 路由正确重定向。
19. Pairing Search 返回 `/bid` 后自动选中 Pairing Tab。
20. Bid 页面根面板固定为共享工作台高度并隐藏外层溢出。
21. Existing Properties 超过最大高度时使用自己的局部滚动。
22. Available Properties 列表使用剩余高度并独立滚动。
23. 切换 Available Tab 后列表滚动位置归零。
24. Pairing Preference 新 JSON payload 显示为 `Award pairing CRAM`，不显示 JSON 或数据库 pairing ID。
25. Pairing、Days Off、Line 的可见摘要均不包含 `{`、`"type"`、`pairingIds`、`pairingLabels` 或 `propertyGroupKey`。
26. Existing 行的 Tiers 与 Actions 固定对齐；Pairing 显示 Preview 和删除，Days Off / Line 显示删除。
27. 点击行主体继续进入编辑；点击 Preview 或删除不会触发编辑。
28. 删除图标打开确认浮层；Cancel 保留条件，Delete 成功后刷新相关数据，失败时保留条件并提示错误。
29. review-only 或数据关联失败的行不显示删除按钮。
30. Formatter 矩阵覆盖新 JSON 的单个/多个 Pairing、Award/Avoid；例如 `Award pairing CRAM`、`Award pairings CRAM, ABC123`、`Avoid pairing CRAM`。
31. pairing label 缺失、JSON 无法解析或 payload type 不支持时显示 review-only 文案；不使用 `pairingIds` 作为 fallback，不显示数据库 pairing ID 或原 payload，且不可编辑、不可删除。
32. 至少各选择一个正常 Days Off、Pairing、Line 条件验证可读摘要；负向 JSON/内部字段断言限定在 Existing Summary 单元格，避免扫描页面内部开发信息产生误报。
33. 删除 pending 时该行主体编辑、Preview、Delete 和 Tier 操作全部禁用；重复点击不能发出第二次 mutation。
34. 删除失败时行仍存在、确认状态结束并显示可恢复错误，共享 draft meta 不得错误递增；409 触发 Coordinator reload 并要求重新确认，不自动重放删除。
35. 删除成功后按分类精确刷新：
    - Days Off：统一 Summary、Days Off draft、Tier、Calendar。
    - Pairing：统一 Summary、Pairing draft、Tier、Calendar、Pairing Pool Count。
    - Line：统一 Summary、Line draft、Tier；不刷新 Calendar 或 Pairing Pool Count。

### Playwright

真实 UI 回归至少覆盖：

1. 登录后从顶部进入 `Bid`。
2. 确认旧三个顶部入口已移除。
3. 确认初始停在 Favorite；再切换四个 Available Tabs，确认分类和无分页行为。
4. 从 Days Off Tab 添加条件。
5. 不刷新页面，切到 Pairing Tab 添加条件。
6. 再切到 Line Tab 添加条件。
7. 确认 Existing Properties 同时显示三类条件，且没有版本冲突。
8. 点击日历日期，在 Days Off 和 Pairing 之间切换并分别保存。
9. 刷新页面并点击另一个日期，确认本次会话仍记住上次选择。
10. 点击星期标题，确认直接进入 Days Off 批量操作。
11. 通过日历添加 Pairing，不刷新页面直接添加 Line，确认无版本冲突。
12. 从 Pairing Search 添加或编辑条件，返回 Bid 后直接添加 Days Off，确认无版本冲突。
13. 在空草稿保存 Favorite，再添加结构性条件，确认身份同步且无版本冲突。
14. 打开 Pairing Rules dialog，确认统一 Existing 列表未被替换，Count 和 Preview 仍可用。
15. 访问旧路由并验证重定向；从 Pairing Search 返回后验证 Pairing Tab 自动选中。
16. 刷新页面，确认三类 Existing Properties 均正确持久化。
17. 在 `1920×1080`、`1366×600` 和 `1024×768` 三种视口验证页面无浏览器级纵向滚动，并分别确认 ScaledPageCanvas 的 `adaptive / adaptive / full-fit` 模式。
18. 使用 Available 溢出数据：指针位于 Available Property 行容器内时，滚轮只改变 Available 的 `scrollTop`；Existing 和 `document.scrollingElement.scrollTop` 保持不变。滚到顶部或底部后继续滚动也不能带动浏览器页面。
19. 使用 Existing 溢出数据：指针位于 Existing Property 行容器内时，滚轮只改变 Existing 的 `scrollTop`；Available 和 `document.scrollingElement.scrollTop` 保持不变。滚到顶部或底部后继续滚动也不能带动浏览器页面。
20. 三种视口均断言 `document.scrollingElement.scrollHeight <= clientHeight + 1`、页面 `scrollTop === 0`、Available 滚动区 `clientHeight > 0`；顶部导航的 bounding box 位于浏览器 viewport 内，完整 `BIDDING CALENDAR` 面板、右侧标题、Tab、工具栏、搜索框及两个滚动容器的 bounding box 位于 ScaledPageCanvas viewport 内。局部滚动前后，顶部导航、日历面板和其他固定控件的位置保持不变。
21. 使用真实 Pairing Preference 数据断言 Existing Summary 单元格显示 `Award pairing CRAM` 和多选可读摘要；fixture 使用醒目的内部 ID `987654321`，并断言该单元格不存在此 ID、`{`、`"type"`、`pairingIds`、`pairingLabels` 等原始 payload 文本。
22. 断言每个可编辑 Existing 行都有删除入口；Pairing 行同时有 Preview，三类行的 Tiers 与 Actions 保持同列对齐。
23. 点击删除后先出现确认浮层；Cancel 不删除，确认 Delete 后该行消失且页面不发生草稿版本冲突。
24. 模拟删除 pending，确认重复点击不会产生第二次请求，且编辑、Preview、Delete、Tier 操作均不可用。
25. 模拟普通失败和 409，确认行仍存在、错误可见、draft meta 未错误递增且不会自动重放；随后重新确认并成功删除。
26. 分别删除 Days Off、Pairing、Line 条件，断言对应 Summary、分类 draft、Tier、Calendar 与 Pairing Pool Count 按第 35 条的分类规则刷新。

### 必跑命令

实现阶段至少执行：

```bash
cd pbs-portal && npm run test -- <touched focused tests>
cd pbs-portal && npm run check:ui
cd pbs-portal && npm run build
```

并运行新增或更新后的真实 UI Playwright 用例。

## 验收标准

1. 顶部导航只显示一个 `Bid` 入口，不再显示 Days Off、Pairing、Line。
2. `/bid` 同时承载三类 Current Bid 条件。
3. Existing Properties 始终显示全部三类已添加条件，并标识分类。
4. Add Properties 只有 `Favorited Properties / Days Off / Pairing / Line` 四个 Tab。
5. 不存在 `All Properties`，不显示分页。
6. 每个 Tab 的列表可滚动，搜索只影响当前 Tab。
7. 日期点击浮层可选择 Days Off 或 Pairing，并在同一浏览器会话中记住上次选择。
8. 星期标题保持 Days Off 批量行为。
9. 从主页面、左侧日历、Pairing Search 和 Favorite 发起的连续写入都使用同一最新 `draftVersion`。
10. Pairing Count、Rules dialog、单行 Preview、All Pairings 和 Search Current Rules 能力没有丢失。
11. Reserve、Tier、Award、Standing Bid 页面行为不受影响。
12. 前端 focused tests、Playwright、`npm run check:ui` 和 build 均通过。
13. Bid 工作台整体固定在可用视口内，不产生浏览器级纵向滚动。
14. Available Properties 是主要滚动区；Existing Properties 仅在超过其最大高度时局部滚动。
15. Existing 摘要全部为业务可读文本，任何正常可编辑行都不暴露 JSON、内部字段或数据库 ID。
16. 点击行主体可以编辑，每个可编辑行有明确删除入口，Pairing 行同时保留 Preview。
17. Tiers 与 Actions 在所有行中稳定对齐；删除具备确认、pending、失败保留和成功刷新行为。

## 风险与缓解

### 风险 1：共享草稿版本不同步

缓解：

- 使用统一 Draft Coordinator。
- 所有携带 Current Bid reference/version 的 mutation 串行化。
- 成功后刷新 Summary 和受影响 cache。

### 风险 2：通用 Existing 列表削弱 Pairing 专属能力

缓解：

- Pairing 行保留专用 row renderer。
- Rules、Count、Preview 继续使用 Pairing 现有逻辑。

### 风险 3：共享 Rule Bid 组件影响 Reserve 或 Standing Bid

缓解：

- Bid 页面优先通过显式 props 或新的薄协调组件禁用分页。
- 不全局删除共享分页能力。
- 补跑 Reserve 和 Standing Bid 受影响测试。

### 风险 4：四组查询出现部分成功

缓解：

- 写入前要求四组身份检查通过。
- 不在部分成功状态开放 mutation。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Bid 页面协调器、Existing 列表、日历行为和草稿版本高度耦合，核心改动会集中在相同前端状态与组件边界。
- Suggested split: 主实现保持单一流程；完成后独立进行 spec/代码审查和测试验证。
- Write boundaries: 主要修改 `pbs-portal`；后端和 contract 仅允许必要的 additive 调整。
- Conflict risk: High if multiple agents edit the workbench, right panel, and calendar simultaneously.
- Execution gate: 本 spec 经用户审核并明确批准实施后才能修改产品代码。
