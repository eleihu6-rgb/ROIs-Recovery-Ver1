# Airport Preference Preferred Layover Hours Slider QA

## 范围

验证 `Airport Preference` 的 `Preferred layover hours` 从 `HH:MM` 文本输入改为 slider 后，员工端保存、Search Pairings 和 algorithm export 的过滤语义一致。

## 前置条件

- Pairing 页面可打开 `Airport Preference`。
- `/pairing-search/airport-options` 返回 `airportPreferenceLayoverHours`，默认范围为 `13-18`，step `1`，default `13`。
- 测试 period 中至少有一个可选 layover airport，例如 `YYZ`。

## AP-LH-01 默认关闭

1. 打开 `Configure Airport Preference`。
2. 确认 `Airport Event` 默认 `Landing`，不显示 `Preferred layover hours`。
3. 切换到 `Layover`。
4. 确认 `Preferred layover hours` switch 默认关闭。
5. 选择机场和 Tier 后保存。

预期：

- 保存 payload 中 `minimumLayoverDuration=null`。
- Search Pairings 不应用 layover hour threshold。

## AP-LH-02 Slider 保存

1. 打开 `Configure Airport Preference`。
2. 选择 `Layover`。
3. 打开 `Preferred layover hours` switch。
4. 确认 slider 默认值为 `13 hours`。
5. 拖动到 `16 hours`。
6. 选择机场和 Tier 后保存。

预期：

- 保存 payload 中 `minimumLayoverDuration="16:00"`。
- Search Pairings 只命中 layover airport 匹配且 `layover_minutes >= 960` 的 pairing。

## AP-LH-03 Both 语义

1. 打开 `Configure Airport Preference`。
2. 选择 `Both`。
3. 选择一个支持 landing 和 layover 的机场。
4. 打开 `Preferred layover hours` 并选择 `16 hours`。
5. 保存后打开 Search Pairings 预览。

预期：

- 内部 payload 仍为 `event="landing_or_layover"`。
- landing 命中不受 `16 hours` 限制。
- layover 命中必须满足 `layover_minutes >= 960`。
- UI 显示提示 `Applies to layovers only`。

## AP-LH-04 切回 Landing 清理

1. 在 `Layover` 或 `Both` 下打开 slider 并选择任意小时。
2. 切回 `Landing`。

预期：

- `Preferred layover hours` 区块隐藏。
- payload 中 `minimumLayoverDuration=null`。
- `ADD BID` 只在 Landing airport 和 Tier 有效后启用。

## AP-LH-05 Algorithm export

1. 保存一个 `Airport Preference`，`event=Both`，机场为 `YVR`，`minimumLayoverDuration="16:00"`。
2. 调用 live-server algorithm export package。
3. 检查导出前的 matching pairing 查询或对应自动化测试。

预期：

- `PAIRING_SCORE.csv` 不新增 layover hour 列。
- 写入 CSV 的 pairing 已经过 Airport Preference 条件过滤。
- 查询条件包含 `airport_events.event_type = 'landing' or airport_events.layover_minutes >= 960`。
