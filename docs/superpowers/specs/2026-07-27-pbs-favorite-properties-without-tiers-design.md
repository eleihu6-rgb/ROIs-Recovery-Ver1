# PBS Favorite Properties 无 Tx 条件模板设计

日期：2026-07-27

## 1. 背景

当前 Pairing、Days Off、Line 的已配置 Favorite 会同时保存条件内容和 `tiers`。用户从
`FAVORITED PROPERTIES` 添加收藏时，系统直接复用收藏中的 Tx。

这个模型把两类不同决策绑定在一起：

- Favorite 表达“这个条件应该如何填写”；
- Tx 表达“本次 Bid 应把这个条件放到哪些 Tier”。

用户希望先收藏完整条件模板，之后每次使用收藏时再决定 T1–T7。Favorite 不应保存或恢复 Tx。

## 2. 目标

- Pairing、Days Off、Line 三类 Favorite 统一成为无 Tx 的完整条件模板。
- `SAVE FAVORITE` 只校验条件内容，不要求选择 Tx。
- `FAVORITED PROPERTIES` 卡片直接提供 T1–T7 多选和添加操作。
- 用户选好 Tx 后点击 `+`，直接添加到 `EXISTING BID PROPERTIES`，不再打开配置弹窗。
- Favorite request、response、前端类型和数据库表都不再包含 `tiers`。
- Existing Bid Property 继续保存 Tx，算法导出行为不变。

## 3. 非目标

- 不改变 Pairing、Days Off、Line 条件本身的业务语义或字段。
- 不改变 Existing Bid Property 的 Tx 多选规则。
- 不改变 Favorite 删除的二次确认。
- 不新增 Favorite 分类、重命名、排序或跨周期共享能力。
- 不改变 `TOP USED` / 推荐 Property 的定义；`recommendedPropertyCodes` 继续只影响 All Properties
  的排序和 `TOP USED` 标记，不进入 `FAVORITED PROPERTIES`。
- 不为旧 Favorite `tiers` API 保留兼容层。
- 不新增 Days Off 或 Line Favorite 编辑接口；Pairing 现有 Favorite PATCH 仅同步新的无 Tx contract。
- 不把 legacy/simple favorite 表迁入新模型。`pbs_bid_pairing_favorite`、
  `pbs_bid_property_favorite` 等旧表不作为本次 `favoriteProperties` 来源。

## 4. 核心语义

### 4.1 Favorite

Favorite 只保存条件模板：

- 稳定身份：`favoriteKey`、`propertyId`、`propertyCode`；
- 条件展示名；
- `action`、`quantifier`；
- 完整 `bid` payload；
- Days Off 专属 modifier，例如 `allOrNothing`、`minimumN`、`maximumN`；
- 创建与更新审计信息。

Favorite 不包含 `tiers`。

`favoriteProperties` 只来自以下三张 configured favorite 表：

- `pbs_bid_pairing_configured_favorite`
- `pbs_bid_days_off_favorite`
- `pbs_bid_line_favorite`

同一 `propertyCode` 的 catalog item 与 configured Favorite 是两个独立对象。前端以稳定
`favoriteKey` 区分 Favorite，不得按 `propertyCode` 覆盖 catalog item 或其他 Favorite。

### 4.2 Existing Bid Property

Existing Bid Property 继续保存：

- Favorite 条件内容的当次快照；
- 本次选择的一个或多个 Tx；
- 稳定 `propertyGroupKey`；
- Existing Bid 所需的排序和审计信息。

从 Favorite 添加后，后续修改 Existing Bid Property 不反向修改 Favorite。

## 5. 用户交互

### 5.1 添加条件弹窗

Pairing、Days Off、Line 的添加弹窗保留 `ADD BID` 和 `SAVE FAVORITE`：

- `ADD BID`
  - 校验条件配置完整；
  - 校验至少选择一个 Tx；
  - 把条件与 Tx 写入 Existing Bid。
- `SAVE FAVORITE`
  - 只校验条件配置完整；
  - 不校验 Tx；
  - 即使弹窗中已选择 Tx，也不把 Tx发送给 Favorite API；
  - 保存成功后刷新/更新 `FAVORITED PROPERTIES`。

条件字段不完整时，两个操作都保持禁用或显示现有字段级校验。只有未选择 Tx 时：

- `ADD BID` 不可用；
- `SAVE FAVORITE` 仍可用。

### 5.2 Favorite 卡片

每张 Favorite 卡片采用紧凑三层结构：

1. 条件名称；右侧保留删除操作。
2. 只读、面向用户的条件摘要。
3. `TX`、T1–T7 七个多选按钮和右侧 `+`。

交互规则：

