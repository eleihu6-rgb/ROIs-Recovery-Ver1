# PBS Favorite 明确日期禁用设计

日期：2026-08-03
状态：待用户确认
范围：PBS Portal Current Bid 的 Days Off、Pairing、Roster / Line 已配置 Favorite

## 背景与已确认决策

Favorite 继续采用与 Jen 确认的当前产品语义：收藏一条已经配置完成的条件，保留除 Tx 之外的可复用参数，用户之后在 Favorite 卡片选择 Tx 并加入 Current Bid。

本次不改成 AA 文档中的“只收藏 property 入口”。但 Favorite 与 Standing 一样具有跨月份复用属性，因此不得保存明确绑定某个年月日的配置。

已确认交互：

- 配置包含明确年月日时，`SAVE FAVORITE` / `UPDATE FAVORITE` 保留原位置但处于 disabled。
- 不增加 tooltip、提示文字、toast 或其他说明，不改变已经确认的弹窗布局。
- `ADD BID` / `UPDATE BID` 仍按 Current Bid 原规则工作，不受 Favorite 限制。
- 项目尚未上线，已有的明确日期 Favorite 直接清理，不做兼容展示或自动转换。

## 目标

1. 保留完整参数 Favorite 的现有能力。
2. Days Off、Pairing、Roster / Line 使用同一条“明确日期不可收藏”原则。
3. 前端立即禁用收藏按钮，后端同时拒绝绕过页面提交的无效收藏。
4. 星期、周末、时间窗口和其他不绑定具体年月日的参数继续允许收藏。
5. 清理数据库中已经存在的明确日期 Favorite，只保留可跨月份复用的收藏。

## 非目标

- 不将 Favorite 改为只保存 `property_id` 的 AA 模式。
- 不改变 Favorite 卡片、Tx 选择、Edit、Delete、Add to Bid 的现有交互。
- 不改变 Current Bid 对具体日期条件的支持。
- 不改变 Standing 的触发、兜底或导入导出逻辑。
- 不因为本次规则调整隐藏任何由数据库标记为可见的 property。
- 不删除所有 Favorite；只清理包含明确日期的无效记录。

## 业务规则

### 允许收藏

下列配置不绑定具体年月日，可以继续收藏：

- `Days of Week`、`Weekends` 等周期性星期配置；
- 纯时间、时间窗口、时长、数量、比例、Award / Avoid、Any / Every 等参数；
- `Whole Month`、`First Half`、`Second Half` 等相对当前月份的范围；
- 不带日期限制的 Pairing、Days Off、Roster / Line 配置；
- 仅包含 Pairing ID / Pairing Number，但不绑定具体 occurrence 日期的配置。

### 禁止收藏

只要一条配置中的任意层级包含明确年月日，即整条 Favorite 不可保存或更新，包括：

- 单个具体日期；
- 多个具体日期；
- 有起止年月日的日期范围；
- `On Date` 类配置；
- Pairing occurrence 中的 `originDate`；
- 嵌套 `dateScope.mode = specific_dates`；
- 嵌套 `dateScope.mode = date_range`；
- `Prefer Off` 的 `Specific Dates` 或 `Date Range`；
- `Commuter Pattern` 等条件中非空的 `dateRange`；
- Reserve / Flying pattern 任一 segment 中的明确日期范围或具体日期。

“明确日期”只按 payload 的业务结构识别，不通过 property code、UI 文案、数据库可见性或字符串模糊搜索硬编码判断。

## 方案比较

### 方案 A：只在 Portal 禁用按钮

优点：改动最小。
缺点：接口仍可被直接调用写入无效 Favorite，数据库不能保证业务规则。

### 方案 B：Portal 与 Server 各自维护一套判断

优点：前后端都有防线。
缺点：新增 bid payload 类型后容易只更新一端，长期产生规则漂移。

### 方案 C：共享明确日期分类器（采用）

在 PBS 共享 contract / utility 边界提供纯函数，按 bid payload 的 discriminated union 判断是否包含明确日期，Portal 和 Server 共同使用。对于 `tag-list` 这类结构相同但业务语义不同的 payload，由对应 feature adapter 提供明确的语义上下文，禁止根据字符串内容猜测 property 类型。

优点：

- 前后端判断来源一致；
- 不依赖 property code，不违反数据库控制 property 可见性的规则；
- 后续新增 payload 类型时可由共享 exhaustive tests 暴露遗漏；
- 可以复用 Standing 已确认的日期语义，但不错误继承 Standing 对具体 Pairing 等其他限制。

