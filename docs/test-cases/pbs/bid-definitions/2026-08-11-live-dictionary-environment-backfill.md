# PBS Definition 环境配置回填测试用例

## 目标

验证 DEV、SIT、UAT 分别从自己的 Live `dictionary` 读取 Minimum Base Layover 与 Time Between Flights 配置，不再错误依赖 DEV 的 `f8.dictionary`。

## 前置条件

- corrective migration 已分别对 `f8`、`f8_sit_live`、`f8_uat_live` 执行成功。
- 对应环境的 Live Server、PBS Server 与 PBS Portal 已部署。
- 测试账号可以访问 Altair PBS Definition 页面与 Crew PBS Bid 页面。

## 数据库验证

对每个 Live schema 检查：

1. `SYS_PARAM / PBS_LINE_MINIMUM_BASE_LAYOVER` 各有且仅有一条，值符合 `HHH:MM`。
2. `SYS_PARAM / PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES` 各有且仅有一条，值为正整数分钟。
3. SIT、UAT 原先缺失时，默认值分别为 `013:00`、`45`。
4. 重复执行 migration 后，行数和值不变。

## Portal 验证

### Minimum Base Layover

1. 登录目标环境 Crew Portal。
2. 打开 Bid 页面并选择 `Minimum Base Layover`。
3. 确认不再显示 `configuration is unavailable`。
4. 确认最小值限制可以正常加载，合法值可提交，低于限制的值显示字段级校验。

### Time Between Flights

1. 在 Bid 页面打开 `Time Between Flights`。
2. 确认不再显示 `Unable to load the Time Between Flights limits`。
3. 确认配置接口返回 200，最小分钟限制正常生效。

## 回归范围

在 Altair PBS Definition 页面确认下列现有配置仍可读取：

- Redeye
- Weekend
- Credit Window
- Efficient Flying Percentile
- Airport Preference Layover Hours

各环境 Business Time Anchor 允许不同，这是环境独立测试时钟，不作为失败。

## 异常场景

- 未传或传入非白名单 `live_schema`：migration 必须失败且不写数据。
- 目标键存在重复行：migration 必须失败且不自动删除或合并。
- 已有非空非法值：migration 必须失败并要求人工确认。
- 任一提交前断言失败：该环境本次事务必须整体回滚。
