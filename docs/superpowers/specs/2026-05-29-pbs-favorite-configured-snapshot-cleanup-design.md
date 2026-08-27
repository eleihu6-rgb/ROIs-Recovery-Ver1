# PBS Favorite 配置快照语义统一与旧收藏清理设计

日期：2026-05-29  
状态：待用户确认  
范围：PBS Portal / PBS Server 中 DaysOff、Pairing、Line 的 `FAVORITED PROPERTIES` 收藏语义、API、数据库表与旧数据清理。

## 背景

当前我们已经确认一个产品语义：

```text
FAVORITED PROPERTIES 收藏的是“已经配置好的规则条件快照”，不是单纯收藏某个 property 模板。
```

DaysOff 已经按这个语义完成：

- 表：`pbs_bid_days_off_favorite`
- 保存内容：`property_code + bid_payload + tiers + all_or_nothing + minimum_n`
- Favorited 展示的是已配置规则，添加时直接按保存快照添加。

Pairing 和 Line 仍有旧语义残留：

- Pairing 主页面已经走 `pbs_bid_pairing_configured_favorite`，但旧表 `pbs_bid_pairing_favorite`、legacy favorite API、部分前端入口仍存在。
- Line 新增了 `pbs_bid_line_favorite`，但 `401-405` 普通 favorite 仍写 `pbs_bid_property_favorite`，只保存 `property_code`，没有保存用户选过的 tiers。

用户要求：可以分多轮做，但这几轮完成后，旧的模板收藏语义必须清理完。

## 目标

1. 统一 PBS favorite 语义：所有 Line / Pairing favorite 都保存配置快照。
2. Line 所有 favorite 都写 `pbs_bid_line_favorite`，包括 `401-405`。
3. Pairing 所有 favorite 都写 `pbs_bid_pairing_configured_favorite`。
4. 前端不再使用 legacy “按 propertyCode 收藏模板”的 API。
5. 后端不再读取 legacy favorite 表作为页面数据来源。
6. 数据库旧表中的现有数据要迁移或清理，避免页面出现旧语义收藏。
7. DaysOff 保持现状，不做破坏性重构。

## 当前状态

### DaysOff

状态：正确，不需要重做。

语义：

- 点击收藏保存完整配置快照。
- Favorite 记录包含 bid、tiers、modifier。
- Favorited 中直接添加已保存配置。

### Pairing

状态：主流程正确，但有 legacy 残留。

正确路径：

- `POST /pairing-bids/current/favorites`
- `pbs_bid_pairing_configured_favorite`
- 保存 `property_code + action + quantifier + bid_payload + tiers`

残留路径：

