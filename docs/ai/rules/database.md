# Database rules — full rule text

> Detail for §Remote-DB-Only, connection info and data-model design rules summarised in root `CLAUDE.md`. Moved here 2026-09-12.

## 数据库

### §Remote-DB-Only — 查询必须打远端库（强制）

**本地开发直接用 `f8_sit_live` / `f8_sit_scenario` / `f8_sit_pbs`（SIT schema）**，不再维护独立的 `f8_dev_*` 隔离 schema（`docs/architecture/dev-db-schema-isolation.md` 中的 DEV 隔离方案已废弃，historical-only）。所有 SQL 查询、数据核查、业务逻辑验证，**必须通过各服务 `.env` 的 `DATABASE_URL`（search_path 已指向目标 schema）**，禁止用 localhost 之外的裸连接。

动态 SQL（模板字符串、条件片段、动态 filter/property/schema）必须遵守
`docs/modules/database/generated-sql-safety-standard.md`：不能只靠 TypeScript build 或 mock/string
test，必须同时具备 fixture/结构完整性检查、远端 PostgreSQL `EXPLAIN` 或最小只读执行，以及关键
HTTP/文件入口 smoke。不得静默跳过失败条件。

### 连接信息

项目当前只上线 **F8** 航司。远端 PostgreSQL：`47.253.173.207:55432`，database `rois`（多环境共用同一库、按 schema 隔离）：

| 环境 | Live | Scenario | PBS |
|------|------|----------|-----|
| SIT（本地开发也用这套）| `f8_sit_live` | `f8_sit_scenario` | `f8_sit_pbs` |
| UAT | `f8_uat_live` | `f8_uat_scenario` | `f8_uat_pbs` |

**本地开发一律使用 `f8_sit_live` / `f8_sit_scenario` / `f8_sit_pbs`**，与 SIT 环境共用同一份 schema（非隔离）。连接串通过环境变量注入（各服务 `.env` 的 `DATABASE_URL`，UAT 连接串向团队成员或密钥管理工具索取），**密码不得写入任何文档或代码**。**本地跑单元/集成/E2E 测试、seed、脚本的写操作都落在共享的 `f8_sit_live` 等 schema 上，会影响其他人正在跑的测试/演示数据——批量写入、delete、或改动特定日期范围的数据前，先确认没有其他 agent/测试依赖同一批数据（如约定好的日期/flight number 白名单），禁止无协调地覆盖。**

### 设计规范

- **推理表关系前必读** `docs/architecture/data-model.md`（实体关系图），代码归属见 `docs/architecture/codebase-index.md`（表↔entity/service/route）。关系以 `sql/schema/**.sql` 的 `foreign key ... references` 为唯一权威，这两份文档是导航，不要靠猜或凭记忆推断
- **核心数据模型陷阱（高频踩坑，写代码/查询前先看）**：
  - `pairing` **不直连** `flight`：环→航班是 N:M，必须经 `pairing → pairing_segment.flt_id → flight`，没有 `pairing.flight_id`
  - `roster_flight` 粒度 = **机组 × 航段**（一个环派给机组会炸开成每航段一行）；机组×航班的执行级信息（实际职级/席位/时间/积分）只在这里
  - `roster_flight.flt_id` → `flight` 是**按值关联、无 FK 约束**（只声明了 `fk_rf_crew` / `fk_rf_pairing`），别假设 DB 替你保证引用完整性
  - 机组的 Base 来自 `crew_base` 表，**不是** `roster_flight.base`
  - 地面任务 = `roster_flight.pairing_id IS NULL`（同时 `flt_id` 为 null）；查飞行任务要显式 `WHERE pairing_id IS NOT NULL`
- PostgreSQL 16，多航司通过 Schema 隔离（schema 名 = 航司二字码小写）
- **所有数据库对象统一小写**：schema 名、表名、字段名、索引名、约束名全部使用小写 + 下划线（`snake_case`），禁止使用大写或双引号包裹
- 建表脚本在 `sql/schema/` 目录下，无 schema 前缀，通过 `search_path` 切换
- 主键统一使用 `bigint GENERATED ALWAYS AS IDENTITY`
- `is_deleted`：**取消状态标记**（0=正常，1=已取消），不是软删除——DELETE 操作执行真实物理删除
- 审计字段：`created_by`, `created_at`, `updated_by`, `updated_at` 每张表必须有
- **外键约束**：核心表已建立 FK RESTRICT 约束，删除父记录前必须先通过应用层 pre-check（返回 409）再在事务中删子记录
- **地面任务**：`roster_flight.pairing_id` 为 `NULL`（不是 0），`NULL` 表示无配对的地面任务
- **filiale 默认值**：每个航司 schema 下所有含 `filiale` 字段的表均已设置列默认值（如 f8 schema 全部为 `DEFAULT 'F8'`），新航司初始化后执行对应 migration 即可；seed 脚本中 INSERT 语句无需显式写 `filiale`，让数据库默认值填充
- **rank 直接用代码**：`composition_rank`、`rank_position`、`rank_acting` 表直接以 `rank varchar` 存储职级代码（如 `'CA'`、`'FO'`），不再保存 `rank_id` 外键，避免不必要的 join

