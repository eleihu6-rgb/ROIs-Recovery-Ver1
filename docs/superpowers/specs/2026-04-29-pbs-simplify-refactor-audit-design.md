# PBS Portal / PBS Server 简化与性能治理设计

日期：2026-04-29
作者：Codex
状态：已确认，第一批试点已实现

## 背景

`pbs-portal` 和 `pbs-server` 近期持续迭代了 Pairing、Days Off、Rule Bids、共享日历、稳定身份、接口性能等功能。功能推进后，代码中可能出现历史兼容层、重复 mapper / validation / service 逻辑、过大的组件和服务文件，以及部分性能路径上的重复请求或重复查询。

用户希望像 `tree shaking` 一样减少无用代码和冗余，但前提非常明确：功能不能丢，修改后必须保证回归测试没有问题，后续还要继续补测试案例。

这里需要区分两个概念：

- `tree shaking`：打包工具基于静态 `import/export` 分析，把未被最终入口引用的代码从前端 bundle 中剔除，重点是减少打包体积。
- `simplify`：更广义的代码治理，目标是在功能不变的前提下降低复杂度，包括删除可证明无用代码、合并重复逻辑、拆分超大文件、减少状态分叉、优化慢路径、补充测试护栏。

本轮治理采用 `simplify` 思路，但必须用测试和分批策略约束风险。

## 目标

1. 第一轮只处理 `pbs-portal` 和 `pbs-server`。
2. 找出并清理可证明无用或过时的代码，避免误删动态入口、测试 fixture、mock 数据和 API 契约。
3. 降低重点大文件复杂度，优先处理 Pairing、Days Off、Rule Bids 相关重复逻辑。
4. 从性能优化角度识别并修复低风险问题，例如重复请求、重复计算、过宽组件订阅、后端重复查询。
5. 每一批改动都必须保持现有功能、API contract、稳定身份、draftVersion、并发语义和错误提示行为不变。
6. 修改完成后运行回归验证；如果回归失败，先修复再继续扩大范围。

## 不做范围

- 不处理 `gantt`、`live-server`、`rule-engine`、`po-engine`、`ro-engine`、`engine-server`。
- 不改变数据库 schema、migration 或已有接口 contract，除非后续单独确认。
- 不重做 PBS 页面视觉语言。
- 不引入新的生产依赖。
- 不做激进重构，例如一次性重写 Pairing 或 Days Off 主流程。
- 不删除无法证明未使用的代码；对于疑似冗余但证据不足的代码，只登记到清单。

## 当前初步信号

只读扫描发现以下复杂度热点：

| 文件 | 行数 | 初步风险 |
| --- | ---: | --- |
| `pbs-server/src/services/days-off/days-off-bid-service.ts` | 1755 | Days Off draft、property、favorite、layer totals、fast path 集中在一个服务中 |
| `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx` | 1393 | 右侧面板承担展示、编辑、保存、规则渲染等多种职责 |
| `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx` | 1142 | Rule Bid 和 Days Off validation / property add 逻辑存在交叉 |
| `pbs-server/src/services/pairing-search/pairing-search-service.ts` | 1124 | 搜索条件编译、SQL 片段和结果映射集中 |
| `pbs-server/src/services/pairing/pairing-bid-service.ts` | 1039 | Pairing draft、property、quantifier、validation、保存逻辑集中 |
| `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx` | 831 | Bid 控件状态、操作按钮和 property 交互较重 |
| `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx` | 819 | 搜索条件、弹窗、筛选、保存入口较多 |

其他信号：

- `pbs-portal` 已启用 `noUnusedLocals` 和 `noUnusedParameters`，明显未使用变量风险较低。
- `pbs-server` 目前未启用 `noUnusedLocals` 和 `noUnusedParameters`，后端需要额外静态审计。
- `pbs-server` 的 `console.log` 主要出现在同步脚本中，属于 CLI 输出，暂不作为问题处理。
- Pairing / Days Off / Rule Bids 之间存在相似概念：property definition、quantifier、draft mapper、validation、summary 文案、stable key，适合优先查重，但不能强行抽象。

## 方案

### 1. 先做 PBS 专项审计清单

审计对象：

- 未引用文件和导出。
- `@deprecated`、历史 adapter、过时 mock。
- 重复 mapper、重复 validation、重复 API service 解包。
- 超大组件和超大 service 的职责边界。
- 潜在性能热点：重复请求、重复 query key、组件无 selector 订阅、后端重复 load、N+1 查询。

