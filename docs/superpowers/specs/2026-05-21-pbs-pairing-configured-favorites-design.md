# PBS Pairing 配置化收藏与新增弹窗对齐设计

## 背景

Days Off 已经调整为“收藏用户配置好的 bid”，而不是只收藏 property 模板。Pairing 当前仍偏向旧逻辑：`ALL PROPERTIES` 行内加号可以直接添加，红心收藏只保存 property 类型，`FAVORITED PROPERTIES` 也主要按模板收藏展示。

用户确认：当前仍是开发阶段，Pairing 旧模板收藏数据没有保留价值，可以清理或废弃。本次目标是让 Pairing 的新增逻辑和收藏语义与 Days Off 靠齐，同时保留 Pairing 自身的 `action`、`quantifier`、`Pairing Number` occurrence 选择等业务能力。

## 目标

- Pairing `ALL PROPERTIES` 点击加号后先打开配置弹窗，不直接新增 Existing。
- 配置弹窗底部提供 `CANCEL / SAVE FAVORITE / ADD BID`。
- `SAVE FAVORITE` 保存当前已配置的 Pairing bid 快照，不新增 Existing。
- `ADD BID` 继续使用现有 Pairing property 快路径新增 Existing。
- `FAVORITED PROPERTIES` 展示已经配置好的收藏项，点击加号直接新增 Existing。
- 废弃旧 Pairing 模板收藏语义，不再只保存 `propertyCode/propertyId`。
- 收藏项删除提供二次确认，交互风格与 Days Off 对齐。
- 新增 UI 文案必须走 i18n，不写死新文本。
- 常规新增、收藏、删除收藏接口目标响应时间 `<2s`。

## 非目标

- 不重做 Pairing Search 页面整体交互。
- 不改 Pairing 左侧日历数据源。
- 不改变现有 `pbs_bid_group` / `pbs_bid_tier` 作为 Pairing bid 条件主存储的语义。
- 不迁移 Tier、Line、Days Off 其他模块收藏语义。
- 不引入新的第三方 UI 或状态管理依赖。

## 当前确认

- 左侧日历 Pairing 和右侧 Pairing Number 已经统一写入 `pbs_bid_group` + `pbs_bid_tier`。
- Pairing 当前新增接口已经是 `POST /api/pairing-bids/current/properties`。
- Pairing 当前编辑/删除使用 `propertyGroupKey` 局部 mutation。
- 旧 `pbs_bid_pairing_favorite` 是模板收藏表，只保存 `bid_id/property_id/property_code`，无法表达已配置的 `bid/tiers/action/quantifier`。
- 用户确认旧 Pairing 模板收藏可以丢弃。

## 推荐方案

采用“配置化收藏快照 + Pairing 专属弹窗”的方案。

### 前端交互

1. `ALL PROPERTIES` 点击加号：
   - 打开 Pairing 配置弹窗。
   - 弹窗内显示 property 名称、bid 控件、action、quantifier、tiers。
   - 不再在列表行内直接提交新增。

2. 弹窗底部按钮：
   - `CANCEL`：关闭弹窗，不保存。
   - `SAVE FAVORITE`：保存当前配置为收藏，不添加到 Existing。
   - `ADD BID`：保存当前配置为 Existing property。

3. `Pairing Number` 特殊逻辑：
   - 保留现有 occurrence 选择能力。
   - 如果当前 property 是 `Pairing Number`，弹窗内仍要支持选择 Entire Month 或 Specific Date 的现有业务路径。
   - 保存到 favorite 时保存最终配置好的 `bid`，包括 `tag-list` 或 `tag-list-date` 语义。

4. `FAVORITED PROPERTIES`：
   - 展示配置化收藏项。
   - 显示收藏时保存的 bid、tiers、action、quantifier。
   - tiers 展示为只读/禁用状态，避免用户误以为可以直接在收藏区修改。
   - 点击收藏项加号直接调用 Existing 新增逻辑，不再打开配置弹窗。
   - 收藏项删除按钮使用二次确认。

5. 旧红心逻辑：
   - `ALL PROPERTIES` 外部模板红心不再作为 Pairing 收藏入口。
   - Pairing 收藏入口统一放在配置弹窗底部的 `SAVE FAVORITE`。

### 后端接口

新增或调整 Pairing 配置化收藏接口：

```http
POST /api/pairing-bids/current/favorites
```

请求体保存完整配置快照：

```json
{
  "draftKey": "2",
  "bidId": 2,
  "periodCode": "Apr 2026",
  "bidContext": "Current",
  "draftVersion": 1042,
  "property": {
    "propertyCode": 102,
    "name": "Pairing Number",
    "action": "award",
    "quantifier": null,
    "bid": {
      "type": "tag-list",
      "values": ["M4959"],
      "suggestions": []
    },
    "tiers": ["T1", "T2"]
  }
}
```

响应体返回 favorite 与 draft identity：

```json
{
  "saved": true,
  "draftKey": "2",
  "bidId": 2,
  "periodCode": "Apr 2026",
  "draftVersion": 1042,
  "favoriteKey": "123",
  "propertyId": 1002,
  "propertyCode": 102,
  "name": "Pairing Number",
  "action": "award",
  "quantifier": null,
  "bid": {
    "type": "tag-list",
    "values": ["M4959"],
    "suggestions": []
  },
  "tiers": ["T1", "T2"]
}
```

删除接口沿用稳定 favorite key：

```http
DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey
```

读取 current draft 时，`favoriteProperties` 返回配置化收藏快照。旧 `favoritePropertyCodes` 可保留兼容字段，但 Pairing 前端不再依赖它驱动收藏展示。

