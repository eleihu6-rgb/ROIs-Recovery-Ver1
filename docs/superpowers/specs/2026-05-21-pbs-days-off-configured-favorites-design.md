# PBS Days Off 已配置 Bid 收藏设计

日期：2026-05-21
状态：已确认并实施
范围：PBS Portal Days Off 新增条件弹窗、收藏列表展示、Days Off favorite contract/API/service、数据库收藏持久化、自动化测试和人工回归案例。

## 背景

当前 Days Off 收藏只保存 `propertyCode`，例如只收藏 `Prefer Off` 这个条件类型。它不会保存用户已经填写好的日期、Tx、`All or Nothing`、`Minimum required` 等配置。

这与用户期望的业务语义不一致。用户收藏的目的不是把条件入口置顶，而是保存一条已经配置好的 bid，下次可以快速复用。

正确语义应为：

- 用户在新增条件弹窗里配置好一条 Days Off bid。
- 点击收藏时，系统保存这条完整 bid 配置。
- 下次在 `FAVORITED PROPERTIES` 中点击这条收藏，直接添加到 Existing，不再二次确认。

## 目标

- Days Off 收藏保存完整配置快照，而不是只保存 property 类型。
- 新增条件弹窗底部增加收藏按钮，位置在 `CANCEL` 和 `ADD BID` 中间。
- 点击收藏按钮只保存收藏，不把条件添加到 Existing。
- 外部 property 列表的小红心入口去掉，避免继续误导为“收藏模板”。
- `FAVORITED PROPERTIES` 展示已配置好的收藏 bid。
- 点击收藏项直接添加到 Existing，使用收藏中的完整配置，不再打开弹窗确认。
- 同一个 propertyCode 可以收藏多条不同配置。
- 保持 Days Off 已有新增 / 编辑 / 删除 / 左侧日历逻辑不被破坏。

## 非目标

- 本次先不改 Pairing / Line 收藏语义，避免扩大风险。
- 本次不设计收藏分组、重命名、排序、拖拽等高级管理能力。
- 本次不改变 Days Off property 的业务校验语义，例如 `Prefer Off` 重叠仍按当前规则允许。
- 本次不恢复旧 `calendar-days-off` 链路。

## 交互设计

### 新增条件弹窗

当前 Days Off 新增条件弹窗底部按钮调整为：

```text
CANCEL    SAVE FAVORITE    ADD BID
```

行为：

- `CANCEL`：关闭弹窗，不保存。
- `SAVE FAVORITE`：保存当前弹窗中已经配置好的 bid 快照为收藏，成功后关闭弹窗并显示统一 message。
- `ADD BID`：保持原逻辑，把当前配置添加到 Existing。

收藏按钮必须使用当前弹窗里的完整状态：

- `propertyCode`
- `name`
- `bid`
- `tiers`
- `allOrNothing`
- `minimumN`

### 外部红心入口

移除 `ADD DAYS OFF PROPERTIES` 列表行上的红心按钮。

原因：

- 外部列表上的红心只能表达“收藏条件模板”，与本次确认的业务语义冲突。
- 收藏入口必须发生在用户已经配置好 bid 的上下文中。

### Favorited Properties

`FAVORITED PROPERTIES` 不再展示“property catalog 中被收藏的模板”，而是展示“已配置收藏 bid”。

用户点击收藏项：

- 直接调用新增 property API，把收藏快照添加到 Existing。
- 不再打开弹窗确认。
- 成功后 Existing 立即出现新 property。
- 失败时使用统一 message，不出现 panel 内重复红色错误块。

展示文案优先沿用 property name，必要时在行内显示配置摘要，例如日期、Tx 或 modifier 摘要。摘要只作为可读辅助，不作为保存身份。

## API 与数据设计

### 数据库

使用 Days Off 配置收藏专用表 `pbs_bid_days_off_favorite`，保存完整配置快照。

说明：

- 旧通用收藏表 `pbs_bid_property_favorite` 继续保留给 Line 等“收藏模板”语义使用。
- 当前开发库中旧通用收藏表与唯一索引 owner 不是 PBS app 连接用户，直接修改旧表结构和删除旧唯一索引会导致 migration 无法由 PBS 连接角色稳定执行。
- 使用专用表可以保留通用表 `(bid_id, bid_type, property_id)` 唯一约束，避免误伤 Line 收藏；Days Off 同 property 多收藏由专用表天然支持。

拟新增表字段：

- `favorite_name varchar(120)`：可选展示名，本次可先自动生成或为空。
- `bid_payload jsonb not null`：保存 serialized bid value。
- `tiers jsonb not null`：保存 Tx 列表，例如 `["T1","T2"]`。
- `all_or_nothing smallint not null default 0`
- `minimum_n smallint`

唯一性调整：

- 专用表不创建 `(bid_id, property_id)` 唯一约束，因为同一个 property 可以收藏多条不同配置。
- 新增普通索引：
  - `(bid_id)`
  - `(bid_id, property_id)`

是否需要防重复收藏：

