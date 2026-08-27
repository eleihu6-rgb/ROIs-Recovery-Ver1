# PBS Long Stretch Off / Compressed Flying Award-only 设计

## 背景

参考项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 中，`Long Stretch Off / Compressed Flying` 不属于 `DAYSOFF.csv`，而是作为 `LINE_RULES.csv` 的 `MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW` 规则导出。

参考项目的字段只有：

```json
{
  "from": "YYYY-MM-DD",
  "minimumDaysOff": 5,
  "to": "YYYY-MM-DD"
}
```

它没有 `Award / Avoid` 选择，也不会在 `Parameters_JSON` 里写 `action`。

我们当前项目里，`204 Long Stretch Off / Compressed Flying` 的核心字段已经对齐参考项目：

- `value` 表示最少连续 off 天数，对应 `minimumDaysOff`
- `from` / `to` 表示日期窗口
- 导出 Rule Type 是 `MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW`

但当前员工端弹窗仍显示 `PREFERENCE Award / Avoid`，后端也把 `action` 存入 `pbs_bid_group.action_id` 并导出到 `LINE_RULES.csv` 的 `Parameters_JSON`。这与参考项目不一致。

## 目标

将 Days Off 条件 `204 Long Stretch Off / Compressed Flying` 收敛为 Award-only 条件：

- 员工端不再显示 `Award / Avoid`
- 新建、编辑、收藏、保存均默认按 `Award`
- 历史/开发库中已存在的 `Avoid` Long Stretch 数据统一归一化为 `Award`
- 算法导出的 `LINE_RULES.csv` 中，204 的 `Parameters_JSON` 不再包含 `action`
- 保留当前 UI 结构、Tier 必选、最少连续 off 天数、日期范围开关和日期范围校验

## 非目标

- 不把 `Long Stretch Off / Compressed Flying` 从 Days Off 页面迁移到 Line 页面。
- 不改变 property code，继续使用 `204`。
- 不改变 bid value shape，继续使用 `stepper-date-range`。
- 不改 `Prefer Off` / `DAYSOFF.csv`。
- 不改其他仍需要 Award/Avoid 的条件，例如 Pairing、Airport、Reserve、Efficient Flying First。
- 不删除数据库字段 `action_id`，只对 204 的写入和导出语义做归一化。

## 当前行为

### 前端

文件：`pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`

`Long Stretch Off / Compressed Flying` 弹窗当前包含：

- `TIERS`
- `PREFERENCE`
  - `Award`
  - `Avoid`
- `MINIMUM CONSECUTIVE DAYS OFF`
- `LIMIT TO A DATE RANGE`

`buildConfiguredProperty()` 会把 `longStretchAction` 写回 property：

```ts
action: isLongStretchOff ? longStretchAction : property.action ?? null
```

### 后端保存/校验

文件：

- `pbs-server/src/routes/days-off-bids.ts`
- `pbs-server/src/services/days-off/days-off-draft-mappers.ts`
- `pbs-server/src/services/days-off/days-off-validation.ts`
- `pbs-server/src/services/days-off/days-off-persistence-mappers.ts`
- `pbs-server/src/services/days-off/days-off-draft-queries.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`

当前 `normalizeDaysOffAction(204, action)` 会保留 `avoid`，否则默认 `award`。

当前 `validateDaysOffDraftProperties()` 要求 204 必须是 `award` 或 `avoid`。

当前 persistence mapper 会把 `award` 写成 `action_id=1`，`avoid` 写成 `action_id=2`。

当前 route schema 没有显式接收 Days Off `action` 字段，直接依赖 service/mapper 的 normalization。因此实现时不能只让前端传 `action="award"`；后端必须在 route 后的 request mapper、save favorite、full draft save、legacy patch 和 import/replay 路径中统一归一化。

### 算法导出

文件：`pbs-server/src/services/algorithm-export/line-rules-entry.ts`

当前 `buildDaysOffLineRuleEntry()` 会对 204 注入：

```json
{
  "action": "award",
  "from": "YYYY-MM-DD",
  "minimumDaysOff": 5,
  "to": "YYYY-MM-DD"
}
```

这比参考项目多了 `action`。

## 推荐方案

采用最小行为收敛，不重构 Days Off 弹窗体系。

### 1. 前端移除 Preference 区块

对 `propertyCode=204`：

- 删除 `LongStretchPreferenceControl`
- 删除 `longStretchAction` state
- 弹窗不再显示 `PREFERENCE`
- `buildConfiguredProperty()` 固定写：

```ts
action: "award"
```

