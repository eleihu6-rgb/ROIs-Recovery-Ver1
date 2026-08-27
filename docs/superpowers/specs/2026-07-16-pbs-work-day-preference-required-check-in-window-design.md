# PBS Work Day Preference Check-In Window 必填校验设计

## 1. 背景

当前 `Configure Work Day Preference` 弹窗将 `WORK DAYS & CHECK-IN WINDOW` 标记为 `REQUIRED`，但实际校验仍把空的 Check-In 时间窗口解释为 `Any time`。因此用户选择一个或多个 weekday 后，即使某个已选 weekday 的 `From` / `To` 仍为空，`ADD BID` 与 `SAVE FAVORITE` 也可能保持可用。

当前实现与测试明确允许以下数据：

```json
{
  "dayOfWeek": "THU",
  "checkInFrom": null,
  "checkInTo": null
}
```

这与界面的 `REQUIRED` 语义不一致，也允许通过 API 绕过 Portal 的必填要求。本次修正将每个已选 weekday 的完整 Check-In window 设为真正必填。

本设计覆盖并取代 `2026-07-16-pbs-work-day-preference-standard-answer-alignment-design.md` 中“空窗口表示 Any time、单边窗口合法”的相关规则；其他已确认语义保持不变。

## 2. 目标

1. 每个已选择的 weekday 必须同时填写合法的 `From` 和 `To`。
2. 任一已选 weekday 的时间窗口不完整或无效时，同时阻止 `ADD BID` 和 `SAVE FAVORITE`。
3. 缺失值在用户操作前不立即显示红色错误；用户触碰并离开对应输入后才显示错误状态。
4. Portal 与 `pbs-server` 使用一致的保存门槛，不能只依赖前端禁用按钮。
5. 保留跨午夜时间窗口，且继续拒绝起止时间相同的零宽窗口。
6. 清理已保存的不完整窗口，并阻止旧库导入再次产生不完整 Work Day Preference。

## 3. 非目标

- 不改变 Work Day Preference 固定为 Award-only 的语义。
- 不恢复 `Award / Avoid`、`Any / Every` 或旧 payload。
- 不改变 weekday chip、弹窗骨架、Tier 选择和 `LIMIT TO EVENT DATE` 的交互。
- 不自动为新选 weekday 填入默认时间。
- 不根据 Event Date 自动选择或删除 weekday。
- 不修改合法完整窗口的匹配算法、闭区间和跨午夜计算方式。
- 不引入新的依赖或无关重构。

## 4. 已确认校验规则

### 4.1 表单完整性

Work Day Preference 可保存必须同时满足：

1. 至少选择一个 Tier。
2. 至少选择一个 weekday。
3. 每个已选 weekday 的 `checkInFrom` 与 `checkInTo` 都是合法 `HH:mm`。
4. 同一个 weekday 的 `checkInFrom !== checkInTo`。
5. `LIMIT TO EVENT DATE` 关闭，或打开后拥有完整、合法的 Specific Dates / Date Range。

时间窗口示例：

| From | To | 结果 |
|---|---|---|
| 空 | 空 | 无效 |
| `06:00` | 空 | 无效 |
| 空 | `10:00` | 无效 |
| `06:00` | `10:00` | 有效，同日窗口 |
| `22:00` | `04:00` | 有效，跨午夜窗口 |
| `06:00` | `06:00` | 无效，零宽窗口 |

### 4.2 Footer 门禁

- 任一必填条件不满足时，`ADD BID` / `UPDATE BID` 与 `SAVE FAVORITE` 必须同时 disabled。
- 两个按钮继续复用同一个 `canConfirm` / validity 结果，不能各自实现不同校验。
- 按钮 disabled 是提交门禁；输入错误状态用于解释具体缺失项，两者不能互相替代。

### 4.3 错误显示时机

- 用户刚选择 weekday 时，新出现的两个时间输入保持空白，但不立即显示红框或错误文字。
- 每个时间输入维护独立的 touched 状态；用户聚焦后离开该输入，若值仍为空，则该输入显示 `aria-invalid="true"` 和错误边框。
- 如果任一端有值而另一端仍为空，已触碰的缺失输入显示错误状态。
- 两端相同时，两个输入均显示现有零宽窗口错误状态。
- 用户补全合法值后，错误状态立即清除。
- 取消选择 weekday 时，删除该 weekday 的时间草稿和 touched 状态；再次选择时从未触碰的空窗口开始。
- 本次不增加常驻错误段落，避免弹窗高度和布局抖动；必填含义继续由 section 的 `REQUIRED` 标记、disabled footer 和输入错误状态共同表达。

