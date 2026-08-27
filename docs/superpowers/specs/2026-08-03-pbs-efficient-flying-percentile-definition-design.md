# PBS Efficient Flying Percentile 定义管理设计

## 1. 背景

PBS Portal 的 `Efficient Flying First` 条件允许用户选择：

- `Efficient flying`
- `Inefficient flying`

页面当前显示 `Top 20% by average daily credit` 或 `Bottom 20% by average daily credit`。这个百分比已经由 dictionary 参数控制：

```text
parent_code = PBS_EFFICIENT_FLYING_CONFIG
code        = PERCENTILE
code_value  = 20
```

PBS Portal、PBS Pairing Search 和算法导出都会读取该值，但 Gantt 管理端的 `Bid Definitions` 页面尚不能维护它。

## 2. 目标

在现有 `Bid Definitions` 页面新增 `Efficient Flying Percentile`，允许管理员维护 Efficient/Inefficient Flying 的公司统一百分位范围。

修改后：

- Gantt 显示当前百分比，例如 `20%`。
- 管理员可以将其修改为 `1–50` 的整数。
- PBS Portal 每次打开 `Efficient Flying First` 弹窗时主动重新请求配置，并在服务端缓存有效期结束后显示最新值。
- Pairing Search 和算法导出使用同一 dictionary 定义；缓存型消费者在 30 秒内完成收敛。
- Current Bid、Standing Bid 和 Favorite 中已有的 Efficient Flying 条件不改写记录，但后续匹配自动使用最新百分比。

## 3. 非目标

- 不把百分比保存进每一条 Bid、Standing Bid 或 Favorite。
- 不批量更新已有 Bid 数据。
- 不新增数据库表或新的参数来源。
- 不改变 Average Daily Credit 的计算方式。
- 不改变 Efficient/Inefficient Flying 的 Base、Rank、Division 或 Bid Period 分组范围。
- 不改变现有弹窗的布局和选择方式。

## 4. 业务规则

### 4.1 百分比语义

`PERCENTILE = 20` 表示：

- `Efficient flying`：匹配 Average Daily Credit 最高的 20%。
- `Inefficient flying`：匹配 Average Daily Credit 最低的 20%。

管理员将其改为 `15` 后，后续预览、搜索和导出统一按 Top/Bottom 15% 计算。

现有百分位算法保持不变：样本数乘以百分比后四舍五入、最少选择 1 条，并按 cutoff 使用 `>=` / `<=` 纳入并列值。因此实际命中数量可能超过严格的 15%，本功能只改变输入百分比，不改变 rounding、minimum-one 或 tie-inclusive 规则。

### 4.2 已有 Bid 的行为

Efficient Flying Bid 只保存方向：

```json
{ "type": "efficient-flying-preference", "mode": "efficient" }
```

Bid 本身不保存百分比。管理员更新公司定义后：

- 已有 Bid 记录保持不变。
- 不增加 Bid 版本，不改写 Current、Standing 或 Favorite 表。
- 这些 Bid 下次参与预览、搜索或算法导出时，使用最新百分比。

这是动态公司定义，与 Minimum Base Layover 对历史具体时长的 grandfathered 规则不同。

### 4.3 有效值

- 仅允许整数。
- 最小值为 `1`。
- 最大值为 `50`。
- 不接受空值、小数、负数、`0` 或大于 `50` 的值。

## 5. 架构与数据流

### 5.1 唯一事实源

继续使用现有 dictionary 行：

```text
PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE
```

前端、live-server、pbs-server 和导出逻辑不得增加百分比常量或备用默认值。

共享 contract 负责定义 parent/code、`1–50` 解析和展示格式。管理端读取、pbs-server config、live-server export 应复用该解析规则；若受模块边界限制无法直接复用，则必须通过同一组 contract fixture 锁定一致行为。禁止的是运行时固定百分比 fallback，测试 fixture 中用于构造场景的 `20` 不属于业务硬编码。

### 5.2 管理端读取

1. 管理员打开 Gantt `PBS > Bid Definitions`。
2. live-server 从 dictionary 读取 Efficient Flying Percentile。
3. API 返回定义值、展示值和审计信息。
4. Gantt 在现有表格追加第五行。

