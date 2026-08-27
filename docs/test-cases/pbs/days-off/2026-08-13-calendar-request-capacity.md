# PBS Days Off 日历申请人数/容量显示测试用例

日期：2026-08-13
范围：PBS Portal 左侧 `BIDDING CALENDAR` 日期格子的 Days Off `requested/max` 指标。

## 前置条件

- 使用有当前 PBS period 的 crew 账号登录 PBS Portal。
- 当前账号所属 base / division 下存在可加载的 roster period、crew base、pairing demand 数据。
- 至少准备一组 Days Off `Prefer Off` 申请数据；如需验证去重，同一 crew 在不同 tier 对同一天保存 Days Off。

## 操作步骤

1. 打开 PBS Portal `Dashboard` 或任一会显示左侧 `BIDDING CALENDAR` 的页面。
2. 查看 bid period 日期格子底部的绿色小指标。
3. 找到有 Days Off 申请的日期，确认显示格式为 `申请人数/可申请人数`，例如 `23/33`，不显示 `DO` 前缀。
4. 将同一 crew 在 T1 和 T2 都申请同一天 Days Off 后保存，再刷新日历。
5. 点击带指标的日期格子，继续执行原有添加 / 取消 Days Off 的操作。

## 预期结果

- 日期格子底部居中显示绿色 `requested/max` 指标。
- `requested` 按同一日期同一 `crew_id` 去重；同一 crew 跨 tier 重复申请同一天只计 1 人。
- `max` 按 `总人数 - pairing demand - reserve demand - pre-assigned DO` 得出，最小为 0。
- 指标不拦截日期点击，不影响 Days Off 和 Pairing bid 的原有日历操作。
- 如果容量数据缺失，日历仍可用，只是不显示该指标。

## 回归范围

- `GET /api/bidding-calendar/current` 返回 `dayOffCapacity[].requestedDayOffCount` 和 `maxDaysOffCount`。
- Dashboard schedule mapper 正确把接口字段映射到 calendar cell。
- `ScheduleEventCalendar` 仍能展示 Off / pairing event bar，并保持日期点击热区可用。
