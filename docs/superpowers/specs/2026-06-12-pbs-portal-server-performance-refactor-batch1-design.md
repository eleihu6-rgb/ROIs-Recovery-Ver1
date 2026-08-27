# PBS Portal / Server 性能优化与重构第一批设计

日期：2026-06-12  
状态：用户授权 agent 自行写文档、自行核对后推进；不提交 git  
范围：第一批只落地 `pbs-portal` 中 Pairing / Rule Bids 右侧面板及其共用工具链；`pbs-server` 暂纳入审计与后续批次，不在第一批混改。

## 背景

本轮目标是从性能优化和长期维护角度治理 `pbs-server` 与 `pbs-portal`。用户明确要求：

- 只看 `pbs-server` 和 `pbs-portal`。
- 不提交 git，修改完成后由用户统一提交。
- 每个功能级改动都要有回归测试、单元测试和对应 QA 测试案例。
- 不机械堆 `for` 循环等低可读写法，优先使用更清晰的动态渲染、数据派生和模块化结构。
- 文件尽量不超过 500 行，但不为了压行数硬拆。
- 减少手写重复方法和常用组件，优先复用现有社区/项目模式。

只读扫描显示，当前第一批最适合从 `pbs-portal` 右侧面板入手：

| 文件 | 行数 | 问题信号 |
| --- | ---: | --- |
| `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx` | 1238 | 控件基础 UI、autocomplete、不同 bid 类型渲染混在同一文件 |
| `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx` | 1111 | 面板状态、列表派生、pool counts、mutation/cache patch、渲染集中 |
| `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx` | 1000 | 通用 Rule Bid 面板状态、mutation、分页、渲染集中 |
| `pbs-portal/src/features/rule-bids/utils.ts` | 566 | Rule Bid 纯逻辑较集中，但已有测试覆盖，可分批处理 |

`pbs-server` 中也有大文件和性能候选，例如 `rule-bid-value.ts`、`pairing-bid-service.ts`、`line-rules-export.ts`，但它们涉及序列化、draft 写入和算法导出语义。第一批不与 Portal 右侧面板混在一起，避免一次改动跨太多契约边界。

## 目标

1. 降低 Pairing / Rule Bids 右侧面板文件复杂度，让页面组件更像组合层。
2. 把纯数据派生、布局计算、hydration/reset、mutation cache patch 等逻辑拆到同 feature 的命名模块。
3. 保持现有用户可见行为、视觉结构、API contract、stable `id/key`、`draftVersion`、Tier 术语不变。
4. 避免把 `for` 循环替换成更慢或更难懂的 `reduce`。只有当声明式派生更清晰、或能减少重复计算/重复渲染时才调整写法。
5. 每个功能级改动配套自动化测试和 QA 测试案例。

## 非目标

- 不重做 PBS Portal 的视觉语言。
- 不改变 Pairing / Rule Bids 的业务规则。
- 不改 `pbs-server` API、数据库 schema、migration 或 SQL。
- 不引入新生产依赖。
- 不为了让文件低于 500 行而硬拆连续 DOM 或强行制造多层 props 传递。
- 不提交 git。

## 第一批设计

### 1. Pairing Right Panel 拆分边界

`pairing-right-panel.tsx` 保留为页面组合组件，继续负责：

- 读取 i18n、navigation、当前 active tier。
- 串联现有子组件和事件 handler。
- 保持现有 section 顺序和用户交互入口。

优先抽出：

- `pairing-right-panel-layout.ts`：viewport 宽度到表格布局的纯计算。
- `pairing-pool-counts.ts`：pool counts tier 解析、初始状态、summary 和 row map 派生。
- `pairing-right-panel-state.ts` 或同等轻量 helper：hydration key 相关 reset 数据准备，不搬 React hook 状态机。

第一批不拆：

- add / favorite / delete 业务 mutation 的全部流程，除非只是移动纯 cache patch helper。
- JSX 主结构中的连续 DOM 区块，避免产生过多 props。

### 2. Rule Bid Right Panel 拆分边界

`rule-bid-right-panel.tsx` 保留为通用面板组件，继续服务 Days Off / Line / Reserve 等页面。

