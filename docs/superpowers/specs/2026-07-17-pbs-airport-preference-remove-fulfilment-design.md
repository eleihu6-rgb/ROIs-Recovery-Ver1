# PBS Airport Preference 移除 Fulfilment 设计

## 1. 背景

当前 `Airport Preference` 配置弹窗在用户选择机场或城市后显示 `FULFILMENT`，并允许选择：

- `All matching pairings`
- `Flexible quantity`
- `Minimum Required`
- `Maximum Required`

该行为从 Airport Preference 首次实现起一直存在，并非本轮 Bid 页面合并造成的代码回归。此前已经移除 Fulfilment 的条件是 `Pairing Preference` 和 `Prefer Off`；Airport Preference 的旧设计仍要求保留数量语义。

产品现已明确：Airport Preference 也不再需要 Fulfilment。项目尚未上线，本次直接以新标准收敛前端、API、搜索、摘要和导出契约，不兼容旧 Airport Preference 数量字段。

## 2. 决策与旧设计覆盖关系

本设计覆盖并取代以下旧文档中要求 Airport Preference 保留 Fulfilment、`minimumRequired` 或 `maximumRequired` 的条款：

- `docs/superpowers/specs/2026-07-12-pbs-airport-preference-jen-aligned-redesign-design.md`
- `docs/superpowers/specs/2026-07-13-pbs-preference-condition-behavior-standard-design.md`
- `docs/superpowers/specs/2026-07-12-pbs-preference-default-selection-alignment-design.md`
- `docs/superpowers/specs/2026-07-16-pbs-airport-preference-layover-slider-design.md`
- 其他文档中与 Airport Preference Fulfilment、`minimumRequired` 或 `maximumRequired` 直接冲突的条款

上述文档中与本次无关的 Airport Preference 行为继续有效，包括事件类型、机场或城市选择、日期限制和 layover duration。本设计不覆盖其他条件自己的数量、range 或 Fulfilment 语义。

## 3. 目标

1. Airport Preference 配置弹窗完全不显示 `FULFILMENT`。
2. Airport Preference 数据结构不再包含 `minimumRequired` 和 `maximumRequired`。
3. 前端、共享 contract、后端校验、持久化序列化、搜索条件、摘要和算法导出统一使用新结构。
4. 新增、编辑、收藏、从收藏添加、Search Pairings Preview 和 Existing Summary 均保持可用。
5. Airport Preference 其余业务字段和默认行为不发生变化。
6. 自动化测试能够阻止 Fulfilment UI 或旧数量字段再次回归。
7. `pbs_bid_property` 中 property 168 的目录元数据与新 contract 一致。
8. 本地、UAT、SIT 中已有的 Airport Preference bids 和 favorites 全部删除，不做旧数据兼容。

## 4. 非目标

本次不修改：

- `Award / Avoid`
- `Landing / Layover / Both`
- Airport 与 City 多选
- `LIMIT TO EVENT DATE`
- Specific Dates 与 Date Range
- `PREFERRED LAYOVER HOURS`
- Airport Preference 的机场选项查询
- 其他条件自己的 Fulfilment 或数量语义
- Pairing Preference、Prefer Off 已确认的新契约
- 非 Airport Preference 条件的数据迁移
- 旧 Airport Preference payload 转换或保留

## 5. 最终用户体验

Airport Preference 弹窗按以下顺序展示：

1. `TIERS`
2. `PREFERENCE`
3. 事件类型：`Landing / Layover / Both`
4. `AIRPORTS`
5. `LIMIT TO EVENT DATE`
6. 仅在 Layover 或 Both 时可用的 `PREFERRED LAYOVER HOURS`
7. Footer actions

弹窗中不得出现：

- `FULFILMENT`
- `All matching pairings`
- `Flexible quantity`
- `Minimum Required`
- `Maximum Required`

用户完成 Tier、事件类型、至少一个有效 Airport/City，以及当前已启用的日期或 layover duration 必填内容后，即可保存；不再存在数量相关有效性条件。

## 6. 数据契约

### 6.1 新 Airport Preference bid

