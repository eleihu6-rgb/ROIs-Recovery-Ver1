# PBS Dashboard USER INFORMATION live 机组资料字段接入设计

## 状态

- 文档状态：已确认，已实现
- 目标页面：`pbs-portal` Dashboard 页面
- 目标区域：左侧 `USER INFORMATION`
- 前置基础：第一阶段已接入 `pbs_user.email / base / rank / division`
- 本阶段目标：接入 live 侧已确认口径的机组资料字段，减少 `-` 占位

## 背景

当前 Dashboard 左侧 `USER INFORMATION` 中已经能显示：

- `BASE`：来自 `pbs_user.base`
- `POSITION`：来自 `pbs_user.rank`
- 邮箱：来自 `pbs_user.email`

仍显示 `-` 的字段包括：

- `FLEET`
- `SENIORITY`
- `STATUS`
- `LANGUAGE`
- `EXISTING CREDIT`
- `TRAINING MONTH`

这些字段并不是全部不存在。`pbs_user` 只保存 PBS 登录和少量同步字段，不适合承载完整机组资料；更完整的数据位于 live schema 的机组相关表中。第二阶段应继续沿用 Dashboard profile API，把 live 字段聚合成前端已经支持的 view model。

## 目标

- `FLEET` 显示当前有效机队资质。
- `LANGUAGE` 显示当前有效语言能力。
- `SENIORITY` 显示 live 侧资历号。
- `STATUS` 暂时继续显示 `-`，直到业务确认稳定定义。
- `EXISTING CREDIT` 显示当前 PBS bid month 对应的月度 credit。
- `TRAINING MONTH` 暂时继续显示 `-`，直到确认稳定业务口径。
- 不改变 Dashboard 左侧布局。
- 不修改数据库 schema。
- 不把 live 机组资料数据塞进 auth session 或 JWT。

## 非目标

- 不实现 `TRAINING MONTH`，因为当前未发现直接可靠字段。
- 不重新定义 PBS 资历排名规则。
- 不引入新依赖。
- 不创建 `pbs_user` 新字段。
- 不改变 `BIDDING CALENDAR` 的 period 选择逻辑。
- 不做 Dashboard 整体视觉改版。

## 数据源映射

| UI 字段 | 数据来源 | 第一版显示规则 |
|---|---|---|
| `FLEET` | live `crew_fleet` | 当前有效记录的 `fleet_specific`，多值换行 |
| `LANGUAGE` | live `crew_language` | 当前有效记录的 `language`，有等级时显示 `language language_level` |
| `SENIORITY` | live `crew.seniority_num` | 直接显示资历号；为空显示 `-` |
| `STATUS` | 待确认 | 暂时继续显示 `-` |
| `EXISTING CREDIT` | live 月度 manday 表 | 按当前 open PBS period 的年月查 `credit` |
| `TRAINING MONTH` | 待确认 | 继续显示 `-` |

## 字段口径

### FLEET

查询 live `crew_fleet`：

- `crew_id = 当前登录用户 crewId`
- `exp_dt is null` 视为当前有效
- 去重后按 `fleet_specific` 升序
- 返回 `fleet: string[]`

显示：

- 有值：前端现有 mapper 用换行展示。
- 无值：显示 `-`。

### LANGUAGE

查询 live `crew_language`：

- `crew_id = 当前登录用户 crewId`
- `is_valid = 1`
- `exp_dt is null or exp_dt >= now()`
- 去重后按 `language` 升序

显示：

- `language_level` 有值：`${language} ${language_level}`
- `language_level` 为空：`${language}`
- 多值换行
- 无值显示 `-`

### SENIORITY

查询 live `crew`：

- `crew_id = 当前登录用户 crewId`
- 取 `seniority_num`

显示：

- 直接转成字符串。
- 末尾 `.00` 可去掉，例如 `646.00` 显示 `646`。
- 为空显示 `-`。

说明：

- 这不是相对排名，也不是 `646/2132` 这种“排名/总数”格式。
- 如果后续业务确认需要排名/总数，应另开设计，基于同 base/rank/division 范围计算。

### STATUS

当前暂不实现。

原因：

- `pbs_user.status` 是 PBS 账号状态，不是机组业务状态。
- live `crew.status` 和 `crew_status.status` 的 UI 业务定义尚未确认。
- 当前数据中 `crew_status.status` 可能出现纯数字原始码，例如 `1`，直接显示会造成 `ACTIVE\n1` 这类不可读结果。

显示：

- 固定返回 `null`，前端显示 `-`。
- 后续确认业务状态定义、字典映射或旧系统显示口径后，再单独接入。

### EXISTING CREDIT

先解析当前 open PBS period：

- 使用 `resolveCurrentPeriod` 或同等逻辑找当前 `pbs_period`。
- 使用 `period.periodCode` 解析 bid month，例如 `Apr 2026` → `2026-04`。
- 如果 periodCode 不能解析，则返回 `null`。

根据 `division` 选择 live 月度表：

- `division = 'P'`：`crew_manday_fd_monthly`
- `division = 'C'` 或 `division = 'A'`：`crew_manday_cc_am_monthly`
- 其他 division：返回 `null`

查询条件：

- `crew_id = 当前登录用户 crewId`
- `year_month = 当前 bid month`
- `scenario_id = 0`

显示：

- `credit` 有值：格式化为最多两位小数，去掉无意义尾零。
- 无值：显示 `-`。

说明：

- 第一版只显示月度累计 credit，不推导计划 credit、目标 credit 或实时未来 credit。
- 如果后续要按 bid window、roster period 或已发布 roster 做更复杂口径，需要另开设计。

### TRAINING MONTH

