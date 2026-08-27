# pbs-server 旧 Crew Bid Import 删除设计

## 背景

Crew Bid Import 的真实入口、解析、Dry Run、正式导入、导入记录查询和回滚已经全部迁移到 `live-server`。Gantt Admin Tools 也只调用 Live API。

`pbs-server` 目前仍保留一套重复的旧实现，并在启动时创建 Service、装饰 Fastify 实例、注册旧 Route。旧 Route 已统一返回 `410 Gone`，不会执行导入业务。

代码引用检查确认：除 `pbs-server` 自己的启动注册、旧 Route 和旧测试外，没有任何运行时消费者继续调用这套实现。

## 目标

彻底删除 `pbs-server` 中已停用的 Crew Bid Import 代码，避免以后误以为存在两套有效导入逻辑。

## 删除范围

1. 删除旧 Route 与测试：
   - `pbs-server/src/routes/crew-bid-imports.ts`
   - `pbs-server/src/routes/crew-bid-imports.test.ts`
2. 删除旧 Service 目录：
   - `pbs-server/src/services/crew-bid-import/crew-bid-import-service.ts`
   - `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
   - `pbs-server/src/services/crew-bid-import/crew-bid-txt-parser.ts`
   - `pbs-server/src/services/crew-bid-import/crew-bid-txt-parser.test.ts`
   - `pbs-server/src/services/crew-bid-import/types.ts`
   - `pbs-server/src/services/crew-bid-import/upload-file-validation.ts`
3. 删除只服务于旧实现的 Drizzle Model：
   - `pbs-server/src/models/pbs/pbs-crew-bid-import-run.ts`
   - `pbs-server/src/models/pbs/pbs-crew-bid-import-item.ts`
   - `pbs-server/src/models/pbs/pbs-crew-bid-import-problem.ts`
   - `pbs-server/src/models/pbs/pbs-crew-bid-import-backup.ts`
4. 清理 `pbs-server/src/models/index.ts` 中对应导出。
5. 清理 `pbs-server/src/app.ts` 中：
   - Route import 与注册；
   - Service factory/type import；
   - `BuildAppOptions.crewBidImportService`；
   - Fastify `crewBidImportService` 装饰器；
   - Service 创建和 `skipDatabase` mock 分支。

## 保留范围

- `live-server/src/routes/admin/pbs-crew-bid-imports.ts`
- `live-server/src/services/crew-bid-import/**`
- `packages/contracts/pbs-crew-bid-imports.*`
- Gantt Admin Tools 的 API 与 UI
- `pbs_crew_bid_import_*` 数据库表
- Crew Bid Import 相关 SQL migration
- Live 端测试和 E2E

这些内容仍属于当前有效导入链路，不能删除。

## 行为变化

- `live-server /api/admin/crew-bid-imports*`：行为不变，继续作为唯一有效入口。
- `pbs-server /api/admin/crew-bid-imports*`：由当前的 `410 Gone` 变为 `404 Not Found`。
- 不迁移、不删除数据库数据，不改变 Standing Bid 或 Current Bid 的业务逻辑。

## 验收标准

1. 全仓库不存在从 `pbs-server` 引用旧 Crew Bid Import Route、Service、Parser 或 Model 的代码。
2. `pbs-server` TypeScript 编译通过。
3. `pbs-server` 应用路由测试通过，且不再注册旧导入接口。
4. Live Crew Bid Import 定向测试通过。
5. Gantt 使用真实文件执行 Dry Run E2E 仍通过。
6. `git diff --check` 与 GitNexus `detect_changes` 通过，改动范围仅覆盖预期删除链路。

## 风险与控制

- 主要风险是误删 Live 端仍使用的共享 contract 或数据库表；它们明确列入保留范围。
- 旧 PBS URL 会从 410 变为 404。这是彻底删除的预期结果，不再保留兼容提示。
- 不做其他 `pbs-server` 重构。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 删除链路集中在 `pbs-server/src/app.ts` 及其直接依赖，拆分会增加同文件冲突。
- Suggested split: 不拆分。
- Write boundaries: 仅本设计列出的 `pbs-server` 文件。
- Conflict risk: Low。
- Execution gate: Spec 审查通过并由用户明确批准实施后开始。
