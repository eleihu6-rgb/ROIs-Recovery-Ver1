# PBS Pairing 规则表达器与同层校验设计

## 背景

当前 `/pairing` 的 `EXISTING PAIRING PROPERTIES` 是平铺列表：

- 每一行表示一个 pairing property。
- 每一行可勾选多个 Layer。
- 添加、删除、收藏已经接入即时保存和 `message` 反馈。

但 AA / PBS 语义里，Pairing property 的真实作用域是 Layer。进入同一个 Layer / pairing pool 的 pairing 没有行内优先级；同层多个条件需要按属性类型解析为 `AND` / `OR`。当前 UI 没有显式展示这层逻辑，也没有在添加时阻止同层重复或 single-use 冲突。

## 目标

1. 保留当前平铺列表作为默认编辑视图。
2. 将当前顶部 `ADD MORE PROPERTIES` 按钮改为规则视图切换按钮。
3. 增加只读规则表达器视图，用当前页面视觉风格展示每个 Layer 的解析结果。
4. 前后端同时增加校验：
   - 同 Layer 完全相同条件不允许。
   - 同 Layer single-use 属性重复不允许。
5. 校验失败使用现有 `message` 反馈，并阻止写入。

## 非目标

- 本轮不把规则表达器做成可编辑构造器。
- 本轮不重构 Pairing 数据库表结构。
- 本轮只实现 AA 已确认的 5 个 forced OR 特例；N-PBS 的 `Any` / `Every` 量词语义不作为同层 AND/OR 特例处理。
- 本轮不改变现有一行 property 可同时绑定多个 Layer 的交互方式。

## 用户体验设计

### 视图入口

`EXISTING PAIRING PROPERTIES` 顶部右侧当前有：

- `ADD MORE PROPERTIES`
- `SEARCH PAIRINGS`

本轮将 `ADD MORE PROPERTIES` 改为视图切换按钮：

- 平铺视图时显示 `VIEW RULES`
- 规则视图时显示 `VIEW PROPERTIES`

默认仍进入平铺视图。`SEARCH PAIRINGS` 保持不变。

### 平铺视图

平铺视图沿用当前 UI：

- property 名称
- bid 摘要
- delete icon
- layer toggle

建议后续将表头 `PRIORITY` 改为 `PROPERTY`，因为 AA 语义中的 Priority 更接近 Layer / award source，不是当前行名称。本轮可一起调整，避免误导。

### 规则表达器视图

规则表达器是只读预览，复用当前 `EXISTING PAIRING PROPERTIES` 的密度、字体、边框和 Layer 视觉语言。

表达方式按 Layer 分组：

```text
L1
Prefer Pairing Length = 3
AND Report Between = 05:00-07:00

L2
(Layover at City = LAX OR Layover at City = SAN)
AND Prefer Pairing Length = 3
```

解析规则：

- 同一 Layer 下，不同 property 默认展示为 `AND`。
- 同一 Layer 下，multi-use property 的不同值展示为 `OR`。
- AA forced OR 特例优先于默认 `AND` 规则；命中特例时，即使是不同 property，也在规则表达器里展示为 `OR` 关系。
- single-use property 不应出现重复；如果后端旧数据或并发导致重复，规则视图显示冲突状态。
- 没有条件的 Layer 不展示，或显示为空状态。

## 校验规则

### 条件标准化

用于判断“完全相同条件”的签名：

```text
propertyCode + action + quantifier + normalizedBidValue + layer
```

`normalizedBidValue` 需要稳定序列化：

- object key 顺序稳定。
- tag-list values 排序后比较。
- 字符串 trim。
- 日期、时间、百分比保留原语义值，不做显示文本比较。

### 同 Layer 完全重复

如果候选 property 与已有 property 在任一重叠 Layer 上签名相同：

- 前端阻止添加或 layer toggle。
- 后端返回业务冲突错误。
- message 示例：`This pairing condition already exists in L1.`

### 同 Layer single-use 重复

如果候选 property 与已有 property 在任一重叠 Layer 上 `propertyCode` 相同，并且该 property 是 single-use：

- 即使 bid value 不同，也不允许。
- message 示例：`Minimum Avg Credit per Duty can only be used once in L1.`

### multi-use 属性

multi-use 属性同 Layer 不同值允许，规则表达器展示为 `OR`。

AA 文档里明确的 multi-use pairing properties 包括：

- Prefer Pairing Length
- Prefer Duty Period
- Report Between
- Release Between
- Prefer Pairing Type
- Co-Terminal / Satellite Airport
- Layover at City
- Avoid Layover at City
- Prefer Landing at City
- Avoid Landing at City
- Prefer Aircraft
- Avoid Aircraft

### AA forced OR 特例

AA 文档明确存在 5 个“不同 property 同层时不按默认 `AND`，而按 `OR` 处理”的 pairing property 组合。本轮纳入规则表达器解析：