## 详细设计

### 1. 共享日期分类

新增一个无副作用的共享判断，例如：

```ts
containsExplicitCalendarDate(bid, semanticContext): boolean
```

它只回答“payload 是否含明确年月日”，不回答 property 是否可见、是否可添加 Current Bid、是否满足 Standing 的全部规则。

输入 contract：

- 以共享 contracts 中 Days Off、Pairing、Line configured Favorite 实际接受的 bid value union 组成规范输入类型；
- Portal 与 Server adapter 必须先把各自 property 映射到该规范输入，不能把任意 `unknown` JSON 直接交给分类器；
- `semanticContext` 是必填 tagged union，至少明确区分 `generic` 与 `prefer-off`；调用方不能省略，也不能依赖默认值；
- 分类器按 `type` 使用 compile-time exhaustive 分支，并以 `never` guard 保证新增 discriminant 时构建或测试失败，禁止未知类型默认返回 `false`；
- 每一个已支持的 discriminant 至少有一个明确的正例或负例测试；存在可选日期结构的类型必须同时覆盖有日期与无日期。

分类器应显式覆盖当前支持的 bid value 类型：

- 直接日期型 value；
- 带 `date` / `from` / `to` 的日期型 value；
- `date-or-dow-list` 中非空 `dates`；
- 各类非空 `dateScope`；
- `days-off-on-pattern.dateRange`；
- `pairing-occurrence-list.occurrences[].originDate`；
- `reserve-flying-date-pattern.segments[].dateScope`；
- `Prefer Off tag-list` 仅由 Days Off Prefer Off adapter 携带明确的 `prefer-off` 语义上下文，并通过现有 Prefer Off parser 区分 specific dates、date range、weekdays 与 weekends。

`tag-list` 消歧要求：

- 通用分类器不得把所有 `tag-list` 都当成 Prefer Off；
- Pairing、Line 或其他非 Prefer Off 的 `tag-list` 不得因为值看起来像字符串日期而被模糊识别；
- Days Off service 已经通过稳定 property definition 识别 Prefer Off，必须在强类型 feature adapter 中传入 `prefer-off` 上下文；其他调用点必须显式传入 `generic`；这里使用 property identity 只为选择 payload parser，不控制 property 是否显示，不能替代数据库 `is_visible` / context 字段；
- Portal 与 Server 的 configured Favorite 写入口测试必须证明 Prefer Off 调用点不能漏传或误传为 `generic`；
- 测试必须同时覆盖非 Prefer Off `tag-list`、Prefer Off weekday、Weekends、ISO specific dates 和 `Between` date range。

日期值判定：

- “明确年月日”必须是现有 canonical date validator 认可的真实 `YYYY-MM-DD` 日历日期，不能只检查字符串非空或只用宽松正则；
- 单日期字段只有值为有效 ISO 日期时返回 `true`；空字符串、缺失值和畸形值不作为本次自动清理依据；
- 日期数组只要包含至少一个有效 ISO 日期就返回 `true`；空数组或全部为畸形值时不触发本次自动清理；
- 日期范围只要任一 endpoint 是有效 ISO 日期，就视为已经绑定明确日期；因此完整范围和只存在一个有效 endpoint 的 partial range 都返回 `true`；两个 endpoint 都为空或都无效时不触发本次自动清理；
- `dateScope.mode = specific_dates | date_range` 仍按其内部有效日期值执行上述规则；单有 mode 但没有任何有效日期，不作为 migration 自动删除依据；
- 正常新增 / 修改请求仍先经过各 feature 现有 payload 完整性校验，空值、畸形值或 partial range 应由原校验拒绝，不能因为分类器返回 `false` 而被保存。

分类器不得把以下内容误判成明确日期：

- `MON` 至 `SUN`；
- `Weekends`；
- `whole_month`、`first_half`、`second_half`；
- `HH:mm` 时间；
- Pairing / Flight 业务编号；
- 仅为空值占位的 Standing reusable 日期字段。

### 2. Portal 交互

所有支持 Favorite 的配置弹窗，在现有完整性校验之外增加：

```text
canSaveFavorite = conditionIsComplete AND NOT containsExplicitCalendarDate(bid)
```

行为要求：

