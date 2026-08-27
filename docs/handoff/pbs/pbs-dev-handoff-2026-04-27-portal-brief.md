# PBS 简版交接（2026-04-27）

> 这份文档放在 `pbs` wing 下，方便 `wakeup pbs` 时更容易命中。
> 更完整的版本见仓库根：`docs/handoff/pbs/pbs-dev-handoff-2026-04-27.md`。

## 当前主线

- PBS 当前主线仍是 `pbs-portal + pbs-server` 联动开发。
- 本轮重点是 Pairing / Pairing Search 的真实保存、性能、并发和稳定身份治理。
- 后续继续开发前先读：
  - `pbs-portal/AGENTS.md`
  - `pbs-server/AGENTS.md`
  - `docs/handoff/pbs/pbs-dev-handoff-2026-04-27.md`

## 最重要的新规则

- PBS 后续所有业务模块，不只是 Pairing，只要涉及业务数据的增删改查、绑定、解绑、保存、收藏、取消收藏等，都要优先使用稳定 `id` / `key`。
- `code` 可以用于创建入参、筛选、字典查询、展示或历史兼容，但不能作为已有业务记录写操作的主身份。
- 不要用 `rowSeq`、展示排序、名称、日期文本、UI 文案或页面临时位置定位已有业务记录。
- 后端新增业务表、业务关系表、可持久化业务对象时，默认要设计稳定主键、唯一键、外键和必要索引。
- 并发修改同一个业务对象时，要用版本号、唯一键、事务约束等机制处理；旧版本保存要拒绝，不能静默覆盖新数据。

## 已更新的协作规则

用户明确要求：不要把稳定身份规则加入根目录全局 `AGENTS.md`，只加入 PBS 相关子项目。

已更新：

- `pbs-server/AGENTS.md`
  - PBS 全业务 CRUD 默认使用稳定 `id` / `key`。
  - 数据库约束要落到主键、唯一键、外键、索引或检查约束。
  - Drizzle / service 字段命名要反映真实语义。
  - 草稿保存、批量保存、跨页面写入和并发写入要考虑版本或事务约束。

- `pbs-portal/AGENTS.md`
  - 前端后续详情、修改、删除、绑定、解绑、保存、乐观更新和缓存同步要使用后端返回的稳定 `id` / `key`。
  - 同一接口多页面共用时，request、cache key、mapper、mock、test 都要同步更新。
  - 乐观更新要有 pending / disabled，失败要 rollback 或重新拉取。

未修改：

- 根目录 `AGENTS.md`。

## Pairing / Search Pairings 状态

- `/pairing/search` 顶部 `SEARCH PAIRINGS` 只是页面主标题，不再当成空业务 section。
- `SEARCH CRITERIA` 下方条件可以直接加号添加或爱心收藏，不需要眼睛 icon。
- 搜索条件变化重新搜索时，只让 `SEARCH RESULTS` 局部 loading，不刷新整个右侧。
- `/pairing` 添加和删除 property 已按 `/pairing/search` 的模式收口：发起操作后 pending / disabled，真实接口完成后才恢复。
- `/pairing` 和 `/pairing/search` 共用的接口必须同步维护，不允许只改一边。

## 当前关键接口

- `POST /api/pairing-bids/current/properties`
  - 添加 current pairing property，响应保持轻量。
- `DELETE /api/pairing-bids/current/properties/:propertyGroupKey`
  - 删除 current pairing property，使用稳定 `propertyGroupKey`。
- `PUT /api/pairing-bids/current/favorites/:propertyCode`
  - 创建收藏可以用 `propertyCode` 作为创建入参，返回稳定 `favoriteKey`。
- `DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey`
  - 取消收藏必须使用稳定 `favoriteKey`。
- `PUT /api/pairing-bids/current`
  - full draft save 携带 `draftVersion`，旧版本返回 409。

## 已完成的稳定身份治理

- Pairing Search 添加走轻量 add 接口。
- Favorite 表和接口支持稳定 `property_id` / `favoriteKey`。
- `pbs_bid_group` / `pbs_bid_condition` 增加 `property_definition_id`。
- current draft 返回稳定 `draftKey` / `bidId` / `periodId`。
- full draft save 增加 `draftVersion` 乐观锁。
- Award 增加稳定 match columns / model，`matched_group_seq` 保留为展示 / 兼容字段。
- 清理旧 rowSeq helper 和旧 favorite delete by code 运行时路径。

## 清理检查结论

- 没有发现可以安全删除的编译级 unused import。
- `favoritePropertyCodes` 仍是兼容 contract 的一部分，不要直接删。
- `legacyPropertyCode` 是历史 `property_id` 业务码兼容命名，不是无用字段。
- `matched_group_seq` / `matchedGroupSeq` 是 Award 展示 / 兼容字段，不是无用字段。
- 旧 `DELETE /api/pairing-bids/current/favorites/:propertyCode` 只剩保护性测试，验证旧路径返回 404，应保留。

## 最近验证状态

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

## 继续开发前提醒

- 当前工作树有大量前序 Pairing / stable identity 改动处于未提交或部分 staged 状态。
- 不要随意 revert 用户或前序 agent 的改动。
- 新窗口接手时先运行：

```bash
git status --short
```

## 不要重复推翻的结论

- 不要把稳定身份规则加入根目录全局 `AGENTS.md`。
- 不要用 `rowSeq`、展示排序或 `propertyCode` 做已有记录删除 / 取消收藏主身份。
- 不要为了性能跳过真实数据库写入；当前性能优化是轻量 mutation response + 前端乐观更新。
- 不要把 `favoritePropertyCodes` 当成明显废代码直接删。
- 不要只改 `/pairing` 或只改 `/pairing/search`；两页绑定同一组接口。