```ts
type PairingAirportPreferenceBid = {
  type: "airport-preference";
  event: "landing" | "layover" | "landing_or_layover";
  locations: Array<{
    code: string;
    kind: "airport" | "city";
  }>;
  dateScope?:
    | null
    | { mode: "specific_dates"; dates: string[] }
    | { mode: "date_range"; from: string; to: string };
  minimumLayoverDuration?: string | null;
};
```

`dateScope` 和 `minimumLayoverDuration` 继续保持当前 optional contract；本次只删除 Fulfilment 数量字段，不顺带收紧其他字段。

### 6.2 删除字段

以下字段从 Airport Preference 的所有层级删除：

```ts
minimumRequired
maximumRequired
```

删除范围包括：

- `packages/contracts`
- Portal feature types 与默认值
- API request/response schema
- current draft 与 favorite payload
- clone、mapper、parser 与 serializer
- Existing/Favorite summary
- pairing preview criteria
- `live-server` 当前 algorithm export
- `pbs-server` 中仍存在的对应 export、search 或 lineholder 路径

### 6.3 不兼容旧数据

项目尚未上线，因此：

- 不增加兼容 union。
- 不增加 legacy parser 或 fallback。
- 增加一个独立、幂等、破坏性的数据库 migration，使 property 168 目录元数据与新 contract 一致。
- migration 直接删除本地、UAT、SIT 中已有的 Airport Preference bid groups、conditions 和 favorites，不转换旧数据。
- 不把旧字段静默映射为其他业务含义。
- 除专门验证旧字段被拒绝的负向 schema/route 测试外，正常产品代码、fixture 和测试不得继续构造含旧数量字段的 Airport Preference。

如果旧格式通过新 API 提交，应按新 schema 视为无效请求；不保留旧字段，也不继续序列化或导出。Airport Preference 的 Zod object 必须使用 `.strict()` 或等价的 forbidden-key refinement，不能依赖 Zod 默认剥离未知字段。

## 7. 前端设计

### 7.1 Airport Preference Editor

从 `AirportPreferenceEditor` 删除：

- Fulfilment section
- All/Flexible segmented control
- Minimum/Maximum number inputs
- `flexibleQuantity` 派生状态
- `isAirportPreferenceQuantityValid`
- 数量字段的默认值、更新与回显

`isAirportPreferenceBidValueValid` 只校验：

- 至少一个合法 Airport/City
- 合法事件类型
- 日期范围完整且在允许格式内
- Landing 不携带 layover duration
- Layover/Both 启用 duration 时值合法

### 7.2 默认值与编辑回显

新建 Airport Preference 默认值保持：

- Action：`Award`
- Event：`Landing`
- Tiers：未选择
- Locations：空
- Date Scope：关闭
- Preferred Layover Hours：关闭

编辑 Existing 或 Favorite 时只回显新 contract 中的字段。不得生成或保留数量字段。

从 Favorite 添加 Airport Preference，以及由 Existing/Favorite 进入 Search Pairings Preview 时，请求体也只能使用新 contract。

### 7.3 摘要

Airport Preference 摘要继续表达：

- Award/Avoid
- Landing/Layover/Both
- Airport/City locations
- Event date scope
- Preferred layover duration

摘要不得显示：

- fulfilment mode
- minimum/maximum quantity
- 旧字段名或旧 payload

## 8. 后端设计

### 8.1 API Schema 与业务校验

从 Airport Preference Zod schema 和业务校验中删除：

- `minimumRequired`
- `maximumRequired`
- 两个字段必须同时存在的校验
- Minimum 不得大于 Maximum 的校验
- `Airport Preference fulfilment quantity is invalid.` 错误分支

Airport Preference 的事件、location、date scope 和 layover duration 校验保持不变。

Airport Preference schema 必须对已删除的 `minimumRequired`、`maximumRequired` 返回 400，而不是静默剥离后继续接受。该严格行为只作用于 Airport Preference 新 contract，不得意外改变其他 bid 类型的 unknown-key 策略。

### 8.2 解析、克隆和序列化

所有 Airport Preference 专用的 read/clone/serialize 路径只读写新 contract 字段。

通用 Days Off、Line 或 Pairing mapper 中为了穷举 shared union 而存在的 Airport Preference 分支也必须同步更新，避免编译通过但重新注入旧字段。