- `SAVE FAVORITE` 与 `UPDATE FAVORITE` 统一使用该结果；
- 禁用只改变按钮的 disabled 状态；
- 不新增解释文案、tooltip、toast、alert 或布局占位；
- `ADD BID` / `UPDATE BID` 继续使用原校验，不调用 Favorite 日期限制；
- 切换回 weekday、weekends 或其他无明确日期模式后，条件完整时收藏按钮立即恢复可用。

“所有入口”不能只按模块抽样，必须逐一审计并覆盖每条独立的 Favorite 保存 / 更新按钮计算路径：

- Days Off：新增条件 `SAVE FAVORITE`；Favorite 编辑 `UPDATE FAVORITE`；
- Roster / Line：新增条件 `SAVE FAVORITE`；Favorite 编辑 `UPDATE FAVORITE`；`LineBidDialog` 内不同 footer 分支必须汇合到同一 Favorite eligibility 结果；
- Pairing 主配置弹窗：新增条件 `SAVE FAVORITE`；Favorite 编辑 `UPDATE FAVORITE`；
- Pairing occurrence 弹窗：entire-month Pairing ID / Number 可以收藏，绑定 `originDate` 的 specific occurrence 必须 disabled；
- Search Pairings：从 Favorite 进入后编辑 criteria 并确认 PATCH 的路径，必须在确认动作前应用同一日期限制；不能先发 PATCH、收到后端 400 后再显示错误；
- Pairing Preview 往返后继续编辑 Favorite 的路径，不得绕过日期限制。

如果实施时发现其他会调用 configured Favorite POST / PATCH 的 Portal 入口，也必须纳入同一清单、同一 eligibility helper 和 focused test，不能仅依靠 Server 400 兜底。

### 3. Server 防线

所有 configured Favorite 的新增与修改入口，在写数据库前调用同一个共享分类器：

- Days Off Favorite；
- Pairing Favorite；
- Roster / Line Favorite。

发现明确日期时返回稳定的 400 业务错误，不写入 Favorite，也不改变 Current Bid。正常 Portal 流程不会触发该错误；它只用于防止旧客户端或直接 API 调用绕过前端。

该校验不得加入 Current Bid 的 add / update 路径，避免误伤合法的具体日期 Bid。

### 4. 历史数据清理

新增幂等 migration，按三类 configured Favorite 的实际 `bid_payload` 结构删除明确日期记录：

- `pbs_bid_days_off_favorite`；
- `pbs_bid_pairing_configured_favorite`；
- `pbs_bid_line_favorite`。

要求：

- 只删除符合本 spec 明确日期结构的记录；
- 不删除 weekday、weekends、relative month scope 或无日期配置；
- SQL 无法直接调用 TypeScript 分类器，因此 migration 必须维护一份与共享分类器逐分支对应的“清理判定清单”；每个会持久化到三张表的日期分支都必须在 SQL 中有明确条件，禁止使用宽泛的字符串日期正则扫描整个 JSON；
- SQL 对日期值的判断必须与 canonical `YYYY-MM-DD` 规则等价；只删除至少含一个有效明确日期的记录，不因空值、畸形值或仅有 date mode 而自动删除；
- migration 文件注释必须列出其对应的分类器分支，后续新增可持久化日期 payload 时，分类器 exhaustive test 与 migration fixture 必须共同更新；
- 执行前后提供按表统计的验证 SQL；
- migration 可在开发、SIT、UAT 重复执行而不报错；
- schema、migration 与 Drizzle model 无需新增字段。

### 5. 数据流

```text
用户配置条件
  -> Portal 共享日期分类
     -> 有明确日期：Favorite 按钮 disabled；Current Bid 按钮照常
     -> 无明确日期：允许发起 Favorite 请求
  -> Server 使用同一分类再次校验
  -> configured Favorite 表
```

## 错误与用户体验

- 页面不显示新的错误提示或解释文案。
- 按钮 disabled 状态沿用当前视觉规范，不新增颜色和样式。
- 后端 400 使用产品级稳定错误文本，不暴露 payload、异常对象或内部字段。
- 已有无效 Favorite 由 migration 清理，因此不设计“失效 Favorite”卡片或兼容编辑状态。

## 测试与验收

### 共享分类器

