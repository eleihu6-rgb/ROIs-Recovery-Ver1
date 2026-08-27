# Lineholder Monthly Bid 一期设计

## 背景

当前 `pbs-portal` 的共享工作台已经开始朝 PBS bidding workbench 方向演进：

- 左侧 `BIDDING CALENDAR` 已经改为跨页面共享
- `Pairing` 已经具备真实后端草稿保存能力
- `Days Off` 仍然只是 UI 壳子
- `Line` 还没有真正落地
- `Reserve` 页面存在，但它不是当前这条主业务线的一部分

本次确认后的产品方向很明确：

- 第一阶段先不做 `Reserve`
- 先把 `Lineholder` 的一条完整业务线打通
- 这条业务线是：
  - `Calendar`
  - `Pairing`
  - `Line`
  - `Days Off`

这里的关键不是“做 4 个页面”，而是让这 4 个入口都真实挂到同一份当前用户、当前 PBS 周期的 `Lineholder draft` 上。

## 本次确认的范围

第一阶段只做以下能力：

- 只做 `Lineholder`
- 只做当前登录用户自己的数据
- 只做当前 PBS 周期
- 只做 `bid_context = Current`
- `Pairing / Line / Days Off` 都走真实后端接口和数据库存储
- 左侧 `Calendar` 第一阶段只支持“具体 Days Off 点选/取消”
- `Line` 页面也要做成真实前后端业务页，不再是占位
- `Layer` 页面要能读取这份统一 `Lineholder draft` 的真实映射和汇总

第一阶段明确不做：

- `Reserve`
- `Default` 默认偏好
- 最终 PBS award / result 计算
- 日历上的具体 pairing 指定
- 日历直接编辑 line 结构

## 核心决策

### 1. 不是四份草稿，而是一份统一的 Lineholder draft

第一阶段不把 `Calendar / Pairing / Line / Days Off` 各做一套独立持久化。

统一模型：

- 每个用户
- 在每个 PBS 周期
- 在 `Current` 上下文下
- 只有一份 `Lineholder draft`

这份 draft 在数据库侧仍然复用现有 PBS 主模型：

- `pbs_bid`
- `pbs_bid_layer`
- `pbs_bid_group`
- `pbs_bid_condition`

这样做的原因：

- 符合现有 PBS 领域模型
- 后续 `submit / lock / award` 更容易往下接
- 不会把 portal 页面结构误做成 4 套彼此孤立的私有草稿

### 2. 统一底层 draft，但接口按模块拆开

虽然底层是同一份 draft，但接口第一阶段不做成一个超大 `/lineholder-bids/current` 文档接口。

推荐接口边界：

- `GET /api/pairing-bids/current`
- `PUT /api/pairing-bids/current`
- `GET /api/line-bids/current`
- `PUT /api/line-bids/current`
- `GET /api/days-off-bids/current`
- `PUT /api/days-off-bids/current`
- `GET /api/calendar-days-off/current`
- `PUT /api/calendar-days-off/current`
- `GET /api/lineholder-bids/current/summary`

设计含义：

- 每个页面只读写自己的业务切片
- 但这些接口在后端内部都解析到同一个 `bid_id`
- `summary` 接口负责给 `Layer` 页面读统一汇总

这样可以兼顾两点：

- 前端页面联调简单
- 后端仍然保持“单一 Lineholder draft”的真实语义

### 3. Calendar 的具体 Days Off 不应硬塞进 `pbs_bid_group`

左侧 `Calendar` 的第一阶段能力是“点具体哪天想休”。

这类数据和右侧 `Days Off` 页的泛化规则不是一回事：

- 日历点选是“具体日期请求”
- 右侧 `Days Off` 是“泛化休息偏好”

如果把日历点选也硬塞进 `pbs_bid_group`，虽然理论上能做，但会带来几个问题：

- 回显会别扭
- 日历交互读写会绕
- 后续扩展和汇总会变复杂

因此第一阶段采用混合方案：