审计方式：

- 优先使用 TypeScript build、ESLint、`rg`、依赖图工具或轻量脚本做静态证据收集。
- 对动态路由、测试入口、mock、契约文件、脚本入口保持保守。
- 输出分级结果：`可安全处理`、`需要补测试后处理`、`暂不处理只记录`。

### 2. 第一批只实施低风险简化

第一批候选类型：

- 删除已经完全不可达且有静态证据的本地 helper。
- 合并同一 feature 内明显重复的小函数。
- 把超大组件中纯展示、纯 mapper、纯 validation 的局部逻辑抽到同 feature 文件，保持导出面最小。
- 后端将重复 property / quantifier / draft helper 收束到当前 service 附近的内部 helper，暂不上提到全局共享层。
- 修复低风险性能问题，例如 memo 化稳定派生数据、收窄 query invalidation、避免页面重复触发同一请求。

第一批禁止类型：

- 不改 API 字段。
- 不改数据库。
- 不改认证、权限、并发版本语义。
- 不改稳定 `id` / `key` 使用原则。
- 不跨 Pairing、Days Off、Rule Bids 强行抽公共框架。

### 3. 大文件治理原则

对大文件不以“行数降低”为唯一目标，而以职责边界为目标。

`pbs-portal`：

- 页面组件保留页面装配和用户流程。
- 面板组件逐步拆出纯展示区、操作区、mapper / summary / validation。
- 服务端状态继续放在 TanStack Query，UI 状态继续按现有 Zustand 规则处理。
- 不把服务请求直接写进页面或组件。

`pbs-server`：

- route 只保留入参校验、调用 service、统一响应。
- service 内部优先抽本文件私有 helper；确认跨服务复用后再放入 `services/lineholder` 或 feature shared 文件。
- SQL 优化必须保留事务边界、draftVersion、layer totals、rowSeq、stable key 语义。

### 4. 性能治理原则

前端重点：

- 检查 `useQuery` key 和 invalidation 是否过宽。
- 检查共享日历、Pairing、Days Off 页面是否存在重复加载同一数据。
- 检查 Zustand 读取是否使用 selector，避免整 store 订阅造成不必要渲染。
- 对大列表、搜索结果、右侧面板派生数据使用稳定 memo，但不为小数据制造复杂缓存。

后端重点：

- 检查 Pairing Search / Pairing Bid / Days Off Bid 是否存在重复读取 current bid、重复解析 period、循环内查询。
- 优先减少远程 DB round trip，而不是只做代码层小优化。
- 不为一次性场景引入复杂缓存；缓存必须有明确 TTL、失效边界和测试。

## 验收标准

1. 第一批改动不改变用户可见功能、页面流程、接口 contract 和数据语义。
2. `pbs-portal` 回归通过：

   ```bash
   cd /Users/lei/Codehub/rois-ai/pbs-portal
   npm test
   npm run lint
   npm run build
   ```

3. `pbs-server` 回归通过：

   ```bash
   cd /Users/lei/Codehub/rois-ai/pbs-server
   npm test
   npm run build
   ```

4. 跨 PBS 验证通过：

   ```bash
   cd /Users/lei/Codehub/rois-ai
   npm run verify:pbs
   ```

5. 对每一处删除或重构，交付说明中必须写清：
   - 改了什么。
   - 为什么可安全处理。
   - 对应测试或验证命令。
6. 若发现缺少测试覆盖，先补最小必要回归测试，再继续处理对应逻辑。

## 实施顺序

1. 生成 PBS 冗余与复杂度审计清单。
2. 从清单中挑选第一批低风险项。
3. 对第一批项补足必要测试。
4. 实施小批量删除、抽取或性能修复。
5. 运行局部测试。
6. 运行 `pbs-portal`、`pbs-server` 和根目录 PBS 回归验证。
7. 输出本批结果和下一批建议。

## 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 静态未引用误判动态入口 | 不删除路由、脚本、mock、测试 fixture，除非有入口级证据 |
| 抽象过度导致功能分叉 | 第一批只抽局部 helper，不建立大框架 |
| 性能优化破坏并发语义 | 不改 draftVersion、事务边界和稳定 key |
| 测试不足导致回归漏掉 | 修改前识别测试缺口，必要时先补测试 |
| 一次改动太大难定位问题 | 小批量提交式推进，每批独立验证 |