优先抽出：

- 已存在的 `rule-bid-right-panel-layout.ts` 继续作为布局计算来源，不重复写 viewport 分支。
- 可将 hydration/reset 派生、available page 派生、pagination 派生补充到 `utils.ts` 或新建同 feature helper。
- 对重复状态更新流程做轻量封装，但不建立跨 Pairing / RuleBid 的大框架。

### 3. Pairing Bid Control 拆分边界

`pairing-bid-control.tsx` 当前包含基础输入控件、autocomplete 菜单和多种 bid 类型渲染。

优先抽出：

- `pairing-bid-control-inputs.tsx`：纯 UI 输入组件，如 date/time/duration/percent/unit/select/row。
- `pairing-bid-control-autocomplete.tsx`：tag list autocomplete 菜单和 hook。

保留：

- 顶层 `PairingBidControl` 的类型分发和业务语义。
- `pairing-bid-control-logic.ts` 中已有纯逻辑，不重复搬迁。

### 4. 性能策略

本批性能重点不是微优化语法，而是减少无意义计算和组件负担：

- 使用 `useMemo` 保持可见属性、分页、pool counts 派生稳定。
- 把布局分支和 pool counts summary 变成可测试纯函数。
- 保持 Zustand selector 读取，不订阅整 store。
- 避免在 render 主路径重复 `structuredClone`、重复构造大 Map，必要时移入 memo/helper。

## 测试计划

自动化测试：

- 更新或新增 `pairing-right-panel` 相关测试，覆盖 pool counts tier/summary 和现有 add/favorite/delete 交互不回退。
- 更新或新增 `rule-bid-right-panel-layout` / helper 测试，覆盖 viewport 布局和分页派生不变。
- 更新或新增 `pairing-bid-control` 测试，覆盖拆分后 autocomplete、duration、percent、date/dow 等核心输入仍可用。

QA 测试案例：

- 新增 `docs/test-cases/pbs/pairing/2026-06-12-pairing-right-panel-performance-refactor.md`。
- 新增 `docs/test-cases/pbs/rule-bids/2026-06-12-rule-bid-right-panel-performance-refactor.md`。

