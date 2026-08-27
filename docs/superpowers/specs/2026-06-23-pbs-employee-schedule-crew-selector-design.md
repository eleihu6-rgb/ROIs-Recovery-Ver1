# PBS Employee Schedule Preference Crew 下拉设计

## 背景

`Employee Schedule Preference` 是基于 Days Off property `206` 改造出来的员工排班偏好条件。当前控件仍使用文本输入：

```text
Employee Number
```

用户希望这个字段更符合业务语义：

- 页面 label 改为 `Crew`。
- 数据来源使用 PBS schema 下的 `pbs_user` 表。
- 下拉显示 `pbs_user.user_name`。
- 实际保存值使用 `pbs_user.crew_id`，不要保存 `pbs_user.id`。

这可以避免用户手输错误工号，同时保留 CLASS bid report 中 employee/crew number 语义和算法侧对 crew id 的识别能力。

## 目标

- 将 `Employee Schedule Preference` 中的 `Employee Number` 文本框改为可搜索的 `Crew` 下拉。
- 下拉数据来自当前航司 PBS schema 的 `pbs_user` 表。
- 下拉选项显示 crew 的姓名，优先展示 `user_name`。
- 保存到 bid payload / rule bid storage 的值仍是 `crew_id`。
- 支持按 `user_name`、`crew_id`、`user_code` 搜索。
- 保持已导入 / 已保存的历史数据兼容；已有只保存 `crew_id` 的行仍能正常展示和编辑。
- Playwright 测试覆盖真实页面选择 crew 后保存的流程。

## 非目标

- 不把该条件改成保存 `pbs_user.id`。
- 不修改 CLASS 文本导入中的 employee number 语义；导入仍以文本中的 employee/crew number 匹配 `crew_id` 或 `user_code`。
- 不改 property `115 Any/Every Leg With Employee Number` 的现有 live `crew` 搜索逻辑。
- 不在 Portal 计算“同上班 / 不同上班 / 同休 / 错休”的算法结果。
- 不做全量历史数据迁移；历史数据按兼容路径读取。

## 数据来源

目标表：

```sql
pbs_user
```

关键字段：

| 字段 | 用途 |
|---|---|
| `crew_id` | 实际保存值，也是导入和算法最稳定的业务标识 |
| `user_name` | 下拉主显示文本 |
| `user_code` | 辅助搜索字段，兼容登录账号和同步来源 |
| `base` / `rank` / `division` | 可作为显示补充或未来过滤条件，本次不强制过滤 |
| `status` / `portal_access` / `exp_dt` | 可用于排除明显不可用账号 |

推荐查询条件：

- `is_admin = 0`
- `status = 0`
- `crew_id` 非空
- `user_name` 非空
- 如果 `exp_dt` 有值，则只显示未过期用户

是否按当前登录用户的 base/rank/division 过滤：本阶段不做强制过滤。该条件本身用于选择“另一个 crew”，如果过早按当前用户过滤，可能会隐藏实际需要选择的员工。后续如果业务确认需要限制范围，可以在接口增加可选 filter。

## API 设计

新增 PBS user 搜索接口，避免复用现有 `/pairing-search/crew-ids`：

```text
GET /api/pbs-users/crew-options?query=<text>&limit=20
```

也可以放在现有 pairing-search namespace 下，但语义上推荐独立到 PBS user / crew selector，因为它不依赖 pairing 搜索。

响应结构：

```json
{
  "query": "carolyn",
  "limit": 20,
  "options": [
    {
      "value": "762",
      "label": "Carolyn Susan Ann Alves",
      "crewId": "762",
      "userName": "Carolyn Susan Ann Alves",
      "userCode": "762",
      "base": "YEG",
      "rank": "FA",
      "division": "C"
    }
  ]
}
```

字段约定：

- `value` 必须等于 `crewId`，用于前端保存。
- `label` 优先等于 `userName`，用于下拉显示。
- 如果存在重名，UI 可以显示补充信息，例如 `Carolyn Susan Ann Alves · 762`，但保存值仍是 `762`。

性能要求：

- 空 query 不做全表扫描，返回空 options。
- `limit` 默认 20，最大 50。
- 搜索使用 `upper(...) like` 或等价方式匹配 `user_name`、`crew_id`、`user_code`。
- 查询字段必须走参数化 SQL，不拼接用户输入。

## 前端设计

### 控件

`EmployeeSchedulePreferenceControl` 中：

- label 从 `Employee Number` 改为 `Crew`。
- 文本框替换为 searchable combobox/autocomplete。
- placeholder 使用 `Search crew`。
- 选择后界面展示 crew 姓名，保存值为 `crew_id`。

建议显示：

```text
Crew
[ Carolyn Susan Ann Alves · 762 ]
```

如果后端只返回 `user_name`，则主显示用 `user_name`；如果同名需要区分，菜单项和 selected display 可以追加 `crew_id`。

### 表单状态

- 未选择 crew 时，校验错误文案改为：

```text
Crew is required.
```

- 加载中显示：

```text
Loading crews...
```

- 无结果显示：

```text
No matching crew
```

- 接口失败显示：

```text
Unable to load crews
```

### Summary / Read-only 展示

已保存 property 行的 bid summary 应优先展示 crew 姓名：

```text
Apart · Days Off · Crew Carolyn Susan Ann Alves · Minimum 8
```

如果 API 没能解析到 `user_name`，回退到 crew id：

