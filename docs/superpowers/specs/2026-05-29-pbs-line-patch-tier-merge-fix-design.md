# PBS Line 编辑条件 tier 合并 409 修复设计

## 背景

用户在 `EXISTING LINE PROPERTIES` 中编辑 `Commuter Pattern`，把 tiers 从 `T1` 改为 `T1, T4` 时，接口返回：

```json
{ "code": 409, "message": "This line property already exists." }
```

但页面只看到一个 `Commuter Pattern`。这说明后端把一次“编辑已有条件并扩展 tier”的操作误判成了“新增重复条件”。

## 目标

- Line PATCH 编辑已有 property 时，如果新配置与已有同条件 property/tier 有交叠，应允许进入已有 SQL 合并逻辑。
- 保持新增 property 的重复校验不变：真正重复添加仍返回 409。
- 保持 Pairing、DaysOff、Reserve 不变。
- 修复后用户可以把 `Commuter Pattern` 从 `T1` 改成 `T1,T4`，后端保存成功，并返回合并后的 tiers。

## 范围

- 后端：`pbs-server/src/services/line/line-bid-service.ts`
- 后端验证：运行 Line 相关 helper、validation、route 测试，确认 PATCH 路由与 Line 条件校验不受影响。

## 设计

当前 `replaceLineDraftPropertyWithTierSync` SQL 已经支持：

- 找到目标 `propertyGroupKey`
- 查找同一 bid 下相同 Line 条件签名的其他 groups
- 删除重复 groups
- 将请求 tiers upsert 到目标 group
- 同步 tier 计数并提升 draft version

问题出在 PATCH 调用 SQL 前执行了 `hasDuplicateLineDraftProperties(nextProperties)`。这个预校验按 `propertyCode + bid + tiers` 判断重复，会在某些“已有重复 group 等待合并”的状态下提前返回 409，导致 SQL 合并逻辑没有机会执行。

修复方案：

- PATCH 路径移除 `hasDuplicateLineDraftProperties(nextProperties)` 这一步。
- 保留 `validateLineDraftProperties(nextProperties)`，继续校验 Line 条件本身是否合法。
- 让 `replaceLineDraftPropertyWithTierSync` 作为 PATCH 的唯一持久化合并入口。
- 返回结果中的 `tiers` 使用请求的标准化 tiers，前端下一次刷新会从 DB 读到合并后的单行。

## 验收标准

- 编辑一个已存在 Line condition 的 tiers，不应因为同条件历史 group 返回 409。
- `POST /line-bids/current/properties` 的重复添加语义保持不变。
- TypeScript 编译不应新增 Line 相关错误。
- Line 相关后端测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复范围很小，主要在 Line 后端一个服务方法和对应测试；并行开发协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/line/*` 与本 spec 文档。
- Conflict risk: 低。
- Execution gate: 用户已明确要求“修复吧”，本 spec 作为确认记录后直接实施。
