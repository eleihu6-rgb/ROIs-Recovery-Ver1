# PBS Days Off / Pairing 可读性与废弃代码专项清理设计

## 背景

Days Off / Pairing 已完成局部 mutation 和性能优化：

- 新增、修改、删除已转向 `id-based` / `propertyGroupKey` 局部 mutation。
- `draftVersion` 并发保护保留。
- Days Off / Pairing 与日历 day off / pairing 的冲突校验保留。
- 高频 mutation 在真实 DB 临时脚本中已压到 2 秒以内。

但当前服务层文件仍然偏大：

- `pbs-server/src/services/pairing/pairing-bid-service.ts` 约 1960 行。
- `pbs-server/src/services/days-off/days-off-bid-service.ts` 约 1852 行。

这会影响后续人工维护和 AI 继续开发的稳定性。用户明确要求继续审核：

- 性能不能回退。
- 代码要符合当前项目风格。
- 代码要更容易阅读和继续修改。
- 没有用到的旧代码、废弃代码、临时逻辑要删除。
- 不能为了重构改坏现有功能。

## 目标

1. 对 Days Off / Pairing 两个模块做专项代码审计。
2. 删除明确无用、废弃、重复或临时残留代码。
3. 简化 mutation 相关实现，让新增、修改、删除路径更清楚。
4. 抽取小而稳定的 helper，降低大 service 文件的阅读负担。
5. 保持现有接口、UI 行为、数据库语义不变。
6. 保持当前性能优化成果，不能重新变慢。

## 非目标

本次不做以下事情：

- 不新增 AA 业务功能。
- 不改 Days Off / Pairing 的页面交互。
- 不删除后端兼容的整份 `PUT /current` 接口。
- 不重写 Line / Reserve / Award 等其他模块。
- 不修改已确认的 schema 建表脚本。
- 不改数据库字段含义。
- 不引入新依赖。
- 不做大范围架构重写。

## 范围

### 后端

重点文件：

- `pbs-server/src/services/pairing/pairing-bid-service.ts`
- `pbs-server/src/services/pairing/types.ts`
- `pbs-server/src/services/days-off/days-off-bid-service.ts`
- `pbs-server/src/services/days-off/days-off-draft-mappers.ts`
- `pbs-server/src/services/days-off/types.ts`
- 对应 route/test 文件中与当前接口相关的内容

允许新增小文件，但必须有明确边界，例如：

- `pairing-property-mutations.ts`
- `pairing-tier-sync.ts`
- `days-off-property-mutations.ts`
- `days-off-tier-sync.ts`

最终是否新增文件以实际代码结构为准，避免为了拆而拆。

### 前端

重点文件：