- 本次不强制阻止重复收藏，保持简单可预测。
- 后续如客户反馈重复太多，再做“相同配置提示已存在”。

历史数据处理：

- 当前仍是开发环境，旧收藏数据可以直接删除，不做兼容回填。
- migration 清理旧通用表中 `bid_type='DaysOff'` 的模板收藏记录，再启用专用配置收藏表。
- 新增后所有 Days Off 收藏都必须写入完整快照。

### Contract

`PbsDaysOffFavoriteProperty` 需要从只包含 property identity，扩展为完整配置：

- `favoriteKey`
- `propertyId`
- `propertyCode`
- `name`
- `bid`
- `tiers`
- `allOrNothing`
- `minimumN`

新增保存收藏请求建议不再用 `PUT /favorites/:propertyCode` 只传 code，而是使用：

```text
POST /api/days-off-bids/current/favorites
```

请求体包含：

- `draftKey`
- `bidId`
- `periodCode`
- `draftVersion`
- `propertyCode`
- `bid`
- `tiers`
- `allOrNothing`
- `minimumN`

删除仍使用：

```text
DELETE /api/days-off-bids/current/favorites/by-key/:favoriteKey
```

### 前端数据映射

Days Off page data 中：

- `availableProperties` 仍来自 property catalog。
- `favoriteProperties` 映射成可直接新增的配置收藏列表。
- 收藏项不再通过 `favoritePropertyCodes` 给 available catalog 打星。

为了降低共享组件风险，可以先在 Days Off feature 内对 `RuleBidRightPanel` 做最小扩展：

- 支持隐藏 available row favorite action。
- 支持弹窗内 `onSaveFavorite`。
- 支持 favorited tab 使用 configured favorites。

## 校验与错误处理

- 保存收藏时应复用新增 bid 的前端校验，避免收藏无效配置。
- 后端也必须复用 Days Off property payload 校验。
- `SAVE FAVORITE` 不 bump 当前 draft 的 property 内容，但可以更新 favorite 表。
- 是否 bump `draftVersion`：
  - 推荐不 bump property draft version，因为收藏不是当前 bid 内容变更。
  - 返回值仍可携带当前 draft identity，便于前端缓存稳定。
- 错误提示统一走 message，不在右侧 panel 中出现额外 alert。

## 测试计划

### 前端自动化

- Days Off 新增弹窗展示 `SAVE FAVORITE`，位置在 `CANCEL` 与 `ADD BID` 中间。
- 点击 `SAVE FAVORITE` 会把当前配置传给 service，不调用 add property。
- 保存收藏成功后关闭弹窗并更新 `FAVORITED PROPERTIES`。
- 外部 property 行不再显示红心按钮。
- 点击收藏项直接调用 add property，把收藏快照添加到 Existing，不打开弹窗。
- 收藏项新增失败时回滚 UI 并显示 message。

### 后端自动化

- `POST /days-off-bids/current/favorites` 接收完整 bid 配置并持久化。
- `GET /days-off-bids/current` 返回 favorite 的完整 `bid/tiers/modifiers`。
- 同一个 propertyCode 支持多条不同收藏。
- 删除 favorite 仍按 stable `favoriteKey`。
- 清理旧模板收藏后，current draft 加载不再返回缺少配置快照的 favorite。

### 人工回归案例

- 配置 `Prefer Off` 日期和 Tx，点击 `SAVE FAVORITE`，确认 Existing 未新增。
- 切换到 `FAVORITED PROPERTIES`，点击刚收藏项，确认直接添加到 Existing。
- 刷新页面后收藏仍保留完整配置。
- 同一个 `Prefer Off` 保存两条不同配置，收藏列表能区分并分别添加。
- 删除收藏后刷新页面不再出现。
- Days Off 左侧小日历、Existing 编辑、删除仍正常。

## 验收标准

- 收藏保存的是完整已配置 bid，不再只是 propertyCode。
- 外部红心入口已移除。
- 新增弹窗里可以保存收藏，且不会误添加 Existing。
- 收藏项点击后直接添加 Existing。
- 同 propertyCode 多收藏可用。
- 自动化测试、lint、build 通过。
- 人工测试案例文档已更新。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次涉及数据库 migration、contract、后端 API、前端共享面板交互和 Days Off 页面缓存，契约必须一次性对齐；并行写容易造成字段或交互不一致。
- Suggested split: 不建议并行实现。
- Write boundaries: `packages/contracts/pbs-days-off-bids.*`、`pbs-server/src/routes/days-off-bids.ts`、`pbs-server/src/services/days-off/*`、`pbs-server/src/models/pbs/pbs-bid-property-favorite.ts`、`sql/migration/*`、`pbs-portal/src/features/days-off/*`、`pbs-portal/src/features/rule-bids/*`、测试与测试案例文档。
- Conflict risk: Medium。当前工作树已有 Days Off 日历和 mutation 性能相关改动，需要避免覆盖。
- Execution gate: 用户确认本 spec 后开始实现。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