验证命令：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint
npm run build
```

## 第七批补充：pbs-server Rule Bid Value 契约拆分

日期：2026-06-12  
范围：`pbs-server/src/services/lineholder/rule-bid-value.ts` 及同目录 Rule Bid value helper。

### 背景

继续执行目标时，`rule-bid-value.ts` 已经超过 900 行，承担了类型定义、展示格式化、深拷贝、序列化、反序列化和 reserve date scope 解析等职责。该文件是 Lineholder rule bid 保存/读取链路的核心契约，风险点不在算法复杂度，而在一个文件内过多 switch / helper 混杂后难以审查、难以局部测试和难以避免后续重复实现。

### 调整设计

- 新增 `rule-bid-types.ts`，集中导出 `RuleBidValue`、`ReserveDateScope`、`RulePropertyDefinition`、`SerializedBid` 等稳定类型。
- 新增 `rule-bid-format.ts`，承载 `formatRuleBid`、`formatReserveDateScope` 和 day-of-week label 映射。
- 新增 `rule-bid-clone.ts`，承载 `cloneRuleBidValue` 与 reserve date scope 深拷贝。
- 新增 `rule-bid-serialize.ts`，承载 `serializeRuleBid` 的各类型序列化分支。
- 保留 `rule-bid-value.ts` 作为对外兼容入口，继续导出原有方法和类型，并聚焦 `deserializeRuleBid`、operator 提取、reserve date scope 解析。
- 不改变数据库字段、API payload、保存格式、UI 展示文本或既有测试断言。

### 性能与可维护性收益

- 序列化、格式化、拷贝各自按职责隔离，后续新增 bid 类型时能在单一文件定位变更。
- 减少超大文件内重复扫描和重复 helper 读取成本，核心入口从约 900 行降到 500 行以内。
- 深拷贝和格式化 helper 可被独立测试覆盖，避免在 UI / service 层重新手写同类逻辑。

### 测试补充

- 复用并回归 `rule-bid-value.test.ts` 对格式化、序列化、反序列化、date scope 和 clone contract 的覆盖。
- 新增 QA 用例：`docs/test-cases/pbs/rule-bids/2026-06-12-rule-bid-value-contract-refactor.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/lineholder/rule-bid-value.test.ts
npm run build
```

## 第八批补充：pbs-server Algorithm Export LINE_RULES 拆分

日期：2026-06-12  
范围：`pbs-server/src/services/algorithm-export/line-rules-export.ts` 及同目录 LINE_RULES helper。

### 背景

`line-rules-export.ts` 原文件约 900 行，混合了 SQL 查询、类型、CSV 计数汇总、静态 Rule ID 元数据、README 生成、Line / DaysOff / Reserve 参数 JSON 构建和 entry 构建。该文件服务于算法导出包，contract 稳定性要求高；继续在单文件中添加规则会让 Review 成本、重复参数构建风险和回归范围持续扩大。

### 调整设计

- 新增 `line-rules-types.ts`，集中放置导出 entry、DB row、skip event、counter row、loader options 类型。
- 新增 `line-rules-metadata.ts`，集中放置 tier 数量、CSV header、Rule ID 元数据、支持的 DaysOff / Reserve code set 和 catalog map。
- 新增 `line-rules-parameters.ts`，集中放置稳定 JSON 序列化、date scope 压缩和 Line bid 参数 JSON 构建。
- 新增 `line-rules-entry.ts`，集中构建 Line / DaysOff / Reserve 的 `LineRuleExportEntry`。
- 新增 `line-rules-csv.ts`，集中处理计数合并、排序和 CSV 序列化。
- 新增 `line-rules-readme.ts`，集中生成 `LINE_RULES.md` 内容。
- `line-rules-export.ts` 保留原公共导出路径，只负责 SQL 查询、skip 通知、period month day count 和调用拆分后的 helper。

### 性能与可维护性收益

- CSV 计数汇总仍使用 `Map` 按 crew/rule/params 聚合，避免重复扫描。
- 静态 metadata、catalog map 和 code set 从入口文件移出，后续新增 Rule ID 时定位更直接。
- 参数 JSON 构建与 entry 构建分层，减少算法导出与查询编排互相干扰。
- 入口文件从约 900 行降到约 120 行，新增文件均低于 500 行。

### 测试补充

- 复用 `line-rules-export.test.ts` 覆盖 CSV 聚合、skip unsupported property、Line Reserve Award/Avoid、README rule mapping。
- 新增 QA 用例：`docs/test-cases/pbs/algorithm-export/2026-06-12-line-rules-export-refactor.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/algorithm-export/line-rules-export.test.ts
npm run build
```

## 第九批补充：pbs-portal Pairing 配置弹窗拆分

日期：2026-06-12  
范围：`pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx` 及同目录 Pairing 配置弹窗 helper。

### 背景

`pairing-property-config-dialog.tsx` 原文件约 746 行，包含 draft clone、credit priority 保留、action / quantifier / credit priority 按钮组、Pairing Number run date 选择、footer pending 状态和保存确认构建。该弹窗是 Pairing 页面新增 bid、编辑配置、保存 favorite 的核心入口，适合按“纯 helper / 展示区块 / 主状态编排”拆分，而不应把保存 contract 或 query 状态拆散。

### 调整设计

- 新增 `pairing-property-config-draft.ts`，集中放置 draft 深拷贝、credit priority 可用性判断、设置和保留逻辑。
- 新增 `pairing-property-choice-group.tsx`，复用 action / quantifier / credit priority 的 segmented button 渲染。
- 新增 `pairing-property-run-section.tsx`，承载 Pairing Number entire-month / specific-date run 选择、loading/error/empty 状态和 confirmed runs 展示。
- 新增 `pairing-property-dialog-footer.tsx`，承载取消、保存 favorite、确认按钮的 pending / disabled 逻辑。
- 主 `pairing-property-config-dialog.tsx` 保留 dialog 生命周期、query、draft 状态、confirm draft 构建和 handlers。
- 不改变可见文案、按钮状态、Pairing Number bid 保存 payload、favorite 保存行为或测试 id。

### 性能与可维护性收益

- Run date 区块独立后，主弹窗 render 树更短，后续 Pairing Number 交互变更只需审查单一区块。
- 重复按钮组统一为配置驱动渲染，减少 action / quantifier / credit priority 三处 className 和 aria 状态重复。
- draft clone / credit priority helper 可复用，避免后续在 dialog 或 favorite 流程中再手写相同逻辑。
- 主弹窗降到 500 行以内，新增文件均低于 500 行。

### 测试补充

- 复用 `pairing-page.test.tsx` 中 Pairing Number entire-month、specific-date、favorite 保存、existing bid 配置等高层交互覆盖。
- 复用 `pairing-bid-control.test.tsx` 覆盖 bid control 输入 contract。
- 新增 QA 用例：`docs/test-cases/pbs/pairing/2026-06-12-pairing-property-config-dialog-refactor.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/components/pairing-bid-control.test.tsx
npm run lint
npm run build
```

## 第十批补充：pbs-server Pairing Bid Service 读模型拆分

日期：2026-06-12  
范围：`pbs-server/src/services/pairing/pairing-bid-service.ts` 与 `pairing-bid-read-model.ts`。

### 背景

`pairing-bid-service.ts` 是 Pairing 当前草稿、属性增删改、configured favorite 和保存整稿的核心事务编排文件。继续审查时发现其中 `loadDraftProperties` 与 `loadFavoriteProperties` 属于读模型组装逻辑：它们负责批量加载 group / tier / occurrence / favorite rows，再映射为前端 contract。这部分可以与写入事务安全分离；而 add / patch / save 的事务链路包含 draft version、advisory lock、tier sync、occurrence 写入和跨模块冲突校验，强拆会增加回归风险。

### 调整设计

- 新增 `pairing-bid-read-model.ts`，集中放置：
  - configured favorite rows 查询与 `PbsPairingFavoriteProperty` 映射。
  - draft group rows 与 occurrence rows 并行加载。
  - `Map` 按 `propertyGroupKey` 聚合 tiers 和 occurrence rows。
  - Pairing bid 反序列化、preference JSON 应用、occurrence-list bid 构建。
- `pairing-bid-service.ts` 继续保留：
  - property catalog/current period cache。
  - current draft 查询编排。
  - save/add/patch/remove/favorite mutation 事务。
  - day-off conflict 校验、tier sync、draft version 冲突处理。
- 不改变 API、数据库写入、draft version 策略、favorite key、Pairing Number occurrence payload 或错误消息。

### 性能与可维护性收益

- 读取 current draft 时保留原本的 `Promise.all` 并行加载 group rows 与 occurrence rows。
- occurrence rows 使用 `Map` 预分组，避免对每个 property 重复扫描 occurrence list。
- 读模型和写入事务分离后，后续优化 current draft 查询或 favorite 展示时不需要进入核心 mutation 文件。
- 服务主文件从约 935 行降到约 804 行；未继续强拆写入事务链路，避免为了行数牺牲可读性和原子性。

### 测试补充

- 复用 `pairing-bids.test.ts` 覆盖 current draft 读取、属性增删改、favorite 保存/删除、invalid payload 和兼容 login 等 API contract。
- 新增 QA 用例：`docs/test-cases/pbs/pairing/2026-06-12-pairing-bid-service-read-model-refactor.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/routes/pairing-bids.test.ts
npm run build
```

## 第五批补充：pbs-server Pairing Search Preview Mapper 拆分

日期：2026-06-12  
范围：`pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`。

### 背景

`pairing-search-preview-query.ts` 原文件同时包含 SQL 查询编排、分页、details 查询、时间格式化、base 时区日期处理、duty coverage 展开、legs 映射和分钟格式化。文件超过 800 行，且纯映射逻辑与数据库访问混在一起，后续优化 SQL 或调整 card 字段时难以隔离影响。

### 调整设计

- 新增 `pairing-search-preview-mapper.ts`，集中承载：
  - pairing summary / segment row 类型。
  - UTC timestamp SQL format helper。
  - base 时区日期、clock、分钟格式化。
  - duty coverage active dates 计算。
  - `mapPairingResult`。
- `pairing-search-preview-query.ts` 保留：
  - count query。
  - preview summary/page query。
  - segment loading。
  - details query。
  - period range 校验。
- 不改变 SQL 查询条件、API contract、分页语义、result shape 或前端调用。

### 测试补充

- 现有 `pairing-search-service.test.ts` 覆盖 preview 查询顺序、base 时区 duty coverage、空结果不加载 segments。
- 现有 `pairing-search-condition-builder.test.ts` 覆盖 preview condition 参数化和 property 语义。
- 现有 `routes/pairing-search.test.ts` 覆盖 route payload 和 response mode。
- 新增 QA 用例：`docs/test-cases/pbs/pairing-search/2026-06-12-preview-mapper-performance-refactor.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/pairing-search/pairing-search-service.test.ts src/services/pairing-search/pairing-search-condition-builder.test.ts src/routes/pairing-search.test.ts
npm test
npm run build
```

## 第六批补充：pbs-server Pairing Search Date / Day 条件去重

日期：2026-06-12  
范围：`pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`。

### 背景

Pairing search detail conditions 中，Duty On Date / Day 与 Layover On Date / Day 两个 property 分支重复实现了 date range 校验、dates 参数化、daysOfWeek 到 ISO DOW 映射、any/every quantifier 包装。重复逻辑增加后续修复风险，也容易让 SQL 参数顺序或错误消息出现分叉。

### 调整设计

- 新增 `pairing-search-date-or-dow-condition.ts`：
  - 统一处理 `date-range` 与 `date-or-dow-list`。
  - 统一校验非法 date range 和空 date/day。
  - 统一 any/every quantifier SQL 包装。
  - 保持所有日期值通过 `PairingSearchSqlBuilder.addParam` 参数化。
- `pairing-search-detail-conditions.ts` 中 110 / 123 分支只保留各自 source query、字段名和别名。
- 不改变 property code、SQL 语义、错误消息或 API contract。

### 测试补充

- 现有 `pairing-search-condition-builder.test.ts` 覆盖 duty/layover date/day、date range、avoid intent、every quantifier。
- 新增 QA 用例：`docs/test-cases/pbs/pairing-search/2026-06-12-detail-date-or-dow-condition-refactor.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- --run src/services/pairing-search/pairing-search-condition-builder.test.ts
npm test
npm run build
```

## 第四批补充：Rule Bid 纯工具拆分

日期：2026-06-12  
范围：`pbs-portal/src/features/rule-bids/utils.ts` 及同目录纯 helper。

### 背景

`rule-bids/utils.ts` 同时承载克隆、tier 合并、分页、搜索过滤、panel key 生成、保存错误解包等逻辑。文件行数超过 500，且不同职责之间没有强耦合。继续把所有纯函数集中在一个文件，会让后续 Rule Bid 页面变更难以判断影响范围。

### 调整设计

- 保留 `utils.ts` 作为兼容出口，避免页面、cache 和 mapper 调用方大范围改 import。
- 新增小模块：
  - `rule-bid-pagination.ts`：分页窗口、页码 clamp、available property page slice。
  - `rule-bid-filtering.ts`：All / Favorites / keyword 过滤和搜索文本规范化。
  - `rule-bid-panel-keys.ts`：hydration key 和 view reset key。
  - `rule-bid-errors.ts`：保存错误消息提取和 fallback。
- 不改变 Rule Bid 面板行为、UI 文案、数据结构或测试契约。

### 测试补充

拆分后的函数继续由 `utils.test.ts` 和 `rule-bid-page-cache.test.ts` 通过原公共出口覆盖；补跑整个 `src/features/rule-bids` 测试目录。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/features/rule-bids
npm run lint
npm run build
```

