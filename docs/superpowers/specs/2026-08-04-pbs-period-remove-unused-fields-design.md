# PBS Period 删除四个无效字段设计

## 背景

PBS Period 当前仍维护以下字段：

- `Award Run` / `pbs_award_run_at`
- `Award Publish` / `pbs_award_publish_at`
- `Max Tiers` / `pbs_max_tiers`
- `Description` / `pbs_description`

代码和远端开发库核查结果：

- Portal、PBS Server、算法导出、PBS Engine 和后台任务均未读取这四个字段。
- `Award Run` 没有触发 Award 任务；`Award Publish` 没有控制 Award 可见性。
- Portal 与 PBS Server 的有效 Tier 范围仍按既有 T1–T7 产品规则执行，并不读取 `pbs_max_tiers`。
- `Description` 只在 Period Admin 页面保存和回显。
- 开发库 `roster_period` 共 145 条记录：两个 Award 时间和 Description 均无非空值；`pbs_max_tiers` 有 12 条非默认值，但没有任何运行时消费者。
- 数据库 View 与 Routine 均未依赖这四列。

## 目标

彻底删除四个无效字段，不保留 UI、API、应用模型、SQL 或数据库列。

## 方案比较

### 方案 A：彻底删除（采用）

删除 UI、API、SQL、Drizzle 模型、schema 定义和数据库列。

优点：数据模型与真实业务一致，不再维护虚假配置。

### 方案 B：只从页面隐藏（拒绝）

数据库和接口继续保留字段。

缺点：无效字段仍会误导后续开发，并继续产生无意义数据。

### 方案 C：保留数据库列等待未来使用（拒绝）

缺点：当前没有已确认的自动 Award 或动态 Tier 需求，违反最小实现原则。

## 字段删除后的业务规则

- Period 只维护：`Period Code`、`Bid Open`、`Bid Close` 和计算得到的 `System Stage`。
- Award 执行和发布仍沿用当前实际流程；本次不新增自动调度或发布时间控制。
- Tier 仍沿用当前产品既有的 T1–T7 范围，但不再被错误表达为 Period 级配置。
- Period 不再保存管理员备注。

## 变更范围

### Gantt

- Add/Edit Period 删除 Award Run、Award Publish、Max Tiers、Description。
- Generate PBS Year 删除 Max Tiers。
- Period 列表和年度预览删除 Max Tiers 列。
- Period API 类型删除对应属性。

### Live Server

- Period POST、PATCH、Generate Year Preview、Generate Year 契约删除对应字段。
- 旧请求携带任一已删除字段时返回 HTTP 400。
- 列表、新增、编辑和年度生成响应不再返回对应字段。
- Period SQL 不再查询、插入、更新或清空对应列。

### PBS Server 与数据模型

- `pbs-server` 与 `live-server` 的 `roster_period` Drizzle 模型删除对应字段。
- 已核查 PBS Server 当前只有字段映射，没有运行时消费者。

### 数据库

- 更新 `sql/schema/live/01-base.sql`，从新建 schema 中删除四列及相关注释。
- 新增幂等 migration，对 `roster_period` 执行 `DROP COLUMN IF EXISTS`。
- 不修改历史 migration；新 migration 作为最终状态清理。

## 部署顺序

删除数据库列属于破坏性变更，必须按以下顺序：

1. 先部署不再读写四列的新代码。
2. 验证 Period 页面与接口正常。
3. 对开发、SIT、UAT 分别执行删除前审计：非空数据、默认值、View、Routine、约束/索引及其他数据库依赖。
4. 分别确认该环境的新 Live Server 与 PBS Server 版本已部署且健康。
5. 向用户报告该环境的审计结果，并取得针对 DROP COLUMN 的明确授权；“批准代码实现”不等于授权执行三库破坏性 migration。
6. 获得授权后再对目标库执行 migration。
7. 每个库执行后核对四列均不存在，并做 Period 页面/API、PBS Portal 与 PBS Server smoke。

不得在仍运行旧代码的环境中先执行 DROP COLUMN，否则旧 SQL 会立即失败。

## 数据处理

- 两个 Award 时间和 Description 没有有效数据需要迁移。
- `pbs_max_tiers` 的非默认值没有消费者，按用户确认直接删除，不迁移到其他位置。
- 删除后没有新 source of truth；这些能力当前不属于 Period 业务。

## 验收标准

1. Period 新增、编辑、年度生成、列表和预览均不显示四个字段。
2. Period 前端请求和后端响应均不包含对应属性。
3. 旧请求携带对应字段时返回 HTTP 400。
4. Period 新增、编辑、年度生成和删除仍正常。
5. Live Server、PBS Server 模型与 schema 不再声明四列。
6. 在分别完成环境审计、部署确认和用户授权后，开发、SIT、UAT 最终均不存在四列。
7. Portal 的 T1–T7、Award 页面和算法导出行为不变。

## 测试

- Live Server 聚焦测试覆盖新契约、旧字段拒绝和更新后的 SQL 参数。
- Playwright 真实验证 Period CRUD、年度生成及字段不可见。
- 运行 PBS Portal T1–T7 聚焦回归，确认既有 Tier 范围不变。
- 运行 PBS Server Award Results 与算法导出聚焦回归，确认删除 Period 元数据没有改变结果读取或导出。
- Gantt、Live Server、PBS Server TypeScript 检查与构建通过。
- UI 标准检查 0 个硬错误。
- migration 在目标库执行后查询 `information_schema.columns` 验证列不存在。
- 每个目标库 DROP 后通过该环境真实 PBS Server/Portal 路径执行 smoke，防止遗漏仓库内外运行时 SQL 消费者。

## 审计范围与残余风险

已检查：Gantt UI/API、Live Server Period 路由与模型、PBS Server 模型、PBS Portal、算法导出、PBS Engine、SQL schema/migration、数据库 View/Routine。

残余风险：若目标环境存在仓库外部程序直接读取这些列，仓库搜索无法发现。每个环境必须独立审计和 smoke；任何数据库 DROP 都需要用户在看到该环境审计结果后另行明确授权。

## Multi-Agent Parallelism Assessment

- Recommendation：No
- Rationale：删除范围跨层但契约高度耦合，必须按同一顺序完成，拆分会增加漏删和部署顺序风险。
- Suggested split：不拆分。
- Write boundaries：仅 Period UI/API、两端模型、SQL、相关测试与文档。
- Conflict risk：当前工作区有无关 Pairing 改动，实施时必须保持文件隔离。
- Execution gate：spec 评审通过并由用户批准后只实施代码和 migration 文件；实际数据库 DROP 必须在对应环境独立审计、新代码部署完成并获得用户针对该环境的明确授权后执行。
