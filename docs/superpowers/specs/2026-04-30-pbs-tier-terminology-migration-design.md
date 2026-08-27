# PBS Layer 到 Tier 全栈术语迁移设计

日期：2026-04-30
作者：Codex
状态：已确认并已按本设计完成实现

## 背景

当前 `pbs-portal` 和 `pbs-server` 大量使用 `Layer / Layers / LAYERS / Lx` 表达 PBS 申请层级。用户确认后续项目术语应统一改为 `Tier / Tiers / TIERS / Tx`，并且不能只改前端展示，否则后续接手代码的人会在 `layer` 与 `tier` 两套概念之间混淆。

本次不是简单 UI 文案替换，而是 PBS 全栈业务概念迁移：

- 前端页面、路由、组件、状态、service、mock、测试、用户可见文案统一使用 `Tier/Tiers/Tx`。
- 后端 API contract、service、route、model、parser、错误提示、测试统一使用 `tier/tiers/Tx`。
- 数据库当前 schema 与新增 migration 统一迁到 `tier` 物理命名。
- `pbs-portal/AGENTS.md` 与 `pbs-server/AGENTS.md` 需要新增长期开发规范，避免后续开发重新写回 `Layer/Lx`。
- AA 文档原文里的 `Layer/Lx` 与本项目术语做显式区分：AA 原文 Layer，对应本项目 Tier。

## 已确认决定

1. 前后端所有 PBS 业务层级相关命名都迁移为 `Tier`。
2. 数据库物理层也迁移，不保留 `pbs_bid_layer` / `layer` 作为新代码主命名。
3. 使用新增 migration 迁移现有数据库；不重写历史已执行 migration 文件。
4. 正式路由改为 `/tier`。
5. 旧 `/layer` 不保留 redirect，访问旧地址应进入 404。
6. 大小写按原语境保留风格，只替换词根：
   - `Layer` -> `Tier`
   - `Layers` -> `Tiers`
   - `LAYERS` -> `TIERS`
   - `layer/layers` -> `tier/tiers`
   - `L1-L7` -> `T1-T7`
   - `Lx` -> `Tx`
7. 旧设计文档和历史 migration 中作为历史记录存在的 `Layer/Lx` 不做大规模重写；新规范、新实现、新测试、新交付说明必须使用 `Tier/Tx`。

## 目标

1. 让 PBS Portal 用户界面只出现 `Tier/TIERS/Tx`。
2. 让 PBS 前后端开发者面对同一套概念命名，避免 `layer` 与 `tier` 混用。
3. 让 API contract 只接受并返回 `tier/tiers/Tx`。
4. 让数据库当前 schema、Drizzle model、约束、索引、注释都反映 `tier` 语义。
5. 明确 AA 文档术语边界，防止后续以 AA 原文为理由把代码重新命名成 `Layer`。
6. 完成后通过 PBS 全量回归验证。

## 不做范围

- 不重写历史 migration 文件中已经落库的 `Layer/Lx` 文案。
- 不批量重写旧设计文档的历史叙述；必要时只在新 spec 和规范中说明术语映射。
- 不改变 PBS tier 的业务含义、排序语义、draftVersion、stable key、并发控制或校验规则。
- 不借本次迁移重做 Pairing、Days Off、Line、Award 的业务流程。
- 不引入新的生产依赖。
- 非 PBS 业务概念中的普通英文 `layer`，例如视觉堆叠、CSS layering、框架分层说明，不作为强制迁移对象；但如果它表达 PBS 申请层级，则必须迁移。

## 术语映射

| 旧术语 | 新术语 | 说明 |
| --- | --- | --- |
| Layer | Tier | 页面名、组件名、业务概念 |
| Layers | Tiers | 复数展示和类型名 |
| LAYERS | TIERS | 表头、区块标题 |
| layer | tier | 变量、字段、普通文案 |
| layers | tiers | 数组、请求体、响应体 |
| L1 | T1 | UI 标签、错误提示、测试数据 |
| L1-L7 | T1-T7 | Portal 当前展示范围 |
| L1-L24 | T1-T24 | 后端/数据库最大范围 |

AA 对齐文档引用规则：

- 引用 AA 原文时可以写“AA 原文 Layer”。
- 解释当前系统实现时必须写“本项目 Tier”。
- 不允许新代码、新 API、新 UI 文案继续使用 AA 原文的 `Layer/Lx` 作为项目术语。

## 数据库设计

数据库采用“新增 migration + 更新当前 schema”的方式。

### 物理命名迁移

需要迁移的核心对象包括但不限于：

