# PBS Favorite 卡片编辑与展示重设计

## 1. 背景

当前 Bid 页面将 Days Off、Pairing、Line 的 Favorite 汇总在
`FAVORITED PROPERTIES`。Favorite 已调整为只保存条件模板，不保存 Tx；用户在卡片上临时选择
T1–T7 后直接加入 Existing Bid。

现有卡片仍存在以下问题：

- 只有很小的 `+` 和删除图标，主要操作不明确；
- 条件摘要使用类似只读输入框的灰色条，信息层级不清楚；
- T1–T7 没有明确说明这是本次复用时的临时 Tx；
- Favorite 无法从卡片直接编辑；
- Pairing 已有 Favorite PATCH 能力，但 Days Off、Line 尚未提供一致的修改接口。

## 2. 目标

- Days Off、Pairing、Line 三类 Favorite 均可编辑。
- 编辑只更新 Favorite 模板，不修改任何已经加入 `EXISTING BID PROPERTIES` 的条件。
- Favorite 编辑不选择、不保存、不校验 Tx。
- 重新设计 Favorite 卡片，使条件、临时 Tx 和操作区域清晰分层。
- 保持现有 Favorite 删除、Pairing Preview、直接添加和 draft version 并发保护能力。

## 3. 非目标

- 不修改 Existing Bid 的编辑流程。
- 不让 Favorite 重新持久化 `tiers`。
- 不新增 Favorite 历史版本或撤销功能。
- 不联动更新由该 Favorite 产生的 Existing Bid。
- 不改变 Favorite 搜索、分类分组或 Bid 页面滚动范围。
- 不恢复独立 Days Off、Pairing、Line 页面。

## 4. 用户交互

### 4.1 Favorite 卡片布局

每张 Favorite 卡片采用三个明确区域。

#### 顶部：名称与模板操作

- 左侧显示条件名称。
- 右侧显示模板级操作：
  - Days Off、Line：`Edit`、`Delete`；
  - Pairing：`Preview`、`Edit`、`Delete`。
- 操作使用与 Existing Bid 一致的图标语言，并提供可访问名称和 tooltip。
- `Delete` 保留现有二次确认；`Edit` 不经过确认。

#### 中部：条件摘要

- 使用小标题 `CONDITION` 和面向用户的自然语言摘要。
- 摘要作为正常信息内容展示，不再伪装成灰色输入框。
- action、quantifier、日期范围、时间、地点等 modifier 继续使用现有统一摘要方法生成；
  不展示原始 JSON、内部 ID 或数据库字段名。
- 长摘要允许自然换行，不横向滚动，不截断关键条件。

#### 底部：本次 Tx 与添加

- 左侧显示 `SELECT TX` 和 T1–T7 多选按钮。
- Tx 是当前卡片的临时 UI 状态，不属于 Favorite 模板。
- 右侧使用明确的主操作按钮 `ADD TO BID`，替代小型 `+` 图标。
- 未选择 Tx 时按钮禁用，并提供可访问说明 `Select at least one Tx`。
- 选择一个或多个 Tx 后，点击 `ADD TO BID` 复用现有 Add Bid mutation，不打开配置弹窗。

### 4.2 编辑 Favorite

点击 `Edit` 后：

1. 打开该类别现有的配置弹窗；
2. 回显 Favorite 保存的完整条件；
3. 弹窗进入 `favorite-edit` 模式；
4. 不显示 Tx/Tiers 区域；
5. 主按钮文案为 `UPDATE FAVORITE`；
6. `Cancel` 关闭弹窗且不修改模板。

编辑弹窗继续复用各条件已有的字段、校验和摘要，不另建第二套条件编辑器。

保存成功后：

- 原卡片就地更新名称、条件摘要和 modifier；
- 保留该卡片保存前已经临时选择的 Tx；
- 立即把响应中的最新 `draftKey`、`bidId`、`draftVersion` 合并到当前 Bid query cache/state；
- Existing Bid 列表不发生变化；
- 使用统一成功消息；
- 关闭编辑弹窗。

保存失败后：

- 弹窗保持打开；
- 用户已填写的内容不丢失；
- 卡片仍显示服务端最后一次成功保存的数据；
- 字段错误关联到对应输入控件；
- 普通短暂请求失败使用全局消息入口；
- draft version 409 使用持久冲突提示和 `Reload draft` 恢复操作，不暴露原始异常；
- 409 出现后，未提交表单先保留，用户仍能查看；点击 `Reload draft` 时明确提示将放弃本地未提交修改，
  然后用服务端最新 Favorite 和最新 draft identity/version 重建弹窗；
- Favorite 已被其他会话删除而返回 404 时，弹窗显示持久本地错误和 `Reload draft`、`Close`；
  reload 后从列表移除该 Favorite，并清理其临时 Tx，不能继续提交不存在的模板。

### 4.3 删除与临时 Tx

