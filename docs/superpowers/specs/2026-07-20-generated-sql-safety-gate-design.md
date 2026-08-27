# 动态 SQL 真实数据库解析与防回归门禁设计

## 背景

`live-server` 的 Airport Preference 曾把 layover 分支的：

```sql
order by s.pairing_id, s.duty_seq, s.seg_seq
```

放在 `UNION ALL` 末尾。TypeScript build 和现有 mock/string tests 均通过，但 PostgreSQL 将其解释为 union 顶层排序；别名 `s` 不在顶层作用域，因此 scenario package 返回 500，调用方 `/optimize/start` 随后返回 502。

提交 `47776892 Fix scenario package airport preference export` 已正式修复 `live-server`，但没有增加数据库解析回归测试；`pbs-server` 的镜像 SQL 仍保留旧结构。

这不是 Airport Preference 独有问题，而是动态 SQL 的系统性风险：

- TypeScript 只把 SQL 当字符串，不验证 PostgreSQL 语法、别名作用域和类型。
- 字符串断言不能证明数据库可以解析 SQL。
- mock DB 不会执行 PostgreSQL planner。
- 同一业务 SQL 在多个服务复制后会漂移。
- 单次导出错误可能放大为优化启动失败。

本设计建立项目级动态 SQL 安全标准，并先在 PBS 搜索与算法导出链路完整落地。

## 目标

1. 修复 `pbs-server` 中相同的 Airport Preference SQL 问题。
2. 为 `live-server`、`pbs-server` 的全部 Pairing Search 动态条件建立 fixture registry。
3. 使用真实 PostgreSQL `EXPLAIN` 解析所有注册 SQL 变体。
4. 对新增或启用的 property 做覆盖完整性检查；缺 fixture 时门禁失败。
5. 覆盖 algorithm export 完整查询和 scenario package route/service 回归。
6. 验证单次动态 SQL/导出错误只影响当前请求，不使服务退出。
7. 把相同原则写成项目长期规范，后续其他模块修改动态 SQL 时必须采用同类门禁。

## 非目标

- 不一次性重构整个仓库的全部历史 SQL。
- 不引入 SQL parser 第三方依赖；PostgreSQL 是最终解析权威。
- 不合并 `live-server` 与 `pbs-server` 的运行时模块。
- 不改变 bid 业务语义、UI、payload 或 property code。
- 不在 SQL 错误时静默跳过条件。
- 不以本地 f8 schema 作为业务验证权威。

## 范围

### 本次必须完成

- `live-server/src/services/pairing-search/**`
- `pbs-server/src/services/pairing-search/**`
- `live-server/src/services/algorithm-export/**`
- `live-server/src/routes/admin/pbs-algorithm-export.ts`
- 项目级动态 SQL 长期规范

### 后续模块接入规则

其他模块新增或修改以下代码时，必须在同一变更中接入动态 SQL 门禁：

- 使用模板字符串、字符串拼接或条件片段生成 SQL。
- 根据用户输入、property、filter、operator 或 schema 组合 SQL。
- 生成供导出、优化器、报表或批处理执行的 SQL。
- 在多个服务复制同一业务 SQL。

历史查询按触达原则逐步纳入，不在本次大规模重写。

## 方案

### 方案 A：每次事故增加一个字符串断言

无法证明 PostgreSQL 可以解析，也无法发现新增 property 没有测试，不采用。

### 方案 B：PBS 全条件 registry + PostgreSQL EXPLAIN + 项目级标准（采用）

fixture registry 描述全部动态条件及关键分支；快速测试检查结构和覆盖；部署门禁让真实 PostgreSQL 执行 `EXPLAIN`。

### 方案 C：一次改造全仓库 SQL 层

不同模块的数据库、部署环境和查询模式差异过大，风险不可控，不采用。

## 总体门禁

```text
Supported handlers / remote property catalog
                    │
                    ▼
        Generated SQL fixture registry
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
  Fast structure tests   PostgreSQL EXPLAIN
          │                   │
          └─────────┬─────────┘
                    ▼
       export route/service tests
                    │
                    ▼
             build/deploy allowed
```

三层缺一不可：

1. 结构与覆盖测试：快速、无数据库。
2. PostgreSQL 解析：验证语法、别名、字段和类型。
3. 完整入口回归：验证查询、CSV/TGZ、受控错误和后续请求恢复。

## Fixture Registry

文件：

- `live-server/src/services/pairing-search/generated-sql-preflight-cases.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-cases.ts`

Case 结构：