- `pbs_bid_layer` -> `pbs_bid_tier`
- `pbs_bid_layer.layer` -> `pbs_bid_tier.tier`
- `pbs_bid.total_layers` -> `pbs_bid.total_tiers`
- `pbs_period.max_layers` -> `pbs_period.max_tiers`
- `pbs_bid_day_off.layer` -> `pbs_bid_day_off.tier`
- `pbs_award_result.awarded_layer` -> `pbs_award_result.awarded_tier`
- `pbs_award_item.matched_layer` -> `pbs_award_item.matched_tier`
- 相关索引、唯一约束、注释从 `layer` 改为 `tier`
- `property_group_key` 注释中的“跨 layer”改为“跨 tier”

### 参数迁移

- `PBS_MAX_LAYERS` 迁移为 `PBS_MAX_TIERS`。
- 新代码只读取 `PBS_MAX_TIERS`。
- migration 或 seed 需要确保新参数存在，旧参数不作为新代码读取来源。

### 数据迁移原则

- 不丢弃现有数据。
- 使用 `ALTER TABLE ... RENAME TO`、`ALTER TABLE ... RENAME COLUMN` 等方式保留数据。
- 迁移后补充验证查询，确保记录数、唯一约束和关键关系仍然成立。
- 历史 migration 不回改；`sql/schema/03-pbs_pg.sql` 作为新装库基准需要更新为 tier 物理命名。

## 后端设计

### API Contract

PBS 后端不保留旧字段兼容层：

- 请求体 `layers` 改为 `tiers`。
- 请求体 `layer` 改为 `tier`。
- 响应体 `layers` 改为 `tiers`。
- 响应体 `layer` 改为 `tier`。
- 字符串标签只接受 `T1`、`T2` 等 `Tx`。
- 传入 `L1` 或 `layers` 应返回 400 或 schema validation 错误。

### 代码命名

后端需要迁移的命名包括但不限于：

- Drizzle model：`pbsBidLayer` -> `pbsBidTier`
- 文件：`pbs-bid-layer.ts` -> `pbs-bid-tier.ts`
- shared helper：`parseLayerKey` -> `parseTierKey`
- validation helper：`parseLayerNumber` -> `parseTierNumber`
- service 内变量：`layer` / `layers` -> `tier` / `tiers`
- route schema：`layers` -> `tiers`
- lineholder summary：`layer` statistics -> `tier` statistics
- pairing search current rule preview：`layer` -> `tier`

### 错误提示

用户可见和测试断言中的错误提示同步迁移：

- `Unsupported lineholder layer: L8` -> `Unsupported lineholder tier: T8`
- `Unsupported pairing search layer: A1` -> `Unsupported pairing search tier: A1`
- `This pairing condition already exists in L1.` -> `This pairing condition already exists in T1.`
- `Only one maximize or string Days Off property can be active in L1.` -> `Only one maximize or string Days Off property can be active in T1.`

### 兼容策略

本次不做旧 contract 兼容。原因：

- 用户明确要求所有涉及处都改，避免后续接手混乱。
- 保留双字段会让 `layer/tier` 混用继续存在。
- 让旧调用快速失败有助于发现漏迁移入口。

## 前端设计

### 路由与导航

- 顶部导航 `Layer` 改为 `Tier`。
- nav key 从 `layer` 改为 `tier`。
- 正式路由从 `/layer` 改为 `/tier`。
- `auth-return-to` 安全白名单移除 `/layer`，加入 `/tier`。
- 旧 `/layer` 不注册、不 redirect，进入 404。

### 目录与组件

迁移命名包括但不限于：

- `src/features/layer` -> `src/features/tier`
- `LayerPage` -> `TierPage`
- `layer-page.tsx` -> `tier-page.tsx`
- `LayerRightPanel` -> `TierRightPanel`
- `layer-draft-mappers.ts` -> `tier-draft-mappers.ts`
- `use-layer-page-data.ts` -> `use-tier-page-data.ts`
- `src/shared/services/layer-service.ts` -> `tier-service.ts`
- `src/shared/components/layers` -> `src/shared/components/tiers`
- `LayerToggleGroup` -> `TierToggleGroup`
- `ScheduleLayerMatrix` -> `ScheduleTierMatrix`

### 状态与数据

- `activeLayerLabel` -> `activeTierLabel`
- `resetActiveLayerLabel` -> `resetActiveTierLabel`
- `layerLabel` -> `tierLabel`
- `selectedLayer` -> `selectedTier`
- `onSelectLayer` -> `onSelectTier`
- `layers` 数据结构改为 `tiers`
- 默认标签 `L1` 改为 `T1`
- 用户可选范围展示 `L1-L7` 改为 `T1-T7`

### UI 文案

- `LAYERS` -> `TIERS`
- `Layer options` -> `Tier options`
- `Toggle L1` -> `Toggle T1`
- `Layer matrix rows` -> `Tier matrix rows`
- `L1 heatmap` -> `T1 heatmap`
- “当前选中的 layer” 等中文开发说明改为“当前选中的 tier”

## 文档规范更新

需要更新：

- `pbs-portal/AGENTS.md`
- `pbs-server/AGENTS.md`