### 8.3 Pairing Search

当前 Airport Preference 的事件 predicate 已经不使用 Fulfilment；本次保持事件筛选语义不变，仅删除 preview property 中的旧数量字段和相关 fixture/断言。

Search Pairings 仍按以下条件匹配：

- Landing、Layover 或 Both
- Airport/City
- 可选 Event Date
- 可选 minimum layover duration

### 8.4 Algorithm Export

当前 active algorithm export 已位于 `live-server/src/services/algorithm-export/`。实施必须以该路径为主，同时清理 `live-server` lineholder rule bid 的 type、clone、parse、format 与 serialize 链路；若 `pbs-server` 中仍有被当前 PBS 流程调用或编译覆盖的对应实现，也必须同步使用新 contract。

Live Server 的明确检查范围包括：

- `live-server/src/services/lineholder/rule-bid-types.ts`
- `live-server/src/services/lineholder/rule-bid-value.ts`
- `live-server/src/services/lineholder/rule-bid-clone.ts`
- `live-server/src/services/lineholder/rule-bid-format.ts`
- `live-server/src/services/lineholder/rule-bid-serialize.ts`
- `live-server/src/services/pairing-search/**`
- `live-server/src/services/algorithm-export/**`

Airport Preference 导出只包含仍有效的事件、location、date scope 和 layover duration 语义。

导出 payload、CSV 或中间 rule bid 中不得继续出现 Fulfilment、Minimum Required 或 Maximum Required。不得为了兼容旧格式保留空字段。

### 8.5 数据库 Migration

新增独立 migration：

`sql/migration/2026-07-17-pbs-airport-preference-remove-fulfilment.sql`

migration 必须在目标 PBS schema 的 `search_path` 下执行，并满足：

1. 事务开始时 fail-fast：`pbs_bid_property` 中必须恰好存在一条 `property_code = 168 AND bid_type = 'Pairing'`；不存在、重复或类型不符均抛错回滚。Migration 只更新已有定义，不 upsert。
2. 将该 property 168 的 `validation_json` 更新为只包含：
   - `type`
   - `events`
   - `locations`
   - `dateScope`
   - `minimumLayoverDuration`
3. 新 `validation_json::jsonb` 必须与完整期望对象语义相等，不得包含 `fulfilment`、`minimumRequired` 或 `maximumRequired`。仅当 JSONB 内容不同时才更新 `validation_json` 和 `updated_at`，避免重复执行产生无意义写入。
4. 使用稳定 `property_definition_id/property_id` 为主、legacy `property_id/property_code = 168` 为补充识别历史引用；legacy 匹配必须同时限制为 Pairing 语义。
5. 在任何删除前使用临时表固化：
   - 唯一 target property definition id
   - target group closure 的 `(bid_id, bid_type, property_group_key)`
   - target group ids、tier ids、bid ids
   - target occurrences
   - target configured/simple/generic favorite ids
   - target groups 中会随整组删除的 sibling condition ids
   - 完整 affected bid ids：target group closure、configured favorites、pairing simple favorites、generic Pairing favorites 各自 `bid_id` 的并集
   - 预计删除后为空的 tier/bid ids
6. Target group closure 定义：只要 group 主属性，或它的任一 condition，通过稳定 definition id 或 Pairing legacy code 引用 property 168，就将该 `(bid_id, bid_type, property_group_key)` 的所有跨 tier group rows 全部纳入 target。不得仅删除 Airport Preference condition 后保留被放宽的残缺规则。
7. 删除三类 Airport Preference favorite：
   - `pbs_bid_pairing_configured_favorite`
   - `pbs_bid_pairing_favorite`
   - `pbs_bid_property_favorite` 中 `bid_type = 'Pairing'` 的 legacy/generic favorite
8. 按顺序删除 target groups 对应的：
   - `pbs_bid_pairing_occurrence`
   - 所有 `pbs_bid_condition`，包括预先固化的 sibling conditions
   - 所有 `pbs_bid_group`
9. 对仍保留的 affected tiers，将 `pbs_bid_tier.total_groups` 重算为实际 group 数。只删除预先固化的 affected tier ids，且它们同时不存在：
   - `pbs_bid_group`
   - `pbs_bid_day_off`
   - `pbs_bid_pairing_occurrence`
