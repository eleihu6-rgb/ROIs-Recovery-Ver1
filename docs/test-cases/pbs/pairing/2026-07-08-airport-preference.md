# PBS Pairing Airport Preference（168）替换版人工测试用例

> 本用例覆盖 168 的当前标准。旧的 `airports`、`dateCondition`、`matchingCount`、`layoverDuration`、`minimumRequired`、`maximumRequired` 载荷和 Fulfilment 编辑器均不再支持。

## 前置条件

- 已部署 `pbs-server`、`pbs-portal` 与迁移脚本 `sql/migration/2026-07-17-pbs-airport-preference-remove-fulfilment.sql`。
- 当前 bid period 可编辑，测试账号可新增、保存和删除 Pairing bid。
- 当前 base + period 至少存在一个 Landing 和一个 Layover 机场；如有城市代码，至少有一个城市下含多个机场。
- 项目尚未上线，迁移会直接删除 168 对应的完整 group closure、occurrences 和三类 favorites，不兼容旧数据。

## 用例 1：新增 Landing 偏好

1. 打开 `Pairing` → `ALL PROPERTIES`，点击 `Add Airport Preference`。
2. 确认 `Landing`、`Layover`、`Landing or Layover` 初始都未选中，且机场选择器不可用。
3. 选择 `Landing`。
4. 打开 `AIRPORTS`，确认只显示当前 base + bid period 中有 landing 事件的机场/城市；选择一个 airport。
5. 选择至少一个 Tier，选择 `Award`，点击 `ADD BID`。

预期结果：

- 弹窗标题为 `Configure Airport Preference`，使用专用编辑器而非旧的通用条件累加编辑器。
- 保存载荷为 `event: "landing"`、`locations: [{ code, kind: "airport" | "city" }]`；没有旧字段。
- Existing bid 摘要显示 Landing 和所选机场/城市。
- Landing 模式不显示 `MINIMUM LAYOVER DURATION`。
- 无论是否选择 location，弹窗都不显示 `FULFILMENT`、Minimum Required 或 Maximum Required。

## 用例 2：新增 Layover 偏好、日期和最短时长

1. 新增 `Airport Preference`，选择 `Layover` 和一个 layover airport。
2. 打开 `LIMIT TO EVENT DATE`，选择 `Specific Dates` 并选择一个 bid-period 日期。
3. 打开 `MINIMUM LAYOVER DURATION`，输入 `12:00`。
4. 选 Tier 与 `Avoid` 后保存。

预期结果：

- 日期依据 landing/layover 事件发生地的本地日期判断，不是 pairing origin date。
- 最短时长仅限制 layover；格式非法（例如 `12:60`）时不能保存。
- 保存载荷包含 `dateScope: { mode: "specific_dates", dates: [...] }` 和 `minimumLayoverDuration: "12:00"`。

## 用例 3：Landing or Layover 与城市选择

1. 新增 `Airport Preference`，选择 `Landing or Layover`。
2. 选择一个 city 选项和一个 airport 选项。
3. 确认两个选项都保留在 chips 中；可移除其中任意一个。
4. 打开时长开关，确认旁注显示 `Applies to layovers only`。

预期结果：

- 任一匹配事件即可命中，不要求同一 pairing 同时含 Landing 和 Layover。
- city 会扩展匹配该 city 下的机场；airport 只匹配该 airport。
- 联合事件下即使配置时长，landing 分支仍可独立命中；时长只过滤 layover 分支。

## 用例 4：日期范围且无 Fulfilment

1. 已选择至少一个 location 后，打开日期范围并选择 `Date Range`，填写完整的起止日期。
2. 检查弹窗中没有 `FULFILMENT`、`All matching pairings`、`Flexible quantity`、Minimum Required 或 Maximum Required。
3. 保存并重新打开该 bid。

预期结果：

- 起止日期不完整，或开始日期晚于结束日期时不能保存。
- Airport Preference 不再提供或保存任何匹配 pairing 数量约束。
- 新增、更新、Favorite 和 Search Preview 请求均不包含 `minimumRequired`、`maximumRequired`。
- 重新打开后 event、locations、dateScope 和 duration 完整回显，仍不显示 Fulfilment。

## 用例 5：切换事件会清理不兼容条件

1. 在 `Layover` 下选择只属于 layover 的机场并配置最短时长。
2. 切换到 `Landing`。

预期结果：

- 不兼容的 location 自动移除。
- 最短 layover 时长区域隐藏且保存值清空。
- 未重新选择有效 landing location 时，`ADD BID` 与 `SAVE FAVORITE` 不可用。

## 用例 6：旧载荷拒绝与迁移验证

1. 通过 API 或测试工具向 `POST /api/pairing-bids/current/properties` 发送旧格式：
   `airports`、`dateCondition`、`matchingCount`、`layoverDuration`、`minimumRequired` 或 `maximumRequired`。
2. 检查响应和迁移后数据。

预期结果：

- API 返回 HTTP 400；服务端没有旧格式运行时兼容分支。
- 迁移后 168 的 catalog 元数据为新 payload；旧 168 property groups 和 configured favorites 已清理。
- 不属于 168 的 property groups、favorites 和 bid container 不受影响。

## 自动化回归收据

- Portal 浏览器：`PBS-3513` 覆盖事件、事件筛选 location、日期、时长、Fulfilment 不存在和切换事件清理。
- Portal 浏览器：`PBS-3326` 覆盖从 location field 任意位置打开下拉框。
- Server：strict 路由 schema 覆盖新载荷接受与旧数量字段拒绝；搜索条件构建覆盖机场/城市、联合事件和 layover 时长。
- Migration 隔离回归：fixture → 首次 migration → verify → 第二次 migration → idempotence verify 全链路 PASS。
- 2026-07-17 三环境执行收据：
  - `f8_pbs`：目录元数据已对齐；第二次执行所有变更计数为 0。
  - `f8_uat_pbs`：首次 `metadata updates=1`，其他删除/更新计数为 0；第二次执行所有变更计数为 0。
  - `f8_sit_pbs`：首次 `metadata updates=1`，其他删除/更新计数为 0；第二次执行所有变更计数为 0。
  - 三套 schema 执行前均不存在 property 168 groups、conditions、occurrences 或 favorites；所有非 property 目录表的总行数执行前后相同。