## 5. 数据契约与服务端防线

Portal 编辑草稿及共享读取模型仍可暂时使用 `null` 表示尚未填写，以支持受控输入、逐步编辑和对异常历史数据的诊断回显：

```ts
type WorkDayPreferenceWindow = {
  dayOfWeek: PairingDayOfWeek;
  checkInFrom: string | null;
  checkInTo: string | null;
};
```

共享 `PbsWorkDayPreferenceWindow` 本轮有意保持 nullable，因为它同时承担 Portal draft/read model；不新增第二套高度重复的共享类型。create/update API 的真实性由统一 runtime validator 保证，Portal completeness 复用同一业务谓词，不能把 TypeScript 的 nullable 误解为允许提交。

可保存 payload 的业务规则收紧为：

- `checkInFrom` 与 `checkInTo` 均必须是合法 `HH:mm` 字符串。
- `pbs-server` route schema / property validation 必须拒绝任一端为 `null` 的 Work Day Preference。
- 服务端返回统一的 Work Day Preference invalid 错误，不接受直接 API 调用绕过 UI。
- 合法完整窗口的 JSON 字段名和结构不变，因此不需要新 API 版本。

### 5.1 不完整历史数据清理

本次新增幂等 migration，清理所有 property `110` 中任一 day 的 `checkInFrom` 或 `checkInTo` 不完整的已保存数据。“不完整”包括：字段缺失、JSON `null`、空字符串、纯空白、非合法 `HH:mm`、两端相同，以及 payload JSON 无法解析。

- configured favorites：从权威 `bid_payload` 检测任一无效 day，删除对应 favorite；无法解析的 property `110` payload 同样删除。
- 主 property group / AND condition：从现有 `operator = 'Json'` + `param_a` 权威 payload 检测；解析前先验证 JSON，不能因一条坏数据让 migration 整体失败。
- 主 property group：删除该 group 的 occurrences、child conditions 与 group。
- property `110` 作为 AND condition：按 `bid_id + bid_type + property_group_key` 删除所有 Tier 副本的完整 group，不能只删除当前 condition 或单个 Tier group 后静默改变 AND 规则。
- 删除完成后重算受影响 Tier 的 `total_groups` 和 bid 的 `total_tiers`；只有在确认没有 group、day-off、favorite 或其他业务子对象后，才删除真正为空的 Tier / bid，沿用基础 migration 的完整子对象保护边界。
- migration 不修改完整合法的 property `110`，也不修改其他 property。
- migration 可重复执行，并提供执行前计数、执行后零残留与其他 property 未受影响的核查 SQL。

如果 migration 前在任一读取路径遇到不完整窗口：

- Portal 可回显原值，但整体表单保持无效，用户必须补全后才能更新。
- Search、评分与算法导出不得继续把它解释为 `Any time` 或单边窗口。
- 不完整 property `110` 无论是主 property 还是 AND condition，必须使整个 `bid_id + bid_type + property_group_key` 在该次计算中 invalid / non-matching；绝不能仅移除该 SQL predicate 后继续计算同组其他条件，否则会放宽用户规则。
- 诊断至少包含 `bid_id`、`property_group_key`、`property_code=110`；`pbs-server` 与 `live-server` 两条 `PAIRING_SCORE` 路径使用相同 fixture 验证同组失效行为。
- formatter 显示 `Incomplete check-in window`，不能输出 `any time`、`from …` 或 `until …` 造成有效规则错觉。

### 5.2 旧库导入

旧库 `Any/Every Duty On ...` 数据不能提供每个 weekday 的完整 Check-In window，也不能在不猜测用户意图的情况下补默认时间。因此：

- `pbs-server` 与 `live-server` 的 `crew-bid-property-mapper.ts` 对这类 property `110` 一律拒绝映射，并输出明确的 unsupported/incomplete Work Day Preference 诊断。
- 不再把旧输入映射为 weekday + 空窗口。
- 本规则覆盖并取代基础设计中“无法提供 per-day windows 时可映射为空窗口”的旧规则。
- 两套 mapper 的 fixture 必须保持一致，不能一侧拒绝、另一侧仍导入旧语义。

### 5.3 Property Catalog 元数据

property `110` 的 seed 与 migration metadata 必须同步收紧：

