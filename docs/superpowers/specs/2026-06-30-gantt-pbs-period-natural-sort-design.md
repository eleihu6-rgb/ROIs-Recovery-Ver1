# Gantt PBS Period 自然月份排序修正设计

## 背景

`PBS -> Period` 页面当前列表默认按 `bid_open_at desc, id desc` 排序。全年生成后，页面会显示：

```text
Dec 2026
Nov 2026
...
Jan 2026
```

这个排序技术上能反映“最近开放窗口优先”，但对于 PBS Period 管理页不符合管理员阅读全年周期的直觉。管理员通常希望按自然月份从前往后检查：

```text
Jan 2026
Feb 2026
...
Dec 2026
```

## 目标

- `PBS -> Period` 默认列表按 PBS period 自然时间正序展示。
- 全年生成后，12 条记录显示为 `Jan -> Dec`。
- 排序依据应稳定，不受创建顺序影响。
- 保留现有筛选、新增、编辑、删除、全年生成能力。

## 非范围

- 不新增前端排序 UI。
- 不做可点击表头排序。
- 不改变 period 生成规则。
- 不改变 `period_code` 格式。
- 不修改数据库结构或索引。

## 方案

排序放在 live-server 的 `GET /api/pbs/period-admin` 中处理，改为按 `bid_open_at asc, id asc` 返回。

原因：

- `bid_open_at` 是实际 period 业务窗口的开始时间，比字符串 `period_code` 更可靠。
- 对全年生成的 PBS Period，`Jan 2026` 的 `bid_open_at` 最早，`Dec 2026` 最晚，因此正序天然得到 `Jan -> Dec`。
- 后端排序可以保证所有调用方拿到一致顺序，前端不需要额外重排。

## 测试

- 更新 live-server `pbs-period-admin-route` 单元测试，断言 list SQL 使用 `order by bid_open_at asc, id asc`。
- 更新或扩展 Gantt Playwright 测试，在全年生成后筛选该年份，断言 `Jan YYYY` 位于 `Dec YYYY` 之前。

## 验收标准

- 管理端打开 `PBS -> Period`，全年 records 默认按月份正序显示。
- 生成 `2026` 后，列表顺序为 `Jan 2026` 到 `Dec 2026`。
- 现有 create / edit / delete / generate-year 回归测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 只涉及一个后端列表排序和现有 Playwright 断言，拆分没有收益。
- Suggested split: 不拆分。
- Write boundaries: `live-server/src/routes/pbs/period-admin.ts`、对应 unit test、`e2e/tests/gantt/pbs-period.spec.ts`。
- Conflict risk: 低。
- Execution gate: 用户已确认按自然月份正序修正。