- T1–T7 支持多选，选中态使用当前 PBS Tier 统一视觉样式。
- 每张卡片独立维护临时 Tx，不在卡片间共享。
- 未选择 Tx 时，`+` 处于不可执行状态，并通过始终可感知的说明解释“Select at least one Tx”。
  控件使用可聚焦的 `aria-disabled`，或者由可聚焦说明元素关联；不得只依赖无法聚焦的原生
  `disabled` 和颜色。
- 选择至少一个 Tx 后，点击 `+` 直接调用正常 Add Bid 接口，不打开配置弹窗。
- 添加成功后：
  - Existing Bid 列表出现该条件；
  - 显示本次选择的 Tx；
  - 清空这张 Favorite 卡片的临时 Tx；
  - 显示统一成功消息。
- 添加失败后：
  - 不修改 Existing Bid 列表；
  - 保留临时 Tx，允许直接重试；
  - 使用项目统一消息入口显示产品化错误文案。
- 搜索、分页和普通重渲染不得误清空临时 Tx。
- 页面刷新、切换 Bid Period、重新登录或重新获取新周期草稿后，临时 Tx 不恢复。
- 两张 Favorite 卡片的临时 Tx 相互隔离；成功添加一张卡片时只清空该卡片。

## 6. 前端状态与数据流

### 6.1 Favorite 映射

Pairing 和共享 Rule Bid 映射器从 Favorite response 构建卡片时：

- 复制完整条件内容；
- 初始化 T1–T7 为全部未选；
- 不从后端读取 Tx；
- 不把临时 Tx 当成 Favorite 数据写入 Query cache。

### 6.2 卡片临时 Tx

临时 Tx 属于页面交互状态，按稳定 `favoriteKey` 管理。它不是服务端状态，不写入数据库，也不进入
Favorite request/response。

Tier 控件以一个具名 group 呈现，T1–T7 使用 `aria-pressed` 表达选中状态，确保键盘和读屏用户
可以理解并切换多选状态。

### 6.3 直接添加

点击 `+` 时，前端组合：

```text
Favorite 条件模板 + 当前卡片临时 Tx + 最新 Draft identity/version
```

然后复用现有 Add Bid mutation。不得新增第二套写 Existing Bid 的接口或绕过 draft version 校验。

Favorite create/PATCH/delete 成功响应中的最新 `draftKey`、`bidId`、`draftVersion` 必须立即合并到页面
cache/state。特别是当前还没有 `pbs_bid` 的空草稿：

1. 首次 `SAVE FAVORITE` 创建 Bid identity；
2. 前端接收并保存该 identity；
3. 用户无需刷新即可在 Favorite 卡片选择 Tx 并添加；
4. Add Bid 使用刚返回的稳定 identity/version。

## 7. API Contract

Pairing、Days Off、Line 的 Favorite 创建和读取 contract 统一移除 `tiers`；Pairing 现有
Favorite PATCH 同步移除 `tiers`。本需求不新增 Days Off 或 Line Favorite PATCH。

### 7.1 Favorite 保存/修改请求

请求继续包含：

- draft identity/version；
- Property 稳定身份；
- 条件名称与配置；
- 类型专属 modifier。

请求不允许包含 `tiers`。三类 Favorite route 的请求顶层 schema 和嵌套 `property` schema 都必须
使用 `.strict()`；旧调用如果继续发送 `tiers`，应返回清晰的 400 契约错误，避免 Zod 默认剥离
未知字段后静默接受错误语义。

必须分别覆盖：

- Pairing Favorite POST；
- Pairing Favorite PATCH；
- Days Off Favorite POST；
- Line Favorite POST。

Days Off Favorite request 必须显式接受并 round-trip `action`，不能继续被 route schema 静默剥离。
Line Favorite response 中完整模板必需的 `name`、`bid` 改为必填；前端 mapper 不再通过可选字段
过滤合法 Favorite。

### 7.2 Favorite 响应

响应不返回 `tiers`。前端不得通过 fallback 自动补 T1。

### 7.3 Add Bid

Add Bid contract 不变，继续要求一个或多个 Tx，并继续执行：

- 条件业务校验；
- draft version 并发校验；
- Existing Bid 持久化；
- Pairing 日期/Days Off 冲突等现有领域校验。

Favorite create/PATCH/delete 都属于当前 Bid 的并发写入，必须：

- 接收最新 `draftVersion`；
- 在同一事务中原子校验并递增 `pbs_bid.draft_version`；
- 返回新的 `draftKey`、`bidId`、`draftVersion`；
- 第二个携带旧版本的并发请求返回 409，不得覆盖先完成的写入。

