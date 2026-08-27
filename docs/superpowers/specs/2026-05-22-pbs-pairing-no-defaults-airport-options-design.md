# PBS Pairing Configure 无默认值与机场候选数据接入设计

## 背景

`Configure Pairing Bid` 目前仍有两类不符合业务预期的问题：

- 从 `ALL PROPERTIES` 点击加号新增 Pairing 条件时，部分字段会带示例默认值，例如 `DFW`、`LAX`、`09:00`、`2026-04-01`、`M4959` 等。用户实际期望是“新增时干净为空”，只有编辑已有 bid 或使用已配置收藏时才回填已保存的值。
- 机场相关条件的候选值仍来自 contract 中硬编码的 `DFW/LAX/SFO/ATL/YYZ/YVR`，不应继续把业务数据写死在前端或共享 contract 中。

只读检查真实数据库后确认：

- PBS 当前连接 schema 是 `f8_pbs`。
- 机场数据在航司/live schema：`f8.airport`。
- `f8.airport` 有 4522 条数据。
- 关键字段包括 `airport`、`airport_name`、`airport_icao`、`airport_abbr`、`city`。
- 已有索引包括 `airport_pkey` 和 `uq_airport_code`。
- 该表没有 `is_deleted` 字段，`state` 当前全部为 `null`，因此本次不能按 PBS 业务表软删字段过滤。

## 目标

- `Configure Pairing Bid` 新增任意 Pairing property 时，业务输入值不带示例默认值。
- 编辑已有 bid、编辑 existing property、使用 configured favorite 时，必须完整回填用户已保存的配置。
- 机场/城市相关输入候选值从真实数据库 `liveSchema.airport` 获取，不再依赖 contract 中硬编码机场列表。
- Pairing Number 继续保持新增时为空，不显示 `M4959` 这类示例值。
- 新增、编辑、收藏、从收藏添加、左侧日历 Pairing Number 入口不得被本次修改破坏。
- 相关接口目标耗时 `< 2s`。
- 代码边界清晰，后端候选数据读取、contract 默认草稿、前端弹窗状态、测试分别落在清晰模块中。
- 补齐单元测试、回归测试和 QA 人工测试案例。

## 非目标

- 不改变 Pairing Number 已确认的 `pairing-occurrence-list` 结构。
- 不新增机场同步表，不把 `f8.airport` 复制到 `f8_pbs`。
- 不迁移或清洗历史收藏数据；当前仍处开发阶段，旧的硬编码收藏/示例数据可按开发需要丢弃或重新保存。
- 不重做 Search Pairings 页面整体交互。
- 不引入新的第三方依赖。

## 需求确认

用户已确认：

- 从 `ALL PROPERTIES` 新增 Configure Pairing Bid 时，所有业务字段应为空。
- 编辑已有 bid 或已配置收藏时，才回填保存过的值。
- 需要检查并接入数据库机场表。

## 方案比较

### 方案 A：只清空前端默认值，机场候选继续硬编码

优点：改动少。

缺点：仍然违反业务数据不能硬编码的规则；后续机场数据变化时必须改代码。

不推荐。

### 方案 B：把 `f8.airport` 同步到 `f8_pbs`

优点：PBS 读取自己 schema，边界看起来更独立。

缺点：新增同步链路、数据一致性和运维成本；本次只是读取候选项，不需要复制一套基础数据。

不推荐作为本次方案。

### 方案 C：PBS 后端通过 live schema 只读查询 `airport`

做法：

- PBS 后端新增 Pairing reference/options 服务。
- 通过已有 `liveSchema = PBS_SCHEMA.replace(/_pbs$/i, "")` 推导 `f8`。
- 从 `${liveSchema}.airport` 查询机场和城市候选。
- 前端通过 PBS API 获取候选项并缓存。
- Contract 中保留 bid 类型定义，但不再保存硬编码机场候选和示例值。

优点：符合现有 Pairing Search / Calendar 读取 live schema 的模式；性能可控；不新增数据同步；航司切换后可自然读取对应 schema。

推荐采用方案 C。

## 后端设计

### 新增服务边界

建议新增：

- `pbs-server/src/services/pairing/pairing-reference-options.ts`

职责：

- 校验 `liveSchema`，复用当前 pairing service 中的 schema identifier 校验思路。
- 查询 `${liveSchema}.airport`。
- 输出 airport options 和 city options。
- 控制字段裁剪，只返回前端需要的字段。
- 做轻量缓存，避免每次打开弹窗都扫描机场表。

