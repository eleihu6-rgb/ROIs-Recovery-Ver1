# PBS Days Off / Pairing 局部 Mutation 性能优化设计

## 背景

Days Off / Pairing 页面已经从“整份 draft 保存”改成局部 mutation：

- Days Off property 新增、修改、删除走 `propertyGroupKey` 或新增 payload。
- Pairing property 新增、修改、删除走 `propertyGroupKey` 或新增 payload。
- Calendar Days Off 走 `(date, tier, selected)` 局部 patch。
- 前端两个页面不再调用旧的整份 `saveCurrentDraft`。

这个方向是正确的：接口语义更清晰、并发覆盖风险更低、payload 更小。但是用户在浏览器 Network 面板发现多个局部 mutation 接口超过 2 秒，甚至接近 3 秒。实际体验不能因为 id-based 改造变差。

本设计用于修复该问题：**id-based / 局部 mutation 不只是标准化，实际性能也必须优于或至少不差于旧整份保存。**

## 已确认现象

以浏览器 Network 单个接口耗时为准：

- `request.ts:40` 对应 `POST`，即新增 property，截图中有约 `3.17s` 的请求。
- `request.ts:54` 对应 `PATCH`，即修改 property，截图中有约 `2.98s` 的请求。
- `request.ts:57` 对应 `DELETE`，即删除 property，截图中有约 `2.94s` 的请求。
- 多个 `current` GET 约 `0.5s-0.9s`，反而不是最慢点。

只读排查发现：

- PBS DB 单次往返稳定约 `150ms`。
- SOURCE DB 单次往返稳定约 `120ms`。
- 小 payload 仍然慢，说明瓶颈不是请求体大小，而是服务端 mutation 内部串行 DB 往返、校验和 SQL 链路。
- Pairing specific-date 相关逻辑会触达 live pairing / pairing_segment 数据，且 `upper(pairing_label)` 这类查询存在不稳定吃索引的风险。

## 目标

1. 保持当前 id-based / 局部 mutation API 语义。
2. 保持 `draftVersion` 并发保护。
3. 保持 Days Off / Pairing 同 Tx 日期冲突校验。
4. 把 Days Off / Pairing 高频 mutation 接口性能压回可接受范围。
5. 优化后不能比旧整份保存更慢。

## 验收标准

以本地开发环境浏览器 Network 面板为准，连续真实操作：

- Days Off `POST /api/days-off-bids/current/properties`：稳定 `< 2s`，目标 `500ms-1s`。
- Days Off `PATCH /api/days-off-bids/current/properties/:propertyGroupKey`：稳定 `< 2s`，目标 `500ms-1s`。
- Days Off `DELETE /api/days-off-bids/current/properties/:propertyGroupKey`：稳定 `< 2s`，目标 `500ms-1s`。
- Pairing `POST /api/pairing-bids/current/properties`：稳定 `< 2s`，目标 `500ms-1s`。
- Pairing `PATCH /api/pairing-bids/current/properties/:propertyGroupKey`：稳定 `< 2s`，目标 `500ms-1s`。
- Pairing `DELETE /api/pairing-bids/current/properties/:propertyGroupKey`：稳定 `< 2s`，目标 `500ms-1s`。

补充验收：

- 不能破坏现有功能。
- 不能移除业务校验来换速度。
- 不能把问题转移成前端假快、后端仍慢。
- `pbs-server npm test` 通过。
- `pbs-server npm run build` 通过。
- `pbs-portal npm test` 通过。
- `pbs-portal npm run lint` 通过。
- `pbs-portal npm run build` 通过。

## 范围

本次只优化以下模块：

- `pbs-server/src/services/pairing/pairing-bid-service.ts`
- `pbs-server/src/services/days-off/days-off-bid-service.ts`
- 必要时优化 pairing occurrence 查询：
  - `pbs-server/src/services/pairing-search/pairing-occurrence-query.ts`
- 必要时补充 SQL migration：
  - `sql/migration/`
- 必要时补充轻量性能日志或开发诊断工具。

不在本次范围：

- 不改 AA 业务规则。
- 不改 Pairing / Days Off 页面交互。
- 不删除后端 PUT 兼容接口。
- 不改 Line 页面整份保存。
- 不做大范围架构重写。

## 推荐方案

采用“先定位，后定向优化”的方案。

### 第一步：服务端分段耗时日志

给 Days Off / Pairing mutation 加可控的分段耗时日志，用于真实点击时定位瓶颈。

建议记录：

- route total time
- catalog cache / load time
- current period / bid reference time
- draft lock time
- load existing properties time
- validation time
- live pairing occurrence query time
- insert / patch / delete SQL time
- tier sync time

日志必须满足：

- 默认开发可用。
- 不打印敏感 crew 数据、token、完整 bid 内容。
- 日志字段简短，方便 grep。
- 后续如果不需要，可保留为低噪声 debug 日志或收敛成慢请求日志。

### 第二步：针对慢点优化 SQL 和串行链路

根据分段日志优化，不盲目大改。

优先方向：

- 减少 mutation 内部串行 DB 往返。
- 能用一次 CTE 完成的 add / delete / patch，不拆成多次 select/update/delete。
- 避免为了校验加载不必要的完整 draft。
- 只加载当前 property 所需的最小数据。
- 对 same-tier duplicate / merge 这种需要全局上下文的校验，保留必要加载，但避免重复加载。
- Pairing specific-date day off 冲突校验只在 propertyCode / bid 类型确实需要时执行。

