# PBS Days Off — Prefer Off 统一条件 QA 测试案例

日期：2026-07-10
范围：PBS Portal、PBS Server、F8 dictionary、Days Off algorithm export

## 1. 测试边界

本次验证 `propertyCode=201` 在 Portal 和 PBS 数据层的完整录入、保存、编辑与收藏。`Time Window` 继续作为日期窗口修饰保存；`FULFILMENT`、`All selected periods`、`Flexible quantity`、`Minimum required`、`Maximum required` 已从 Days Off `Prefer Off` 员工端移除，保存统一按全部 selected periods 处理。

## 2. 前置条件

- 已按顺序部署 Prefer Off migration、`pbs-server`、`pbs-portal`。
- F8 `dictionary` 包含 `DOW` 和 `PBS_PREFER_OFF` 配置。
- Weekend 初始配置为 Friday `00:00` 至 Sunday `24:00`。
- 使用开放且允许编辑的 PBS bid period。
- 使用允许破坏性测试的 PBS 测试账号和测试数据库。

## 3. 正常流程

### PO-01 单一入口与 Tier 防呆

1. 打开 `Days Off`，切换到 `ALL PROPERTIES`。
2. 确认只显示一个 `Prefer Off`，不再显示 `Dates`、`Days of Week`、`Date Range` 三个入口。
3. 点击 `Add Prefer Off`。
4. 确认 T1 默认选中。
5. 取消 T1，使 Tier 选中数变为 0。
6. 确认出现 `APPLY TO TIERS · REQUIRED`，`SAVE FAVORITE` 和 `ADD BID` 禁用。
7. 重新选择任意 Tier，确认 REQUIRED 消失；选择内容合法后按钮恢复。

### PO-02 Specific Dates

1. 保持 `Specific Dates`。
2. 选择一个日期，确认立即生成 tag，且没有 `ADD DATE` 按钮。
3. 确认不显示 `FULFILMENT`。
4. 再选择一个日期，确认仍不显示 `FULFILMENT`、`All selected periods`、`Flexible quantity`。
5. 再次点击已选日期或点击 tag 的删除按钮，确认日期被移除且不会重复。
6. 保存并重新编辑，确认日期完整回显。

### PO-03 Date Range

1. 切换到 `Date Range`。
2. 先选择较晚日期，再选择较早日期。
3. 确认组合输入框自动按从早到晚排列，并高亮包含式范围。
4. 保存并重新编辑，确认范围完整回显。

### PO-04 Days of Week

1. 切换到 `Days of Week`。
2. 确认星期名称和顺序与 F8 `DOW` dictionary 一致。
3. 选择 Monday 和 Friday。
4. 保存后确认 bid values 只包含 `Monday`、`Friday`，员工端不显示 selected-period count。
5. 保存并重新编辑，确认星期选择完整回显。

### PO-05 Weekends

1. 切换到 `Weekends`。
2. 确认界面显示 `Saturday 00:00 – Sunday 24:00`。
3. 确认 Weekend 数只统计完整落在 bid month 内的 Saturday-Sunday block。
4. 以 June 2026 为例，确认显示 `4 weekends`，对应 Jun 6–7、13–14、20–21、27–28。
5. 保存并重新编辑，确认 `Weekends` 回显。
6. 确认左侧 Bidding Calendar 的 Prefer Off 事件只落在上述 Saturday/Sunday，不包含 Jun 5、12、19、26。
7. 验证 Pairing 指定日期冲突：相同 Tier 的 Saturday/Sunday Pairing 被阻止，Friday Pairing 不因 `Weekends` 被阻止。

### PO-06 Time Window

1. 在任一模式开启 `TIME WINDOW`。
2. 输入 `08:00` 至 `18:00`。
3. 保存并重新编辑，确认开关、From、To 完整回显。
4. 关闭开关并保存，确认 payload 不再包含 `Window HH:mm-HH:mm`。

### PO-07 Fulfilment 已移除

1. 创建至少两个 selected periods。
2. 检查弹窗中是否存在 `FULFILMENT`、`All selected periods`、`Flexible quantity`、`Minimum required`、`Maximum required`。
3. 保存并重新编辑。

预期：

- 上述 fulfilment / quantity UI 始终不显示。
- 保存 payload 标准化为 `allOrNothing=true`、`minimumN=null`、`maximumN=null`。

### PO-08 Favorite round-trip

1. 配置两个 Specific Dates 和 Time Window。
2. 点击 `SAVE FAVORITE`。
3. 在 `FAVORITED PROPERTIES` 中确认显示 `Prefer Off` 和保存的摘要/Tier。
4. 点击 Favorite 的 `Add Prefer Off`，确认不需要重新打开配置弹窗即可加入 Existing。
5. 重新编辑 Existing，确认日期、Window 均未丢失，且不显示 fulfilment / min/max。

## 4. 异常与边界

### PO-B01 Period 外日期

- 日历中 bid month 外日期必须禁用。
- 通过 API 提交 period 外 Specific Date 或跨月 Date Range，应返回 400。
- 旧 period 外数据可以打开和删除，但修正前不能重新保存，不得静默裁剪。

### PO-B02 不完整 Weekend

- 月初或月末被边界截断的 Weekend 不计入 count。
- `DAYS_OFF.csv` 不得把不完整 Weekend 输出到相邻月份。

### PO-B03 Dictionary 缺失或非法

- 删除任一 Weekend 必需配置或写入非法时间后，Weekends 按钮应禁用。
- Specific Dates 和 Date Range 仍可使用。
- 直接通过 API 保存 `Weekends` 应返回明确配置错误，不得回退为 Sat/Sun。

### PO-B04 无效时间

- From 等于 To、From 晚于 To、缺少一端时，保存按钮禁用。
- 通过 API 提交跨夜窗口应返回 400。

### PO-B05 旧数量字段标准化

- 旧 `false + null/null`、旧 min-only Flexible、旧 min/max range 均可打开。
- 重新保存后统一写为 `allOrNothing=true`、`minimumN=null`、`maximumN=null`。
- `DAYSOFF.csv` 导出只包含具体日期 / 时间窗口和 Tier counter，不出现数量语义。

### PO-B06 Mixed legacy tags

- 日期、星期、范围混合的旧 201 可以打开和删除。
- 编辑时显示兼容提示，必须选择一个明确模式后才能保存；不得静默删除旧 tag。

## 5. 回归范围

- Days Off 其他 property 的 Add/Edit/Delete/Favorite。
- Pairing、Line、Reserve 的配置弹窗与 Tier 默认行为。
- `pbs_bid_group.limit_n` 的非 201 既有语义。
- Days Off draft 全量保存与增量 Add/Patch。
- Favorite 的旧数据读取。
- `DAYS_OFF.csv` 的具体日期、日期范围、星期和时区转换。

## 6. 自动化收据命令

```bash
cd pbs-portal
npx vitest run src/features/days-off/components/prefer-off-editor.test.tsx src/features/days-off/pages/days-off-page.test.tsx src/shared/services/days-off-service.test.ts

cd ../pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test \
  src/services/days-off/days-off-validation.test.ts \
  src/services/days-off/days-off-draft-mappers.test.ts \
  src/services/days-off/days-off-persistence-mappers.test.ts \
  src/routes/days-off-bids.test.ts \
  src/services/algorithm-export/days-off-export.test.ts

cd ../e2e
npm run test:pbs-portal -- --no-deps tests/pbs-portal/days-off-prefer-off.spec.ts --reporter=list
```
