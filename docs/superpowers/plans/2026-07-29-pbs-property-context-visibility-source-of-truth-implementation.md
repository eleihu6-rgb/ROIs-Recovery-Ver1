# PBS 条件上下文可见性唯一数据源实施计划

日期：2026-07-29
对应设计：`docs/superpowers/specs/2026-07-29-pbs-property-context-visibility-source-of-truth-design.md`
执行方式：单主流程、分阶段、小步验证、不执行 Git 提交

## 1. 实施约束

- `pbs_bid_property_context` 是 Current、StandingLineholder、StandingReserve 条件目录的唯一显示来源。
- 删除运行时 property code 可见 allowlist；property registry 只负责类型、默认值、编辑器和校验。
- 数据库标记可见但 registry 缺失时明确报配置错误，禁止静默隐藏。
- Standing 只裁剪明确年月日，不决定目录项是否显示。
- 历史草稿读取与 Add Properties 可见目录分离，隐藏不能导致已有条件丢失。
- 保留工作树中所有既有改动，不修改无关文件。

## 2. 影响分析结果

- `resolveLineholderPropertyCatalog`：LOW。
- `resolveStandingPropertyCatalog`：LOW；直接影响 `loadCatalogs`，间接影响 Standing GET/Save。
- `pbsStandingLineholderPropertyCatalog`：LOW。
- `pbsBidProperty`：LOW。

实际业务风险高于静态图结果，因为 catalog 是 Current/Standing 创建、编辑、历史回显和保存的公共合同。
因此按数据库、后端、Portal、E2E 顺序验证，任一阶段失败不进入下一阶段。

## 3. 阶段一：数据库模型与迁移

### 写入范围

- `sql/schema/pbs/01-pbs.sql`
- `sql/migration/2026-07-29-pbs-property-context-visibility.sql`
- `sql/seed/10-pbs-bid-property.sql`
- `pbs-server/src/models/pbs/pbs-bid-property-context.ts`
- `pbs-server/src/models/index.ts`

### 工作

1. 新增 `pbs_bid_property_context`。
2. 增加 FK、context/visible check、唯一约束和查询索引。
3. 按已批准矩阵幂等写入 Current、StandingLineholder、StandingReserve。
4. 迁移不直接复制旧全局字段。
5. 暂不在第一步删除旧字段；先让所有 consumer 切换，最终阶段再停止/删除旧来源。

### 验证

- migration 结构检查。
- 远端 PostgreSQL transaction 内执行 migration 并回滚。
- 查询三个 context 的 code 集合与设计矩阵一致。

## 4. 阶段二：统一 context-aware catalog resolver

### 写入范围

- `pbs-server/src/services/lineholder/property-catalog.ts`
- 新增或复用 property registry 聚合模块
- Pairing、Days Off、Line、Reserve service catalog 调用
- Standing Bid service catalog 调用
- 对应 focused tests

### 工作

1. resolver 输入 `bidContext` 和完整 registry。
2. 查询 context 表作为显示唯一来源。
3. `catalog` 只返回 context 可见定义。
4. `catalogByCode` 保留所有 active、已实现定义用于历史草稿。
5. context 可见但 registry 缺失、inactive 时抛稳定配置错误。
6. 删除 Standing 专属 code allowlist。
7. Current 四类 service 使用 `Current` context。
8. Standing 使用 `StandingLineholder` / `StandingReserve` context。

### 验证

- Current/Standing context 目录 focused tests。
- 新旧字段冲突测试：context 必须胜出。
- registry 缺失和 inactive 冲突测试。

## 5. 阶段三：历史草稿和缓存

### 工作

1. 审计 Pairing、Days Off、Line、Reserve、Standing 中未知 definition 的 `continue`。
2. 历史隐藏条件仍可读取和保存。
3. 真正未知/未实现条件返回配置错误并阻止覆盖。
4. catalog cache key 加 context 和新版本。
5. 优先取消小型 property catalog 的跨请求缓存，保证刷新读取新配置。

### 验证

- 可见改隐藏后 Add 列表消失、Existing 仍存在。
- 整份保存不删除隐藏历史条件。
- context 数据变化后无需改代码即可改变 API catalog。

## 6. 阶段四：Portal 与 Standing 能力适配

### 工作

1. Portal 完全消费 API catalog，不维护显示 code 列表。
2. Standing Days Off 增加 204，移除 218。
3. Standing Roster 移除 410。
4. Standing Reserve 移除 312/313/314，只保留 301。
5. Pairing 目录由 context 表表达 102 差异。
6. Long Stretch Off / Compressed Flying 在 Standing 中隐藏绝对日期范围，保留长期配置。
7. 配置错误使用持久 recovery panel。

### 验证

- focused component/page tests。
- Current Bid 行为回归。
- `npm run check:ui`。

## 7. 阶段五：旧来源下线

### 工作

1. 全仓搜索旧 `is_visible_in_portal` consumer。
2. 确认所有运行时目录读取已迁移。
3. 删除旧 visibility/display order consumer。
4. 旧字段从 runtime model 移除并在 schema/migration 注释中明确废弃；为兼容历史 seed/migration 暂不物理删除，不得保留 fallback。
5. 删除 property code 可见 allowlist 和对应陈旧测试。

## 8. 阶段六：完整验证

- Database migration transaction smoke。
- pbs-server focused integration tests。
- pbs-server build。
- pbs-portal focused unit tests。
- pbs-portal lint/build。
- root UI standard gate。
- PBS Standing Playwright。
- Current Bid/Reserve/Days Off/Pairing/Roster Playwright 回归。
- `git diff --check`。
- GitNexus `detect-changes --scope compare --base-ref main`。

## 9. 完成标准

- 数据库 context 表是显示唯一来源。
- 运行时代码没有目录可见 code allowlist。
- 数据库切换可见值后刷新生效，无需部署。
- Current 与 Standing 可以数据库独立配置。
- Standing 仅裁剪绝对日期。
- 历史隐藏条件不丢失。
- 所有必需验证给出明确 PASS/FAIL 回执。