10. 对仍保留的 affected bids，将 `pbs_bid.total_tiers` 重算为实际 tier 数。
11. 只允许从预先固化的 affected bid ids 中删除空 bid；完整空容器谓词必须逐一 `NOT EXISTS`：
    - `pbs_bid_tier`
    - `pbs_bid_day_off`
    - `pbs_bid_group`
    - `pbs_bid_pairing_occurrence`
    - `pbs_bid_pairing_favorite`
    - `pbs_bid_pairing_configured_favorite`
    - `pbs_bid_property_favorite`
    - `pbs_bid_days_off_favorite`
    - `pbs_bid_line_favorite`
12. 以下任一跨类型引用均视为目录损坏并 fail-fast 回滚，不纳入删除目标：
    - `pbs_bid_group.bid_type IS DISTINCT FROM 'Pairing'`，但主属性引用 definition 168 或 legacy code 168
    - 属于非 Pairing group 的 `pbs_bid_condition` 引用 definition 168 或 legacy code 168
    - `pbs_bid_property_favorite.bid_type IS DISTINCT FROM 'Pairing'`，但引用 definition 168 或 legacy code 168
    - `pbs_bid_days_off_favorite` 引用 definition 168 或 legacy code 168
    - `pbs_bid_line_favorite` 引用 definition 168 或 legacy code 168
13. 不修改其他 property code、非 target group/condition/occurrence/favorite，也不扫描删除其他原因造成的历史空 tier/bid。
14. 整个 schema 的操作位于单一事务中；任何失败必须回滚。
15. migration 可重复执行；第二次执行时 metadata update、所有 delete、tier cleanup 和 bid cleanup 计数均为零，不得报错。
16. migration 输出执行前后的 property、group、condition、occurrence、三类 favorite、tier 和 bid 计数，便于审计。

旧的 `2026-07-12-pbs-airport-preference-168-replacement.sql` 属于历史已执行 migration，不回写、不重命名。新 migration 负责覆盖其旧 `validation_json` 并清理已保存数据。

### 8.6 三环境执行顺序

使用 PostgreSQL 管理账号分别执行：

1. 本地连接库的 `f8_pbs`
2. UAT 的 `f8_uat_pbs`
3. SIT 的 `f8_sit_pbs`

每个 schema 独立执行和验收，不使用跨 schema 的单一大事务。前一环境验证通过后才进入下一环境。

每套环境执行前后必须只读核验：

- property 168 是否存在且唯一
- `validation_json::jsonb` 是否与完整期望对象相等
- 关联 bid groups、conditions、occurrences、configured/simple/generic favorites 数量
- migration 后所有关联旧数据是否归零
- 非 target groups/favorites 的主键集合是否保持不变
- 仅预计变空的 tier/bid 是否被删除
- `total_groups/total_tiers` 是否与实际子表数量一致
- 是否存在 orphan tier、group、condition 或 occurrence

每次执行前必须输出并人工核对 `current_database()`、`current_schema()`，执行器必须启用等价于 `ON_ERROR_STOP=1` 的失败即停行为。执行记录只保存 schema、时间、Git commit、前后计数和 PASS/FAIL，不记录连接串、账号密码或 Token。

数据库密码不得写入 migration、文档、日志或 Git。

## 9. 错误处理

- 缺少 location：保持现有必填错误。
- 日期限制已开启但日期不完整：保持现有日期错误。
- Landing 携带 layover duration：保持现有非法组合错误。
- 不再产生任何 Airport Preference fulfilment quantity 错误。
- current draft create/update、Favorite create/update 和 Search Preview 请求中的旧 contract 均按新 schema 返回 400，不做自动修复、静默剥离或降级。
- 其他 bid 类型的请求校验行为保持不变。

## 10. 测试设计

### 10.1 Portal 单元与组件测试

更新或新增测试，验证：