```text
Apart · Days Off · Crew 762 · Minimum 8
```

推荐在 bid value 中增加可选显示字段：

```ts
{
  type: "employee-schedule-preference",
  crewId: "762",
  crewName?: "Carolyn Susan Ann Alves",
  relationship: "apart",
  scheduleType: "days_off",
  thresholdType: "minimum",
  days: 8
}
```

如果为了降低本轮改动范围，也可以暂时沿用 `employeeNumber` 字段名，但字段内容必须明确是 `crew_id`。从长期可读性看，推荐在新 `employee-schedule-preference` 类型中使用 `crewId`，旧 `crew-days-off-share` 继续保留 `employeeNumber` 以兼容历史类型。

## 后端存储与兼容

### 新类型推荐

推荐新类型使用 `crewId`：

```json
{
  "type": "employee-schedule-preference",
  "crewId": "762",
  "crewName": "Carolyn Susan Ann Alves",
  "relationship": "apart",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 8
}
```

### Rule bid 序列化

`pbs_bid_group` 继续使用现有参数字段，不新增表字段：

| 字段 | 值 |
|---|---|
| `operator` | `Minimum` 或 `Maximum` |
| `param_a` | `crew_id` |
| `param_b` | mode，例如 `opposite_days_off` |
| `param_c` | days |

`crewName` 仅用于显示，不作为核心存储字段。读取 current draft / favorite / summary 时可通过 `param_a = pbs_user.crew_id` 补充。

### 历史兼容

必须继续读取以下旧形态：

```json
{
  "type": "crew-days-off-share",
  "employeeNumber": "817",
  "minimumDays": 12
}
```

以及当前实现中已出现的：

```json
{
  "type": "employee-schedule-preference",
  "employeeNumber": "817",
  "relationship": "together",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 12
}
```

兼容策略：

- 读取旧 `employeeNumber` 时按 `crew_id` 处理。
- 如果能在 `pbs_user` 中找到 `crew_id = employeeNumber`，补充 `crewName`。
- 保存时写为新推荐形态 `crewId`。
- 导入器可继续产出 crew id 值，但最终 normalized bid 应使用 `crewId`。

## 导入影响

CLASS 条件：

```text
Set Condition Days Off Opposite Employee 762 Minimum 8
```

导入解析：

- `762` 作为 crew id。
- 尝试在 `pbs_user` 中按 `crew_id = '762'` 或 `user_code = '762'` 查找。
- 找到时保存 `crewId = '762'`，展示可补充 `crewName`。
- 未找到时仍可保存 `crewId = '762'`，但导入报告应产生 warning，说明该 crew id 未在 `pbs_user` 中匹配到显示姓名。

这类 warning 属于数据同步问题，不应阻止导入。

## 测试要求

### 后端

- PBS user 搜索接口：
  - 空 query 不查询 / 返回空 options。
  - 可按 `user_name` 搜索。
  - 可按 `crew_id` 搜索。
  - 可按 `user_code` 搜索。
  - 返回 `value = crewId`。
  - 不返回 admin / disabled / expired 用户。

- Rule bid value / format：
  - 新 `crewId + crewName` 能正确格式化 summary。
  - 只有 `crewId` 时能回退显示。
  - 旧 `employeeNumber` 仍能反序列化。

- 导入：
  - `Days Off Opposite Employee 762 Minimum 8` 映射到 `crewId = "762"`。
  - 找不到 `pbs_user` 时记录 warning，不变成 unsupported。

### 前端单测

- `EmployeeSchedulePreferenceControl` 显示 `Crew` label。
- 输入搜索词后调用 PBS user search。
- 选择 `user_name` 选项后，bid 保存 `crewId`。
- 校验错误从 `Employee number is required.` 改成 `Crew is required.`。
- Summary 优先显示 `crewName`，没有时显示 `crewId`。

### Playwright

真实页面测试：

1. 登录测试 crew。
2. 打开 Days Off。
3. 添加 `Employee Schedule Preference`。
4. 在 `Crew` 下拉中搜索并选择一个 `pbs_user.user_name`。
5. 选择 `Apart + Days Off + Minimum 8`。
6. 保存。
7. 断言 existing row 中显示 crew 姓名。
8. 可选：检查保存请求 / 重新加载后仍显示同一 crew，且底层值是 crew id。

## 验收标准

- 页面不再出现 `Employee Number` label，改为 `Crew`。
- 用户可以通过 `pbs_user.user_name` 搜索并选择 crew。
- 保存值是 `pbs_user.crew_id`，不是 `pbs_user.id`。
- 已保存行优先显示 `user_name`，找不到姓名时显示 `crew_id`。
- CLASS 导入中的 employee number 条件继续可导入。
- 旧数据不报错、不丢失。
- 单测和 Playwright 覆盖上述行为。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该改动横跨 contracts、pbs-server、pbs-portal、导入和测试，但字段契约强耦合，拆成多个 agent 容易出现 `employeeNumber` / `crewId` 命名不一致。
- Suggested split: 不拆；按 contracts → server API → serialization/summary/import → portal control → tests 顺序串行完成。
- Write boundaries: 单人修改 206 相关类型、PBS user search API、Portal 控件与测试。
- Conflict risk: Medium。当前工作区已有未提交的 Employee Schedule Preference 相关改动，需要在这些文件基础上继续调整，不能回滚用户或前序改动。
- Execution gate: 本 spec 经用户确认后再实施。