本需求不新增 Favorite 自身版本列，也不新增 Days Off/Line PATCH。真正把 Favorite 写入 Existing Bid
时，继续复用 Add Bid 的原子 draft version 校验。任何 Favorite mutation 或 Add Bid 发生 409 时，
前端进入可恢复的本地错误状态，保留当前卡片临时 Tx，并提供键盘可用的 `Reload draft` 操作。

## 8. 数据库设计与 Migration

从以下三张收藏表删除 `tiers`：

- `pbs_bid_pairing_configured_favorite`
- `pbs_bid_days_off_favorite`
- `pbs_bid_line_favorite`

同步修改：

- `sql/schema/pbs/01-pbs.sql`；
- 新增幂等 Migration；
- 三个 Drizzle model；
- Favorite read/write service；
- `live-server/src/services/crew-bid-import/crew-bid-import-service.ts`；
- `pbs-server/src/services/crew-bid-import/crew-bid-import-service.ts`；
- fixture、verifier 和算法导出回归中依赖旧列结构的路径。

Migration 行为：

- 保留 Favorite 行、稳定 `id`、条件 payload 和其他 modifier；
- 仅删除旧 `tiers` 列及其数据；
- 不删除现有 Favorite；
- 不把旧 Tx 迁移到其他字段；
- 提供列不存在、Favorite 数量未减少、条件 payload 未变化的验证查询；
- 在已配置的本地/SIT/UAT 三个 PBS schema 执行并验证。

Migration 完整性验证不能只比较数量和 `bid_payload`。每张表必须比较删列前后除 `tiers` 外的完整
业务行，至少覆盖：

- `id`、`property_id`、`property_code`、`favorite_name`；
- `action`、Pairing `quantifier`；
- `bid_payload`；
- Days Off modifiers；
- `created_by/at`、`updated_by/at`；
- identity sequence 的下一值不受影响。

Migration 及 verifier 必须支持二次执行。测试资产先按执行顺序分类：

- 会在最新无 `tiers` schema 上运行的 fixture/verifier，移除对 Favorite `tiers` 的读写；
- 用于重建或验证历史 migration 前置状态的历史 fixture 保持原状；
- 为本次 drop-column Migration 单独增加 pre-migration fixture、post-migration verifier 和
  second-run verifier。

### 8.1 Import backup/rollback

仓库中 `live-server` 和 `pbs-server` 各保留一套 crew-bid import snapshot/rollback 路径，本需求不做
架构合并，但两套都必须适配无 Tx Favorite：

- 新 snapshot 不记录 Favorite `tiers`；
- 迁移前旧 snapshot 恢复时显式丢弃 `tiers`；
- 其他 Favorite 字段和稳定 `id` 原样恢复；
- rollback 必须恢复 snapshot 中的 Favorite 行，不能只恢复 bid/tier/group/condition；
- 增加迁移前旧 snapshot 与迁移后新 snapshot 的 rollback 回归测试。

### 8.2 发布顺序

本次为 forward-only contract/schema 变更，不恢复旧 Favorite Tx。每个环境使用维护窗口：

1. 停止会读写旧 Favorite `tiers` 的 PBS Portal、PBS Server 和相关 import worker。
2. 部署无 Tx 的 contracts、PBS Server、PBS Portal、Live Server 代码。
3. 执行并验证 drop-column Migration。
4. 启动服务并执行 smoke/Playwright。

不得在旧服务仍运行时先删列。应用代码若回滚到旧版本，必须先执行单独的恢复 schema 操作增加空
`tiers` 列；旧 Tx 数据不会恢复。正常交付不提供回到旧 Favorite 语义的自动 down migration。

项目未上线，本次不提供旧 Favorite `tiers` contract 或 schema 兼容层。

## 9. 错误与可访问性

- 条件字段错误继续关联具体控件，不改成普通红色文本。
- 未选择 Tx 时通过可聚焦不可执行状态和始终可感知的说明表达，不只依赖颜色。
- Add Bid 的 draft version 冲突属于阻断继续操作的错误：使用卡片/页面局部持久 recovery state，
  提示刷新草稿并提供键盘可用的 `Reload draft`，不能只发短暂 toast。
- 不向用户展示原始 Axios、数据库、Zod 或异常堆栈。
- 重复点击期间禁用相关卡片 `+`，避免重复写入。
- 一个 Favorite 添加失败不影响其他 Favorite 卡片的临时 Tx。

## 10. 测试设计

### 10.1 后端

Pairing、Days Off、Line 分别覆盖：

