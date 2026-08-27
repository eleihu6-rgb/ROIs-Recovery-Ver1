# PBS Redeye Preference 日期统一测试用例

## 1. 测试目标

验证 Pairing property `117 Redeye Preference`：

- 新增时默认选择 Avoid，同时仍可选择 Award；
- 显示只读定义 `03:30-05:30 local time`；
- `LIMIT TO FLIGHT DATE` 默认关闭；
- 开启后支持 Specific Dates 多选和 Date Range；
- Pairing 与 Search Pairings 使用相同 editor 和 payload；
- 旧 `flag` / `specific_date` payload 被拒绝；
- 搜索和算法评分使用一致的 Redeye 正向命中集合。

## 2. 前置条件

- PBS Portal 与 pbs-server 使用同一版本。
- 当前 bid period 有可选日期，例如 `Jun 2026`。
- property catalog 中 `propertyCode=117` 可见。
- 已在受控 PBS schema 执行 `sql/migration/2026-07-16-pbs-redeye-preference-date-standardization.sql`。

## 3. 默认状态与无日期限制

1. 进入 Pairing 页面并打开 `Redeye Preference`。
2. 验证所有 Tier 默认未选择。
3. 验证 Avoid 选中、Award 未选中。
4. 验证 `03:30-05:30 local time` 可见且不可编辑。
5. 验证 `LIMIT TO FLIGHT DATE` 开关关闭。
6. 选择 T1 并保存。

预期：保存成功，payload 为：

```json
{
  "propertyCode": 117,
  "action": "avoid",
  "quantifier": null,
  "tiers": ["T1"],
  "bid": {
    "type": "redeye-preference",
    "dateScope": null
  }
}
```

## 4. Specific Dates 多选

1. 新增 Redeye Preference。
2. 开启 `LIMIT TO FLIGHT DATE`。
3. 验证默认进入 `Specific Dates`，未选日期时 Add Bid 禁用。
4. 选择两个 bid period 内日期。
5. 选择 T1 并保存，再重新编辑。

预期：两个日期均回显；payload 使用：

```json
{
  "type": "redeye-preference",
  "dateScope": {
    "mode": "specific_dates",
    "dates": ["2026-06-03", "2026-06-18"]
  }
}
```

## 5. Date Range 与隐藏字段清理

1. 在 Specific Dates 已选日期的状态切换到 Date Range。
2. 验证 range 初始为空，旧 dates 不再提交。
3. 选择合法起止日期并保存。
4. 重新编辑，关闭 `LIMIT TO FLIGHT DATE`。

预期：range 正确回显；关闭开关后 payload 为 `dateScope: null`，不残留 `dates/from/to`。

## 6. Award 编辑回显

1. 新增条件，切换到 Award 后保存。
2. 重新编辑已保存条件。

预期：仍显示 Award；新增默认 Avoid 不覆盖已有 action。

## 7. Search Pairings

1. 从已有 Redeye Preference 打开 Search Pairings。
2. 编辑搜索条件。

预期：复用相同 UI；Award/Avoid、Specific Dates 或 Date Range 正确回显。Avoid 搜索返回正向 Redeye 条件的补集。

## 8. 校验与边界

- Specific Dates 为空：拒绝保存。
- Specific Dates 任一日期超出 bid period：服务端拒绝。
- Date Range 任一端超出 bid period：服务端拒绝。
- Date Range `from > to`：拒绝。
- `{ "type": "flag" }`：拒绝。
- `{ "mode": "specific_date", "date": "..." }`：拒绝。
- 非空 quantifier 或未知 bid 字段：拒绝。

## 9. Migration 验证

1. 在受控 PBS schema 执行 migration 两次。
2. 核查 property `117` 的三类 favorite、condition、group 和 occurrence 已清除。
3. 核查受影响 tier/bid 汇总计数正确。
4. 核查其他 property 的记录数量未变化。

预期：两次执行都成功；第二次不产生额外删除；无 property `117` 旧 payload 残留。

## 10. 回归范围

- Pairing 页面 Add/Edit/Save Favorite。
- Search Pairings 编辑和预览。
- lineholder JSON 序列化、clone 与摘要。
- pbs-server/live-server Pairing Search。
- 算法 Award/Avoid counter 输出。
