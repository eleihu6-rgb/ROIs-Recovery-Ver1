# PBS Server 协作约定

## 项目定位

- `pbs-server` 是 PBS 独立后端，不与 `live-server` 共享运行时、连接池或 Redis 实例。
- 后端需要与 `pbs-portal` 长期协同演进，优先保证接口稳定、字段语义清晰和可回归验证。
- 共享业务字段尽量与 `live-server` 的 `users` 语义对齐；PBS 独有安全字段继续保留在 PBS 自己的模型里。

## 技术栈边界

- 基础栈固定为 `Fastify + TypeScript + Drizzle + PostgreSQL`。
- 环境变量必须通过 `zod` 校验，不允许直接散落读取 `process.env`。
- 数据访问统一通过 Drizzle model 和数据库插件管理，不在路由里直接拼接临时 SQL，迁移和同步脚本除外。
- 新增依赖前必须确认许可证、安全性、必要性和长期维护成本。

## 接口与分层原则

- 路由层负责解析请求、校验入参、调用 service 和返回统一响应，不承载业务逻辑。
- 业务逻辑优先放在 `src/services`。
- 统一响应格式保持 `{ code, data, message }`。
- 认证、会话和同步逻辑优先复用已有 service / util，不在多个入口重复实现。
- HTTP 方法按语义使用：`GET` 用于读取，`POST` 用于创建或登录，`PUT/PATCH` 用于更新，`DELETE` 用于删除或登出；不要默认把所有动作都做成 `POST`。

## 数据模型与数据库约束

- 改动业务表结构时，必须同时更新：
  - `sql/schema`
  - `sql/migration`
  - Drizzle model
  - 受影响的 service / route / script
- `pbs_user` 与 `users` 的共享字段命名应尽量保持一致；PBS 独有字段只做补充，不重复发明近义字段。
- 禁止在代码中硬编码字段语义分支；状态判断优先基于当前模型字段和明确规则。
- PBS 所有业务表、业务关系表和可持久化业务对象，默认必须设计稳定 `id` / `key` 作为后续 CRUD 主身份；业务 `code` 可以作为创建入参、筛选条件、展示值或兼容字段，但不得作为已有记录的长期主身份。
- 新增、查询详情、修改、删除、绑定、解绑、保存草稿、批量保存等会读取或改变既有业务记录的接口，必须优先用后端返回的稳定 `id` / `key` 定位记录，禁止依赖页面顺序、展示序号、`rowSeq`、名称、日期文本或可变业务 `code`。
- 只有纯字典、静态配置、不可变自然键等明确适合 `code` 的读取场景，才可以把 `code` 作为查询身份；一旦涉及用户数据或可变业务记录写入，仍必须优先使用稳定 `id` / `key`。
- 能由数据库表达的数据安全规则必须落到主键、唯一键、外键、索引或检查约束中；对应 migration 必须支持回填、幂等执行和验证查询。
- Drizzle model 和 service 字段命名必须反映真实语义；历史兼容业务码不要命名成 `propertyId`、`bidId`、`userId` 这类稳定身份字段。
- 草稿保存、批量保存、跨页面共用写入和任何可能并发修改同一业务对象的接口必须考虑并发；优先使用明确版本号、唯一键或事务约束，旧版本保存应被拒绝并返回可处理错误，不能静默覆盖新数据。

## PBS Tier 术语规范

- PBS Server 中表达申请层级时统一使用 `Tier / Tiers / tier / tiers / Tx`，例如 `pbs_bid_tier`、`tier` 字段、`tiers` API 数组、`T1-T24` 标签。
- 禁止新增 `Layer / Layers / layer / layers / Lx` 作为 PBS 业务术语；route schema、service、Drizzle model、SQL、测试、错误文案和共享 contract 都必须使用 tier 命名。
- API contract 不保留旧 `layer/layers/Lx` 兼容层；旧字段或旧标签应通过校验失败暴露未迁移调用方。
- 如果引用 AA 文档，必须写清“AA 原文 Layer，对应本项目 Tier”，不能把 AA 原文术语带回项目代码或数据库模型。
- 只有历史 migration、历史设计文档、AA 原文引用或非 PBS 业务含义的普通英文 `layer` 可以保留。

## PBS Property Catalog 规范

- `pbs_bid_property` 是 PBS Portal property 展示和持久化身份的统一来源；修改 property 规则时必须同步 schema、migration、seed、Drizzle model、service 和 contract。
- 旧库 `crew_bids_reference` 的 property 默认 `source_type='legacy'` 且 `is_visible_in_portal=1`；AA 文档 property 默认 `source_type='aa'` 且 `is_visible_in_portal=0`，只保留能力和后续配置空间。
- Service 返回给 Portal 的 `propertyCatalog` 只能包含 `is_visible_in_portal=1` 且 contract 支持的 property；内部 `catalogByCode` 应保留所有 active supported property，避免隐藏 AA property 的历史草稿无法反序列化。
- `Pairing Number / Pairing ID` 使用旧库 `property_code=102`；`property_code=128` 是 `Deadhead Day`，禁止在新代码、测试或 migration 中继续把 128 当 Pairing ID。
- Pairing 主页面、Search Pairings、calendar pairing bid 展示必须共享同一套 stable property 语义；不得在某个入口临时注入例外 property。
- `Month-End Carryover` 使用 `property_code=163`，运行时只接受 `month-end-carryover` payload（`<` / `=` / `>` / `Between` + 正整数天数），表达 Award/Avoid 跨出当前 bid month 指定天数条件的 pairing；它属于 Pairing property，不属于 Days Off 日历占位，不得重新引入旧 `Carry-Out Days` / `stepper` 合同、`C/O Off` 或下月 day off placeholder。

## 认证与同步约束

- 认证链路优先保持 `JWT + Bearer` 的统一模式。
- 涉及 `pbs_user`、认证、会话、同步脚本的改动必须先考虑回归测试，再改实现。
- `users -> pbs_user` 同步脚本必须支持 `--dry-run`，并保留防止误停用全量账号的安全护栏。
- 会影响现网数据的脚本必须先保证幂等性和可审查性。

## 测试与交付要求

- 涉及 route、auth、sync、schema 对齐的改动必须补测试。
- PBS Server 功能新增、行为变更、关键 bug 修复、性能优化和重构，只要影响可验证业务行为，交付时不能只说明“已跑回归测试”，还必须新增或更新对应测试案例。
- 测试案例包含两类：开发侧自动化测试，以及给后期测试人员使用的 QA 人工测试案例；二者不能互相替代。
- QA 测试案例按功能单独成文，默认路径为 `docs/test-cases/pbs/<module>/<YYYY-MM-DD>-<feature>.md`，内容至少包含前置条件、操作步骤、预期结果、异常/边界场景和回归范围。
- 如果某次改动确实不适合新增自动化测试或 QA 测试案例，交付说明必须写明原因，并提供可执行的人工验证步骤。
- 交付前至少验证：
  - `npm test`
  - `npm run build`
- 如果改动涉及用户同步或数据写入逻辑，还必须运行：
  - `npm run sync:pbs-users -- --dry-run`
- 跨模块 PBS 流程改动优先在仓库根执行 `npm run verify:pbs`。

## 修改原则

- 先保边界清晰，再追求局部编码速度。
- 不做与当前目标无关的重构。
- 不把一次性脚本逻辑散落进常驻服务代码。
- 这是长期维护项目，修改应优先考虑可读性、可验证性、数据安全和后续演进成本。