- `Pairing / Line / Days Off` 继续落在 `pbs_bid_group / pbs_bid_condition`
- `Calendar specific days off` 单独落一张明细表

这是第一阶段最重要的结构决策。

### 4. 第一阶段只做 `Current`

当前阶段只支持：

- `bid_context = Current`

不做：

- `Default`

原因：

- 当前目标是先打通一条可工作的真实主链
- `Default` 会把读取、继承、覆盖逻辑复杂度明显拉高
- 它不影响当前阶段验证“统一 Lineholder draft”的基本正确性

## 业务语义拆分

### 1. Calendar

第一阶段 `Calendar` 的角色是：

- `Lineholder` 的“具体休息日请求”入口

它承接的是 AA 语义里的：

- 在月历上直接点具体日期，表达“这一天我想休”

第一阶段只支持：

- 点选某天为 off
- 取消某天 off
- 当前操作仅作用于当前选中的 layer

第一阶段不支持：

- 在日历上点具体 pairing
- 在日历上拖拽 line 结构
- reserve 专属含义

### 2. Pairing

`Pairing` 页面继续表示：

- `Lineholder` 对 pairing 的偏好规则

这部分已经有真实后端基础，第一阶段以现有真实保存链路为基底继续演进，不另起草稿体系。

### 3. Line

`Line` 页面表示：

- `Lineholder` 对整月 line 形状和指标的偏好

这一页在业务上不是可选配件，而是这条主业务线的一部分。第一阶段要求：

- 有真实接口
- 有真实数据模型
- 有真实回显

### 4. Days Off

`Days Off` 页面在第一阶段明确定义为：

- `Lineholder` 的泛化休息偏好页

它不是：

- `Reserve Days Off`
- 日历具体日期点选的重复入口

因此第一阶段的职责划分是：

- `Calendar` 负责“具体日期休”
- `Days Off` 负责“泛化休息偏好”

## 数据模型设计

### 1. 继续复用的现有表

#### `pbs_bid`

作为整份 `Lineholder draft` 的主记录。

唯一标识仍然是：

- `crew_id`
- `period_code`
- `bid_context = Current`

建议继续写入：

- `status = 'DRAFT'`
- `last_modified_at`
- `remarks`

#### `pbs_bid_layer`

保存当前 draft 中实际启用到的层。

层的来源是四个入口的并集：

- `Calendar`
- `Pairing`
- `Line`
- `Days Off`

只要某个 layer 在任意模块里有内容，就保留对应 `pbs_bid_layer`。

#### `pbs_bid_group`

保存三类规则型数据：

- `Pairing`
- `Line`
- `Days Off`

其中：

- `bid_type` 明确标识模块来源
- `property_id / operator / param_a / param_b / param_c` 承接主规则参数
- `all_or_nothing / minimum_n` 继续保留给 Days Off 等规则使用

#### `pbs_bid_condition`

第一阶段仍然保留，但只在需要复杂 AND 条件链时使用。

初期实现可以优先覆盖单规则场景。

### 2. 第一阶段新增表：`pbs_bid_day_off`

第一阶段建议新增专用于日历具体休息日点选的明细表：

```sql
create table pbs_bid_day_off (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    bid_id               bigint       not null,
    layer_id             bigint       not null,
    layer                smallint     not null,
    bid_date             date         not null,
    request_type         varchar(20)  not null default 'DAY_OFF'
);
```

建议约束：

- 唯一索引：`(bid_id, layer, bid_date, request_type)`

为什么新增这张表：

- 它直接承接“月历点具体哪天休”的行为
- 查询、保存、删除、回显都最自然
- 不会把日历型数据强行揉进规则型表结构

这里故意不做成过度抽象的通用日历动作表，因为第一阶段只确认了“具体 Days Off”这一类能力。

## 模块到数据库的映射

### 1. Pairing / Line / Days Off

这三类页面统一采用：

- 前端页面文档模型
- 后端负责序列化成 `pbs_bid_group / pbs_bid_condition`

每个模块保存时的策略是：

- 只替换当前 `bid_type` 对应的数据切片
- 不破坏其他模块已经保存的数据