- `sql/seed/10-pbs-bid-property.sql` 不再使用 `optional local check-in window` 文案。
- tooltip 明确每个已选 weekday 都需要完整的 local Check-In From/To window。
- `validation_json` 增加清晰的双端必填约束，例如 `checkInWindowRequired: true` 与 `checkInWindowEndpoints: "both"`；具体字段名沿用 catalog 既有命名风格，并由 catalog test 固定。
- 新 migration 同步更新已存在数据库中的 tooltip 与 `validation_json`，不能只改 seed。

## 6. 实现边界

### 6.1 Portal

主要修改范围：

- `work-day-preference-editor.tsx`
  - 收紧 `isWorkDayPreferenceBidValueValid`。
  - 为每个 weekday 的两个时间输入维护 touched 状态。
  - 将缺失、格式无效和零宽窗口映射到一致的 `aria-invalid` 与错误边框。
- `work-day-preference-editor.test.tsx`
  - 删除“空窗口表示 Any time”的旧断言。
  - 增加空窗口、单边窗口、完整窗口、跨午夜与 touched 错误显示测试。
- `pairing-page.test.tsx`
  - 覆盖 Tier 已选但 weekday 时间未完成时两个 footer 按钮仍 disabled。
  - 覆盖全部已选 weekday 补全后按钮 enabled。
- `pairing-bid-control-logic.ts` 与对应测试
  - `isPairingBidComplete` 不得只检查 `days.length > 0`。
  - 复用或等价调用 Work Day Preference 的完整窗口谓词，删除“空窗口为 complete”的陈旧断言。
- Portal summary/formatter
  - 合法记录只输出完整时间范围。
  - 防御性读取到不完整记录时显示 `Incomplete check-in window`。

不在 footer 内新增 Work Day Preference 特例；footer 只消费统一 validity。

### 6.2 PBS Server

主要修改范围：

- Work Day Preference route schema / property validation：拒绝空端点和单边窗口。
- 对应 validation 与 route tests：证明直接 API 提交不完整窗口返回错误，完整同日与跨午夜窗口继续通过。
- `rule-bid-value` / formatter：不完整遗留值不能继续格式化为有效的 `any time` / 单边窗口。
- `crew-bid-property-mapper`：拒绝无法提供完整 per-day Check-In window 的旧 property `110` 输入。
- `crew-bid-txt-parser.test.ts`：增加 pbs-server mapper 拒绝旧 property `110` 的集成断言，避免只有 live-server 有覆盖。

### 6.3 Live Server 与 SQL

- `live-server` 的 import mapper、rule-bid parser/formatter 与对应测试同步采用相同契约。
- pbs-server / live-server 的匹配 SQL 可以保留对旧空值的防崩溃判断，但检测到不完整 condition 时必须让整个 group non-matching 并产生诊断；该分支不再代表可创建或可评分的新业务语义。
- pbs-server / live-server 的 Search、评分与导出路径对不完整 property `110` 必须让整个 `property_group_key` non-matching，不允许只跳过单个 AND condition。
- 更新 property seed，并新增幂等 SQL migration：清理不完整 property `110` group/favorite、更新 catalog metadata、验证派生计数。
- 新增 migration verification SQL，在隔离的远端测试 schema 中覆盖坏 JSON、字段缺失、null/空白/单边/同值窗口、AND group 多 Tier 副本、完整合法窗口和其他 property 保护。

## 7. 测试与验收

### 7.1 自动化测试

至少覆盖：

1. 未选择 weekday：invalid。
2. 已选择 weekday、两端为空：invalid。
3. 只填写 From：invalid。
4. 只填写 To：invalid。
5. 两端合法且不同：valid。
6. `22:00–04:00`：valid。
7. 两端相同：invalid。
8. 多个 weekday 中任意一个不完整：整体 invalid。
9. 补全最后一个 weekday：`ADD BID` 与 `SAVE FAVORITE` enabled。
10. 取消不完整 weekday：若剩余条件完整，整体恢复 valid。
11. 输入未 touched 时不显示红框；blur 后缺失输入显示 `aria-invalid="true"`。
12. `pbs-server` 拒绝空窗口和单边窗口，接受完整窗口。
13. `isPairingBidComplete`、配置 editor 与 API validator 对同一 fixture 结论一致。
14. 两套旧库 import mapper 均拒绝无法提供完整时间窗口的 property `110`。
15. formatter 不再把不完整遗留值展示为 `any time` / `from` / `until`。
16. migration 执行后不完整 property `110` groups/favorites 为零，完整 property `110` 与其他 property 保持不变。
17. 不完整 property `110` 位于 AND group 时，Search 与两条评分/导出路径均让整个 group non-matching。
18. seed 与已迁移 catalog 均不再宣告窗口 optional，且 metadata 明确两端必填。

