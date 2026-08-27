# PBS Minimum Base Layover 定义管理设计

## 1. 背景

Gantt 管理端已经提供 `Bid Definitions` 页面，用于维护 PBS 业务定义：

- Redeye
- Weekend
- Credit Window

`Minimum Base Layover` 当前也已通过 `dictionary` 参数化：

- `parent_code = SYS_PARAM`
- `code = PBS_LINE_MINIMUM_BASE_LAYOVER`
- 当前值为 `013:00`，Portal 以 `13:00` 展示

PBS Portal 新建 Minimum Base Layover 条件时，会读取该配置作为默认值和最低允许值；PBS Server 保存 Current Bid、Standing Bid 和 Favorite 时，也会使用该配置进行校验。但是该定义尚未出现在 Gantt 的 `Bid Definitions` 管理页面中，管理员无法通过页面维护。

## 2. 目标

在现有 `Bid Definitions` 页面增加 `Minimum Base Layover`，让管理员可以修改系统定义的最低基地停留时长。

修改后：

- Portal 后续新建 Minimum Base Layover 条件时，默认使用最新配置。
- Portal 后续新增或编辑该条件时，不允许保存低于最新配置的值。
- Current Bid、Standing Bid 和 Favorite 使用同一份配置规则。
- 已经保存的 Bid 和 Favorite 不批量修改、不回填。
- 已有的低值属于 grandfathered 数据；只要时长本身没有改变，就不能阻断用户保存同一草稿中的其他修改。

## 3. 非目标

- 不修改历史、已提交或已锁定的 Bid。
- 不批量修改已有 Current Bid、Standing Bid 或 Favorite 中保存的具体时长。
- 不新增数据库表。
- 不建设通用 dictionary 编辑器。
- 不改变 Redeye、Weekend、Credit Window 的既有行为。
- 不改变 PBS Portal 当前 Minimum Base Layover 弹窗的视觉结构。

## 4. 业务规则

### 4.1 定义值

管理员配置的是 Minimum Base Layover 的系统最低值，不是某一位用户的 Bid。

示例：管理员把定义从 `13:00` 修改为 `14:00` 后：

- 新打开的配置弹窗默认显示 `14:00`。
- 用户可以填写 `14:00` 或更大的时长。
- 用户不能保存 `13:59` 或更小的时长。
- 已经保存的 `13:00` Bid/Favorite 保持原值，不在本次配置保存时改写。

已有低值豁免按稳定记录身份和时长字段判断：

- Current Bid 和 Standing Bid 使用现有 `propertyGroupKey` 对比持久化记录。
- Favorite 使用现有 `favoriteKey` 对比持久化记录。
- 若传入时长与该稳定记录原值一致，即使低于新最低值，也允许保存草稿中的其他变化。
- 若新增 Minimum Base Layover，或已有记录的 `minimumDuration` 实际发生变化，则必须满足最新最低值。
- 不允许通过复制、删除后重建或更换稳定 key，把旧低值作为新记录保存。

### 4.2 时间格式

- 管理页面输入和展示使用紧凑格式 `HH:MM`，例如 `13:00`、`100:30`。
- dictionary 延续现有规范化格式 `HHH:MM`，例如 `013:00`、`100:30`。
- 分钟必须为 `00–59`。
- 小时允许 1–3 位，且总时长必须为正数。
- 字段格式错误必须显示在 `Minimum Duration` 输入框附近，并设置可访问的错误关联；不能只使用 toast。

### 4.3 生效时机

保存成功后，后续从 PBS Server 获取配置、打开新建/编辑弹窗或提交条件时使用最新值。

本功能不在配置保存时扫描或更新 PBS 用户数据。

## 5. 架构与数据流

### 5.1 数据源

继续使用现有 dictionary 行作为唯一事实源：

```text
SYS_PARAM / PBS_LINE_MINIMUM_BASE_LAYOVER / 013:00
```

不在前端、live-server 或 pbs-server 新增另一份业务常量。