1. 新建 Airport Preference 不显示 `FULFILMENT`。
2. 选择 Airport/City 后仍不显示 Fulfilment。
3. Landing、Layover、Both 三种事件均不显示 Fulfilment。
4. Specific Dates、Date Range 与 Preferred Layover Hours 仍可保存。
5. Existing、Favorite 回显不包含旧数量字段。
6. 保存和更新 payload 不包含 `minimumRequired`、`maximumRequired`。
7. 摘要不包含 fulfilment 文案。
8. 从 Favorite 添加时的请求不包含旧字段。
9. Existing/Favorite 发起 Search Pairings Preview 时的请求不包含旧字段。
10. 其他仍合法使用自身数量或 Fulfilment 语义的 bid 类型不受影响。

### 10.2 Server 测试

更新或新增测试，验证：

1. Airport Preference route schema 使用 strict 新 contract。
2. 新结构能够新增、更新、clone 和 round-trip。
3. 旧数量字段不会进入 parser、serializer 或响应。
4. 不再存在 quantity validation 分支。
5. Pairing Search 的 event/date/location/duration predicate 保持不变。
6. Active `live-server` Algorithm Export 不输出旧字段。
7. current draft create/update、Favorite create/update 和 Search Preview 含任一旧字段时均返回 400。
8. strict Airport Preference schema 不改变其他 bid 类型的 API 行为。
9. 上述拒绝请求不会执行数据库写入，也不会在响应中回显旧字段。
10. `normalizePbsPairingBidValueForRules`、`serializePbsPairingBidValueForRules` 及 PBS/Live Server parser、clone、formatter、serializer round-trip 均只保留新结构。
11. Pairing Length 或 Flight Legs per Duty 至少一条完整 round-trip/search/export 回归继续通过，证明其 min/max、Between 或其他自身范围语义未被误删。

Airport Preference schema 单测必须直接断言：

- 不含旧字段的新 payload `safeParse(...).success === true`。
- 只含 `minimumRequired` 的 payload 为 false。
- 只含 `maximumRequired` 的 payload 为 false。
- 同时含两个旧字段的 payload为 false。

Route/integration 测试必须覆盖 current property add、existing property update、Favorite create/update 和 Pairing Search Preview；每类至少验证一个旧字段请求返回 HTTP 400 且没有数据写入。

### 10.3 Playwright 真实 UI 回归

使用真实 PBS Portal UI：

1. 登录 Lineholder 账号并进入 `/bid`。
2. 打开 `PAIRING` Tab。
3. 打开 `Airport Preference`。
4. 选择 Tier、Landing/Layover/Both 和 Airport/City。
5. 切换 Event Date 和 Preferred Layover Hours。
6. 断言整个过程中不存在 `FULFILMENT`、Minimum/Maximum。
7. 保存后重新编辑，确认其他字段正确回显。

Playwright 必须通过真实用户操作完成，不以 mock-only 测试替代。

### 10.4 Migration 回归

在隔离事务或临时 schema 中验证：

1. property 168 的旧目录元数据被替换为新结构。
2. property 168 的 current/draft groups、conditions、occurrences、configured/simple/generic favorites 被删除。
3. 只含 Airport Preference 的 bid：group、tier、bid 全部删除。
4. 同 bid 同 tier 还有其他 property：保留 bid、tier 和其他 group，并正确重算计数。
5. Property 168 作为 AND condition：删除整个跨 tier group closure，不保留被放宽的 sibling rule。
6. 同 bid/tier 存在 day-off：不得删除 tier/bid。
7. bid 存在 Days Off、Line 或其他类别 favorite：不得删除 bid。
8. Target group 存在 occurrence：occurrence 被删除。
9. 只包含 Airport configured favorite 的 bid：favorite 删除后空 bid 被删除。
10. 只包含 Airport simple 或 generic Pairing favorite 的 bid：favorite 删除后空 bid 被删除。
11. Favorite-only bid 仍包含其他类别 favorite：删除 Airport favorite 后 bid 保留。
12. 非 target group、condition、occurrence 和 favorite 的主键集合保持不变。
13. migration 重复执行不报错，metadata update 和所有删除/cleanup 计数均为零。
14. `validation_json::jsonb` 精确等于期望对象，保留完整 events、locations、dateScope 和 minimumLayoverDuration，并且不含旧三项。

## 11. 验收标准