- 规范 union 的每一个 discriminant 都有测试，新增类型无法静默落入 `false`。
- `semanticContext` 必填，Prefer Off adapter 不存在省略上下文或默认落入 `generic` 的调用路径。
- 每一种直接日期 payload 返回 `true`。
- 每一种嵌套 date scope 返回正确结果，并覆盖同类型无日期状态。
- Prefer Off specific dates / date range 返回 `true`。
- Prefer Off weekdays / weekends 返回 `false`。
- 非 Prefer Off `tag-list` 不调用 Prefer Off parser，也不按字符串形态误判。
- Pairing occurrence 返回 `true`，仅 Pairing ID 返回 `false`。
- Relative month scope、时间窗口和无日期配置返回 `false`。
- 有效 ISO 日期、空值、畸形日期、空数组、混合数组、完整范围、单端有效 partial range 与双端无效范围均有明确测试。

### Portal

- 为“Portal 交互”列出的每一条独立 Favorite 新增 / 更新路径补 focused test，不以每模块一个代表条件代替入口覆盖。
- Days Off 新增与 Favorite 编辑分别验证日期模式 disabled、recurring 模式 enabled。
- Roster / Line 新增与 Favorite 编辑分别验证日期模式 disabled、无日期模式 enabled，并覆盖 `LineBidDialog` 的独立 footer 分支。
- Pairing 主配置新增与 Favorite 编辑分别验证日期模式 disabled、无日期模式 enabled。
- Pairing occurrence 同时验证 specific occurrence disabled、entire-month Pairing ID / Number enabled。
- Search Pairings Favorite criteria 编辑同时验证日期状态禁止确认 PATCH、无日期状态允许 PATCH；禁止出现由 Server 400 触发的错误 toast。
- Pairing Preview 往返编辑 Favorite 后仍使用相同限制。
- 选择 Specific Dates 或 Date Range 后，Favorite 按钮 disabled。
- 切换回 recurring / no-date 模式后，条件完整时按钮恢复 enabled。
- 同一状态下 `ADD BID` 仍可用并能成功保存 Current Bid。
- Favorite edit 模式中的 `UPDATE FAVORITE` 使用相同规则。
- 不出现新增提示、tooltip、toast 或布局变化。

### Server

- 三类 Favorite POST / PATCH 均拒绝明确日期 payload。
- 拒绝时不新增、不更新 Favorite，不改变 Current Bid 和 draft 内容。
- 无明确日期的现有 Favorite contract 继续通过。
- Current Bid 的日期条件 add / update 回归通过。

### Migration

- 三张 configured Favorite 表分别建立独立 fixture。
- fixture 对应 SQL 判定清单，覆盖实际可进入每张表的直接日期、`dateScope`、`dateRange`、occurrence、segments 与 Prefer Off 日期结构。
- 每张表同时保留 weekday、Weekends、relative month scope、无日期 Pairing、非 Prefer Off `tag-list` 与空 reusable 占位等反例。
- fixture 额外覆盖有效 ISO 日期、空值、畸形值、混合数组、单端有效 partial range 和仅有 date mode 的历史 payload，确保 SQL 与共享分类器边界一致。
- migration 后校验“实际删除 ID 集合”与“预期删除 ID 集合”完全一致，而不只检查剩余数量。
- 重复执行结果一致。
- 在开发、SIT、UAT 执行验证查询并记录各表清理数量。

### Playwright

通过真实 Portal 至少覆盖：

1. Prefer Off 选择 `Specific Dates`，确认 `SAVE FAVORITE` disabled、`ADD BID` 可用。
2. Prefer Off 切换到 `Days of Week`，完成配置后确认 `SAVE FAVORITE` enabled。
3. 一个 Pairing 日期范围条件确认 Favorite disabled，但仍可加入 Current Bid。
4. 一个无日期 Roster / Line 条件确认仍可收藏并从 Favorite 卡片复用。

## 验收标准

- 所有 Favorite 新增和编辑入口都不能保存明确年月日。
- Current Bid 仍能正常保存明确年月日条件。
- recurring / relative 配置仍能完整收藏和复用。
- 页面没有新增提示或布局变化。
- 旧的明确日期 Favorite 已从开发、SIT、UAT 清理。
- focused tests、PBS Portal / Server 相关回归、Playwright、build、lint、`npm run check:ui` 与 `git diff --check` 均通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 共享分类器、三类 Favorite 写入口与 migration 必须严格使用同一语义，属于紧密耦合的跨层规则；并行写入容易产生分类差异。
- Suggested split: 主 agent 顺序完成共享分类、Portal、Server、migration 与验证。
- Write boundaries: 不拆分实现写入范围；spec 审查可独立进行。
- Conflict risk: 多 agent 同时修改共享 contracts 与 Favorite service 的冲突风险较高。
- Execution gate: 用户审查并明确批准本 spec 后，才进入实施计划和代码修改。