### 5.3 管理端保存

1. 管理员点击该行编辑图标。
2. `AppDialog` 显示一个整数输入框。
3. Gantt 校验 `1–50`。
4. live-server 使用 Zod 再次校验。
5. live-server 在事务中更新 `code_value`、`updated_by`、`updated_at`。
6. PATCH 返回完整的更新后 definition row，Gantt 随后重新读取全部定义并刷新表格。

保存流程不得访问或更新任何用户 Bid 表。

### 5.4 PBS 消费

现有服务端消费链保持不变，Portal 配置加载增加弹窗打开时主动 refetch：

- pbs-server 的 Efficient Flying config service 读取 dictionary。
- Portal 通过现有配置接口显示最新百分比；每次打开 `Efficient Flying First` 弹窗都显式 refetch，不能只依赖 TanStack Query `staleTime`。
- Pairing Search 将最新值传给 cohort SQL。
- live-server 和 pbs-server 的算法导出使用同一 dictionary 值。

### 5.5 生效时序

本功能采用有界最终一致，而不是新增跨服务强制失效机制：

- Gantt Bid Definitions：PATCH 成功后立即显示新值。
- live-server export：直接读取数据库，新请求立即使用新值。
- pbs-server Efficient Flying config / Pairing Search：沿用现有最多 30 秒的服务端配置缓存。
- PBS Portal：每次打开弹窗显式 refetch；请求结果仍可能受 pbs-server 最多 30 秒的服务端配置缓存影响。
- pbs-server export：按其现有配置读取策略生效，测试必须锁定其最大延迟不超过 30 秒。

因此系统在管理员保存后最多 30 秒内收敛。管理页面应提示 `Changes may take up to 30 seconds to appear in PBS searches and dialogs.`。本次不引入跨 live-server / pbs-server Redis 失效、消息总线或额外版本表。

## 6. API 与 Contract

扩展现有 PBS Bid Definitions contract：

- 新增 definition code：`efficient-flying-percentile`
- 可用值：`{ available: true, percentile: number }`
- 不可用值：`{ available: false }`
- 新增保存路由：
  `PATCH /api/pbs/bid-definitions/efficient-flying-percentile`
- 请求体：

```json
{ "percentile": 20 }
```

响应继续使用项目统一格式：

```json
{
  "code": 200,
  "data": {
    "code": "efficient-flying-percentile",
    "value": { "available": true, "percentile": 20 },
    "displayValue": "20%",
    "updatedBy": "admin",
    "updatedAt": "2026-08-03T00:00:00.000Z"
  },
  "message": "ok"
}
```

读取和修改权限与现有 Bid Definitions 一致，仅管理员可用。并发写入沿用现有 last-write-wins 语义。

## 7. UI 设计

在现有 Bid Definitions 表格追加一行：

| Definition | Current Value | Description |
|---|---|---|
| Efficient Flying Percentile | `20%` | Percentage used for the highest and lowest average daily credit cohorts. |

编辑弹窗沿用现有 `AppDialog`：

- 标题：`Edit Efficient Flying Percentile`
- 字段：`Percentile`
- 输入类型：整数
- 辅助文本：`Allowed range: 1–50%`
- 生效提示：`Changes may take up to 30 seconds to appear in PBS searches and dialogs.`
- 操作：`Cancel`、`Save`

字段错误必须绑定到输入框，并提供 `aria-invalid` 和可访问描述；不能只使用 toast。

## 8. 错误处理

- Gantt 拒绝无效值并保持弹窗打开。
- live-server 拒绝无效请求，不能写库；服务端返回的 400 validation error 必须映射回 `Percentile` 字段并保持弹窗打开。
- 网络错误或 5xx 使用项目统一 toast；只显示清洗后的产品文案，不暴露原始异常。
- dictionary 行缺失时事务回滚，不自动插入，也不使用硬编码 20%。
- 读取失败继续使用现有局部错误面板和 `Retry`。
- Portal 读取不到有效配置时继续显示 `Efficient flying configuration is unavailable.`，并阻止依赖该定义的提交或搜索。
- 用户界面不暴露数据库错误、堆栈或原始异常。

