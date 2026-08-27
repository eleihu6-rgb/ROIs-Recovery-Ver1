# PBS 开发交接上下文（2026-04-27）

> 这份文档用于给后续新窗口的 AI / 开发者提供 2026-04-27 这一轮 PBS 最新结论。
> 只记录开发侧上下文、代码逻辑和验证结果，不写数据库密码、明文账号密码或其他运行时敏感信息。

## 这一轮先读什么

继续做 PBS / Pairing 前，建议按这个顺序读：

1. `pbs-portal/AGENTS.md`
2. `pbs-server/AGENTS.md`
3. `docs/handoff/pbs/pbs-dev-handoff-2026-04-23.md`
4. `docs/superpowers/specs/2026-04-24-pbs-stable-identity-and-constraints-roadmap-design.md`
5. `docs/superpowers/specs/2026-04-24-pbs-pairing-concurrency-property-identity-design.md`
6. `docs/superpowers/specs/2026-04-24-pbs-pairing-search-add-and-favorite-unified-optimization-design.md`
7. 本文档

## 本轮最重要的结论

- PBS 后续所有业务模块，不只是 Pairing，只要涉及业务数据的增删改查、绑定、解绑、保存、收藏、取消收藏等，都要优先使用稳定 `id` / `key`。
- `code` 可以用于创建入参、筛选、字典查询、展示或历史兼容，但不能作为已有业务记录写操作的主身份。
- 不要用 `rowSeq`、展示排序、名称、日期文本、UI 文案或页面临时位置定位已有业务记录。
- 后端新增业务表、业务关系表、可持久化业务对象时，默认要设计稳定主键、唯一键、外键和必要索引。
- 能由数据库表达的数据安全规则要落到数据库约束或索引中，不只靠应用层判断。
- 并发修改同一个业务对象时，要用版本号、唯一键、事务约束等机制处理；旧版本保存要拒绝，不能静默覆盖新数据。
- 同一个接口如果被 `/pairing` 和 `/pairing/search` 等多个页面共用，一个入口改成稳定身份后，另一个入口必须同步更新。

## 已落地的协作规则更新

用户明确要求：不要把这条规则加入根目录全项目 `AGENTS.md`，只加入 PBS 相关子项目。

已修改：

- `pbs-server/AGENTS.md`
  - 在“数据模型与数据库约束”下加入 PBS 全业务 CRUD 稳定身份规则。
  - 明确 `code` 与 `id/key` 的边界。
  - 明确数据库主键、唯一键、外键、索引、检查约束要求。
  - 明确 Drizzle model / service 字段命名要反映真实语义，历史业务码不要命名成稳定身份字段。
  - 明确草稿保存、批量保存、跨页面写入和并发写入必须考虑版本/事务/约束。

- `pbs-portal/AGENTS.md`
  - 在“状态、请求与认证边界”下加入 PBS 前端全业务 CRUD 稳定身份规则。
  - 明确创建、筛选、字典查询可以用 `code`，但后端返回稳定 `id/key` 后，后续详情、修改、删除、绑定、解绑、保存、乐观更新和缓存同步要继续使用稳定身份。
  - 明确不要用 `rowSeq`、展示排序、名称、日期文本、UI 文案、可变业务 `code` 或页面临时位置定位已有业务记录。
  - 明确同一接口多页面共用时，request、cache key、mapper、mock、test 都要同步更新。
  - 明确乐观更新要有 pending / disabled、失败 rollback 或重新拉取。
  - 明确草稿/批量保存遇到并发冲突不能静默覆盖。

未修改：

- 根目录 `AGENTS.md`。

## Pairing / Pairing Search 本轮业务与交互收口

这一轮围绕 `/pairing` 和 `/pairing/search` 做了多次确认和实现。

### `/pairing/search` 标题结构

用户指出页面看起来有三个标题，但只有 `SEARCH CRITERIA` 和底部搜索结果有实际内容。

结论：

- 顶部 `SEARCH PAIRINGS` 是页面主标题，不应伪装成一个空业务 section。
- 业务承载区域应集中在：
  - `SEARCH CRITERIA`
  - `SEARCH RESULTS`

对应设计文档：

- `docs/superpowers/specs/2026-04-24-pbs-search-pairings-heading-structure-design.md`

### `SEARCH CRITERIA` 行内操作

用户希望 `SEARCH CRITERIA` 下方带过来的条件，像 `ADD PAIRING PROPERTIES` 一样可直接操作：

- 如果用户满意当前条件，可以直接点加号加入当前 layer。
- 也可以点爱心收藏。
- 不需要眼睛 icon。
- 右侧 layer 仍决定加到哪里。

