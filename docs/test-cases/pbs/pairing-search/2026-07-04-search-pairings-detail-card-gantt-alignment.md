# PBS Search Pairings 结果卡片与日历弹窗字段对齐测试

## 目标

验证 `Pairing > Search Pairings` 搜索结果卡片的 pairing detail 展示与左侧 `BIDDING CALENDAR` pairing 弹窗保持一致，并确认旧版无意义白色 square 不再出现。

## 前置条件

- `pbs-server` 和 `pbs-portal` 正常运行。
- 测试用户有可搜索到的 pairing 数据。
- 当前可申请周期内存在至少一个带航段明细的 pairing。

## 操作步骤

1. 登录 PBS Portal。
2. 进入 `Pairing` 页面。
3. 点击 `SEARCH PAIRINGS`，进入搜索结果页。
4. 查看第一张搜索结果卡片。
5. 返回左侧 `BIDDING CALENDAR`，点击同类 pairing bid 打开 `Pairing Bid` 弹窗。

## 预期结果

- Search 结果卡片摘要显示 `Start / Base / Composition / Total Credit / Total BH / Total DP`。
- Search 结果卡片明细表头显示 `QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty`。
- Search 结果卡片不再显示旧表头 `DUTY / DATE / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / BLKT / EQP`。
- Pairing 编号 badge 只显示 pairing number，不显示无意义的白色小方块。
- `ADD PAIRING` 按钮仍可点击，右侧 mini calendar 仍高亮 active dates。
- 左侧 `Pairing Bid` 弹窗与 Search 结果卡片使用同一套摘要字段和明细表头。

## 回归范围

- `Pairing > Search Pairings` 结果卡片。
- 左侧 `BIDDING CALENDAR` pairing bid 弹窗。
- Search 结果 `ADD PAIRING` 添加流程。
- Search 结果右侧 mini calendar active date 高亮。

## 自动化覆盖

- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`
- `e2e/tests/pbs-portal/pairing-search.spec.ts`