### 数据库设计

新增 Pairing 配置化收藏表，避免继续复用旧模板收藏表：

```text
pbs_bid_pairing_configured_favorite
- id
- bid_id
- property_id
- property_code
- property_name
- action_id
- quantifier
- bid_operator
- param_a
- param_b
- param_c
- tiers
- created_by / created_at / updated_by / updated_at
```

说明：

- `bid_id` 关联当前 crew/current bid。
- `property_id` 使用稳定 property definition id。
- `property_code` 仅用于展示和兼容。
- `tiers` 可存为逗号分隔或数组语义字段，实施时按项目现有 Drizzle/PostgreSQL 习惯选择。
- `bid_operator/param_a/param_b/param_c` 复用现有 `serializeRuleBid` 语义，避免新建一套不可读 JSON 协议。
- migration 清理旧 `pbs_bid_pairing_favorite` 中当前开发数据，或让新逻辑完全不读取旧表。

### 前端模块边界

优先保持 Pairing 当前模块边界：

- `pairing-service.ts`：新增配置化 favorite service 方法。
- `pairing-draft-mappers.ts`：把后端配置化 favorite 映射为前端可复用收藏行。
- `pairing-page-cache.ts`：增加配置化 favorite patch/unfavorite helper。
- `pairing-right-panel.tsx`：改新增入口为弹窗，接入 save favorite。
- 新建或扩展 Pairing 配置弹窗组件：承载 action、quantifier、bid、tiers、favorite/add 两种提交动作。

不建议本次把整个 Pairing 右侧面板迁到 `RuleBidRightPanel`，避免一次性影响 Pairing rules view、search preview、occurrence dialog 等更多路径。

## 校验与错误处理

- 保存 favorite 前复用 Pairing property 校验：
  - 至少一个 tier。
  - propertyCode 必须存在于 catalog。
  - bid value 必须符合该 property 的控件类型。
- `SAVE FAVORITE` 失败只提示统一 message，不新增 DOM 内重复错误面板。
- `ADD BID` 仍保留现有重复/冲突校验。
- draftVersion 过期返回 409，前端提示用户刷新后重试。
- 删除 favorite 找不到时按幂等处理或返回清晰错误，实施时以现有 Days Off 行为为准。

## 性能要求

- `POST /pairing-bids/current/properties` 保持现有快路径。
- `POST /pairing-bids/current/favorites` 目标 `<2s`。
- `DELETE /pairing-bids/current/favorites/by-key/:favoriteKey` 目标 `<2s`。
- `GET /pairing-bids/current` 不应因为配置化收藏明显变慢；读取 favorite 应按 `bid_id` 索引查询。
- migration 需要补充必要索引，例如：
  - `(bid_id)`
  - `(bid_id, property_id)`

## 测试计划

### 后端测试

- route 测试：
  - `POST /api/pairing-bids/current/favorites` 校验 payload 并调用 service。
  - `DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey` 按 favoriteKey 删除。
- service 测试：
  - 保存配置化 favorite 返回完整快照。
  - current draft 读取返回配置化 favorite。
  - 旧模板 favorite 不再影响 Pairing `FAVORITED PROPERTIES` 展示。
  - 无效 propertyCode / 空 tiers / 过期 draftVersion 返回正确错误。

### 前端测试

- service 测试：
  - Pairing favorite payload 包含完整 property 配置，而不是只传 propertyCode。
  - 删除 favorite 使用 favoriteKey。
- 页面/组件测试：
  - `ALL PROPERTIES` 点击加号打开弹窗。
  - `SAVE FAVORITE` 不新增 Existing，只出现在 `FAVORITED PROPERTIES`。
  - `ADD BID` 新增 Existing。
  - 收藏项点击加号直接新增 Existing。
  - 收藏项删除出现二次确认。
  - Pairing Number 保存 favorite 时保留 occurrence 语义。

### 人工回归测试

新增文档：

```text
docs/test-cases/pbs/pairing/2026-05-21-configured-favorites-regression.md
```

覆盖：

- 普通 Pairing property 配置后收藏。
- Pairing Number Entire Month 收藏。
- Pairing Number Specific Date 收藏。
- 收藏项直接新增 Existing。
- 删除收藏。
- 刷新页面后收藏仍按配置快照展示。

## 验收标准

- Pairing 新增交互与 Days Off 一致：先弹窗，底部有 `SAVE FAVORITE`。
- Pairing 收藏语义与 Days Off 一致：收藏配置好的 bid。
- `FAVORITED PROPERTIES` 不再只是模板收藏。
- 旧模板收藏数据不再影响 Pairing 页面。
- 新 UI 文案走 i18n。
- 后端、前端测试和人工测试用例齐全。
- 关键新增/收藏/删除接口正常情况下 `<2s`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次涉及 Pairing API contract、后端收藏持久化、前端 mapper、右侧面板交互和测试，语义强耦合；拆分多 agent 容易同时修改同一组文件。
- Suggested split: 不拆分，由主 agent 串行完成。
- Write boundaries: `packages/contracts`、`pbs-server/src/services/pairing`、`pbs-server/src/routes/pairing-bids.ts`、`pbs-portal/src/features/pairing`、`pbs-portal/src/shared/services/pairing-service.ts`、migration、test-case docs。
- Conflict risk: Medium，主要风险在 Pairing 现有手写面板与 Days Off 配置化收藏模式对齐。
- Execution gate: 用户确认本 spec 后再进入实现。

