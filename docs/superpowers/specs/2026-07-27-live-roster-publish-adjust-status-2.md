# roster_publish_adjust published 状态扩展

## 背景

SIT 的 `roster_publish_outbound` scheduler 每 300 秒触发一次，但当前 outbound 回调连续失败。现有实现会在抢占待发送批次时把 `published` 临时写成 `2`，成功后又把整批写成 `1`，因此无法区分“已发布”和“IMP 导入、不需要发布至 NOC”的记录。

## 目标

让 `roster_publish_adjust.published` 的最终状态可直接反映处理结果：

- `0`：新产生、等待发布，或发布失败后等待重试。
- `1`：已正确发布至 NOC。
- `2`：当前 roster 来源为 `IMP`，明确不发布至 NOC。

`2` 不再作为永久状态之外的模糊“处理中”结果；内部抢占可以继续使用暂态，但必须在同一次处理结束前收敛为 `0`、`1` 或 `2`。

## 设计

1. 数据库 schema/migration：
   - `published` 默认值设为 `0`。
   - 保留 `smallint`，增加状态注释，明确 `2=IMP imported / excluded from NOC publish`。
   - SIT 当前 `old_source='IMP' OR new_source='IMP'` 的记录改为 `2`；不修改非 IMP 的 `0`/`1` 记录。
2. outbound 批处理：
   - 继续按 batch 原子抢占待处理行，避免同一批被并发重复发送。
   - payload 构造沿用现有规则：任一侧 source 为 `IMP` 的行不进入 NOC payload。
   - 对被跳过的 IMP 行写 `published=2`。
   - 只对实际进入 payload 的行执行成功/失败更新：成功写 `1`，失败恢复为 `0`。
   - 如果整批只有 IMP 行，不调用 connector，直接把这些行写为 `2`，scheduler 本轮视为无发送但处理完成。
3. 新产生数据：
   - `roster_publish_service` 继续插入 `published=0`，确保状态含义统一。
   - 后续 outbound worker 遇到新产生的 IMP 行时自动转为 `2`，避免未来 IMP 数据被重复处理。
4. 验证：
   - 增加/更新 Vitest，覆盖普通行成功为 `1`、普通行失败回到 `0`、IMP 行为 `2` 且不进 payload、混合 batch 不影响普通行发送。
   - 运行 live-server focused test、build、`git diff --check`。
   - 部署 SIT 后检查 scheduler run、`roster_publish_adjust` 三态分布、outbound log 和 connector-server 健康接口；若外部 NOC 仍返回未知 HTTP 错误，保留为独立链路问题，不把失败标为 `1`。
   - connector/server 与 live/server 的运维日志保留 connector 返回的原始异常详情；仅在没有任何异常详情时使用通用兜底文本。
   - 对最近失败的 batch 使用 `ROSTER_PUBLISH_OUTBOUND_RETRY_COOLDOWN_MS` 冷却窗口（默认 1 小时）；冷却期间 scheduler 不重新请求、不新增重复错误日志，窗口到期后自动重试。

## 不在范围

- 不改变 NOC callback payload 格式。
- 不把 `query_outbound` placeholder 接口改造成真实查询接口。
- 不清理既有 outbound 日志或历史 scheduler run。
- 不修改非 IMP 记录的业务发布语义。