对应设计文档：

- `docs/superpowers/specs/2026-04-24-pbs-search-criteria-inline-actions-design.md`

### Search Results 局部 loading

用户指出重新筛选搜索时，整个右侧刷新体验很差。

结论：

- 修改搜索条件再搜索时，只让 `SEARCH RESULTS` 区域出现 loading。
- 右侧其他上下文和已选 layer 不应被整块刷新。

对应设计文档：

- `docs/superpowers/specs/2026-04-24-pbs-search-results-local-loading-design.md`

### Pairing 添加 / 删除的持久化时机

用户发现：

- `/pairing` 的 `EXISTING PAIRING PROPERTIES` 删除后，如果立刻刷新页面，条件没有真正删除。
- `/pairing` 的 `ADD PAIRING PROPERTIES` 添加后，如果立刻刷新页面，条件没有真正添加。
- `/pairing/search` 已经有更好的体验：先让条件进入不可选择 / pending 状态，真实接口完成后才恢复。

结论：

- `/pairing` 添加和删除也必须模仿 `/pairing/search`。
- 操作发起后先进入 pending / disabled。
- 只有真实接口完成后才解锁。
- 失败时要回滚或重新拉取。

对应设计文档：

- `docs/superpowers/specs/2026-04-24-pbs-pairing-add-delete-persist-before-unlock-design.md`

## Pairing API 性能与稳定身份路线

用户要求添加 / 删除接口尽量在一秒内完成，并追问性能优化是否牺牲了正确性。

本轮解释过的优化原则：

- 不是跳过数据库写入，也不是为了快丢掉数据。
- 主要是 mutation 成功后不再返回完整 current draft。
- 写入完成后返回轻量结果，前端靠乐观更新和定向缓存同步维护界面状态。
- 需要真实一致性时仍可重新拉取，但不把每次 add/delete/favorite 都变成 full draft 重算和大响应。

对应设计文档：

- `docs/superpowers/specs/2026-04-24-pbs-pairing-add-delete-api-performance-design.md`
- `docs/superpowers/specs/2026-04-24-pbs-pairing-search-add-and-favorite-unified-optimization-design.md`

## 已完成的稳定身份治理轮次

本轮围绕 PBS 稳定身份和数据库约束完成了多轮治理：

### 第 0 轮：Pairing Search 添加与 Favorite 优化

- `/pairing/search` 添加改用轻量 add property 接口。
- Favorite 表增加稳定 `property_id`。
- Favorite 创建返回 `favoriteKey`。
- Favorite 删除改用稳定 `favoriteKey`。
- `/pairing` 和 `/pairing/search` 两个入口同步更新。

### 第 1 轮：Property Definition ID

- `pbs_bid_group` 增加 `property_definition_id`。
- `pbs_bid_condition` 增加 `property_definition_id`。
- 新保存的 bid group / condition 写稳定 property definition id。
- 旧 `property_id` 业务码改为 legacy 语义保留。

### 第 2 轮：Current Draft 身份收敛

- current draft 返回稳定 `draftKey` / `bidId` / `periodId`。
- current mutation 尽量由服务端解析当前 bid，而不是让前端用 `periodCode` 定位已有记录。
- `periodCode` 保留为展示 / 兼容字段。

### 第 3 轮：完整草稿保存并发保护

- current draft 增加 `draftVersion`。
- full draft save 必须带版本。
- 版本过期返回 409。
- 避免多标签页或多设备同时编辑时静默覆盖。

### 第 4 轮：Award 匹配引用稳定化

- Award 结果增加稳定 match columns / model。
- `matched_group_seq` 保留为展示 / 兼容字段，不作为唯一稳定引用。

### 第 5 轮：旧入口和命名清理

- 清理旧 rowSeq helper。
- 删除旧 favorite delete by code 运行时路径。
- 保留保护性测试，确认旧 `DELETE /api/pairing-bids/current/favorites/:propertyCode` 返回 404。
- 旧 code 字段命名逐步改成 legacy 语义。

## 当前关键接口状态

### Pairing property add

`POST /api/pairing-bids/current/properties`

- 用于添加 current pairing property。
- 响应保持轻量。
- 前端操作期间 pending / disabled。

### Pairing property delete

`DELETE /api/pairing-bids/current/properties/:propertyGroupKey`

- 删除 current pairing property 使用稳定 `propertyGroupKey`。
- 不再用 `rowSeq` 作为删除身份。

### Favorite create