新增规范要点：

1. PBS Portal / Server 中表达申请层级时统一使用 `Tier/Tiers/Tx`。
2. 禁止新增 `Layer/Layers/Lx` 作为 PBS 业务术语。
3. 如果引用 AA 文档，必须说明“AA 原文 Layer，对应本项目 Tier”。
4. API、类型、测试、mock、UI 文案、数据库模型都应使用 tier 命名。
5. 旧 `/layer` 路由不保留兼容入口，新页面路由为 `/tier`。
6. 只有历史 migration、历史设计文档、非 PBS 业务含义的普通英文 `layer` 可以保留。

## 实施顺序

### 1. 规范与迁移清单

- 写入本设计文档。
- 后续实现时先更新 `pbs-portal/AGENTS.md` 和 `pbs-server/AGENTS.md`。
- 明确残留扫描豁免范围。

### 2. 数据库与后端基础层

- 新增 SQL migration。
- 更新 `sql/schema/03-pbs_pg.sql`。
- 更新 Drizzle model 和 model export。
- 更新 shared parser/helper。
- 更新 route zod schema。
- 更新 service 入参、出参、SQL 引用和错误提示。
- 更新后端测试，并补充旧 `Lx` 拒绝测试。

### 3. 前端基础层

- 更新路由 `/tier`、导航、return-to 白名单。
- 迁移 feature/shared 目录和组件命名。
- 更新 service mapper、类型、store、query key、mock。
- 更新前端测试断言。

### 4. 业务页面联调

- Pairing、Search Pairings、Days Off、Line、Dashboard schedule、Award/Summary 全部从 tier contract 读写。
- 保持 draftVersion、stable key、favorite/add/delete、search preview、calendar state 语义不变。
- 确认 `/layer` 进入 404。

### 5. 回归与残留扫描

- 运行 PBS 全量验证。
- 扫描 `pbs-portal`、`pbs-server`、`sql/schema`、新增规范文档中的 `Layer/Layers/LAYERS/layer/layers/L[0-9]` 残留。
- 对允许残留项在交付说明中列出原因。

## 测试计划

### 后端

- `pbs-server npm test`
- `pbs-server npm run build`
- `npm run sync:pbs-users -- --dry-run`，如本次改动触及 verify 脚本要求
- Route 测试：
  - Pairing draft 使用 `tiers: ["T1"]`
  - Days Off draft 使用 `tiers: ["T1"]`
  - Line draft 使用 `tiers: ["T1"]`
  - Calendar days off 使用 `tier: "T1"`
  - Pairing search preview 使用 `tier: "T1"`
  - 旧 `L1` 被拒绝
  - 旧 `layers` 字段被拒绝

### 前端

- `pbs-portal npm test`
- `pbs-portal npm run lint`
- `pbs-portal npm run build`
- 路由测试：
  - `/tier` 渲染 Tier 页面
  - `/layer` 进入 404
  - return-to 允许 `/tier`，不允许 `/layer`
- UI 测试：
  - 顶部导航显示 `Tier`
  - toggle aria label 使用 `Toggle T1`
  - 共享日历跨页面保持 selected tier
  - Pairing / Days Off / Search Pairings 请求体使用 `tiers`

### 根目录验证

最终执行：

```bash
cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
```

## 风险与控制

| 风险 | 控制 |
| --- | --- |
| DB rename 影响已有数据 | 使用新增 migration，保留数据并增加验证查询 |
| 前后端 contract 不同步 | 同批更新 service、route、mock、测试，不保留双字段 |
| 全局替换误伤普通英文 layer | 以 PBS 业务语义为判断标准，非业务 layer 可保留 |
| 旧 `/layer` 访问中断 | 用户已确认不保留 redirect，测试应锁定 404 |
| AA 文档继续引入 Layer 术语 | 在 AGENTS 规范中明确 AA Layer = 本项目 Tier |
| 改动面过大难定位问题 | 按数据库/后端、前端基础层、业务页面、验证扫描分批实施 |

## 验收标准

1. 用户可见界面统一显示 `Tier/TIERS/Tx`。
2. `/tier` 可用，`/layer` 进入 404。
3. API 只接受并返回 `tier/tiers/Tx`。
4. 数据库当前 schema 和新增 migration 使用 tier 物理命名。
5. `pbs-portal/AGENTS.md` 与 `pbs-server/AGENTS.md` 明确记录 Tier 术语规范和 AA 区分规则。
6. PBS 业务代码、测试、mock 中不再出现表达业务层级的 `Layer/Layers/Lx`。
7. 允许残留项仅限历史 migration、历史设计文档、AA 原文引用或非 PBS 业务含义。
8. `npm run verify:pbs` 通过。

## 实现状态

用户已确认按本 spec 实现。实现完成后应以交付说明和验证结果为准继续维护。
