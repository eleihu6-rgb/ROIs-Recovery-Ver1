# PBS Award 页面真实数据展示 QA 测试用例

日期：2026-07-03
范围：`pbs-portal` `/award`、`pbs-server` `/api/award/current`

## 前置条件

- PBS Portal 可登录。
- `pbs-server` 连接到远端权威库。
- `roster_publish` 至少有某个 bid period 的发布 roster 数据；当前环境 Jun 2026 已有样本数据。
- `pbs_award_result` / `pbs_award_item` 当前可以为空。

## 用例 1：Award 页面加载真实发布 roster

1. 登录 PBS Portal。
2. 打开 `/award`。
3. 观察右侧主面板。

预期结果：

- 页面标题为 `AWARD RESULTS`。
- 顶部显示 period、`Tier`、`Off`、`Credit`、`Premium`、`Pairings`、`Activities`。
- 页面显示整月 calendar。
- calendar 下方显示按日期排序的 award items。
- Pairing item 展示 pairing code、日期、时间、base/fleet/seat、leg 表格。
- 页面不显示 mock-only 的旧 `CO5721` 等静态内容，除非真实 API 返回该值。

## 用例 2：Reason Report 数据未发布

1. 确认 `pbs_award_result` / `pbs_award_item` 当前无该 crew + period 数据。
2. 打开 `/award`。

预期结果：

- `VIEW REASON REPORT` 按钮存在但不可点击。
- `Tier` 显示 `--`。
- 页面不伪造 matched tier 或 award reason。

## 用例 3：无发布 roster 空态

1. 使用当前 period 没有 `roster_publish` 数据的 crew 登录，或切换到无发布数据 period。
2. 打开 `/award`。

预期结果：

- 页面保留 `AWARD RESULTS`、summary 和整月 calendar 骨架。
- Award Items 区域显示 `No published award roster is available for this period.`
- 不出现 mock 内容和布局跳动。

## 用例 4：术语检查

1. 打开 `/award`。
2. 检查页面可见文案。

预期结果：

- 页面使用 `Tier`。
- 页面不出现 PBS 业务含义的 `Layer`。

## 用例 5：视觉与布局回归

1. 在 1920 x 1080 视口打开 `/award`。
2. 折叠和展开左侧 `BIDDING CALENDAR`。
3. 观察 `/award` 右侧主面板。

预期结果：

- 左侧共享 `BIDDING CALENDAR` 不被 Award 页面重置。
- 右侧 Award 面板随可用宽度变化，不裁切底部内容。
- summary、calendar、award item 不重叠。
- Reason Report 按钮不遮挡标题。

## 回归范围

- `Dashboard / Pairing / Tier / Reserve / Days Off` 左侧共享 calendar 不应受影响。
- `pbs-server` 原有 auth、bidding-calendar、pairing-search route 不应受影响。