- `pbs-portal/src/features/pairing/**`
- `pbs-portal/src/features/days-off/**`
- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/shared/services/days-off-service.ts`
- `pbs-portal/src/shared/services/calendar-days-off-service.ts`

前端只做与当前 Days Off / Pairing 局部 mutation 相关的清理和简化，不做视觉和交互变更。

### 数据库

本次原则上不需要新增表字段。

如果审计中发现性能必须补索引：

- 必须新增 `sql/migration/*.sql`。
- migration 必须幂等。
- 不修改 `sql/schema/` 下已确认建表脚本。

## 可删除与不可删除边界

### 可以删除

- 已经没有任何引用的函数、类型、常量。
- 上一轮性能调试留下的无效分支。
- 被新局部 mutation 完全替代、且没有外部兼容责任的内部 helper。
- 重复实现且可由已有 helper 覆盖的代码。
- 不再使用的前端 mapper、service 方法、测试 mock 分支。

### 不能删除

- 后端整份 `PUT /current` 兼容接口，除非另开专项确认。
- Line 页面仍在使用的整份保存逻辑。
- `legacyPropertyCode` 这类数据库兼容映射。名字里有 legacy 不代表废弃，它仍对应 `pbs_bid_group.property_id`。
- 业务校验：
  - `draftVersion` 并发保护。
  - Days Off 属性规则校验。
  - Pairing 属性规则校验。
  - same-tier day off / pairing 冲突校验。
  - specific-date pairing merge 语义。
- 慢请求日志，除非确认已有更好的诊断方式。

## 推荐方案

采用“专项瘦身，不大拆架构”的方案。

做法：

1. 先用静态搜索和测试覆盖确认引用关系。
2. 删除明确无用代码。
3. 把 mutation 写入、tier 同步、stable bid helper 这类低耦合逻辑抽小。
4. 保留 service 对外 API 不变。
5. 每一轮重构后跑服务端 build/test，避免累计风险。
6. 最后跑真实 DB 性能脚本，确保接口没有回退。

不推荐这次直接大拆成完整分层架构。原因是当前模块仍在快速对齐 AA 文档，大拆会让 diff 过大，容易把业务语义一起搅乱。

## 设计原则

### 可读性

- 单个 helper 只表达一个目的，例如：
  - 定位 current bid。
  - 写入一个 property。
  - 删除一个 property。
  - 同步 tier 统计。
  - 构造 mutation response。
- 避免一个函数同时做校验、SQL 写入、response 拼装和前端兼容转换。
- 对复杂 SQL 只保留必要注释，说明业务原因，不解释语法本身。

### 性能

- 不把少 SQL 往返退回多次串行查询。
- 不为了“更好读”重新加载整份 draft。
- 空 draft 首次 add 保留跳过 existing properties 查询的优化。
- stable `bidId` 路径继续优先使用直接定位。
- 索引优化必须进入 `sql/migration/`。

### 安全性

- 保留 `draftVersion` 校验。
- 保留 mutation 失败时的 409 / 404 语义。
- 不吞掉业务异常。
- 不打印敏感 payload。

## 验收标准

### 功能

- Days Off 手动 add / patch / delete 行为不变。
- Pairing add / patch / delete 行为不变。
- 日历 off / pairing 冲突拦截不变。
- same-date specific pairing 合并语义不变。
- 前端 message、loading、disabled 状态不回退。

### 性能

真实 DB 临时脚本或等价操作中：

- Pairing add / patch / delete 稳定 `< 2s`。
- Days Off add / patch / delete 稳定 `< 2s`。
- 目标仍保持在约 `500ms-1.5s` 区间，不能明显慢于上一轮结果。

上一轮参考结果：

```text
pairing add initial: ~1570ms
pairing patch stable: ~1120ms
pairing delete stable: ~670ms
days-off add initial: ~1380ms
days-off patch stable: ~1140ms
days-off delete stable: ~690ms
```

### 验证命令

必须通过：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm run build
npm test
```

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test
npm run lint
npm run build
```

还需要执行：

```bash
cd /Users/lei/Codehub/rois-ai
git diff --check
```

如 `pbs-portal/tsconfig.tsbuildinfo` 因 build 变化，必须恢复，不保留 build 产物。

## 风险与控制

### 风险：误删兼容代码

控制：

- 删除前用 `rg` 搜引用。
- 不能只根据命名中的 `legacy` 判定废弃。
- route / contract / portal service 同步检查。

### 风险：重构后性能回退

控制：

- 不恢复整份 draft 保存。
- 不增加无意义的串行 DB 往返。
- 保留真实 DB 性能脚本作为最终验收。

### 风险：SQL 可读性提升但一致性变差

控制：

- 保留 add / patch / delete 后的 bid、tier、group 状态检查思路。
- 避免同一条 CTE 里依赖 Postgres 语句快照看到刚删除/刚插入的数据。
- 复杂 mutation 后继续使用可靠的 tier sync。

## 实施顺序

1. 审计 Days Off / Pairing 当前引用关系。
2. 删除明确无用代码。
3. 整理后端 mutation helper，优先处理最大、最难读的函数块。
4. 整理前端 service / mapper 中的重复或废弃分支。
5. 跑服务端 build/test。
6. 跑前端 test/lint/build。
7. 跑真实 DB 性能脚本。
8. 恢复 build 产物，执行 `git diff --check`。
9. 输出最终总结，列出删除内容、保留原因、性能结果。

## 成功定义

本次成功不是把所有文件拆到很小，而是让当前正在开发的 Days Off / Pairing 代码进入一个更稳的状态：

- 旧逻辑不混在新局部 mutation 主路径里。
- 新人能顺着 add / patch / delete 读懂主要流程。
- 性能结果继续达标。
- 后续继续对齐 AA 文档时，不会在一堆废弃分支里迷路。