- Airport Preference UI 中完全不存在 Fulfilment 相关控件和文案。
- `airport-preference` TypeScript contract 不再声明数量字段。
- Portal 发出的新增、更新、Favorite 请求不包含数量字段。
- Server 不再解析、校验、保存、返回或导出数量字段。
- Active `live-server` algorithm export 与 lineholder rule-bid 链路不再声明或输出数量字段。
- Existing 与 Favorite Summary 不再表达 Fulfilment。
- Favorite Add 和 Search Pairings Preview 请求不再携带数量字段。
- Airport/City、Event、Event Date 和 Layover Hours 行为保持不变。
- 其他 bid 类型的 Fulfilment、数量字段和校验不受影响。
- `f8_pbs`、`f8_uat_pbs`、`f8_sit_pbs` 的 property 168 `validation_json::jsonb` 均精确等于新 contract 的完整目录对象。
- 三套 PBS schema 中已有 Airport Preference group closure、conditions、occurrences 和三类 favorites 均已删除。
- 三套 PBS schema 中非 target group/condition/occurrence/favorite 的主键集合不变。
- 三套 PBS schema 中仅预计变空的 tier/bid 被删除，保留行的 `total_groups/total_tiers` 与实际子表计数一致。
- migration 第二次执行安全且无额外删除。
- 相关 Portal、Server、Playwright 测试通过。
- Portal lint、build、全量 Vitest 和根目录 `npm run check:ui` 通过。
- PBS Server 与 Live Server build 和相关测试通过。

## 12. 风险与控制

### 12.1 共享 union 影响

Airport Preference bid 出现在 Portal、PBS Server、Live Server 和共享 contract 的多个穷举分支中。遗漏任一 clone/mapper/serializer 可能导致旧字段重新出现或类型构建失败。

控制方式：

- 先改共享 contract，再由 TypeScript 编译暴露所有受影响分支。
- 对新增、编辑、Favorite、Search、Summary、Export 分别建立断言。
- 不删除或重写共享 numeric/range UI 组件，只移除 `AirportPreferenceEditor` 的 Fulfilment 分支和 Airport Preference subtype 字段。
- 保留 Pairing Length、Flight Legs per Duty 等非 Airport Preference 条件的现有范围能力与回归。

### 12.2 旧测试与旧文档

旧测试和旧 spec 明确要求 Fulfilment，若只删除产品代码会产生 stale tests 和矛盾文档。

控制方式：

- 更新 touched-area 测试为新标准。
- 在本 spec 中明确覆盖旧条款。
- 不删除历史设计文档，但不得继续把其 Fulfilment 条款视为当前标准。

### 12.3 当前工作树冲突

Bid 页面合并及 Airport Preference 应用层改动已提交为 `d9ecb959`。本轮仅追加 spec、migration、migration 测试和执行记录。

控制方式：

- 只做最小范围增量修改。
- 不改写历史 migration。
- 不把数据库密码写入仓库。
- 提交前使用 GitNexus `detect_changes()` 和 `git diff --check` 审核范围。

### 12.4 破坏性数据清理

migration 会删除三套环境中所有已有 Airport Preference bids 和 favorites。项目尚未上线，用户已明确要求不兼容旧数据，因此这是预期行为。

控制方式：

- 每套环境执行前记录关联行计数。
- 每个 schema 独立事务执行。
- 删除条件同时使用 stable property definition id 和 Pairing `property_code = 168` 识别历史引用。
- 只要 property 168 是主属性或 AND condition，就删除完整跨 tier group closure，避免规则被意外放宽。
- 仅清理预先固化的 affected tier/bid ids；空容器判定覆盖全部相关子表。
- 执行后对比非 target 行主键集合，而不是只比较容易误判的全表总数。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 剩余工作集中在一个 migration、同一组关联表和严格顺序的三环境执行，多 agent 同时操作会增加误删和统计不一致风险。
- Suggested split: 主流程统一完成 migration、隔离测试、本地 → UAT → SIT 执行和验收。
- Write boundaries: 本 spec、`sql/migration`、migration 测试与执行记录。
- Conflict risk: 多 agent 同时修改或执行同一破坏性 migration 风险高。
- Execution gate: 修订 spec 审查通过并由用户再次确认实施后开始。