1. `ODANs` 与 `Prefer Pairing Length`
2. `1-day pairings` 与 `Layover at City`
3. `1-day pairings` 与 `Avoid Layover at City`
4. `1-day pairings` 与 `Minimum Layover Time`
5. `1-day pairings` 与 `Maximum Layover Time`

实现语义：

- 这些不是“添加时阻止”的冲突规则。
- 前端规则表达器必须把命中的同 Layer 条件展示为 `OR`。
- 前端/后端校验仍只负责重复条件和 single-use 重复；forced OR 是解析与展示规则。
- N-PBS 文档里的 `Any` / `Every` 是 property 自身量词语义，不归入 forced OR 特例。

### single-use 属性

AA 文档里明确的 single-use pairing properties 包括：

- Mid-Pairing Report After
- Mid-Pairing Release Before
- Maximum TAFB-Credit Ratio
- Minimum Avg Credit per Duty
- Maximum Duty Time per Duty
- Maximum Block per Duty
- Minimum Connection Time
- Maximum Connection Time
- Minimum Layover Time
- Maximum Layover Time
- Maximum Landing per Duty
- Prefer Positions Order

项目当前 catalog 里已有的 property code 应先覆盖以上列表中已存在的项。后续新增 property 时必须补充 usage metadata。

## 前端设计

### 规则工具函数

新增 pairing 规则工具，职责包括：

- 生成 normalized condition signature。
- 判断 property 是 `multi-use` 还是 `single-use`。
- 按 Layer 生成规则表达器数据。
- 校验候选 property 与已有 property 是否冲突。

建议位置：

```text
pbs-portal/src/features/pairing/pairing-rule-logic.ts
```

### 校验触发点

需要覆盖：

- `/pairing` 添加 property。
- `/pairing/search` 将 preview criteria 添加到 current draft。
- existing property 的 Layer toggle。
- 未来若 existing property 支持编辑 bid，也复用同一校验。

校验失败时不调用 API，不进入 pending 状态，直接 `message.error(...)`。

### i18n

新增可扩展 key：

- `pairing.message.duplicateConditionError`
- `pairing.message.singleUseConditionError`
- `pairing.rules.viewRules`
- `pairing.rules.viewProperties`
- `pairing.rules.empty`

## 后端设计

### 共享规则元数据

前后端应使用同一份 usage metadata，避免前后端规则漂移。

短期建议放在现有 contracts pairing catalog 附近，扩展 property definition：

```ts
usage: "multi" | "single"
```

长期可迁移到 `pbs_bid_property` / dictionary 参数，符合项目参数化方向。

### 保存草稿校验

`saveCurrentDraft` 走完整草稿替换写入，必须在删除旧数据前校验 normalized draft：

- 当前 payload 内部不能自相冲突。
- 冲突时抛出 `LineholderBidServiceError`，不写数据库。

### 添加单条 property 校验

`addCurrentDraftProperty` 必须在 advisory lock 保护下校验：

1. 定位 current bid。
2. 读取当前已有 pairing properties。
3. 把候选 property 与当前 draft 合并。
4. 执行同一套校验。
5. 通过后再插入。

这样可以防止多标签页或并发请求绕过前端校验。

### 错误码

建议业务冲突使用 `409 Conflict`：

- duplicate condition
- single-use property repeated in overlapping layer

前端 `request` 层继续解包错误信息，页面层显示 `message.error`。

## 测试策略

### 前端测试

覆盖：

- 默认显示平铺视图。
- 点击 `VIEW RULES` 显示按 Layer 分组的规则表达器。
- 再点击 `VIEW PROPERTIES` 回到平铺视图。
- 添加完全相同条件且 Layer 重叠时阻止 API，并显示 message。
- 添加 single-use 属性且 Layer 重叠时阻止 API，并显示 message。
- 同 property 不同 Layer 不阻止。
- multi-use property 同 Layer 不同值允许，并在规则表达器中展示 `OR`。

### 后端测试

覆盖：

- `POST /pairing-bids/current/properties` 拒绝完全重复条件。
- `POST /pairing-bids/current/properties` 拒绝 single-use 同层重复。
- `PUT /pairing-bids/current` 拒绝 payload 内部冲突。
- multi-use 同层不同值允许。
- 同 property 不同 Layer 允许。

## 验收标准

1. 默认页面仍是当前 `EXISTING PAIRING PROPERTIES` 平铺列表。
2. 用户可切换到只读规则表达器，并看到每个 Layer 的 `AND/OR` 解析。
3. 同 Layer 完全相同条件无法添加。
4. 同 Layer single-use 属性无法重复添加。
5. 前端阻止常规操作，后端兜底阻止绕过前端的请求。
6. 所有错误都有 `message` 提示。
7. 相关前后端测试、lint、build 通过。
