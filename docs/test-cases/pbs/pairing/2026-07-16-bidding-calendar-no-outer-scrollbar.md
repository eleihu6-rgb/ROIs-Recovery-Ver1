# Bidding Calendar Pairing 操作弹层无外层滚动条回归

日期：2026-07-16
模块：PBS Portal / Pairing / Bidding Calendar

## 前置条件

- 当前 bid period 处于可编辑状态。
- Pairing 页面左侧 `BIDDING CALENDAR` 已加载。
- 至少一个日期存在多个可选 Pairing occurrence。
- 至少一个 occurrence 与某个 Tier 的 Prefer Off 日期冲突。

## 主流程

1. 打开 Pairing 页面。
2. 点击当前月份第一周中的可编辑日期。
3. 确认 `PAIRING BID` 操作弹层显示。
4. 观察左侧白色日历卡片右边缘。
5. 在 Pairing Numbers 内部滚动并选择一个 pairing。
6. 选择可用 Tier，触发一次保存失败提示。
7. 关闭弹层，再点击第二周或后续周的可编辑日期。

预期：

- 左侧整个 `BIDDING CALENDAR` 不出现纵向滚动条。
- 弹层完整位于左侧白色卡片内，`Cancel` 和 `ADD BID` 始终可见。
- Pairing Numbers 记录超过可视高度时，只有列表内部出现滚动。
- blocked 或保存错误提示出现时，Pairing Numbers 列表略微变矮，但所有记录仍可滚动访问。
- 第一周向下展开、后续周向上展开均不被卡片裁切。

## 自适应回归

分别在以下视口重复主流程：

- `1920 × 1080`
- `1440 × 900`
- `1024 × 768`

预期：

- 页面继续沿用现有 adaptive / full-fit 缩放。
- 左右面板宽度比例不变。
- 日历网格无横向溢出。
- 左侧卡片底部可用空白用于容纳操作弹层，不生成外层滚动条。

## 相关回归

1. 折叠并重新展开 `BIDDING CALENDAR`，确认状态和布局正常。
2. 点击蓝色 Pairing 事件，确认 Pairing 详情仍覆盖整个浏览器视口。
3. 打开 Dashboard 独立页面，确认日历 matrix、weekday 和 calendar grid 没有横向裁切。