```ts
type GeneratedSqlPreflightCase = {
  id: string
  propertyCode: number
  propertyName: string
  property: PbsPairingSearchPreviewProperty
  context: PairingSearchConditionContext
  expected:
    | { kind: "sql" }
    | { kind: "error"; messagePattern: RegExp }
}
```

要求：

- `id` 稳定且唯一，例如 `airport-preference:both:date-range:min-layover`。
- 每个 case 使用最小合法 bid，不要求查询命中数据。
- 同一 property 有不同 SQL 分支时必须拆成多个 case。
- operator、quantifier、Award/Avoid 只有改变 SQL 结构时才拆分。
- 有意拒绝的非法组合使用 `expected.kind="error"`，并进入 branch coverage；只有 `kind="sql"` 的 case 进入 PostgreSQL `EXPLAIN`。
- fixture 不包含密码、token 或个人信息。

第一阶段覆盖全部当前 Pairing Search handler，包括：

- Pairing stable IDs
- Work Day Preference
- Airport Preference：Landing、Layover、Both、date scope、minimum layover
- Flight Legs per Duty：Any、Every
- Pairing Length：specific dates、date range
- Pairing Check-In / Check-Out Time
- Redeye Preference
- Deadhead Flying
- Flight Number Preference
- Enroute、layover、duty duration 等现有 switch case

只要运行时代码仍支持并可能从历史 bid、import 或 export 进入，就必须注册；不限于 Portal 当前可见条件。

## Handler 与分支覆盖完整性

### 真实 dispatcher 机械审计

不额外维护一份可能漂移的 `SUPPORTED_PROPERTY_CODES`。测试使用项目已安装的 TypeScript compiler API 解析以下真实 source files：

- `pairing-search-core-conditions.ts`
- `pairing-search-time-conditions.ts`
- `pairing-search-detail-conditions.ts`

审计器定位以 `property.propertyCode` 为 discriminant 的 switch，并提取全部 numeric `case`。这三个真实 dispatcher 的 case code 集合是支持范围的机械事实源。

测试必须双向验证：

- dispatcher 中每个 code 都存在于 manifest。
- manifest 每个 code 都能在且只能在预期的 `core / time / detail` handler 中找到。
- 新增 switch case 而未增加 manifest/fixture 时测试失败。
- 删除 switch case 但遗留 manifest/fixture 时测试失败。
- 同一 code 意外出现在多个 handler 时测试失败，除非 manifest 明确声明允许的调用顺序和原因。

### 完整 variant manifest

新增：

- `live-server/src/services/pairing-search/generated-sql-preflight-manifest.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-manifest.ts`

结构：

```ts
type GeneratedSqlPreflightManifestEntry = {
  propertyCode: number
  handler: "core" | "time" | "detail"
  requiredCaseIds: readonly string[]
}
```

manifest 必须为每个 dispatcher code 列出全部改变 SQL 结构的 case id，而不只是“每个 code 至少一个”。需要拆分的维度包括：

- bid discriminated-union type
- operator family：single compare、range、in-list 等
- quantifier：Any、Every
- action：仅在 Award/Avoid 改变内部 SQL 而非单纯外层 `not(...)` 时
- date scope：none、specific dates、date range
- condition mode/event：例如 Landing、Layover、Both
- 其他会进入不同 if/switch 分支的字段

测试执行严格集合相等：

```text
registry case ids
  == manifest 中全部 requiredCaseIds
```

因此缺 case 和多余/过期 case 都会失败。Airport、Work Day 等不再使用零散特殊名单；所有 property 都遵守同一 manifest。

### Builder branch coverage 基线

AST 能机械发现新增 property code，但不能单独发现既有 code 内新增的 `if`、operator、bid type 或 date-scope 分支。因此 registry 驱动测试必须对以下真实 builder files 建立可重复、不可降低的 branch coverage 基线：

- `pairing-search-core-conditions.ts`
- `pairing-search-time-conditions.ts`
- `pairing-search-detail-conditions.ts`

要求：

- SQL 成功分支由 `expected.kind="sql"` case 覆盖。
- 参数缺失、非法组合等拒绝分支由 `expected.kind="error"` case 覆盖。
- 在既有 property 内新增未注册分支会降低 branch coverage，并使测试失败。
- 不允许降低 threshold、扩大 coverage ignore 或把整个函数排除。
- 覆盖率不是 handler 完整性的唯一证明；dispatcher AST、manifest/registry 严格集合相等和真实 PostgreSQL `EXPLAIN` 均必须同时通过。

实施时发现仓库当前依赖图包含 npm 不支持的 `workspace:` 协议，不能安全地仅为
`live-server` 写入新的 npm dev dependency；两个服务均已运行 Node 22，因此统一使用
Node 22 内置 test coverage threshold，不新增运行时或开发依赖。