- 删除成功后移除 Favorite，并清理该 `favoriteKey` 对应的临时 Tx。
- 删除失败时卡片和临时 Tx 均保留。
- 编辑成功不清空临时 Tx。
- `ADD TO BID` 成功只清空当前卡片的临时 Tx。
- 搜索过滤导致卡片暂时隐藏时，不清空临时 Tx。
- Pairing `Preview` 往返 Search Pairings 时，在同一 Bid draft/period 内保留该卡片临时 Tx。
- 页面刷新、切换 Bid Period、重新登录或加载新草稿后，不恢复临时 Tx。

## 5. 前端设计

### 5.1 共享卡片结构

Pairing 与共享 Rule Bid 当前有两套 Favorite row 实现。实现时保持各自领域组件边界，但视觉结构和
交互契约必须一致：

- `FavoriteCardHeader`
- `FavoriteConditionSummary`
- `FavoriteTxActions`

只有确认三部分能在不扩大影响面的前提下稳定复用时才提取共享组件；否则在现有两个 row 中使用同一
布局规范，避免为了本需求做无关重构。

### 5.2 编辑状态

页面按稳定 `favoriteKey` 记录当前编辑对象，不使用列表索引、名称或 property code 作为身份。

配置弹窗增加明确的提交意图：

```text
add-bid | save-favorite | update-favorite | edit-existing
```

`update-favorite` 模式：

- 从 Favorite 条件初始化表单；
- 隐藏 Tx；
- 只执行条件完整性校验；
- 调用对应 Favorite PATCH；
- 不调用 Existing Bid PATCH。

Favorite PATCH pending 时进入当前草稿统一的结构写入串行边界：

- 禁止重复提交当前 Favorite PATCH；
- 暂时禁用同一草稿的 Favorite Edit/Delete、`ADD TO BID` 及其他结构写入；
- 响应中的最新 draft identity/version 合并完成后才解除禁用；
- 不能依靠两个并发请求各自携带同一个旧 `draftVersion`，再把客户端自身制造的 409 当作正常并发。

PATCH 成功响应必须先通过现有 cache helper 更新当前草稿 meta，再更新 Favorite 卡片。紧接着执行的
`ADD TO BID` 必须使用 PATCH 响应返回的新 `draftVersion`。

### 5.3 Pairing Preview

Pairing Favorite 保留独立 `Preview`：

- `Preview` 继续进入 Search Pairings；
- `Edit` 在 Bid 页面打开配置弹窗；
- 从 Search Pairings 修改 Favorite 时继续复用同一个 Favorite PATCH 契约；
- 两个入口均通过 `favoriteKey` 更新同一模板。
- 临时 Tx 放在 Bid workspace 按 draft/period 隔离的 UI state 中，Preview 路由往返不会偶然清空；
  显式刷新页面、切换 period 或加载另一草稿时清空。

## 6. API 契约

### 6.1 统一 PATCH

三类 Favorite 均提供：

```text
PATCH /api/{category}-bids/current/favorites/by-key/:favoriteKey
```

其中 `{category}` 为：

- `days-off`
- `pairing`
- `line`

Pairing 沿用现有 PATCH；Days Off、Line 新增等价能力。

### 6.2 请求

请求包含：

- `draftKey`
- `bidId`
- `periodCode`
- `draftVersion`
- 完整 Favorite 条件
- 类别特有 modifier

`propertyId/propertyCode` 是 Favorite 创建后不可变的类型身份。PATCH 只允许更新：

- `action`
- `quantifier`
- `bid`
- 类别特有 modifier

前端不得通过编辑弹窗改变 Property 类型；服务端以 URL 中的 `favoriteKey` 读取原身份，请求中的身份
如与原记录不一致，返回产品化 400。

客户端不得提交或修改 `created_by`、`created_at`、`updated_by`、`updated_at`。服务端保留创建审计
字段，并只依据认证 actor 和服务器时间更新 `updated_by`、`updated_at`。

请求不允许包含 `tiers`。三类 PATCH 顶层 schema 一律 strict；只有实际存在 `property` 或其他条件
嵌套 object 的类别，才要求对应嵌套 schema 同样 strict。Days Off 保持现有扁平 payload，不为了
统一外观强制改成嵌套结构。

### 6.3 响应

成功响应包含：

- 最新 `draftKey`
- 最新 `bidId`
- 递增后的 `draftVersion`
- `favoriteKey`
- 更新后的完整 Favorite 条件

响应不包含 `tiers`。

### 6.4 并发与身份

- 通过稳定 `favoriteKey` 定位记录。
- PATCH 在同一事务内校验并递增当前 Bid 的 `draftVersion`。
- 旧版本请求返回 409，不覆盖较新的 Favorite。
- Favorite 不存在返回产品化 404。
- Favorite 不属于当前 crew/period/context 时不得更新。

## 7. 数据库

- 不新增表或字段。
- 三张 configured Favorite 表继续不包含 `tiers`。
- Days Off、Line 仅新增应用层 PATCH 写入能力。
- 更新保留原 `id`、`favoriteKey`、归属关系与审计字段语义。
- 本需求不需要 migration。

## 8. 错误与可访问性

