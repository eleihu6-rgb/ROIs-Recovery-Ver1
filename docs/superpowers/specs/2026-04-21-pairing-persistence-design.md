# Pairing 持久化设计

## 背景

`pbs-portal` 当前 `Pairing` 页面右侧工作台仍然完全依赖前端 mock 数据，用户在页面上的新增、删除、编辑只存在于本地状态中，刷新后会丢失。`pbs-server` 当前只提供认证能力，还没有承接 PBS bid 持久化的 API。

仓库现状并不是“完全没有 PBS 数据模型”。`sql/schema/03-pbs_pg.sql` 已经定义了以下 PBS 申请相关表：

- `pbs_bid`
- `pbs_bid_layer`
- `pbs_bid_group`
- `pbs_bid_condition`
- `pbs_bid_property`
- `pbs_period`

因此本次设计的关键不是重新设计一套 Pairing 私有表，而是决定如何在不偏离现有 PBS 业务模型的前提下，让 `Pairing` 页面先具备“当前用户当前周期草稿可持久化”的真实能力。

## 本次确认的范围

第一阶段只做以下能力：

- 只支持当前登录用户
- 只支持当前 PBS 周期
- 只支持 `bid_context = Current`
- 只支持 `Pairing` 页面右侧草稿的真实增删改保存
- 暂不做真实 pairing 搜索
- 暂不做 `Default` 默认偏好
- 暂不做提交、锁定、审核流

这意味着第一阶段目标是“草稿保存与回显”，不是完整 PBS 提交流。

## 决策结论

### 1. 不新增 Pairing 专用主表

第一阶段不新增 `pbs_pairing_draft` 一类的专用业务表，也不新增 portal 私有 JSON 草稿主表。

原因：

- 现有 `pbs_bid*` 表已经表达了 PBS 申请主记录、层、分组、条件链这四层结构。
- 如果先新增 portal 私有表，后续接 `Days Off / Reserve / Line / submit / award` 时大概率还要再迁移一次。
- `pbs-portal` 当前页面虽然是 UI 优先实现，但语义上仍然是 PBS bid 草稿，而不是一份独立于 PBS 领域模型之外的临时文档。

### 2. 第一阶段复用现有 `pbs_bid*` 体系

持久化策略：

- `pbs_bid`：保存当前用户在当前周期下的 Pairing 草稿主记录
- `pbs_bid_layer`：保存当前草稿中实际使用到的层
- `pbs_bid_group`：保存每条 Pairing 属性规则
- `pbs_bid_condition`：第一阶段预留，不强制使用

这条路径的好处是：

- 与现有 SQL 设计一致
- 后续可以平滑扩展到 `Days Off / Reserve / Line`
- 后续提交、锁定、award 可以继续沿用

### 3. 第一阶段接口采用“整份草稿文档保存”

前端第一阶段不做“每个按钮一个接口”的细粒度 RPC 风格接口，而采用：

- `GET` 读取当前草稿
- `PUT` 整份覆盖保存当前草稿

原因：

- 当前 `pbs-portal` `Pairing` 页面本身就是一个本地状态工作台
- 前端已有完整工作态，直接序列化整份草稿最稳
- 可以显著降低第一阶段的联调复杂度

## 为什么不在第一阶段新增表

虽然第一阶段也可以通过新增 `jsonb` 草稿表更快落地，但不推荐。

`jsonb` 草稿表方案的问题：

- 会与 `pbs_bid*` 正式表形成双轨
- 后续需要额外做“草稿格式 -> 正式 PBS 模型”的迁移
- 容易让 portal 的数据格式和 PBS 业务模型脱节

除非后续明确需要“审计快照 / 恢复历史版本 / 长时间并行两套输入模型”，否则第一阶段不值得为速度引入额外模型债务。

## 数据归属与上下文

第一阶段每份 Pairing 草稿由以下三元组唯一标识：

- `crew_id`
- `period_code`
- `bid_context = Current`

主表复用现有唯一约束：

- `uq_pbs_bid (crew_id, period_code, bid_context)`

第一阶段约束：

- 任何读取和写入都只允许访问当前登录用户自己的 `pbs_bid`
- 不允许跨用户读取或写入
- 不允许写入非 `Current` 的上下文

## 前端与后端之间的文档模型

第一阶段在接口层使用 portal 友好的草稿文档，而不是直接把数据库表结构暴露给前端。

建议接口文档模型：