例如：

- 保存 `Line` 时，不影响 `Pairing`
- 保存 `Days Off` 时，不影响 `Calendar`

这要求后端 service 具备“按模块切片更新同一份 bid”的能力，而不是简单整表清空重建。

### 2. Calendar

`Calendar` 保存时：

- 根据当前登录用户和当前周期解析 `bid_id`
- 根据当前 UI 选中的 layer 解析 `layer_id`
- 对当前 layer 的 `pbs_bid_day_off` 明细做增删

第一阶段只记录：

- 哪个 layer
- 哪一天
- 请求类型是 `DAY_OFF`

### 3. Layer 汇总

`Layer` 页面读取时，不应再只看 `Pairing`。

它要读的是“统一 Lineholder draft”：

- 当前 layer 下的 `Calendar` 具体 days off
- 当前 layer 下的 `Pairing` 规则
- 当前 layer 下的 `Line` 规则
- 当前 layer 下的 `Days Off` 规则

第一阶段的 `summary/statistics` 仍然是“真实 draft 映射页”，不是最终 PBS award 结果页。

## 接口设计

### 1. 统一规则

所有第一阶段接口都遵循同一套约束：

- 只允许访问当前登录用户自己的数据
- 周期优先取当前 `OPEN` 的 `pbs_period`
- 若不存在草稿则自动初始化空 draft
- 所有写入都落真实数据库
- 不允许前端本地 JSON 替代真实存储

### 2. `Pairing`

沿用现有：

- `GET /api/pairing-bids/current`
- `PUT /api/pairing-bids/current`

但其内部 service 需要升级为“统一 Lineholder draft 的一个切片”。

### 3. `Line`

新增：

- `GET /api/line-bids/current`
- `PUT /api/line-bids/current`

职责：

- 读取和保存 `Line` 页面右侧规则
- 落到同一个 `bid_id`
- 使用 `bid_type = 'Line'`

### 4. `Days Off`

新增：

- `GET /api/days-off-bids/current`
- `PUT /api/days-off-bids/current`

职责：

- 读取和保存 `Lineholder` 的泛化休息偏好
- 不承接日历具体日期点选
- 落到同一个 `bid_id`
- 使用 `bid_type = 'DaysOff'`

### 5. `Calendar`

新增：

- `GET /api/calendar-days-off/current`
- `PUT /api/calendar-days-off/current`

文档模型只表达：

- 每个 layer 下当前已经点选的 off 日期列表

建议接口文档模型：

```ts
type CalendarDaysOffDraft = {
  periodCode: string;
  bidContext: "Current";
  layers: Array<{
    layer: string; // L1-L7
    dates: string[]; // YYYY-MM-DD
  }>;
};
```

### 6. `Layer` 汇总

新增：

- `GET /api/lineholder-bids/current/summary`

职责：

- 聚合 `Calendar + Pairing + Line + Days Off`
- 给 `Layer` 页面提供真实映射和统计所需的数据

第一阶段不要求它具备 PBS award 计算能力，但必须是“真实数据汇总”，不能继续只看 pairing。

## 前端实现边界

### 1. 共享左侧工作台继续保留

当前共享工作台方向是正确的，继续保持：

- 左侧 `BIDDING CALENDAR` 是共享区域
- 当前选中的 layer 在页面切换时不重置

### 2. Calendar 不再只是展示

第一阶段开始，左侧 `Calendar` 变成真实业务入口：

- 根据当前选中 layer 对具体日期做点选/取消
- 自动通过真实后端接口保存
- 刷新后可回显

### 3. Pairing / Line / Days Off 都改为真实接口驱动

这三页第一阶段都不再依赖纯 mock 本地状态。

推荐交互原则：

- 保持工作台编辑体验
- 使用防抖自动保存
- 不引入单独“保存”按钮

这样能与当前 `Pairing` 已有体验保持一致。

## 属性目录策略

### 1. Line

`Line` 第一阶段优先复用现有 `pbs_bid_property` 中的 `401-407`。