## 待确认事项

1. 用户已确认本轮范围只包含 `pbs-portal` 和 `pbs-server`。
2. 用户已要求修改完成后必须保证回归测试没有问题。
3. 待用户确认：是否按本 spec 进入第一批低风险审计与实施。

## 2026-04-29 补充：Pairing Search 时间条件拆分

用户确认继续优化 `pbs-server` 的 Pairing Search 条件构建，但明确要求不要拆得过碎。该小步采用“按业务族群拆分”的方式，只新增一个时间条件模块：

- 新增 `pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts`。
- 从 `pairing-search-condition-builder.ts` 迁移 `134 / 139 / 135 / 140 / 136 / 141` 六个时间和日期相关 preview condition。
- 保留 `pairing-search-condition-builder.ts` 作为调度层，继续承载 action/quantifier、layer、OR/AND 分组和剩余业务条件。
- 不继续把 layover、deadhead、fleet、connection 等剩余条件拆散，避免一函数一文件式过度抽象。
- 不改变 SQL 语义、参数顺序、API contract、认证/权限、事务语义或性能路径。
- 补充时间条件测试，重点锁定 SQL 片段和 `$n` 参数顺序。

## 2026-04-29 补充：Days Off 草稿 mapper 拆分

用户确认下一步转向 `pbs-server/src/services/days-off/days-off-bid-service.ts`，但继续遵守“不拆太碎”的边界。该小步只抽出 Days Off 草稿的纯数据整理逻辑：

- 新增 `pbs-server/src/services/days-off/days-off-draft-mappers.ts`。
- 迁移空草稿构造、property group key 规范化、snapshot row 到 draft property 的映射、保存草稿请求规范化、添加 property 请求规范化、favorite 请求规范化、add request 到 draft property 的映射。
- `loadDraftProperties`、favorite 读取、写库 SQL、事务、draftVersion、stable key、layer sync 和性能关键 SQL 仍保留在 `days-off-bid-service.ts`。
- 不改变 API contract、错误文案、rowSeq 规范化、propertyGroupKey 去重、bidContext 校验和 Days Off validation 触发点。
- 补充 mapper 单测，重点覆盖 propertyGroupKey 去重、rowSeq 重排、非法 property code、非 Current context、snapshot rows 合并 layer。

## 2026-04-29 补充：Days Off persistence mapper 拆分

用户确认继续优化 `days-off-bid-service.ts`，但不直接拆大 SQL。该小步只迁移写库前的纯数据准备逻辑：

- 新增 `pbs-server/src/services/days-off/days-off-persistence-mappers.ts`。
- 迁移 stable draft id 解析、普通保存用 group values 构造、stable save 用 group rows 构造。
- `insertDraftPropertyWithLayerSync`、`insertStableDraftPropertyWithLayerSync`、`saveStableCurrentDraftWithLayerSync` 的 CTE SQL、事务边界、draftVersion、layer sync、冲突检测和错误语义保持不变。
- 不改变性能路径；该拆分只减少 service 中的 inline 数据构造噪音。
- 补充 persistence mapper 单测，锁定 bid id 解析、非法 draftKey 错误、layer/property identity 映射、serialized bid、allOrNothing/minimumN 映射。

## 2026-04-29 补充：前端可用属性分页 footer 复用

用户确认从 `pbs-portal` 的 Pairing / Days Off 前端结构继续做小步优化，并要求不要拆得过碎。该小步只抽取重复的纯展示分页 footer：

- 新增 `pbs-portal/src/shared/components/pagination/available-properties-pagination-footer.tsx`。
- `pairing-right-panel.tsx` 与 `rule-bid-right-panel.tsx` 共用该 footer，保留各自的业务 state、保存、收藏、add/delete handler 和 query cache 同步逻辑。
- 页码输入的临时 UI 状态收束到 footer 内部，父组件只保留 `currentPage` 与 `onPageChange`。
- 清理 `pairing-right-panel.tsx` 中已无实际用途的 `addSectionRef`。
- 不改变 API contract、draftVersion、稳定 id/key、收藏/添加/删除请求、搜索 preview 请求和页面视觉结构。
- 暂不删除 `PairingSearchModal`，因为它疑似历史残留但还需要确认是废弃功能还是漏接入口。

## 2026-04-29 补充：Search Pairings preview 防抖

