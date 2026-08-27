# PBS Favorite Properties 无 Tx 实施计划

日期：2026-07-27

依据：

- `docs/superpowers/specs/2026-07-27-pbs-favorite-properties-without-tiers-design.md`

## 目标

- Pairing、Days Off、Line Favorite 只保存完整条件模板，不保存 Tx。
- Favorite 卡片内选择 T1–T7 后直接加入 Existing Bid，不再打开配置弹窗。
- 三张 configured favorite 表物理删除 `tiers`。
- Favorite 写入具备原子 draft version 并发保护。
- 两套 crew-bid import snapshot/rollback 适配无 Tx Favorite。

## Task 1：影响分析与失败测试

在修改前对以下 symbols 执行 GitNexus upstream impact：

- Favorite contracts 与三个 route schemas；
- 三类 Favorite normalize/read/write/remove 方法；
- `RuleBidRightPanel` 与 Pairing right panel Favorite add/save handlers；
- Favorite mapper、cache helper、Property card；
- 两套 import snapshot/restore 方法。

先增加或更新失败测试：

- 三类 Favorite request/response 不含 `tiers`；
- strict route 拒绝旧 `tiers`；
- Days Off `action` round-trip；
- Favorite create/PATCH/delete 原子递增 draft version；
- 空草稿保存 Favorite 后返回稳定 identity；
- 卡片 T1–T7 临时多选与直接添加；
- success 清空、failure/409 保留；
- 两卡片隔离、pending 去重、重渲染保持；
- import rollback 恢复无 Tx Favorite。

## Task 2：Contract 与后端写入

修改：

- `packages/contracts/pbs-pairing-bids.d.ts`
- `packages/contracts/pbs-days-off-bids.d.ts`
- `packages/contracts/pbs-line-bids.d.ts`
- 三类 route schema；
- Pairing、Days Off、Line Favorite normalize/read/write/remove service。

要求：

- Favorite request/response 物理移除 `tiers`；
- Favorite route 顶层和 `property` schema 使用 `.strict()`；
- Days Off schema 显式保留 `action`；
- Line Favorite `name`、`bid` 为必填；
- create/PATCH/delete 使用最新 `draftVersion`，事务内原子校验并递增；
- mutation response 返回最新 `draftKey/bidId/draftVersion`；
- 旧版本并发写入返回 409。

验证：

- 三类 focused route/service tests；
- TypeScript build。

## Task 3：Schema、Migration 与 import rollback

修改：

- `sql/schema/pbs/01-pbs.sql`
- 三个 Drizzle Favorite model；
- 新增 drop-column Migration；
- 新增 Migration fixture、verify、second-run verify；
- `live-server` 与 `pbs-server` crew-bid import snapshot/restore。

要求：

- 三张表删除 `tiers`；
- Favorite 数量、稳定 id、完整业务行、审计字段和 identity sequence 保持；
- 旧 snapshot 恢复时丢弃 `tiers`；
- 新旧 snapshot rollback 都恢复 Favorite 行；
- 不修改仍用于历史 migration 前置状态的 fixture。

验证：

- Migration fixture/verify/second-run；
- 两套 import focused tests；
- algorithm-export focused regression。

## Task 4：前端 Favorite 类型与保存校验

修改 Pairing 和共享 Rule Bid mapper/service/cache：

- Favorite 类型不含 Tx；
- Favorite 映射时初始化本地 T1–T7 为全未选；
- `SAVE FAVORITE` 的可用性只依赖条件完整性；
- Favorite request 不发送 Tx；
- mutation response 更新页面最新 draft meta；
- `ADD BID` 继续要求至少一个 Tx。

验证：

- Pairing/Days Off/Line service tests；
- mapper/cache/component tests；
- 空草稿保存 Favorite 后直接 Add 的回归。

## Task 5：Favorite 卡片内联 Tx UI

在共享 Rule Bid 卡片和 Pairing 卡片中：

- 标题、条件摘要、Tx 操作分层；
- T1–T7 多选；
- `aria-pressed`、具名 group、可感知未选说明；
- 未选时 `+` 不可执行；
- 选中后直接复用 Add Bid mutation；
- 不打开配置弹窗；
- 成功仅清空目标卡片；
- 普通失败/409 保留 Tx；
- 409 显示持久恢复状态和 `Reload draft`；
- pending 期间去重。

验证：

- UI component tests；
- `npm run check:ui`；
- Portal lint/build。

## Task 6：Playwright 与 QA

更新真实 Playwright：

- Pairing、Days Off、Line 保存 Favorite 不选 Tx；
- request 无 `tiers`；
- 卡片多选 Tx；
- `+` 直接 Add，request 含精确 Tx；
- 不打开弹窗；
- success/failure/409/pending/两卡片隔离；
- 搜索/分页/重渲染/刷新/切周期状态边界；
- `TOP USED` 不进入 Favorites。

新增 QA：

- `docs/test-cases/pbs/condition-properties/2026-07-27-configured-favorites-without-tiers.md`

## Task 7：三库执行与交付验证

按 forward-only 顺序：

1. 确认服务停止或不再读写旧 `tiers`；
2. 在本地/SIT/UAT 三个 PBS schema 执行 Migration；
3. 执行 verify 和 second-run verify；
4. 重启对应服务并 smoke；
5. 运行真实 Playwright。

最终验证：

- pbs-server focused tests + build；
- live-server focused tests + build；
- pbs-portal tests + lint + build；
- `npm run verify:pbs`；
- `npm run check:ui`；
- `git diff --check`；
- GitNexus `detect-changes --scope compare --base-ref main`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Contract、三类 service、共享 Favorite card 和 draft version 彼此紧密耦合。
- Suggested split: 单一实现者按测试 → contract/backend → schema/import → frontend → E2E 串行完成。
- Write boundaries: `packages/contracts`、`pbs-server`、`live-server`、`pbs-portal`、`sql`、`e2e`、`docs/test-cases`。
- Conflict risk: 并行写共享 Favorite 类型和 Rule Bid 组件会造成短暂契约不一致。
- Execution gate: 用户已批准 spec 和实施。