### 7.2 Playwright 与人工 QA

真实 UI 回归至少执行：

1. 打开 Work Day Preference。
2. 选择 Tier、Mon、Wed、Thu。
3. 只填写 Mon 与 Wed 时间，确认 `ADD BID` 和 `SAVE FAVORITE` 均 disabled。
4. 聚焦并离开 Thu 空时间输入，确认出现错误状态。
5. 补全 Thu，确认两个按钮 enabled。
6. 清空 Thu 任一端，确认两个按钮重新 disabled。
7. 取消 Thu，确认剩余完整条件可以保存。
8. 开启 `LIMIT TO EVENT DATE` 后，确认日期门禁仍按现有规则工作。

新增 QA 用例到 `docs/test-cases/pbs/pairing/`，记录前置条件、操作步骤、预期结果、异常边界和回归范围。

### 7.3 交付命令

按最小到完整范围执行并报告结果：

```bash
cd pbs-portal && npm test -- src/features/pairing/components/work-day-preference-editor.test.tsx src/features/pairing/pairing-bid-control-logic.test.ts src/features/pairing/pages/pairing-page.test.tsx
cd pbs-server && DATABASE_URL="$TEST_DATABASE_URL" node --import tsx --test src/services/pairing/pairing-property-validation.test.ts src/routes/pairing-bids.test.ts src/services/lineholder/rule-bid-value.test.ts src/services/crew-bid-import/crew-bid-txt-parser.test.ts
cd live-server && npm test -- --run src/services/crew-bid-import/__tests__/crew-bid-property-mapper.test.ts src/services/lineholder/rule-bid-value.test.ts
cd pbs-portal && npm run lint -- --quiet
cd pbs-portal && npm run build
cd pbs-server && npm run build
cd live-server && npm run build
npm run check:ui
git diff --check
```

在指向隔离远端测试 schema 的 `TEST_DATABASE_URL` 上执行 migration fixture、migration 两次和验收 SQL，证明首次清理正确且第二次为 no-op：

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-07-16-pbs-work-day-preference-required-window-fixture.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-07-16-pbs-work-day-preference-required-window.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/2026-07-16-pbs-work-day-preference-required-window.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migration/tests/2026-07-16-pbs-work-day-preference-required-window-verify.sql
```

这些 fixture / verify 文件属于本次交付范围，只能在隔离测试 schema 使用；不得向生产业务 schema 写测试数据。

并执行相关 Work Day Preference Playwright 主路径；若本地环境阻塞，交付说明必须列出阻塞原因、已完成的替代验证和剩余风险。

## 8. 验收标准

- 截图所示“Thu 已选但时间为空，仍可 Add”场景不再出现。
- 任一已选 weekday 缺少 From 或 To 时，所有保存动作均不可用。
- touched 后缺失输入有明确且可访问的错误状态，初始空值不立即报红。
- 完整同日窗口和跨午夜窗口均可保存。
- Portal 与 API 对同一 payload 得出一致的有效性结果。
- 旧库导入不能重新生成空/单边窗口；不完整历史数据被清理，读取防线不会继续按有效规则评分。
- property catalog 的 seed、已迁移数据与界面 `REQUIRED` 使用同一双端必填语义。
- Event Date Scope、Award-only、Tier、摘要和匹配算法的既有行为无回归。

## 9. Multi-Agent Parallelism Assessment

- **Recommendation：No**
- **Rationale：** 改动横跨 Portal、pbs-server、live-server、migration 与共享业务契约，多个路径存在同一批陈旧 optional-window 断言；并行修改容易形成契约分叉。
- **Suggested split：** 不拆分；按统一 validator → Portal validity → Server/API → import/read/format 防线 → migration → tests → Playwright / QA 顺序完成。
- **Write boundaries：** Work Day Preference editor/completeness/format、pbs-server 校验/import/read、live-server import/read、SQL migration、紧邻测试与 QA 文档。
- **Conflict risk：** 中；主要风险是漏掉仍把空窗口当作 `Any time` 的旧测试或读取路径，因此实施前必须全仓搜索并维护一份触达清单。
- **Execution gate：** 本 spec 经 review 并由用户明确批准后才进入实施。