如果后续批次触达 `pbs-server`，再执行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test
npm run build
```

最终跨模块回归：

```bash
cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
```

## 验收标准

1. 第一批改动不改变 Pairing / Rule Bids 页面可见行为。
2. 右侧面板核心文件职责更清晰，纯计算逻辑可独立测试。
3. 不新增 `Layer/Lx` 术语，不破坏 Tier 规范。
4. 不新增请求直连、裸 `fetch` / `axios`，不绕过 `src/shared/services`。
5. 不提交 git。
6. 自动化测试、lint、build 按交付说明执行并记录结果。
7. QA 测试案例写入 `docs/test-cases/pbs/` 对应目录。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 第一批改动集中在 Portal 右侧面板，同一批文件之间共享类型、测试和组件结构。并行写代码容易产生 props 边界和测试 fixture 冲突。
- Suggested split: 不拆分 agent。由主 agent 先完成 spec、自检、实现、测试和汇报。
- Write boundaries: `pbs-portal/src/features/pairing/`、`pbs-portal/src/features/rule-bids/`、相关测试、`docs/test-cases/pbs/pairing/`、`docs/test-cases/pbs/rule-bids/`。
- Conflict risk: Medium。Pairing 和 RuleBid 右侧面板都有较多历史行为测试，拆分时必须小步验证。
- Execution gate: 用户已授权 agent 自行写文档、自行看和查；本批 spec 写入后不提交 git，直接进入小步实现。

## 第二批补充：pbs-server 日历 Pairing Event 合并

日期：2026-06-12  
范围：`pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts` 及其测试。

### 背景

继续执行目标时，`pbs-server` 扫描发现 `bidding-calendar-pairing-events.ts` 位于 500 行边界附近，且同 tier pairing event 合并时存在多组 metadata 分割、读取和去重逻辑。原实现使用数组 `includes` 在合并路径中累积去重，事件量增加时会产生不必要的线性扫描，也让主业务文件承担过多字符串 metadata helper 职责。

### 调整设计

- 新增 `bidding-calendar-pairing-event-metadata.ts`，集中放置 metadata split、read、unique、label helper。
- 合并 `pairingDateRanges` / `pairingBidEntries` 时改用 `Set` 一次性去重，保留原插入顺序，再对 bid entries 保持既有排序逻辑。
- 保持 `buildPairingEvents`、`findPairingDayOffConflicts` 对外 contract 不变。
- 不改 API、数据库、路由、schema 或前端调用。

### 测试补充

- 在 `bidding-calendar-service.test.ts` 新增重复 overlapping pairing event 合并用例，断言 `propertyGroupKeys`、`pairingNumbers`、`pairingBidEntries`、`pairingCount` 不重复堆叠。
- 新增 QA 用例：`docs/test-cases/pbs/pairing-calendar/2026-06-12-pairing-calendar-event-merge-metadata.md`。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test
npm run build
```