现有 `DEFAULT_MINIMUM_BASE_LAYOVER_DURATION = "013:00"` 及 Portal 的固定 `13:00` 兜底应在实施中移除。dictionary 行缺失或值非法时统一返回 `available: false`，不得继续假装配置可用。

### 5.2 读取流程

1. Gantt 打开 `Admin Tools > Bid Definitions`。
2. live-server 读取现有 Redeye、Weekend、Credit Window 和 Minimum Base Layover dictionary 行。
3. API 返回四项定义、展示值和审计信息。
4. Gantt 表格显示 `Minimum Base Layover` 当前值，例如 `13:00 minimum`。

### 5.3 保存流程

1. 管理员点击 Minimum Base Layover 行的编辑图标。
2. `AppDialog` 显示一个时长输入框。
3. 前端先校验格式和正数范围。
4. live-server 再进行相同的服务端校验。
5. live-server 在事务中更新 dictionary 的 `code_value`、`updated_by`、`updated_at`。
6. API 返回更新后的定义；Gantt 刷新当前行并显示成功消息。

保存流程不访问或更新 `pbs_bid_group`、`pbs_bid_line_favorite` 等用户 Bid 表。

### 5.4 PBS Portal 消费流程

沿用现有接口和逻辑：

- PBS Server 从 dictionary 读取 `PBS_LINE_MINIMUM_BASE_LAYOVER`。
- Portal 通过现有 `minimum-base-layover-config` 接口取得配置。
- 新建条件默认使用最新值。
- Current、Standing、Favorite 的后续保存由 PBS Server 使用最新最低值校验。
- dictionary 缺失或非法时，PBS Server 必须拒绝 Minimum Base Layover 的新增或实际变更，不能依赖 Portal 禁用来保证数据安全。
- dictionary 不可用时，grandfathered 旧记录只要稳定 key 与时长都未改变，仍允许同一草稿保存其他无关修改。

## 6. API 与 Contract

扩展现有 PBS Bid Definitions contract：

- 新增 definition code：`minimum-base-layover`
- 新增可用值：`{ available: true, minDuration: string }`
- 不可用值继续使用：`{ available: false }`
- 新增保存路由：`PATCH /api/pbs/bid-definitions/minimum-base-layover`
- 请求体：`{ minDuration: string }`

响应继续使用项目统一格式：

```json
{ "code": 200, "data": {}, "message": "ok" }
```

仅管理员可以读取和修改 Bid Definitions；权限规则与现有三项保持一致。

本次保持与现有 Redeye、Weekend、Credit Window 相同的管理员写入语义：并发保存采用 last-write-wins，最终值及 `updated_by`、`updated_at` 以最后成功事务为准。本次不单独为第四项引入乐观锁；Bid Definitions 的统一并发控制可另行设计。

## 7. UI 设计

在现有表格追加一行，不新增页面或卡片：

| Definition | Current Value | Description |
|---|---|---|
| Minimum Base Layover | `13:00 minimum` | Minimum home-base spacing allowed for Line bids. |

编辑弹窗沿用现有 `AppDialog`、按钮、间距和错误交互：

- 标题：`Edit Minimum Base Layover`
- 字段：`Minimum Duration`
- 占位格式：`HH:MM`
- 操作：`Cancel`、`Save`

不引入新的视觉规范。

## 8. 错误处理

- 前端格式错误绑定到 `Minimum Duration` 字段，设置错误状态、`aria-invalid` 和可访问描述；弹窗保持打开。
- 服务端拒绝无效格式、零时长和负时长，返回稳定的产品化错误文案。
- dictionary 行缺失时事务回滚，不静默插入，也不显示保存成功。
- Portal 读取到 `available: false` 时不得使用硬编码最低值；相关新增/保存入口禁用，并在配置区域显示可访问的局部配置错误。
- PBS Server 在配置 unavailable 时拒绝 Current、Standing、Favorite 中 Minimum Base Layover 的新增、复制、重建或实际时长变更；只豁免稳定 key 和原时长均未改变的已有记录。
- 页面读取失败沿用现有局部错误面板和 `Retry`。
- 不向用户暴露原始数据库或异常信息。