- Favorite 保存请求不需要 Tx；
- Favorite 保存/修改/读取响应不含 Tx；
- 请求携带旧 `tiers` 被拒绝；
- Days Off `action` 完整 round-trip；
- Line Favorite `name`、`bid` 为必填完整模板；
- Migration 前后 Favorite 数量、稳定 id 和 payload 保持一致；
- Migration 二次执行成功且 identity sequence 不受影响；
- 两套 import rollback 都能恢复迁移前/迁移后 Favorite snapshot，旧 `tiers` 被丢弃；
- Favorite create/PATCH/delete 原子递增 draft version，第二个旧版本写入返回 409；
- Favorite mutation 响应返回并更新最新 draft identity/version；
- Add Bid 仍拒绝空 Tx；
- Add Bid 继续保存一个或多个 Tx；
- Add Bid draft version 冲突行为不变。

### 10.2 前端单元/组件测试

- 未选 Tx 时 `SAVE FAVORITE` 可用、`ADD BID` 不可用。
- 条件无效时两个操作都不可用。
- Favorite 卡片渲染 T1–T7，初始全部未选。
- T1–T7 支持多选和取消。
- 未选择 Tx 时 `+` 禁用。
- 点击 `+` 不打开弹窗，直接发送 Favorite 条件与临时 Tx。
- 成功后 Existing 更新且临时 Tx 清空。
- 失败后 Existing 不变且临时 Tx 保留。
- Favorite mutation 成功后页面 draft meta 更新为响应中的最新 identity/version。
- 空草稿首次保存 Favorite 后，无需刷新即可使用新 identity 直接添加。
- pending 期间重复点击只发送一次 mutation。
- 两张卡片的临时 Tx 相互隔离，成功只清空目标卡片。
- 搜索、分页和普通重渲染保留临时 Tx。
- 刷新、切周期和重新登录清空临时 Tx。
- Tier group/`aria-pressed`/不可执行说明具备可访问语义。
- Pairing、Days Off、Line 三类行为一致。

### 10.3 Playwright

使用真实 PBS Portal：

1. 分别创建 Pairing、Days Off、Line Favorite，保存时不选 Tx。
2. 捕获三类 Favorite 保存请求，确认请求不含 `tiers`。
3. 从没有 `pbs_bid` 的空草稿保存 Favorite，确认响应更新页面 draft identity/version；不刷新直接添加成功。
4. 刷新页面，确认三个 Favorite 条件仍存在且没有 Tx。
5. 验证未选 Tx 时 `+` 不可执行；选择多个 Tx 后可取消回零。
6. 点击 `+`，确认没有配置弹窗出现，Add Bid 请求包含精确 Tx 和最新 draft version。
7. 确认 Existing Bid 显示正确条件和 Tx。
8. 确认 pending 重复点击只产生一次写请求。
9. 确认添加成功后只清空目标卡片 Tx，另一张卡片不受影响。
10. 模拟普通失败和 409，确认 Existing 不变、Tx 保留；409 显示持久恢复操作。
11. 验证搜索、分页、普通重渲染不清空 Tx，刷新/切周期/重新登录会清空。
12. 重新加载确认 Favorite 本身仍没有 Tx。
13. 验证 `TOP USED` 仍只属于 All Properties，不进入 `FAVORITED PROPERTIES`。

### 10.4 QA 人工测试

新增：

`docs/test-cases/pbs/bid/2026-07-27-favorite-properties-without-tiers.md`

覆盖正常、多 Tx、未选 Tx、条件无效、添加失败、并发冲突、删除 Favorite 和刷新页面场景。

## 11. 验收标准

- Pairing、Days Off、Line 的 Favorite 数据均不包含 Tx。
- 三张 Favorite 表不存在 `tiers` 列。
- `SAVE FAVORITE` 不因未选 Tx 被禁用。
- `ADD BID` 仍要求至少一个 Tx。
- Favorite 卡片直接展示 T1–T7 多选和 `+`。
- 选好 Tx 后直接添加，不出现配置弹窗。
- 添加成功后 Existing 内容正确，临时 Tx 清空。
- 添加失败后临时 Tx 保留。
- 算法导出只消费 Existing Bid，结果不受 Favorite schema 调整影响。
- `live-server` algorithm-export focused test 证明删列前后导出包内容一致。
- `live-server` 与 `pbs-server` import snapshot/rollback 均适配无 Tx Favorite。
- 前后端自动化、Playwright、QA 案例、Migration 三库验证全部通过。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 三类 Favorite 共用 contract、共享 Rule Bid 组件和数据库语义，修改顺序高度耦合。
- Suggested split: 单一实现者按 contract → backend/schema → frontend → tests 串行完成。
- Write boundaries: `packages/contracts`、`pbs-server`、`pbs-portal`、`live-server`、`sql`、`e2e`、
  `docs/test-cases`。
- Conflict risk: 并行修改共享 Favorite 类型和通用卡片容易造成契约短暂不一致。
- Execution gate: 本 spec 经用户审核批准后，先编写实施计划，再开始代码修改。