返回结构建议：

```ts
type PairingAirportOption = {
  code: string;
  name: string | null;
  icao: string | null;
  abbr: string | null;
  city: string;
};

type PairingCityOption = {
  code: string;
};

type PairingReferenceOptions = {
  airports: PairingAirportOption[];
  cities: PairingCityOption[];
};
```

查询原则：

- `airports` 使用 `airport` 作为稳定值。
- `cities` 使用 `distinct city`，过滤空值。
- 排序按 code 升序。
- 不使用 `is_deleted` 过滤，因为真实表没有该字段。
- 暂不使用 `state` 过滤，因为当前真实数据全部为 `null`，没有明确 active 语义。

### 新增接口

建议新增只读接口：

```text
GET /api/pairing-bids/reference-options
```

响应：

```json
{
  "code": 200,
  "data": {
    "airports": [
      { "code": "DFW", "name": "DALLAS-FORT WORTH INTL", "icao": null, "abbr": null, "city": "DFW" }
    ],
    "cities": [
      { "code": "DFW" }
    ]
  },
  "message": "ok"
}
```

接口约束：

- 只读 `GET`。
- 通过 auth 保护，与 Pairing draft 接口保持一致。
- 目标 `<2s`。
- 若机场表读取失败，不应导致当前 draft 读取失败；新增弹窗可退化为空候选，但保存校验仍按用户输入执行。

### 缓存策略

机场表 4522 行，数据相对稳定。建议：

- 后端进程内缓存，TTL 5-15 分钟。
- 查询失败不缓存失败结果过久，避免短暂数据库问题恢复后仍不可用。
- 前端使用现有 Query/服务层缓存，避免同一页面重复请求。

## Contract 与默认草稿设计

`packages/contracts/pbs-pairing-bids.js` 当前同时承担“property catalog 定义”和“新增草稿默认值”。本次需要把“示例值”从新增路径中移除。

新增草稿规则：

- `tag-list`：`values: []`，`suggestions` 不在 contract 写死。
- `tag-list-date`：`values: []`，`date: ""`，`suggestions` 不在 contract 写死。
- `time`：`value: ""`。
- `time-range`：`from: ""`，`to: ""`。
- `time-range-date`：`from: ""`，`to: ""`，`date: ""`。
- `text`：`value: ""`。
- `percent`：`value: ""`。
- `stepper` / `stepper-date`：不使用示例业务值；若组件必须有 number 类型，前端用 draft 空态承载，提交前校验必填。
- `select`：不默认选择业务值；显示未选择空态。
- `flag`：保持无需输入。
- `pairing-occurrence-list`：`occurrences: []`。

注意：

- `min/max/options` 这类控件约束不是业务默认值，可以保留。
- 已保存 bid 的反序列化不能被清空规则影响。
- Favorite 保存的是用户配置好的 bid 快照，使用时应回填快照。

## 前端设计

### 数据获取

建议新增或扩展：

- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/features/pairing/hooks/use-pairing-reference-options.ts`

职责：

- 调用 `GET /api/pairing-bids/reference-options`。
- 用 TanStack Query 缓存。
- 页面级复用，避免每次打开 dialog 都请求。

### Configure Dialog 行为

新增模式：

- `create`：从 `ALL PROPERTIES` 点击加号，使用空草稿。
- `edit-existing`：编辑已有 bid，使用已有 bid 数据。
- `favorite-create`：从新增弹窗点击 Add Favorite，保存当前配置。
- `favorite-apply`：从 FAVORITED PROPERTIES 添加，直接使用收藏快照。

空态展示：

- Summary 区未填写显示 `--`。
- 输入框 placeholder 可以提示输入格式，但 placeholder 不算默认值。
- `Airport/City` 类输入可支持候选，但不预填。

机场/城市候选使用范围：

- Airport 类 property 使用 `airports.code`。
- City 类 property 使用 `cities.code`。
- 如果历史 property 名称包含 City 但旧库实际填 airport/city 三字码，UI 仍以 code 输入为准，显示时可以保持当前 summary 风格。

初步覆盖 property：

- `Any Landing In Airport`
- `Any/Every Layover In Airport`
- `Any/Every Layover On Date / Day`
- `Co-Terminal / Satellite Airport`
- `Layover at City`
- `Avoid Layover at City`
- `Layover at City on Date`
- `Prefer Landing at City`
- `Avoid Landing at City`

实现时应基于 property 名称和 bid 类型梳理最终清单，避免误把 aircraft、pairing number、weekday 等候选接入机场表。

### 校验与错误提示

- 用户点击 `Add Bid` / `Save` / `Add Favorite` 时校验必填字段。
- 使用统一 message/toast 提示。
- 不新增重复的 DOM 错误面板。
- 校验信息需要走 i18n，不写死可见文案。

## 测试设计

### 后端自动化测试

覆盖：

- `pairing-reference-options` service 能从 mock pgPool 返回 airports/cities。
- `liveSchema` 非法时拒绝。
- airport 表读取失败时接口返回可控错误或前端可处理的空候选策略。
- `GET /api/pairing-bids/reference-options` 返回统一 `{ code, data, message }`。
- 接口不返回多余字段。

### 前端自动化测试

覆盖：

- 从 `ALL PROPERTIES` 打开 Configure Pairing Bid，字段为空，不出现 `DFW/LAX/M4959/09:00/2026-04-01` 示例默认值。
- 编辑已有 Pairing property 时，已保存值正常回填。
- configured favorite 展示并应用时，已保存值正常回填。
- 机场/城市候选来自 service mock，不依赖 contract 硬编码。
- 候选接口失败时，弹窗仍能打开，输入可用，提示不重复。

### QA 人工测试案例

新增文档：

```text
docs/test-cases/pbs/pairing/2026-05-22-pairing-no-defaults-airport-options-regression.md
```

至少包含：

- 新增 Pairing property 无默认值。
- Pairing Number 新增无默认值。
- airport/city 条件可搜索真实机场/城市 code。
- 编辑已有 bid 正常回填。
- 添加到收藏后再次使用正常回填。
- 左侧日历 Pairing Number 入口不被破坏。
- 接口耗时 `<2s`。
- Dashboard / Pairing 左侧日历显示不回退。

## 性能要求

- `GET /api/pairing-bids/reference-options` 目标 `<2s`，正常缓存命中应明显低于 2s。
- 不允许每个 property 行单独请求候选。
- 不允许每次 render 弹窗重复请求候选。
- airport/city 候选读取必须是一次批量查询或有限查询。

## 风险与处理

- 风险：`f8.airport.state` 没有明确 active 语义。
  - 处理：本次不按 `state` 过滤；后续如业务确认 active 字段，再单独调整。
- 风险：stepper/select 等组件原本依赖默认值渲染。
  - 处理：前端增加 draft 空态适配，提交前校验，而不是用示例值填充。
- 风险：现有测试依赖 `DFW/LAX` 默认文案。
  - 处理：更新为“新增为空、编辑回填”的新业务语义。
- 风险：contract 清空默认值影响旧数据读取。
  - 处理：清空只影响新增草稿；反序列化已保存 bid 仍使用数据库值。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次涉及 contract 默认草稿、后端 reference options、前端 dialog 状态和测试断言，语义强耦合；拆多 agent 容易出现前后端契约不一致。
- Suggested split: 单主线顺序实施：后端候选接口 -> contract 空草稿 -> 前端接入候选与空态 -> 测试与 QA 文档。
- Write boundaries: 由单一实现者维护 Pairing contract、service、dialog 和测试，避免覆盖近期 Pairing occurrence-list 改动。
- Conflict risk: Medium，主要集中在 `packages/contracts/pbs-pairing-bids.js`、`pairing-property-config-dialog.tsx`、`pairing-bid-control.tsx` 和 Pairing 页面测试。
- Execution gate: 用户确认本 spec 后才能进入实现。

## 验收标准

- 新增 Configure Pairing Bid 时，所有业务字段为空。
- 编辑已有 bid / existing property / configured favorite 时，保存值完整回填。
- 机场/城市候选来自真实数据库 `liveSchema.airport`。
- Contract 中不再保留机场示例候选作为新增默认来源。
- `GET /api/pairing-bids/reference-options` 返回统一响应，目标 `<2s`。
- 可见错误提示不重复，文案走 i18n。
- 自动化测试覆盖新增空态、编辑回填、机场候选、异常兜底。
- QA 测试案例文档已补齐。
- 不破坏 Pairing Number occurrence-list、左侧日历、Dashboard 日历、configured favorite 和现有 Pairing 保存/编辑/删除流程。