用户确认继续优化 `SearchPairingsPage` 的可读性和请求性能。该小步允许轻微改变 preview 请求触发时机，但不改变用户可见的搜索语义：

- 给 Pairing Search preview 的请求输入增加轻量防抖，目标是减少用户连续编辑 criteria bid / action / quantifier / layer 时的重复 preview 请求。
- 防抖只作用于 preview query 的请求参数；页面上的 criteria 编辑结果仍然即时展示。
- 保留现有 loading/refresh 行为：已渲染过 search shell 时，只刷新结果区域，不回到整页 loading。
- 收束重复的 criteria 更新流程，避免多个 handler 中散落 `setCurrentPage(1)`、`setLastPreviewResponse(null)` 和 `setCriteriaItems(...)`。
- 不改变 `/api/search-pairings/preview` contract、不改后端 SQL、不引入新依赖、不改变收藏、添加到当前 draft、layer 选择和 query cache 同步逻辑。
- 暂不删除 `PairingSearchModal` 与 `pairingService.previewSearch()`；它们作为疑似历史残留继续登记，后续单独确认。
- 回归测试需要覆盖：编辑 criteria 后不会立即以每个输入触发请求，而是在防抖完成后请求；结果区域刷新行为保持不变。

## 2026-04-29 补充：Pairing 旧搜索弹窗残留清理

用户确认继续检查 Pairing 前端是否还有可安全删除的历史残留。本次只清理已经有静态证据证明不可达的旧搜索弹窗路径：

- 删除 `pbs-portal/src/features/pairing/components/pairing-search-modal.tsx`。
- 删除 `pairing-right-panel.tsx` 中仅服务该旧弹窗的 `isSearchModalOpen`、`searchDraft`、弹窗 change/submit handler 和 render。
- 删除 `pairingService.previewSearch()`，当前生产代码的 Pairing Search preview 已统一走 `previewCriteria()` 和 `previewCurrentRules()`。
- 删除 `PairingRightPanelData` 与 mock 中只服务旧弹窗的 `modalTitle`、`searchActionLabel`、`pairingTypeOptions`、`addMoreButtonLabel`、`previewTitle`。
- 同步删除测试 setup 中不再需要的 `previewSearch` mock。
- 当时保留 `initialSearchForm`、`appliedSearch`、`cloneSearchForm` 和 `filterPairingAvailableProperties`，因为它们仍用于右侧 available properties 的本地过滤，后续再单独确认是否能继续收敛。
- 不改变 `/api/search-pairings/preview` contract、搜索结果页行为、右侧属性添加/收藏/删除、draftVersion、稳定 id/key 或后端 SQL。

## 2026-04-29 补充：Pairing 右侧属性过滤状态收敛

用户确认继续收敛旧搜索弹窗删除后留下的命名和状态结构。本次只做无行为变化的状态简化：

- 删除 `PairingRightPanel` 中不再被交互改变的 `appliedSearch` state。
- 将右侧 available properties 的基础过滤条件命名为 `availablePropertyFilter`，直接来自 `data.initialSearchForm`。
- 删除 `cloneSearchForm` helper、对应单测和 mock factory 残留；它只做浅拷贝，旧弹窗删除后已经没有生产价值。
- 保留 `initialSearchForm` 字段和 `filterPairingAvailableProperties`，因为它们仍定义右侧 available properties 的默认过滤范围。
- 不改变可用属性关键词过滤、tab 过滤、日期/类型过滤、分页、搜索结果页、API contract、draftVersion、稳定 id/key 或后端 SQL。

## 2026-04-29 补充：PairingBidControl 输入渲染收敛

用户确认继续做一处小范围可读性优化，但明确要求不要拆得太碎，且不能因为重构影响性能或功能。本次只处理 `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx`：

- 只在本文件内抽少量 helper / 小输入控件，收敛重复的 `number`、`date`、`time`、range 和 percent 输入渲染。
- 不新增一批小文件，不建立新的组件目录，不做“一函数一文件”式拆分。
- 不改变 `PairingBidValue` 类型、operator 转换、tag-list 交互、UI 文案、CSS 尺寸、aria label、API contract、搜索 preview 行为或后端 SQL。
- `transformBidForOperator`、`TagListControl` 和现有各 bid 类型的语义保持不变。
- 回归重点覆盖 `pairing-bid-control.test.tsx`、Pairing 页面和 Search Pairings 页面，最后继续运行 `npm run verify:pbs`。