`PUT /api/pairing-bids/current/favorites/:propertyCode`

- 创建收藏仍允许使用 `propertyCode` 作为创建入参。
- 后端返回稳定 `favoriteKey`、`propertyId`、`propertyCode`。

### Favorite delete

`DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey`

- 取消收藏使用稳定 `favoriteKey`。
- 旧的 `DELETE /api/pairing-bids/current/favorites/:propertyCode` 不再支持。

### Full draft save

`PUT /api/pairing-bids/current`

- 请求携带 `draftVersion`。
- 版本过期返回 409。
- 前端遇到 409 不能静默覆盖，应提示用户重新加载或重新保存。

## 清理检查结论

用户要求检查 `pbs-server` / `pbs-portal` 是否存在改动后不用的旧代码或没用引入。

检查结论：

- `pbs-portal npm run lint` 通过，没有编译级 unused import。
- `pbs-portal npm run build` 通过。
- `pbs-server npm run build` 通过。
- `currentPropertyByRowSeq` 和旧的 `removeFavoriteProperty(...)` 在运行时代码里已经没有。
- 旧 `DELETE /api/pairing-bids/current/favorites/:propertyCode` 只剩历史文档和一个保护性测试；测试应保留。
- `favoritePropertyCodes` 还在 contract、mock、测试和兼容响应里。Pairing 前端主逻辑已经不靠它判断收藏状态，但直接删除属于 API contract breaking change，不建议本轮清理。
- `legacyPropertyCode` 是历史 `property_id` 业务码兼容命名，不是无用字段。
- `matched_group_seq` / `matchedGroupSeq` 是 Award 展示 / 兼容字段，不是无用字段。
- `rowSeq` 仍可作为展示 / 排序 / 兼容字段存在，但不能作为写操作主身份。

## 验证状态

最近完整验证通过：

```bash
npm run verify:pbs
```

覆盖：

- `pbs-server: npm test`
- `pbs-server: npm run build`
- `pbs-server: npm run sync:pbs-users -- --dry-run`
- `pbs-portal: npm test`
- `pbs-portal: npm run lint`
- `pbs-portal: npm run build`

关键 pairing server 测试已覆盖：

- GET current pairing draft。
- PUT full draft save。
- stale `draftVersion` 返回 409。
- POST current properties 添加。
- DELETE current properties by `propertyGroupKey` 删除。
- PUT favorite by `propertyCode` 创建收藏。
- DELETE favorite by `favoriteKey` 取消收藏。
- 旧 DELETE favorite by `propertyCode` 路径返回 404。

关键 portal 测试已覆盖：

- `search-pairings-page.test.tsx`
- `pairing-page.test.tsx`
- `/pairing` 和 `/pairing/search` route tests。

## 当前工作树注意事项

- 当前仓库有大量前序 Pairing / stable identity 改动处于未提交或部分 staged 状态。
- 不要随意 revert 用户或前序 agent 的改动。
- 新窗口接手时先运行：

```bash
git status --short
```

## 不要重复推翻的结论

- 不要把稳定身份规则加入根目录全局 `AGENTS.md`，用户已经明确收窄到 `pbs-server` 和 `pbs-portal`。
- 不要把 Pairing / Pairing Search 的同一接口改一边漏一边；两页绑定，接口契约变化要同时处理。
- 不要为了性能返回空结果或丢掉必要状态；当前性能优化是让 add/delete/favorite mutation response 变轻，并配合前端乐观更新，不是跳过真实数据库写入。
- 不要用 `rowSeq`、展示排序或 `propertyCode` 做已有记录删除 / 取消收藏主身份。
- 不要把 `favoritePropertyCodes` 当成“明显废代码”直接删；它仍是兼容 contract 的一部分。
- 不要把历史文档里旧接口记录大面积重写；它们是历史 handoff/spec。必要时只加 superseded note。

## 新窗口推荐提示

可以这样开启新对话：

```text
这是 rois-ai / pbs 的已有上下文，请先阅读并基于它继续：

$(./scripts/memory/wakeup-rois-ai.sh pbs)

另外请优先阅读：
- /Users/lei/Codehub/rois-ai/docs/handoff/pbs/pbs-dev-handoff-2026-04-27.md

当前我要继续的任务是：
[写你的下一步任务]

要求：
1. 先基于已有上下文理解项目
2. 如果上下文不够，再结合仓库代码继续判断
3. 不要重复做已经明确否定的方案
4. 所有 PBS 后续业务 CRUD 默认使用稳定 id/key，不要用 rowSeq/code/UI 文案定位已有业务记录
```
