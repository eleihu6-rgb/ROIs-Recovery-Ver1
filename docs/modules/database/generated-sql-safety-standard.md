# 动态 SQL 安全与防回归标准

## 适用范围

以下任一情况都必须遵守本标准：

- 根据 property、filter、operator、用户输入或 schema 动态组合 SQL。
- 通过模板字符串或字符串片段生成查询。
- SQL 用于搜索、导出、报表、优化输入或后台批处理。
- 同一业务 SQL 在多个服务中分别实现。

本标准适用于整个仓库，不限于 PBS Pairing Search。

## 为什么 TypeScript build 不够

TypeScript 只会把 SQL 当作字符串。它不能发现 PostgreSQL 的别名作用域、`UNION`
顶层排序、列名、类型转换和函数签名错误。Mock 或字符串包含断言也不能代替数据库解析。

因此动态 SQL 变更不得只凭 build 或 mock test 交付。

## 必须具备的三层门禁

### 1. Fixture 与结构完整性

- 每个运行时 handler 和会改变 SQL 结构的分支必须有稳定 fixture。
- 新增 handler、property 或分支时，fixture/manifest 必须在同一变更中更新。
- registry 与真实 dispatcher 必须双向校验，禁止只维护一份容易漂移的手写 supported list。
- identifier 必须经过白名单校验，值必须使用参数化查询。

### 2. 真实 PostgreSQL 解析

- 使用远端 PostgreSQL 权威环境执行 `EXPLAIN` 或最小只读查询。
- 覆盖所有已注册的合法 SQL case，而不是只覆盖一条 happy path。
- 数据库连接失败、catalog 未覆盖或任一 SQL 解析失败时，门禁必须非零退出。
- 不得记录连接串、密码、token 或完整敏感参数。

### 3. 完整入口 smoke

对导出、优化输入或压缩包接口，必须从真实 HTTP 入口验证：

- 认证和权限。
- HTTP 状态和 content type。
- 输出文件可以解析。
- 必需文件完整。
- 单次失败返回受控错误，服务进程仍能响应后续请求。

## 覆盖与豁免

- Coverage threshold 以当前可重复实测值建立，只允许提高，不允许降低。
- Coverage 不是完整性的唯一证明，必须与 dispatcher/manifest 严格集合检查和 PostgreSQL
  `EXPLAIN` 同时使用。
- 暂不能支持的 active property 必须进入显式 exemption registry，记录原因、负责人和到期日。
- 过期、重复、空原因、已被正式支持但仍保留的 exemption 必须使门禁失败。
- 不得通过静默跳过条件、吞掉 SQL 错误或生成不完整输出换取表面成功。

## PBS Pairing Search 当前落地

当前实现位置：

- `live-server/src/services/pairing-search/generated-sql-preflight-*`
- `pbs-server/src/services/pairing-search/generated-sql-preflight-*`
- `live-server/scripts/verify-generated-pairing-sql.mjs`
- `pbs-server/scripts/verify-generated-pairing-sql.mjs`

本地快速门禁：

```bash
cd live-server && npm run test:generated-sql-coverage
cd ../pbs-server && npm run test:generated-sql-coverage
```

真实数据库验证必须在 build 后执行：

```bash
cd live-server
npm run build
LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs npm run verify:generated-sql

cd ../pbs-server
npm run build
LIVE_SCHEMA=f8 PBS_SCHEMA=f8_pbs npm run verify:generated-sql
```

## 变更检查清单

1. 先做影响分析，确认调用方、导出链路和复制实现。
2. 为所有新增 SQL 分支添加 fixture。
3. 更新 dispatcher/manifest/registry 严格校验。
4. 运行聚焦测试和 coverage baseline。
5. 在远端 PostgreSQL 跑 `EXPLAIN`。
6. 对完整 HTTP/文件入口跑 smoke。
7. 验证错误只影响当前请求，不终止服务。
8. 提交前运行 change detection 和 `git diff --check`。

详细设计见：

- `docs/superpowers/specs/2026-07-20-generated-sql-safety-gate-design.md`