这样新增、编辑 existing bid、从 favorite 加载后保存，都会回到 Award-only。

### 2. 后端保存归一化为 Award

对 `propertyCode=204`：

- `normalizeDaysOffAction()` 固定返回 `"award"`
- `mapDaysOffActionFromId()` 对 204 固定返回 `"award"`，即使 DB 历史值是 `action_id=2`
- validation 不再要求用户输入 Award/Avoid；route 即使剥掉 `action`，service mapper 也要把 204 归一化为 Award-only
- persistence mapper 对 204 固定写 `action_id=1`
- configured favorite 保存时对 204 固定写 `action="award"`
- crew-bid import / NPBS replay 生成 204 时固定写 `actionId=1`，避免绕过 Days Off service normalization

这样可以防止绕过前端的旧 payload 或导入路径继续写入 `Avoid`。

### 3. 导出与参考项目对齐

对 `LINE_RULES.csv` 的 `204 MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW`：

- `Parameters_JSON` 只包含：

```json
{
  "from": "YYYY-MM-DD",
  "minimumDaysOff": 5,
  "to": "YYYY-MM-DD"
}
```

- 不再包含 `action`
- Description 保持现有参考项目一致表达：

```text
DaysOff rule: Long Stretch Off / Compressed Flying is 5 from 2026-06-01 to 2026-06-05.
```

### 4. Migration 归一化历史数据

新增幂等 migration，只针对 PBS schema 下的 `property_code=204`：

- `pbs_bid_group` 没有 `property_code` 字段，必须通过 `property_id=204` 或 join `pbs_bid_property.property_code=204` 识别目标行。
- `pbs_bid_group.bid_type='DaysOff'` 且对应 property code 为 `204` 的行，`action_id` 统一改为 `1`。
- `pbs_bid_days_off_favorite.property_code=204` 或 join `pbs_bid_property.property_code=204` 的 favorite，`action` 统一改为 `'award'`。
- 同步更新 schema comment / migration comment，说明 `pbs_bid_days_off_favorite.action` 对 204 只保留 Award-compatible 快照，不再提供 Award/Avoid 业务选择。

迁移不删除 group，不改变 `operator/param_a/param_b/param_c`。

执行 migration 需要单独授权。写代码时只新增 migration 文件，不自动执行。

## 备选方案

### 方案 A：只改前端和导出，不动后端/DB

优点：改动最小。

缺点：旧 `Avoid` 数据仍可能通过 existing/favorite/import 路径回显或保存；隐藏状态和导出状态不一致，不适合长期维护。

不推荐。

### 方案 B：前端、后端、导出、DB 全部 Award-only

优点：行为闭环；员工端、保存、导出、历史数据一致；最贴近参考项目。

缺点：需要 migration，且旧 `Avoid Long Stretch` 语义会被废弃。

推荐。

### 方案 C：保留 DB action，但导出忽略 action

优点：兼容旧数据。

缺点：页面看不到 Avoid，但 DB 仍保留 Avoid，后续排查会出现“隐藏语义”；不符合用户当前明确要求。

不推荐。

## 影响范围

预计涉及：

- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
- `pbs-server/src/services/days-off/days-off-draft-mappers.ts`
- `pbs-server/src/services/days-off/days-off-validation.ts`
- `pbs-server/src/services/days-off/days-off-persistence-mappers.ts`
- `pbs-server/src/services/days-off/days-off-draft-queries.ts`
- `pbs-server/src/routes/days-off-bids.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `pbs-server/src/services/algorithm-export/line-rules-entry.ts`
- `pbs-server/src/services/algorithm-export/line-rules-metadata.ts`
- `sql/schema/pbs/01-pbs.sql` 的注释或对应 migration comment
- `sql/migration/*`
- 相关 Vitest / node:test / Playwright / QA 文档

不应涉及：

- Pairing 条件
- Line 条件 catalog
- Reserve 条件
- `DAYSOFF.csv` 的 Prefer Off 导出

## 测试与验收

### 前端单测

更新 Days Off 页面和 dialog 测试：

- Long Stretch 弹窗不显示 `PREFERENCE`
- 不显示 `Award` / `Avoid` segmented control
- 保存 payload 固定 `action="award"`
- 编辑旧 `action="avoid"` 的 existing/favorite 后，重新保存为 `award`
- Tier 必选、日期范围开关、日期范围长度校验保持不变

### 后端单测

更新 Days Off service 测试：

- `normalizeDaysOffAction(204, "avoid")` 返回 `award`
- 204 保存 mapper 固定写 `action_id=1`
- 旧 `action_id=2` 读取后映射为 `award`
- route schema 不接收或忽略 `action` 时，service mapper 仍能把 204 标准化为 `award`
- GET existing 旧 `action_id=2` 回显为 `award`
- GET favorite 旧 `action='avoid'` 回显为 `award`
- save favorite / add favorite 对 204 固定保存 `action='award'`
- full draft save 对 204 固定保存 `action_id=1`
- crew-bid import / replay 204 固定写 `actionId=1`

### 导出测试

更新 `line-rules-export` 测试：

- 204 `Parameters_JSON` 不包含 `action`
- 204 即使源 row 的 `actionId=2`，导出仍不包含 `action`
- 204 参数顺序/稳定 JSON 输出对齐参考项目：

```json
{"from":"2026-06-01","minimumDaysOff":2,"to":"2026-06-07"}
```

### Playwright

更新真实 UI 回归：

- `Configure Long Stretch Off / Compressed Flying` 中不出现 `PREFERENCE`、`Award`、`Avoid`
- 配置 T1、最少连续 off 天数、日期范围后可以 `ADD BID`
- 保存请求 payload 中 `action` 为 `award`
- 从旧 mock existing `action=avoid` 打开后，UI 不显示 Avoid；更新后 payload 为 `award`

### UI 标准

前端样式改动后必须运行：

- `cd pbs-portal && npm run lint -- --quiet`
- `cd pbs-portal && npm run build`
- `npm run check:ui`

`check:ui` hard violations 必须为 0。

### QA 文档

更新 Days Off QA：

- `Long Stretch Off / Compressed Flying` 不再要求验证 Award/Avoid 选中态
- 旧导出文档中“保留 action”的描述改为“不导出 action”
- 明确该条件仍导出到 `LINE_RULES.csv`，不是 `DAYSOFF.csv`
- 同步更新任何仍写着“204 保留 action”的 algorithm export / Days Off QA 文档
- 更新 DB comment 或 migration 说明，避免后续维护者按旧 Award/Avoid 语义使用 favorite action 字段

## 数据库执行策略

本次实现只新增 migration，不自动执行。

如果用户授权执行，需要在 PBS schema 上执行：

- `f8_pbs`
- `f8_sit_pbs`
- `f8_uat_pbs`

不应在 live schema 上执行该 PBS migration。

执行后核验：

```sql
select count(*)
from pbs_bid_group g
left join pbs_bid_property p
  on p.id = g.property_definition_id
where g.bid_type = 'DaysOff'
  and (g.property_id = 204 or p.property_code = 204)
  and g.action_id is distinct from 1;
```

以及：

```sql
select count(*)
from pbs_bid_days_off_favorite f
left join pbs_bid_property p
  on p.id = f.property_id
where (f.property_code = 204 or p.property_code = 204)
  and f.action is distinct from 'award';
```

预期为 `0`。

## 风险

- 旧用户如果曾保存 `Avoid Long Stretch`，语义会被废弃并转成 Award。
- 如果还有导入器、历史 TXT replay 或 mock 数据构造 `action=avoid`，实现需要在 mapper 层统一归一化，不能只依赖 UI。
- `line-rules-export` 是算法输入路径，必须用后端导出测试证明 `Parameters_JSON` 与参考项目对齐。
- route schema 当前可能剥掉 Days Off `action` 字段，因此后端不能依赖 request body 携带 `action="award"`；归一化必须发生在 service/mapper 层。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动虽然跨前端、后端和 migration，但都围绕 `propertyCode=204` 的同一条语义，拆分会增加 contract/测试不一致风险。
- Suggested split: 不拆；单 agent 先完成 UI/后端归一化，再补导出和测试。
- Write boundaries: 仅限 Days Off 204、algorithm export 204、migration、测试与 QA 文档。
- Conflict risk: Medium，主要风险是误伤其他需要 Award/Avoid 的条件。
- Execution gate: 用户确认本 spec 后再进入实现；migration 执行需要单独授权。

## 验收标准

完成后应满足：

1. 员工端 `Configure Long Stretch Off / Compressed Flying` 不再显示 Award/Avoid。
2. 新增、编辑、favorite 保存的 204 payload 均为 Award-only。
3. 后端不会再持久化新的 204 Avoid。
4. `LINE_RULES.csv` 中 204 的 `Parameters_JSON` 不含 `action`。
5. 历史 204 Avoid 可通过 migration 归一化为 Award。
6. 相关前端、后端、Playwright、UI gate 验证通过。