### 第三步：Pairing occurrence 查询优化

如果日志显示 live pairing 查询慢，优先处理：

- `upper(pairing_label)` 查询是否需要 functional index。
- `pairing_segment(pairing_id, is_deleted)` 或相关组合索引是否需要补充。
- 把 origin date 范围过滤尽量下推，避免扫描大量 pairing 后再过滤。
- 查询只返回 conflict 校验需要的字段，不加载多余信息。

如果需要改数据库：

- 必须在 `sql/migration/` 新增 migration SQL。
- migration 必须幂等。
- 不修改已确认 schema 建表脚本。

### 第四步：前端刷新链路检查

虽然当前截图显示 mutation 自身慢，但仍需确认前端没有制造额外等待：

- mutation 成功后不能 `await` 非关键的 invalidate，除非 UI 必须等待它完成。
- Pairing / Days Off 局部 cache patch 应保持同步更新。
- calendar / tier refetch 可以后台触发，但不应该阻塞按钮恢复，除非业务依赖实时结果。

## 数据流设计

### Days Off Add

当前目标：

1. 校验 payload。
2. 根据 `bidId` / `draftKey` / `periodCode` 定位 current bid。
3. 校验 `draftVersion`。
4. 校验新增 property 与现有 properties 的规则冲突。
5. 写入 `pbs_bid_group` / 必要 tier。
6. 更新 bid version。
7. 返回新增 property identity 和新 version。

优化重点：

- 如果 `bidId` 已存在，优先用 `bidId` 直达，不绕 period 查找。
- 只加载校验所需的 existing properties。
- 写入和 version 更新尽量合并。

### Days Off Patch

当前目标：

1. 使用 `propertyGroupKey` 定位目标 property。
2. 校验目标存在。
3. 校验 patch 后规则不冲突。
4. 删除/替换该 property 的 group rows。
5. 同步 tier 和 version。

优化重点：

- 用 `propertyGroupKey` 精确定位目标 group。
- 避免整份删除重建。
- patch 后如果所有 tiers 为空，走等价 delete 逻辑。

### Days Off Delete

当前目标：

1. 使用 `propertyGroupKey` 精确删除目标 property。
2. 后续 groupSeq 前移。
3. 同步 tier 和 version。

优化重点：

- 保持单 SQL / 少 SQL CTE 方案。
- 先检查当前 delete 是否已经足够快；不要为了统一风格反而改慢。

### Pairing Add / Patch

当前目标：

1. 保持 property 规则校验。
2. 保持 specific-date pairing 与同 Tx day off 冲突校验。
3. 保持 Pairing Number same-date merge 逻辑。
4. 局部写入目标 property。

优化重点：

- specific-date conflict 校验只对需要的 property 执行。
- occurrence 查询按 pairing number / period 只查必要数据。
- 若同一请求内已经拿到 existing properties，不重复加载。
- 如果 merge 命中，只替换被 merge 的 property，不重写整份。

### Pairing Delete

当前目标：

1. 用 `propertyGroupKey` 删除 property。
2. groupSeq 前移。
3. 同步 tier 和 version。

优化重点：

- 优先改成与 Days Off delete 类似的少 SQL CTE。
- 不触发 live pairing 查询。

## 错误处理

保持现有错误语义：

- `400`：payload 无效。
- `401`：未认证。
- `404`：目标 property / draft 不存在。
- `409`：`draftVersion` 冲突或业务冲突。
- `500`：未知服务端错误。

新增性能日志不能改变响应结构。

## 测试计划

后端：

- 保留现有 route 测试。
- 补充/更新 add / patch / delete mutation 测试，确保：
  - version 更新正确。
  - propertyGroupKey 定位正确。
  - patch empty tiers 等价 delete。
  - pairing specific-date 与 day off 冲突仍拦截。
  - same-date pairing merge 仍合并 Tx。

前端：

- 保留现有页面测试。
- 确认页面仍调用 `addCurrentDraftProperty` / `patchCurrentDraftProperty` / `removeCurrentDraftProperty`。
- 确认操作成功 message / loading / disabled 状态仍存在。

性能验证：

- 浏览器 Network 真实点击验证六类 mutation。
- 如有日志，记录优化前后关键接口耗时。
- `git diff --check` 通过。

## 风险与约束

- 数据库 RTT 较高，优化重点必须是减少串行 DB 往返。
- Pairing live source 查询跨 schema / source DB，不能假设本地内存速度。
- 不能为性能删除业务校验。
- 如果需要索引，必须走 migration，并说明索引用途。
- 不做无关重构，避免把当前已经稳定的页面功能改坏。

## 实施顺序

1. 加分段耗时日志，复现截图里的慢请求。
2. 根据日志确认最大瓶颈。
3. 优化 Days Off add / patch / delete。
4. 优化 Pairing delete。
5. 优化 Pairing add / patch，重点处理 occurrence / conflict 校验。
6. 如需要，补 SQL migration。
7. 跑全量验证。
8. 用浏览器 Network 做最终验收。

## 结论

本次优化的核心不是重新讨论 id-based 是否正确，而是补齐它应有的性能结果：

**局部 mutation 必须真正局部、真正更快、真实用户体验不能倒退。**