### 2. Days Off

`Days Off` 第一阶段不应把“月历具体日期休”与“泛化休息偏好”混在一起。

因此目录策略建议为：

- `Calendar` 承接具体日期休
- `Days Off` 页面只暴露泛化规则

如果现有 `201-206` 种子中的个别属性与这一定义冲突，允许在第一阶段通过 seed/migration 调整“前端暴露范围”，但不把当前 seed 当作最终产品真理。

### 3. Pairing

当前 `Pairing` 已经存在 portal 临时 catalog。第一阶段可以继续沿用现有真实能力，但要明确这是统一 `Lineholder draft` 的一部分，而不是私有独立草稿。

## 服务端分层建议

第一阶段建议把 `pbs-server` 的持久化能力从“单一 Pairing service”演进成：

- 一个共享的 `lineholder-bid-service`
  - 负责解析当前用户、当前周期、当前 bid
  - 负责创建/读取 `pbs_bid`
  - 负责维护 `pbs_bid_layer`
  - 负责提供汇总读取能力

- 多个模块切片 service
  - `pairing-bid-service`
  - `line-bid-service`
  - `days-off-bid-service`
  - `calendar-days-off-service`

这能避免每个模块各自重复实现：

- 找当前 period
- 找当前 bid
- 初始化 layer
- 维护 last_modified_at

## 测试要求

第一阶段至少补以下测试：

- `pbs-server`
  - `line-bids` route/service 测试
  - `days-off-bids` route/service 测试
  - `calendar-days-off` route/service 测试
  - `lineholder summary` 测试
  - 统一 `bid_id` / layer 维护测试

- `pbs-portal`
  - `Calendar` 点选具体 off 的交互与回显测试
  - `Line` 页面真实数据读写测试
  - `Days Off` 页面真实数据读写测试
  - 跨页面切换 layer 不重置测试

交付前验证：

- 仓库根 `npm run verify:pbs`
- `pbs-server` `npm test`
- `pbs-server` `npm run build`
- `pbs-portal` `npm test`
- `pbs-portal` `npm run lint`
- `pbs-portal` `npm run build`

## 风险与延后项

### 1. Days Off 目录仍需要进一步对齐 AA 目标语义

当前仓库中的 `DaysOff` seed 和 AA/N-PBS 目标语义并不是完全一致。

第一阶段可以先把“真实主链”和“存储模型”打通，但 `Days Off` 最终目录和文案仍然可能在第二阶段继续校准。

### 2. Reserve 暂不纳入，不代表以后一定共用同一条产品流

第一阶段刻意不把 `Reserve` 拉进来，避免混淆。

后续是否与 `Lineholder` 共用同一份 `pbs_bid` 主记录，需要在 `Reserve` 立项时单独确认，而不是现在提前假设。

### 3. Layer 页仍然是 draft 映射，不是最终 PBS 算法输出

第一阶段不要把 `Layer` 页误当成 award 结果页。

它读到的是真实 draft 汇总，不是最终自动排班结果。

## 推荐实施顺序

1. 先补数据库迁移和 Drizzle model
2. 抽共享 `lineholder-bid-service`
3. 把现有 `pairing-bid-service` 迁到统一 draft 之下
4. 新增 `line-bids` 接口与页面联通
5. 新增 `days-off-bids` 接口与页面联通
6. 新增 `calendar-days-off` 接口与左侧工作台联通
7. 新增统一 `summary` 接口并驱动 `Layer` 页面

## 最终结论

第一阶段的正确切法不是“先做几个独立页面”，而是：

- 先只做 `Lineholder`
- 用一份统一的 `Current` draft 串起
  - `Calendar`
  - `Pairing`
  - `Line`
  - `Days Off`
- 其中：
  - `Pairing / Line / Days Off` 走 PBS 规则表
  - `Calendar` 的具体 days off 点选走单独明细表

这条线打通之后，前后端和数据库的业务骨架才算真正立住，后面再做 `Reserve` 和更完整的 PBS 规则/结果，才不会反复返工。
