# PBS Days Off 可见条件删减 QA

日期：2026-07-07
范围：PBS Portal `Days Off` 页面 Add Properties 列表。

> 历史留痕：本用例对应 2026-07-07 第一轮删减，当时仍保留 `Min Consecutive Days Off`。
> 当前该删减已被 2026-07-08 可见性恢复覆盖；最新验收以
> `docs/test-cases/pbs/condition-properties/2026-07-08-bid-property-visibility-restore.md` 为准。
> 本文件仅保留历史背景，不再作为当前 QA 预期。

## 前置条件

- 已执行 migration：`sql/migration/2026-07-07-pbs-days-off-visible-property-pruning.sql`
- `pbs-server` 已重启，或已清理 Redis key：`pbs:f8_pbs:days-off:property-catalog:v1`
- 使用可登录 PBS Portal 的 lineholder 用户。

## 测试步骤

1. 登录 PBS Portal。
2. 打开 `Days Off` 页面。
3. 查看 `ADD DAYS OFF PROPERTIES` 区域。
4. 切换 `ALL PROPERTIES`。
5. 搜索以下 property 名称：
   - `Max Consecutive Days On`
   - `Min Consecutive Days Off In Window`
   - `Days Off / Days On Pattern`
   - `Employee Schedule Preference`
   - `Day of Week Off`
6. 搜索或查看以下 property 名称：
   - `Prefer Off`
   - `Min Consecutive Days Off`

## 预期结果

- `ALL PROPERTIES` 中只显示本轮保留的 Days Off 主入口：
  - `Prefer Off`
  - `Min Consecutive Days Off`
- 以下条件不再显示：
  - `Max Consecutive Days On`
  - `Min Consecutive Days Off In Window`
  - `Days Off / Days On Pattern`
  - `Employee Schedule Preference`
  - `Day of Week Off`
- 已存在草稿如果包含被隐藏 property，页面不应崩溃；后端仍可解析该 property code。

## 回归范围

- `Prefer Off` 仍可新增、编辑、保存。
- `Min Consecutive Days Off` 仍可新增、编辑、保存。
- `Days Off` 页面搜索不会返回隐藏 property。
- `Standing Bid` 后续如需 `Day of Week Off`，应由 Standing Bid 自己的 catalog 处理，不依赖 Current Days Off 页面。