## 9. 测试与验收

### 9.1 Contract / 后端测试

- contract 能解析和格式化 Minimum Base Layover 定义。
- GET Bid Definitions 返回第四项及正确审计信息。
- PATCH 能把 `13:00` 规范化保存为 `013:00`。
- PATCH 拒绝无效分钟、空值、零时长和非时长字符串。
- 非管理员请求返回 403。
- dictionary 行缺失时不发生部分更新。

### 9.2 PBS Server 回归

- 配置为 `14:00` 时，新建空值解析为 `014:00`。
- `13:59` 保存失败，`14:00` 和更大值保存成功。
- Current、Standing、Favorite 的相关保存路径继续共用同一配置。
- 已保存值不会因管理员更新定义而被批量改写。
- Current、Standing、Favorite 各自覆盖 grandfathered 旧值：只修改其他字段或其他条件时，旧 `13:00` 不阻断保存。
- 对已有 Minimum Base Layover 实际修改时，旧值豁免失效并执行最新最低值校验。
- dictionary 缺失或非法时返回 unavailable，不能回退到硬编码 `13:00`。
- dictionary unavailable 时，Current、Standing、Favorite 的新增或变更由 PBS Server 拒绝；未改变的 grandfathered 旧值仍不阻断无关保存。
- Current、Standing、Favorite 分别覆盖防绕过：新 key、错配 key、复制、删除后重建都视为新记录，不能继承旧值豁免。

### 9.3 Playwright

通过真实 Gantt UI：

1. 管理员进入 `Bid Definitions`。
2. 看到第四行 Minimum Base Layover。
3. 打开编辑弹窗并保存新值。
4. 表格显示更新后的值和审计信息。
5. 刷新页面后值仍然存在。
6. 无效值不能保存，字段呈现关联错误且弹窗保持打开。

通过真实 PBS Portal UI 验证新建 Minimum Base Layover 时默认值和最低限制使用最新配置。

### 9.4 必跑门禁

- 相关 contract 测试
- live-server 路由测试
- pbs-server Minimum Base Layover 测试
- Gantt Playwright
- PBS Portal Playwright
- `npm run check:ui`
- 受影响模块 build/typecheck

## 10. 数据库与发布

现有环境已经存在 dictionary 行，因此本功能原则上不需要新增数据 migration。为保证新环境初始化一致，schema/seed 中现有 `PBS_LINE_MINIMUM_BASE_LAYOVER` 定义继续保留。

如果实施检查发现某个 dev/SIT/UAT 环境缺少该行，只补充幂等 migration 并提供 verify SQL；不得通过运行时代码自动插入。

## 11. 风险与约束

- 管理员提高最低值后，旧 Bid 可能低于新规则；本需求明确不回填旧数据。旧记录读取时仍保留原值，且其时长未改变时不阻断整份草稿的其他修改；新增或实际修改该时长时才执行最新最低值校验。
- dictionary 是唯一事实源；不得在 Gantt 或 PBS Portal 写死 `13:00`。
- 当前 Git 正处于恢复提交的 cherry-pick 冲突状态。必须先由用户处理冲突并完成恢复验证，才能实施本功能。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: contract、live-server route、Gantt UI 和现有 PBS 配置消费链紧密耦合，改动规模较小，串行实施更容易保持契约一致。
- Suggested split: 不拆分；主代理依次完成 contract、后端、前端、测试和集成验证。
- Write boundaries: 单代理负责全部相关文件。
- Conflict risk: 当前 cherry-pick 尚有一个未解决冲突；在冲突完成前禁止实施。
- Execution gate: 用户审阅并批准本 spec，且当前 cherry-pick 恢复完成后，才进入实施计划和代码修改。