```ts
type PairingDraftDocument = {
  periodCode: string;
  bidContext: "Current";
  remarks?: string;
  properties: Array<{
    rowSeq: number;
    propertyCode: number;
    name: string;
    bid: PairingBidValue;
    layers: string[]; // 例如 ["L4", "L5"]
  }>;
};
```

说明：

- `rowSeq` 是前后端共享的“当前草稿行序号”
- `rowSeq` 不需要新增数据库字段，第一阶段可借用 `pbs_bid_group.group_seq`
- 前端继续保留自己的 `PairingBidValue` 语义，后端负责转换为 `operator / param_a / param_b`

## UI 行到 `pbs_bid*` 的映射方式

### 1. `pbs_bid`

每次保存时，按当前用户 + 当前周期 + `Current` 上下文：

- 不存在则创建
- 存在则更新

建议写入字段：

- `crew_id`
- `period_code`
- `bid_context = 'Current'`
- `status = 'DRAFT'`
- `last_modified_at`
- `remarks`

### 2. `pbs_bid_layer`

`Pairing` 页面里的 `L1-L7` 是 portal 当前使用的层级集合。第一阶段对数据库的处理规则：

- 从所有草稿行中收集所有激活 layer
- 只为当前草稿实际使用到的 layer 创建 `pbs_bid_layer`
- `layer` 存数字层号，例如 `L4 -> 4`
- `total_groups` 为当前层下规则行数
- `is_active = 1`

### 3. `pbs_bid_group`

每一条 portal Pairing 属性行，会按其激活的 layer 扇出为多条 `pbs_bid_group`。

例如：

- portal 一条规则：`Prefer Pairing Length`，激活 `L4` 和 `L5`
- 数据库存储：两条 `pbs_bid_group`
  - `layer = 4, group_seq = 1`
  - `layer = 5, group_seq = 1`

关键约定：

- 同一个 portal 可视行在不同 layer 下共用同一个 `group_seq`
- 读取时后端按 `group_seq + 规则内容` 聚合回 portal 的一条行

这让我们在不新增字段的前提下，就能把“同一规则属于多个 layer”的 portal UI 语义映射回现有 PBS 表结构。

### 4. `pbs_bid_condition`

第一阶段暂不承接复杂 AND 条件链。

当前 portal Pairing 页面右侧工作台展示的可编辑行都是单条件规则，足以落到 `pbs_bid_group` 主条件字段中：

- `property_id`
- `operator`
- `param_a`
- `param_b`
- `param_c`

当 portal 后续引入真正的附加条件链，再把 `pbs_bid_condition` 接上。

## 属性定义与参数映射

第一阶段不把属性名称硬编码在前端或后端。

### 属性来源

属性定义由 `pbs_bid_property` 提供，至少包括：

- `property_code`
- `bid_type`
- `property_name`
- `operator_options`
- `validation_json`

第一阶段 `Pairing` 页面只读取：

- `bid_type = 'Pairing'`
- `is_active = 1`

### `PairingBidValue` 到数据库字段的映射

建议映射规则：

- `stepper`
  - `operator = '='`
  - `param_a = value`
- `time`
  - `operator = '>'` 或按属性定义决定
  - `param_a = value`
- `time-range`
  - `operator = 'Between'`
  - `param_a = from`
  - `param_b = to`
- `date-range`
  - `operator = 'Between'`
  - `param_a = from`
  - `param_b = to`
- `select`
  - `operator = '='` 或 `In`
  - `param_a = value`
- `percent`
  - `operator = '='`
  - `param_a = value`
- `text`
  - `operator = '='`
  - `param_a = value`

这里有一个重要边界：

- 第一阶段允许后端基于 `propertyCode + bid.type` 做有限的规则映射
- 但不允许直接依赖展示文案 `name` 做存储语义判断

## 接口设计

### 1. 读取当前草稿

`GET /api/pairing-bids/current`

职责：

- 根据登录态识别当前用户
- 解析当前周期
- 读取当前用户当前周期的 `Current` 草稿
- 转换为 portal 友好的文档结构

返回：

- 若不存在草稿，返回一个空草稿文档
- 同时返回 Pairing 属性目录，供右侧 “available properties” 渲染

### 2. 保存当前草稿

`PUT /api/pairing-bids/current`

职责：

- 校验 payload
- 以事务方式写入 `pbs_bid / pbs_bid_layer / pbs_bid_group`
- 第一阶段采用“覆盖式保存”

覆盖式保存策略：

1. 锁定当前 `pbs_bid`
2. upsert 主记录
3. 删除当前 bid 关联的旧 layer/group/condition
4. 按新 payload 全量重建

