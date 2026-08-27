# PBS Search Pairings 结果卡片紧凑布局测试用例

## 目标

验证 `Pairing > Search Pairings` 结果卡片不再把完整 Gantt 宽表塞进列表卡片，用户可以在搜索结果中快速阅读核心信息，同时左侧日历的 Pairing Bid 弹窗仍保留完整明细。

## 前置条件

- `pbs-server` 正常运行。
- `pbs-portal` 正常运行。
- 测试用户可以登录 PBS Portal，并且当前 bidding period 有 Pairing 数据。
- 推荐使用用户 `247 / rois`，或其他有 Pairing 搜索结果的测试用户。

## 操作步骤

1. 登录 PBS Portal。
2. 进入 `Pairing` 页面。
3. 点击 `ALL PAIRINGS` 或 `SEARCH PAIRINGS` 进入搜索结果页。
4. 查看第一条搜索结果卡片。
5. 检查卡片左侧 Pairing detail 区域。
6. 检查卡片右侧 mini calendar。
7. 从左侧 `BIDDING CALENDAR` 点击已添加的 Pairing，打开 `Pairing Bid` 详情弹窗。

## 预期结果

- Search Pairings 结果卡片左侧显示摘要字段：`Start / Base / Composition / Total Credit / Total BH / Total DP`。
- Search Pairings 结果卡片的 leg preview 显示紧凑字段：`Flight / ALN / Fleet / Route / PCK / RPT / STD / STA / BH / Duty`。
- Search Pairings 结果卡片内部不出现横向滚动条。
- Search Pairings 结果卡片左侧 Pairing detail preview 顶部与右侧 mini calendar 对齐，且高度不低于右侧 mini calendar；当 legs 较多时允许左侧自然超过右侧。
- Search Pairings 结果卡片不显示完整 Gantt 宽表专属字段：`QUAL / ACC / Ref / ATD / ATA / DRP / GT / FT / MRT`。
- Search Pairings 结果卡片不显示旧版表头：`DUTY DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / BLKT / EQP`。
- Search Pairings 结果卡片右侧 mini calendar 继续展示 active dates。
- `ADD PAIRING` 操作位置和行为不变。
- `Pairing Bid` 详情弹窗继续显示完整 Gantt 明细表，包含 `QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty`。

## 回归范围

- Pairing 搜索结果卡片布局。
- Pairing 搜索结果字段格式。
- Pairing 搜索结果 mini calendar。
- 左侧日历 Pairing Bid 详情弹窗。
- Pairing 添加按钮。