新增独立配置/脚本：

- `live-server` script：`test:generated-sql-coverage`
- `pbs-server` script：`test:generated-sql-coverage`

coverage include 只包含上述三份 builder files，避免被模块其他代码稀释。初始实测门槛为：

- `live-server`：branches 50%、lines 88%、functions 92%。
- `pbs-server`：branches 69%、lines 95%、functions 100%。

这些门槛是当前源码和 registry 的可验证最低基线，只允许提高，不允许降低。目标仍是逐步补齐
防御性/错误分支并提高覆盖率，但不以虚假的 100% 数字替代 AST 完整性和 PostgreSQL 解析证明。

### 远端 catalog 审计

新增 exemption registry：

- `live-server/src/services/pairing-search/generated-sql-preflight-exemptions.ts`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-exemptions.ts`

结构：

```ts
type GeneratedSqlPreflightExemption = {
  propertyCode: number
  reason: string
  owner: string
  expiresOn: string // YYYY-MM-DD
}
```

远端审计明确查询：

```sql
select property_code, property_name
from <pbs_schema>.pbs_bid_property
where bid_type = 'Pairing'
  and is_active = 1
order by property_code
```

“参与范围”定义为上述全部 active Pairing properties。每条记录必须满足其一：

1. code 存在于真实 dispatcher AST 集合、manifest 和 registry。
2. code 存在于 exemption registry。

Exemption 自动校验：

- code 必须存在于远端查询结果。
- reason 和 owner 不能为空。
- `expiresOn` 必须是合法日期且不早于运行日。
- 重复 code、过期 exemption 或 dispatcher 已支持但 exemption 未清理时失败。
- 只记录 warning 不算通过。

Registry 可以保留 catalog 尚未启用但 dispatcher 仍支持的历史/import code；这些 code 仍需通过 EXPLAIN。新增 active property、dispatcher handler 或 SQL variant 未同步 fixture 时，门禁必须失败。

## 快速结构测试

测试文件：

- `live-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`

测试先用 TypeScript AST 完成 dispatcher/manifest/registry 双向审计，再遍历 registry 调用公开的 `buildPreviewCondition`，并由独立 coverage 命令检查 builder branch coverage，具体检查：

1. 条件符合 case 预期。
2. 参数占位符与 `sqlBuilder.params` 一致。
3. schema 只能来自已验证 identifier。
4. 已知危险结构被拒绝，例如 union 顶层 `ORDER BY <branch_alias>.*`。
5. 两个服务共有 case 的参数顺序和关键结构一致。

Airport 专项断言：

- SQL 包含 `from (...) layover_events`。
- `order by s.pairing_id, s.duty_seq, s.seg_seq` 位于该子查询内。
- union 顶层不存在直接引用 `s.*` 的 `ORDER BY`。

字符串测试用于快速定位，不是最终 SQL 正确性证明。

## PostgreSQL EXPLAIN 门禁

脚本：

- `live-server/scripts/verify-generated-pairing-sql.mjs`
- `pbs-server/scripts/verify-generated-pairing-sql.mjs`

模块 build 后，脚本导入 dist 中的 registry 和 `buildPreviewCondition`，将每个 condition 包进：

```sql
explain
select p.id
from <live_schema>.pairing p
where <generated_condition>
limit 1
```

规则：

- 必须读取 `DATABASE_URL`、`LIVE_SCHEMA`、`PBS_SCHEMA`。
- 缺失变量、非法 schema、连接失败、catalog 审计失败或任一 `EXPLAIN` 失败时非零退出。
- 值使用参数化查询；schema 通过 identifier 校验。
- 只执行 `EXPLAIN` 和只读 catalog 查询。
- 输出 case id、property code、PASS/FAIL 和错误摘要，不输出连接串或敏感参数。
- 两个服务必须分别验证全部 case；一边通过不能替代另一边。

开发验证：

```bash
cd live-server
npm run build
LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs node --env-file=.env scripts/verify-generated-pairing-sql.mjs