理由：

- 第一阶段最稳
- 容易保证 portal 本地状态和数据库一致
- 回归测试简单

### 3. 提交接口

第一阶段先不实现，但预留为下一步：

`POST /api/pairing-bids/current/submit`

提交时需要额外校验：

- 周期是否开放
- 草稿是否为空
- 当前 bid 是否已锁定

## 当前周期解析策略

这是第一阶段唯一需要进一步落实现细节、但不阻塞方案成立的点。

推荐优先级：

1. 服务端优先从 `pbs_period` 解析当前开放周期
2. 若当前环境尚未准备好 `pbs_period` 数据，则第一阶段可允许显式传入 `periodCode`
3. 一旦 `pbs_period` 数据可用，前端不再自己决定周期

即：

- 第一阶段可以兼容显式 `periodCode`
- 最终归一应由服务端决定当前周期

## 是否需要新增表或改表

### 第一阶段结论

- 不新增核心 Pairing 专用表
- 不新增 portal 草稿专用表
- 不强制改动现有 SQL schema

### 仅在下列情况再考虑 schema 变更

只有当后续出现以下需求时，再评估改动 `pbs_bid_group` 或增加辅助表：

- 需要稳定追踪“同一 portal 行”跨多次编辑的历史身份
- 需要复杂条件链的可视化拖拽编辑
- 需要完整历史版本/回滚/审计

在那之前，先用 `group_seq` 作为 portal 行聚合键足够。

## 后端实现建议

`pbs-server` 第一阶段新增内容：

- Drizzle models
  - `pbs_bid`
  - `pbs_bid_layer`
  - `pbs_bid_group`
  - `pbs_bid_condition`
  - `pbs_bid_property`
  - `pbs_period`
- services
  - `pairing-bid-service.ts`
- routes
  - `pairing-bids.ts`
- contracts
  - 新增 `packages/contracts/pbs-pairing-bids.ts`

路由层职责：

- 解析登录用户
- 校验请求
- 调用 service
- 返回统一 `{ code, data, message }`

业务层职责：

- 周期解析
- 草稿读写事务
- portal 文档与数据库模型转换

## 前端实现建议

`pbs-portal` 第一阶段改动建议：

- 保留左侧日历和 schedule mock，不在本阶段强行接真实搜索结果
- `pairing-service` 改为真实请求：
  - 读取草稿
  - 保存草稿
- `PairingRightPanel` 保持当前本地交互手感
- 在以下动作后触发保存：
  - 添加属性
  - 删除属性
  - 编辑 bid 值
  - 切换 layer
  - Reset All

第一阶段可以先做显式保存，也可以做 debounce 自动保存；推荐先做显式或低频保存，降低联调复杂度。

## 校验与权限

服务端需要至少校验：

- 登录用户必须存在
- 只能访问自己的草稿
- `bid_context` 只能是 `Current`
- `propertyCode` 必须存在于 `pbs_bid_property`
- `bid_type` 必须是 `Pairing`
- `layer` 必须在允许范围内
- 已锁定记录不可修改

## 测试建议

### `pbs-server`

- service 单测
  - 空草稿读取
  - 首次保存
  - 再次覆盖保存
  - 多 layer 同一规则扇出与聚合
  - 非本人访问拒绝
  - 锁定状态拒绝修改

### `pbs-portal`

- `pairing-service` 集成测试
- `PairingPage` / `PairingRightPanel` 回归测试
  - 保存后刷新仍可回显
  - 删除后重新读取不再出现
  - layer 切换后重新读取仍保持一致

## 风险与后续

第一阶段最大风险不是数据库，而是 portal 当前 UI 与正式 PBS 规则语义之间还存在一定抽象差距，主要体现在：

- portal 里的一条规则可同时勾选多个 layer
- 现有 SQL 模型里一条 `pbs_bid_group` 只能属于一个 layer

本设计通过“同一 portal 行按激活 layer 扇出、多条 group 共用 `group_seq`”解决这个问题，足够支撑第一阶段草稿保存。

如果后续 portal 发展成真正的 PBS 规则编排器，再评估是否需要更强的行级标识或规则快照能力。

## 推荐结论

第一阶段采用：

- 复用现有 `pbs_bid*` 表
- 不新增核心表
- 接口使用 `GET + PUT` 的整份草稿模式
- 只做当前用户、当前周期、`Current` 草稿的真实保存

这是当前成本最低、后续扩展最顺的实现路径。
