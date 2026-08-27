# PBS Bid Property 可见性恢复 QA

日期：2026-07-08
范围：PBS Portal `Days Off` / `Pairing` Add Properties catalog。

## 前置条件

- 已执行 migration：`sql/migration/2026-07-08-pbs-bid-property-visibility-restore.sql`
- PBS Portal 使用的 PBS Server 已读取最新 property catalog。
- 如页面仍显示旧列表，等待 `pbs-server` 进程内 5 分钟 property catalog cache 过期，或重启 PBS Server。
- 使用可登录 PBS Portal 的 lineholder 用户。

## 用例 1：Days Off 恢复旧入口显示

1. 登录 PBS Portal。
2. 打开 `Days Off` 页面。
3. 在 `ADD DAYS OFF PROPERTIES` 中切换到 `ALL PROPERTIES`。
4. 搜索并确认以下入口可见：
   - `Dates`
   - `Days of Week`
   - `Date Range`
   - `Max Consecutive Days On`
   - `Min Consecutive Days Off`
   - `Min Consecutive Days Off In Window`
   - `Days Off / Days On Pattern`
   - `Employee Schedule Preference`
   - `Day of Week Off`

预期：

- `201 Prefer Off` 仍以 `Dates`、`Days of Week`、`Date Range` 三个 UI 入口显示。
- 恢复的旧 Days Off property 也出现在 `ALL PROPERTIES` 中。
- 不要求恢复 `Prefer Off` 原始单行显示。

## 用例 2：Pairing 恢复旧入口显示

1. 打开 `Pairing` 页面。
2. 在 `ADD PAIRING PROPERTIES` 中切换到 `ALL PROPERTIES`。
3. 搜索并确认以下入口可见：
   - `Airport Preference`
   - `Any Landing In Airport`
   - `Any/Every Layover In Airport`
   - `Any/Every Layover Duration`
   - `Any/Every Layover On Date / Day`
   - `Flight Legs per Duty`
   - `Total Legs In Pairing`
   - `Total Legs In First Duty`
   - `Total Legs In Last Duty`

预期：

- `168 Airport Preference` 仍可见。
- `101 / 104 / 119 / 123 / 108 / 124 / 130` 均恢复可见。
- `107` 继续显示为 `Flight Legs per Duty`，不恢复旧名 `Any/Every Duty Legs`。

## 用例 3：Search Pairings 使用同一 Pairing catalog

1. 进入 `Search Pairings`。
2. 打开新增 criteria 的 property picker。
3. 搜索用例 2 中的 Pairing property。

预期：

- Search Pairings picker 与 Pairing 主页面使用同一可见 catalog。
- 恢复显示的 Pairing 旧入口同样可选。

## 回归范围

- Days Off `201` 三入口配置、保存、favorite 复用。
- Pairing `168 Airport Preference` 配置、保存。
- `107 Flight Legs per Duty` 配置、保存。
- 已恢复旧 property 只恢复新增入口可见性；之前已删除的旧 favorite / rule group 不作为本用例验收目标。