- `PUT /pairing-bids/current/favorites/:propertyCode`
- `pbs_bid_pairing_favorite`
- 只保存 property 模板。
- `pbs-portal/src/shared/services/pairing-service.ts` 仍有 `favoriteProperty(propertyCode, draftMeta)`。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx` 仍可能调用 legacy favorite。

### Line

状态：混合语义，需要统一。

正确路径：

- `POST /line-bids/current/favorites`
- `pbs_bid_line_favorite`
- `406-408` configured favorite 保存 bid + tiers。

残留路径：

- `PUT /line-bids/current/favorites/:propertyCode`
- `pbs_bid_property_favorite` 中 `bid_type='Line'`
- `401-405` 普通 favorite 只保存 propertyCode，没有保存用户选择的 tiers。

## 设计原则

### Favorite 是快照

Favorite row 必须包含添加规则所需的完整信息：

- propertyCode
- name / favoriteName
- bid payload
- active tiers
- Pairing 还包括 action / quantifier
- DaysOff 还包括 allOrNothing / minimumN

### All 里收藏，Favorited 里删除

前端交互保持：

- `ALL PROPERTIES`：用于选择 property、配置条件、保存 favorite。
- `FAVORITED PROPERTIES`：用于查看已保存 favorite、直接添加、删除 favorite。
- Favorited 中不再允许编辑 tiers 或 bid；需要改配置时重新保存一个 favorite。

### 删除旧语义，而不是继续兼容

这次目标是清理旧语义，不继续让新旧 favorite 长期共存。

允许短期在迁移阶段双读或兼容，但最终代码应满足：

- Line 不再读写 `pbs_bid_property_favorite`。
- Pairing 不再读写 `pbs_bid_pairing_favorite`。
- 前端不再调用 legacy `PUT /favorites/:propertyCode`。

## 分轮实施方案

### 第 1 轮：Line favorite 语义统一

范围：

- Line 前端收藏入口。
- Line service / routes / contracts。
- Line favorite 迁移脚本。

改动：

1. `lineService.favoriteProperty` 改为传完整 property，而不是只传 propertyCode。
2. `401-405` 点爱心时，把当前列表中的 `bid + active tiers` 保存到 `pbs_bid_line_favorite`。
3. `406-408` 继续通过弹窗 `SAVE FAVORITE` 保存到同一张表。
4. Line 后端停用 `saveFavoriteProperty(actor, propertyCode, request)` 的模板收藏写入逻辑。
5. Line 后端读取 favorite 只读 `pbs_bid_line_favorite`。
6. 迁移旧数据：
   - 读取 `pbs_bid_property_favorite where bid_type='Line'`。
   - 按 catalog 默认 bid 生成 `bid_payload`。
   - tiers 默认迁移为 `["T1"]`，因为旧表没有 tier 信息。
   - 插入 `pbs_bid_line_favorite`。
   - 删除旧 `Line` rows。

注意：

- 对旧数据默认迁移为 `T1` 是信息损失后的最保守选择；旧表本身没有 tiers，无法恢复用户当时选择。
- 新保存的数据必须保留真实 selected tiers。

### 第 2 轮：Pairing legacy favorite 清理

范围：

- Pairing 前端 legacy favorite 调用点。
- Pairing service / routes / contracts。
- Pairing old table migration / cleanup。

改动：

1. 检查 `pairingService.favoriteProperty` 的调用方，重点是 `search-pairings-page.tsx`。
2. 若搜索页仍需要收藏：
   - 改为保存配置快照。
   - 必须传 action / quantifier / bid / tiers。
   - 如果搜索页没有完整配置上下文，则取消搜索页模板收藏入口，避免继续制造旧语义。
3. Pairing 后端读取 favorite 只读 `pbs_bid_pairing_configured_favorite`。
4. 停用或删除 legacy route：
   - `PUT /pairing-bids/current/favorites/:propertyCode`
5. 迁移旧数据：
   - 读取 `pbs_bid_pairing_favorite`。
   - 按 catalog defaultAction / defaultQuantifier / defaultBid 生成 configured favorite。
   - tiers 默认 `["T1"]`。
   - 插入 `pbs_bid_pairing_configured_favorite`。
   - 清空 `pbs_bid_pairing_favorite`。

注意：

- Pairing 旧 favorite 只有 propertyCode，所以迁移只能还原默认配置，不可能恢复用户原始配置。
- 搜索页如果没有配置能力，不应该再保留收藏 property 模板的能力。

### 第 3 轮：旧表 / API 收口与回归

范围：

- contracts 清理。
- service interface 清理。
- 测试清理。
- 数据库确认。

改动：

1. 移除或废弃前端不再使用的 legacy service 方法：
   - `lineService.favoriteProperty(propertyCode, draftMeta)` 的旧签名。
   - `pairingService.favoriteProperty(propertyCode, draftMeta)` 的旧模板收藏用途。
2. 后端 service interface 不再暴露 legacy save favorite。
3. routes 测试删除 legacy favorite 用例，改成 configured favorite 用例。
4. 数据库确认：
   - `pbs_bid_property_favorite where bid_type in ('Line', 'Pairing')` 为 0。
   - `pbs_bid_pairing_favorite` 为 0。
5. 可选：保留表结构但不再读写，避免大范围 schema 删除；或新增 migration 注释标记 deprecated。

本轮建议先不 drop 表：

- `pbs_bid_property_favorite` 可能被其它 bid type 或历史脚本引用。
- `pbs_bid_pairing_favorite` 可以先清空并停止使用，后续 schema 整理再 drop。

## API 设计

### Line

保留：

```text
POST /line-bids/current/favorites
DELETE /line-bids/current/favorites/by-key/:favoriteKey
```

停止使用：

```text
PUT /line-bids/current/favorites/:propertyCode
```

Line favorite payload：

```json
{
  "draftKey": "...",
  "bidId": 123,
  "periodCode": "Apr 2026",
  "draftVersion": 2,
  "property": {
    "propertyCode": 401,
    "name": "Max Credit Window",
    "bid": { "type": "flag" },
    "tiers": ["T1", "T2"]
  }
}
```

### Pairing

保留：

```text
POST /pairing-bids/current/favorites
DELETE /pairing-bids/current/favorites/by-key/:favoriteKey
```

停止使用：

```text
PUT /pairing-bids/current/favorites/:propertyCode
```

Pairing favorite payload 继续使用已有 configured favorite payload：

```json
{
  "draftKey": "...",
  "bidId": 123,
  "periodCode": "Apr 2026",
  "draftVersion": 2,
  "property": {
    "propertyCode": 132,
    "name": "Pairing Length",
    "action": "award",
    "quantifier": "any",
    "bid": { "type": "stepper", "value": 3 },
    "tiers": ["T1"]
  }
}
```

## 数据迁移策略

### Line 旧数据

来源：

```sql
pbs_bid_property_favorite where bid_type = 'Line'
```

目标：

```sql
pbs_bid_line_favorite
```

迁移规则：

- `bid_id` 原样保留。
- `property_id` 原样保留。
- `property_code` 原样保留。
- `favorite_name` 使用 catalog property name，可为空时由读取逻辑 fallback。
- `bid_payload` 使用 Line catalog defaultBid。
- `tiers` 使用 `["T1"]`。
- 迁移完成后删除旧 `bid_type='Line'` rows。

### Pairing 旧数据

来源：

```sql
pbs_bid_pairing_favorite
```

目标：

```sql
pbs_bid_pairing_configured_favorite
```

迁移规则：

- `bid_id` 原样保留。
- `property_id` 原样保留。
- `property_code` 原样保留。
- `favorite_name` 使用 catalog property name，可为空时由读取逻辑 fallback。
- `action` 使用 catalog defaultAction。
- `quantifier` 使用 catalog defaultQuantifier。
- `bid_payload` 使用 catalog defaultBid。
- `tiers` 使用 `["T1"]`。
- 迁移完成后清空 `pbs_bid_pairing_favorite`。

## 不做范围

- 不改 DaysOff favorite 结构。
- 不 drop 数据库旧表，先停止读写并清空旧语义数据。
- 不实现 favorite 编辑功能。
- 不让 Favorited 中可修改 tier 或 bid。
- 不改变最终 optimizer 对 favorite 的解释；favorite 只是添加 bid 的模板快照。

## 验收标准

1. Line `401-405` 点爱心保存到 `pbs_bid_line_favorite`，并包含当前 selected tiers。
2. Line `406-408` 弹窗保存仍写 `pbs_bid_line_favorite`。
3. Line 页面不再读取 `pbs_bid_property_favorite` 的 Line rows。
4. Pairing 主页面保存 favorite 仍写 `pbs_bid_pairing_configured_favorite`。
5. Pairing 不再通过 legacy template favorite 入口制造 `pbs_bid_pairing_favorite` rows。
6. 迁移/清理后：
   - `pbs_bid_property_favorite where bid_type='Line'` 为 0。
   - `pbs_bid_pairing_favorite` 为 0。
7. Favorited tab 展示的所有项都能直接添加，并按保存时的 bid + tiers 添加。
8. 删除 favorite 使用 stable favorite key。
9. 相关前端测试、后端 route/service 测试、`pbs-portal build`、`pbs-server build` 通过。

## 测试计划

### 前端

- Line：
  - `401 Max Credit Window` 选择 T2 后收藏，service 收到 `tiers:["T2"]`。
  - Favorited 中该 favorite 显示只读 T2，点 `+` 按 T2 添加。
  - `406-408` 仍通过弹窗保存。
- Pairing：
  - 主 Pairing configured favorite 保存不回退。
  - 搜索页不再调用 legacy `favoriteProperty(propertyCode)`；如果保留收藏入口，则必须调用 configured favorite。

### 后端

- Line：
  - `POST /line-bids/current/favorites` 保存 `401` flag + tiers 成功。
  - `GET /line-bids/current` 返回 Line configured favorite。
  - legacy Line favorite rows 不再返回。
- Pairing：
  - configured favorite save/delete 通过。
  - legacy route 测试删除或改为返回不支持。
- Migration：
  - Line old rows 迁移到 `pbs_bid_line_favorite`。
  - Pairing old rows 迁移到 `pbs_bid_pairing_configured_favorite`。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务可拆成 Line 语义统一、Pairing legacy 清理、migration/test 三块，写入边界相对清晰；但 API contracts 需要主 agent 统一整合。
- Suggested split:
  - Agent A：Line 前后端 favorite 语义统一。
  - Agent B：Pairing legacy favorite 调用点排查与清理方案/实现。
  - Agent C：migration 和数据库验证脚本/测试。
- Write boundaries:
  - Agent A：`pbs-portal/src/features/line/*`、`pbs-portal/src/shared/services/line-service.ts`、`pbs-server/src/services/line/*`、`pbs-server/src/routes/line-bids.ts`。
  - Agent B：`pbs-portal/src/features/pairing/*`、`pbs-portal/src/shared/services/pairing-service.ts`、`pbs-server/src/services/pairing/*`、`pbs-server/src/routes/pairing-bids.ts`。
  - Agent C：`sql/migration/*`、相关 route/service tests。
- Conflict risk: Medium。contracts、models/index、shared rule-bid helpers 可能交叉，需要主 agent 串行整合。
- Execution gate: 用户确认本 spec 后，再分轮或分 agent 开始实现。