cd ../pbs-server
npm run build
LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs node --env-file=.env scripts/verify-generated-pairing-sql.mjs
```

## Algorithm Export 保护

必须保护完整输出：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `RESERVE_SCORE.csv`
- `LINE_RULES.csv`
- `LINE_RULES_README.md`

要求：

1. export loaders 保持聚焦测试。
2. 修改 `algorithm-export/**` 时运行完整 export service tests。
3. scenario package service 抛错时 route 返回结构化 500。
4. 同一 Fastify 实例随后仍可响应第二个请求。
5. 禁止用缺失条件的压缩包继续优化。

## 运行时错误隔离

- route/service 边界保留 `try/catch`。
- 数据库错误返回结构化 500，不泄露 SQL、连接信息或参数。
- 不产生 unhandled rejection，不调用 `process.exit`。
- route 测试模拟失败后继续注入第二个请求并验证成功。
- 调用方获得明确失败，不使用不完整压缩包继续优化。

## 项目长期规范

新增：

- `docs/modules/database/generated-sql-safety-standard.md`

并在根 `AGENTS.md`、`CLAUDE.md` 添加链接入口。长期规则：

1. 动态 SQL 不能只靠 TypeScript build 或 mock/string test 验收。
2. 必须提供最小 fixture、结构测试和真实 PostgreSQL `EXPLAIN`/执行测试。
3. 新增 handler/property 必须进入 coverage registry。
4. identifier 必须白名单校验，值必须参数化。
5. 错误必须隔离在请求边界，不能终止服务。
6. 不得静默跳过条件换取表面成功。
7. 使用远端 PostgreSQL 权威环境验证。

后续其他模块触达动态 SQL 时必须引用该标准并建立自己的 registry/preflight；无法使用 `EXPLAIN` 时，需要在 spec 中定义替代的真实数据库验证。

## 实施顺序

1. 同步 `pbs-server` Airport Preference 子查询修复。
2. 建立两个 registry、完整 variant manifest、exemption registry 和 AST dispatcher coverage tests。
3. 补快速结构测试。
4. 实现两个 PostgreSQL `EXPLAIN` 脚本并在远端运行。
5. 补 export route 错误隔离测试。
6. 写长期规范和根文档入口。
7. 运行全部门禁并提供验证收据。

## 验证命令

```bash
cd live-server
npm run build
npm run test:generated-sql-coverage
npx vitest run \
  src/services/pairing-search/pairing-search-condition-builder.test.ts \
  src/routes/admin/pbs-algorithm-export.test.ts \
  src/services/algorithm-export/algorithm-export-service.test.ts
LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs npm run verify:generated-sql

cd ../pbs-server
npm run build
npm run test:generated-sql-coverage
node --import tsx --test \
  src/services/pairing-search/pairing-search-condition-builder.test.ts \
  src/services/pairing-search/pairing-search-service.test.ts
LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs npm run verify:generated-sql

cd ..
git diff --check
```

## 验收标准

1. `pbs-server` Airport SQL 与已修复的 `live-server` 作用域一致。
2. 两个服务真实 core/time/detail dispatcher 的全部 property code 和 SQL variants 都有 fixture。
3. 新增 dispatcher case、active catalog property 或 SQL branch 未增加 manifest/fixture 时，AST、严格集合检查或 coverage baseline 至少一项失败。
4. 两个服务全部 registry case 通过真实 PostgreSQL `EXPLAIN`。
5. 远端 active catalog 不存在未覆盖且无有效 exemption 的 property。
6. scenario package service 测试验证 TGZ 包含五个文件。
7. 导出失败时返回受控 500，服务仍可响应后续请求。
8. 两个模块 build 和聚焦测试通过。
9. 项目长期规范和根入口已建立。
10. 不改变搜索/导出语义，不静默丢弃条件。

## 风险与控制

- Fixture 较多：按 SQL 分支族组织，复用构造器。
- dispatcher 与 manifest 漂移：TypeScript AST 直接读取真实 core/time/detail switch，并与 manifest/registry 双向比较。
- 既有 code 内新增分支漏 fixture：registry/manifest 严格集合与不可降低的 builder coverage baseline 共同阻止静默漂移。
- 两个服务实现漂移：共享 case id 和验收语义，运行时仍独立。
- 远端数据库不可用：相关变更不得把未验证状态当 PASS。
- 固定 smoke crew 失效：明确报错；更新 scope 必须同步测试说明。
- 门禁耗时：快速测试默认运行；完整 EXPLAIN 在相关交付时运行。
- 错误被吞掉：禁止 fail-open，route 只隔离进程影响。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: registry、supported set 和 EXPLAIN 需要统一口径，并行编辑容易形成两套标准。
- Suggested split: 不拆，按实施顺序逐层完成。
- Write boundaries: `live-server`、`pbs-server`、`docs/modules/database`、根开发规范入口。
- Conflict risk: Medium，两个服务的 SQL builder 和根规范可能同时被其他任务修改。
- Execution gate: 本 spec 通过独立审阅并经用户确认后实施；未明确授权前不提交 Git。