当前暂不实现。

原因：

- `pbs_user` 没有对应字段。
- live schema 中只看到培训任务相关字段，例如 `is_training / training_role / duty_training_add_time`，没有直接等价于 UI `TRAINING MONTH` 的稳定字段。
- 不应通过猜测把某个 training 任务月份当成该字段。

显示：

- 保持 `-`。

## 后端设计

继续使用现有 `GET /api/dashboard/profile`。

`PbsDashboardUserProfile` 已有字段可承载本阶段数据：

- `fleet: string[] | null`
- `languages: string[] | null`
- `seniorityLabel: string | null`
- `statusLabel: string | null`，本阶段固定返回 `null`
- `existingCreditLabel: string | null`
- `trainingMonthLabel: string | null`

实现调整：

- `createPbsDashboardProfileService` 增加 `pgPool` 和 `liveSchema` 依赖。
- `app.ts` 注册 service 时传入：
  - `db: server.db`
  - `pgPool: server.pgPool`
  - `liveSchema: env.PBS_SCHEMA.replace(/_pbs$/i, "")`
- 复用或新增 live schema 校验函数，禁止不安全 schema 名进入 SQL。
- 继续先用 Drizzle 查询 `pbs_user`，获取 `crewId / base / rank / division`。
- 使用 `pgPool` 对 live schema 做只读聚合查询。
- live 聚合失败时应记录服务端错误并返回 500；单个字段缺数据不算失败，返回 `null`。

性能设计：

- 当前接口只查询当前登录用户，数据量极小。
- live 查询应合并为少量 SQL，避免逐字段 N+1。
- 可使用 `Promise.all` 并行加载相互独立的 `crew`、`fleet/language/status`、`credit`。
- 不引入缓存，后续如 profile 成为高频瓶颈再评估短 TTL 缓存。

安全设计：

- 只返回当前登录用户自己的 profile。
- 不返回证件、身份证、联系方式、家庭地址、生日等敏感字段。
- 不在前端 console 输出 profile 原始数据。
- 不把完整 live row 透传给前端。

## 前端设计

前端已有 mapper 可支持本阶段：

- `fleet` 用 `formatList` 换行显示。
- `languages` 用 `formatList` 换行显示。
- `seniorityLabel / statusLabel / existingCreditLabel / trainingMonthLabel` 已有 fallback。

预计前端只需要：

- 根据后端新增数据更新测试期望。
- 保持 `TRAINING MONTH` 为 `-`。
- 不改变 `DashboardLeftPanel` 结构。

## 错误与 fallback

- `pbs_user` 找不到：维持现有 404 行为。
- live `crew` 找不到：保留 pbs_user 已有字段，live 扩展字段返回 `null`。
- live `crew_fleet / crew_language` 无当前有效记录：对应字段返回 `null`。
- 当前 open period 找不到或 periodCode 解析失败：`existingCreditLabel = null`。
- 月度 manday 无记录：`existingCreditLabel = null`。

前端统一把 `null` 显示为 `-`。

## 测试设计

后端自动化测试：

- profile service 能返回 `fleet / languages / seniorityLabel / existingCreditLabel`。
- `statusLabel` 固定返回 `null`，前端显示 `-`。
- `division = 'P'` 时从 `crew_manday_fd_monthly` 取 credit。
- `division = 'C'` 或 `A` 时从 `crew_manday_cc_am_monthly` 取 credit。
- live 字段缺失时返回 `null`，不影响 `base / rank`。
- unsafe live schema 被拒绝。

前端自动化测试：

- Dashboard mapper 能显示多值 fleet/language。
- Dashboard 页面能显示后端返回的 `seniority/status/existing credit`。
- `trainingMonthLabel = null` 时仍显示 `-`。
- 不重新出现 mock 值。

QA 人工测试：

- 更新 `docs/test-cases/pbs/dashboard/2026-06-12-dashboard-user-information-profile.md` 或新增第二阶段用例。
- 覆盖有完整 live 机组资料、缺少 fleet/language、缺少月度 credit、不同 division 的账号。

## 验收标准

- Dashboard `FLEET` 显示当前有效机队资质。
- Dashboard `LANGUAGE` 显示当前有效语言能力。
- Dashboard `SENIORITY` 显示 live `crew.seniority_num`。
- Dashboard `STATUS` 暂时显示 `-`，不显示账号状态，也不显示未定义的 live 原始码。
- Dashboard `EXISTING CREDIT` 显示当前 bid month 的月度 credit。
- `TRAINING MONTH` 继续显示 `-`。
- 字段缺失时显示 `-`，不显示 mock。
- 不修改数据库 schema。
- 自动化测试覆盖新增映射和 fallback。

## 风险与后续

- `SENIORITY` 第一版不是排名/总数。如果业务要显示 `646/2132`，需要确认排序范围和总人数范围。
- `STATUS` 暂缓接入。后续需要业务确认 `crew.status`、`crew_status.status`、字典映射和旧系统 UI 显示口径后再实现。
- `EXISTING CREDIT` 第一版是月度统计表 credit，不等价于未来计划 credit 或目标 credit。
- `TRAINING MONTH` 仍需业务提供明确来源。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 profile service 和相关测试，前端 mapper 已有能力承载新增字段；并行开发会增加 contract 和测试口径协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/dashboard-profile/*`、`pbs-server/src/app.ts`、相关后端测试、`pbs-portal/src/features/dashboard/*` 测试、Dashboard QA 文档。
- Conflict risk: 低到中，主要风险在 `EXISTING CREDIT` 月份和 division 表选择口径。
- Execution gate: 用户确认本设计后再开始实现。

## 实施门禁

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