## 第三批补充：Portal 右侧面板展示层拆分

日期：2026-06-12  
范围：`pbs-portal` Pairing / Rule Bid 右侧面板展示层。

### 背景

第一批已抽出 Pairing bid control 和部分 Pairing 纯逻辑，但 `pairing-right-panel.tsx`、`rule-bid-right-panel.tsx` 仍把状态编排、mutation handler 和大段 JSX 放在同一文件中。继续硬拆 mutation 链路会增加回归面，因此本批只拆展示区块，保留主组件作为状态与服务编排层。

### 调整设计

- 新增 `pairing-right-panel-sections.tsx`，承载：
  - pool counts toolbar
  - existing properties / rules view
  - available properties tab、搜索、列表、分页
- 新增 `rule-bid-right-panel-sections.tsx`，承载：
  - validation / informational messages
  - existing properties list
  - available properties tab、搜索、列表、分页
  - add shortcut button
- 主组件继续保留：
  - hydration/reset
  - service mutation
  - query cache patch
  - navigation / dialog orchestration
- 不改变可见 UI、文案、测试 id、API contract 或保存行为。

### 测试补充

本批是展示层搬迁，未新增业务分支；回归覆盖使用现有高层测试：

- `pairing-page.test.tsx`
- `days-off-page.test.tsx`
- `line-page.test.tsx`
- `reserve-page.test.tsx`
- `shared-bidding-workbench-layout.test.tsx`
- `rule-bid-page-cache.test.ts`
- `rule-bids/utils.test.ts`

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint
npm run build
```