## 9. 测试与验收

### 9.1 Contract 与 live-server

- contract 能解析 `1–50` 的整数并格式化为百分比。
- contract 统一导出 parent/code、parse/format，并被管理端和两类服务端消费者复用或由一致性 fixture 锁定。
- GET Bid Definitions 返回第五项及审计信息。
- PATCH 正确更新 dictionary。
- PATCH 拒绝空值、小数、负数、`0` 和大于 `50` 的值。
- dictionary 行缺失时回滚且不发生部分更新。
- 非管理员请求返回 403。

### 9.2 PBS 回归

- pbs-server 继续从 dictionary 读取最新百分比。
- Portal 弹窗显示最新 Top/Bottom 百分比。
- Pairing Search cohort SQL 使用最新百分比。
- live-server `pairing-score-export` 使用最新百分比。
- pbs-server algorithm export 使用最新百分比。
- 已有 Current、Standing 和 Favorite 记录不包含百分比，也不会在定义保存时被更新。
- 配置缺失或非法时不回退到固定 20%。
- 缓存键或配置缓存不会在 30 秒窗口结束后继续返回旧百分比。
- Current、Standing、Favorite 原 payload 仍只包含 `mode`，定义保存过程不写入用户 Bid 表。

### 9.3 Playwright

通过真实 Gantt UI：

1. 管理员看到第五行 `Efficient Flying Percentile`。
2. 打开编辑弹窗。
3. 无效值显示字段错误且无法保存。
4. 保存新值后表格立即显示新百分比。
5. 刷新页面后仍显示数据库中的最新值。

通过真实 PBS Portal UI：

1. 先以配置 `20` 打开 `Efficient Flying First` 并确认显示 `Top 20%`。
2. 管理员将配置改为 `15`。
3. 在同一 Portal 会话中等待最多 30 秒并重新打开弹窗，主动 refetch 后 Efficient 显示 `Top 15%`。
4. 切换 Inefficient 后显示 `Bottom 15%`。
5. Preview/Search 与 live-server、pbs-server 两套 Export 均使用 `15`，且缓存窗口结束后不再返回 `20`。

### 9.4 必跑门禁

- contract 测试
- live-server Bid Definitions 路由测试
- pbs-server Efficient Flying config/search/export 相关测试
- live-server `pairing-score-export` 测试
- Gantt Playwright
- PBS Portal Playwright
- `npm run check:ui`
- 受影响模块 build/typecheck
- PBS QA 人工用例：`docs/test-cases/pbs/pairing/2026-08-03-efficient-flying-percentile-definition.md`

## 10. 数据库与发布

现有 schema、seed、dev、SIT 和 UAT 已使用该 dictionary 定义，因此原则上不新增 migration。

发布前必须执行只读 verify SQL，确认该 parent/code 恰好一行，且 `code_value` 是 `1–50` 的整数。缺失、重复或非法时阻止发布，并通过幂等 migration 修复；运行时代码不得自动插入。

部署本功能不会修改当前值。当前 `20` 会继续生效，直到管理员在页面主动修改。

## 11. 风险与约束

- 修改百分比会在最多 30 秒的一致性窗口内改变已有 Efficient Flying Bid 的匹配集合，这是本功能明确接受的动态公司定义行为。
- 百分比改变可能影响 Preview 数量和算法输出，管理员保存前必须能清楚看到新值。
- 所有消费者必须继续使用 dictionary；允许在已声明的 30 秒缓存窗口内短暂存在旧值，窗口结束后不得继续分叉。
- 本次只扩展现有 Bid Definitions，不建设通用参数管理器。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、live-server、Gantt 和现有 PBS 消费链共享同一简单定义，改动规模小且契约紧密。
- Suggested split: 不拆分；由主代理串行完成 contract、API、UI、测试和验证。
- Write boundaries: 单代理负责所有相关文件。
- Conflict risk: 多代理可能同时修改现有 Bid Definitions contract、路由和 E2E fixture，冲突收益不划算。
- Execution gate: 用户审阅并批准本 spec 后，才进入实施计划和代码修改。
