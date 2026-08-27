# PBS 条件页默认收藏属性设计

## 背景

用户反馈 PBS Portal 的 `Days Off`、`Pairing`、`Line` 条件页里，常用条件应该优先显示在 `FAVORITED PROPERTIES` 中，并且该 tab 应该放在左侧第一个，作为进入页面后的默认视图。

参考输入文件：

- `/Users/lei/Downloads/CLASS-BidsReport_March2026.txt`

## 目标

- `FAVORITED PROPERTIES` 在 `Days Off`、`Pairing`、`Line` 三个条件页中显示在 `ALL PROPERTIES` 左侧。
- 页面首次进入、数据重新 hydrate、点击 reset/cancel 后，默认停留在 `FAVORITED PROPERTIES`。
- 默认收藏来自后端 catalog，不在前端硬编码业务列表。
- 默认收藏按 NPBS 报表使用率排序。
- 员工自己保存的收藏仍然保留，且可以删除；系统默认收藏不可删除。

## 报表提取结果

### Days Off

| 顺序 | property_code | 名称 | 使用次数 |
|---:|---:|---|---:|
| 1 | 201 | Prefer Off | 1583 |
| 2 | 203 | Min Consecutive Days Off | 175 |
| 3 | 202 | Max Consecutive Days On | 65 |
| 4 | 205 | Days Off / Days On Pattern | 34 |

说明：Days Off 在报表中只有 4 个有效高频项，不额外凑满 5 个。

### Pairing

| 顺序 | property_code | 名称 | 使用次数 |
|---:|---:|---|---:|
| 1 | 102 | Pairing Number | 2094 |
| 2 | 101 | Any Landing In Airport | 1186 |
| 3 | 106 | Departure Date / Day | 625 |
| 4 | 103 | Pairing Check-In Time | 332 |
| 5 | 105 | Pairing Total Credit | 295 |

### Line

| 顺序 | property_code | 名称 | 使用次数 |
|---:|---:|---|---:|
| 1 | 402 | Min Credit Window | 63 |
| 2 | 401 | Max Credit Window | 59 |
| 3 | 404 | No Same Day Pairings | 56 |
| 4 | 405 | Waive No Same Day Duty Starts | 29 |

说明：Line 在报表中只有 4 个有效高频项，不额外凑满 5 个。

## 设计方案

### 数据模型

在 `pbs_bid_property` 增加系统默认收藏字段：

- `default_favorite_order smallint`：默认收藏排序；为空表示不是系统默认收藏。
- `default_favorite_usage_count integer`：报表使用次数，仅用于审计和后续调整依据。

字段放在 catalog 表上，是因为默认收藏属于系统级 property 展示规则，不属于某个用户的个人收藏。

### 后端契约

`Days Off`、`Pairing`、`Line` 当前草稿接口新增：

- `defaultFavoritePropertyCodes: number[]`

后端返回逻辑：

- 只从 `is_visible_in_portal=1` 且当前模块 contract 支持的 property 中生成默认收藏。
- 按 `default_favorite_order` 升序返回。
- `favoritePropertyCodes` 保持用户个人收藏语义。
- 默认收藏和用户收藏在前端合并展示，但来源仍保持区分。

### 前端行为

- `FAVORITED PROPERTIES` 放在 tab 左侧，并作为默认 active tab。
- Favorited 列表展示：
  1. 后端默认收藏，按 `defaultFavoritePropertyCodes` 排序；
  2. 用户保存的 configured favorites；
  3. 兼容性的 catalog favorite。
- `ALL PROPERTIES` 继续展示 catalog 全量可选属性，不展示用户 configured favorite 副本。
- 系统默认收藏不显示删除按钮；只有用户 configured favorite 显示删除按钮。

## 验收标准

- 进入 `Days Off` 页面时，默认看到 `FAVORITED PROPERTIES`，且顺序为 `Prefer Off`、`Min Consecutive Days Off`、`Max Consecutive Days On`、`Days Off / Days On Pattern`。
- 进入 `Pairing` 页面时，默认看到 `FAVORITED PROPERTIES`，且顺序为 `Pairing Number`、`Any Landing In Airport`、`Departure Date / Day`、`Pairing Check-In Time`、`Pairing Total Credit`。
- 进入 `Line` 页面时，默认看到 `FAVORITED PROPERTIES`，且顺序为 `Min Credit Window`、`Max Credit Window`、`No Same Day Pairings`、`Waive No Same Day Duty Starts`。
- `ALL PROPERTIES` 仍可手动切换并搜索全部可见属性。
- 用户自己保存到 favorite 的属性仍能出现在 `FAVORITED PROPERTIES`，并可删除。
- 后端不返回不可见或不支持的 property 作为默认收藏。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动横跨同一条 contract、mapper、tab 状态与测试链路，接口字段和排序语义强耦合。
- Suggested split: 不建议拆分；由一个 agent 完成后端字段、前端 mapper、UI 默认 tab 和测试。
- Write boundaries: 单 agent 可保持 `pbs-server`、`pbs-portal`、`packages/contracts`、`sql` 一致。
- Conflict risk: 多 agent 容易在 contract 字段、mock 数据和测试预期上产生冲突。
- Execution gate: 用户确认本 spec 后实施。