- `Edit`、`Preview`、`Delete` 图标必须有 `aria-label` 和键盘焦点样式。
- T1–T7 使用 `aria-pressed` 表示多选状态。
- `ADD TO BID` 使用真实按钮；禁用原因不能只依赖颜色。
- 字段级校验与字段关联。
- 409 使用持久 alert/recovery panel 和键盘可操作的 `Reload draft`。
- 点击 409 的 `Reload draft` 前明确说明本地未提交字段将被服务端版本替换。
- 404 使用持久本地恢复状态，不作为短暂 toast；reload 后移除已不存在的卡片。
- 不向用户显示 SQL、Axios、Zod、stack trace 或原始异常对象。
- 重复请求失败不得产生无限 toast。

## 9. 测试

### 9.1 前端单元/组件测试

Days Off、Line、Pairing 分别验证：

- Favorite 卡片显示 `CONDITION`、`SELECT TX`、`ADD TO BID`；
- 未选择 Tx 时 Add 禁用，选择后可添加；
- `Edit` 打开回显条件的弹窗；
- Favorite 编辑模式不显示 Tx；
- 保存调用 Favorite PATCH，而不是 Existing Bid PATCH；
- 更新成功刷新卡片但不修改 Existing Bid；
- 更新成功保留当前临时 Tx；
- PATCH 响应的新 draft identity/version 先写入 cache，随后 Add 使用新版本；
- PATCH pending 时重复提交及其他 draft 结构写入不可执行；
- 400 字段错误、404、409 和普通网络错误符合展示规范；
- 409 reload 明确放弃本地编辑并回显服务端最新模板；
- 404 reload 关闭编辑状态、移除卡片并清理临时 Tx；
- Pairing Preview 往返后，在同一 draft/period 内保留临时 Tx；
- 删除和 Add 的临时 Tx 清理边界正确。

### 9.2 后端测试

三类 PATCH 分别验证：

- 正常更新；
- request/response 不含 `tiers`；
- 三类顶层 legacy `tiers` 均被拒绝；Pairing、Line 等实际存在条件嵌套对象的类别，还要验证嵌套
  `tiers` 被拒绝；Days Off 保持扁平 contract；
- `favoriteKey` 稳定定位；
- Property 类型身份不可更换，身份不一致返回 400；
- draft version 原子递增；
- 并发旧版本返回 409；
- 跨 crew/period/context 不可修改；
- 不存在返回 404；
- Existing Bid 数据不被修改。

### 9.3 Playwright

通过真实 Bid 页面完成：

1. 打开 `FAVORITED PROPERTIES`；
2. 编辑 Days Off Favorite 并确认卡片摘要更新；
3. 确认 Existing Bid 未变化；
4. 在更新后的卡片选择多个 Tx；
5. 点击 `ADD TO BID`；
6. 确认 Existing Bid 出现更新后的条件和所选 Tx；
7. 对 Pairing、Line 至少各验证一个编辑路径；
8. 捕获三类 PATCH，确认使用稳定 `favoriteKey` 且请求不含 `tiers`；
9. 确认 PATCH 返回的新 `draftVersion` 被紧接着的 Add 使用；
10. 确认普通失败时弹窗保持、表单不丢失、卡片不变；
11. 确认 409 持久恢复、reload 替换本地编辑并可重新操作；
12. 确认 404 reload 后移除卡片并清理临时 Tx；
13. 确认 pending 重复点击只产生一次 PATCH，其他 draft 结构写入不可执行；
14. 确认 Pairing Preview 往返保留同一 draft/period 的临时 Tx；
15. 从 Search Pairings 编辑 Pairing Favorite，确认复用同一 `favoriteKey`、请求不含 `tiers`、
    使用最新 `draftVersion`，返回 Bid 后卡片显示更新后的模板；
16. 验证键盘可以访问 Edit、T1–T7、Add 和 Delete。

同时更新人工 QA：

```text
docs/test-cases/pbs/condition-properties/2026-07-27-configured-favorite-card-editing.md
```

## 10. 验收标准

- 三类 Favorite 均能从卡片编辑。
- 编辑只更新 Favorite，不联动 Existing Bid。
- Favorite 编辑弹窗不显示或要求 Tx。
- 卡片清楚区分条件摘要、临时 Tx 和 `ADD TO BID`。
- `ADD TO BID` 仅在选择 Tx 后可用。
- Pairing Preview、Favorite Delete、409 恢复能力不回归。
- API 和数据库继续不持久化 Favorite tiers。
- 前后端测试、Playwright、build、lint、`npm run check:ui` 全部通过。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 三类 Favorite 共享前端状态、配置弹窗模式和 draft version 契约，改动紧密耦合。
- Suggested split: 单代理依次完成共享交互、三个 PATCH、测试和文档。
- Write boundaries: Favorite 卡片、配置弹窗、Favorite route/service、相关测试。
- Conflict risk: 多代理会同时修改 Rule Bid、Pairing 共享组件和 contracts，冲突风险高。
- Execution gate: 本 spec 经用户确认后，先写实施计划，再开始代码修改。
