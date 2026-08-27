# PBS Period Base-local 墙上时间回归用例

## 目标

验证 Period 管理端保存的是不带时区的墙上时间，PBS Portal 按 Crew 在 Roster Start 当天的有效主基地时区解析 Bid 与 Award 生命周期。

## 前置条件

- `roster_period` 的五个 Period 时间字段均为 `timestamp without time zone`。
- 测试 Crew 在 `crew_base` 中存在有效主基地，基地在 `airport.zone_id` 中配置合法 IANA 时区。
- Award 状态验证使用真实 `schedule_publish_record` 发布事实，不用 `roster_publish` 行数替代。

## 用例

### 1. 管理端墙上时间原样保存

1. 新建或编辑 Period，输入到秒，例如 `2026-01-01 00:00:30`。
2. 保存后刷新并重新打开编辑框。
3. 切换浏览器系统时区后再次打开。

预期：列表和编辑框始终显示 `2026-01-01 00:00:30`，请求体无 `Z` 或 offset。

### 2. 不同 Base 在相同当地钟点开放

1. 为同一 Period 配置相同的 Bid Open 墙上时间。
2. 使用 YYZ Crew 和 YYC Crew 分别登录。
3. 在各自 Base 当地开放时刻前后刷新 Portal。

预期：两个 Crew 都在各自基地当地相同钟点开放；API 返回不同 UTC instant，并同时返回正确的 `base`、`zoneId` 和 `timezoneLabel`。

### 3. Roster Start Base 边界

1. Crew 在当前 Period 中途调动 Base。
2. 验证当前 Period。
3. 再验证调动后开始的下一 Period。

预期：当前 Period 仍使用 Roster Start 当天的旧 Base；下一 Period 使用新 Base。同一天存在旧 Base 失效与新 Base 生效时，选择较晚生效的新 Base。

### 4. Base 或时区缺失

1. 使用 Roster Start 当天没有有效主 Base 的 Crew。
2. 使用 Base 存在但 `airport.zone_id` 缺失或无效的 Crew。

预期：Period 状态为 `INCOMPLETE`，Bid/Award 不开放，并显示可操作的业务提示；不得回退到浏览器时区。

### 5. Award 双重门禁

1. 当前时间早于计划 Award Publish。
2. 当前时间已到，但没有成功的 `schedule_publish_record`。
3. 写入覆盖当前 Period、Crew 范围和有效 Base 的成功发布记录。

预期：状态依次为 `SCHEDULED`、`PUBLISH_PENDING`、`AVAILABLE`。

### 6. Migration 数据核查

分别在 DEV、SIT、UAT 执行 migration 两次，并记录执行前后：

- 五个字段的数据类型；
- Period 总数与 Award Publish 空值数量；
- 每条记录的墙上时间是否发生偏移；
- Award Publish 是否仅对空值按 `Bid Close + 10 days` 回填；
- 2026 年前三个 Roster Range 是否为 `01-01～01-30`、`01-31～03-01`、`03-02～03-31`。

预期：第二次执行不再产生变化，证明 migration 幂等；不得新增或篡改实际发布记录。
