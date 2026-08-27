# PBS Flight Legs per Duty：Jen 对齐专用编辑器设计

日期：2026-07-13
状态：原专用编辑器及本视觉补充均已实施、验证通过，待用户验收
范围：将现有 Pairing property `107` 的新增 / 编辑弹窗改为专用、可读的 `Flight Legs per Duty` editor。保持既有 payload、后端筛选、数据库可见性与 migration 语义；本设计文档本身不创建 Git 提交。

## 1. 业务目标

Jen 希望用户通过一个直观入口，按每个 duty 的 flight leg 数表达偏好，而不再面对 `Total Legs In Pairing`、`Total Legs In First Duty`、`Total Legs In Last Duty` 等技术入口。

`Flight Legs per Duty` 已存在，使用 property code `107`：

- `Any duty`：至少一个 duty 满足 legs 比较条件。
- `Every duty`：所有 duty 都满足 legs 比较条件。
- 例如 `Avoid + Any duty + > 3` 表示避免任意 duty 有 4 legs 或以上的 pairing。

本轮只改善此既有条件的 Portal 配置体验，不改变其 SQL、规则计算或保存合同。

## 2. 已确认默认规则

新增 `Flight Legs per Duty` 时：

| 区域 | 初始状态 | 原因 |
| --- | --- | --- |
| Tiers | T1–T7 均不选，必填 | 与前五条 Jen 条件一致，用户必须确定应用 tier。 |
| Preference | `Award` 默认选中 | 延续已有 Preference 条件的默认语义。 |
| Duty match | `Any duty` 默认选中 | 延续现有 `107` 的默认量词与用户最常见的表达。 |
| Comparison | `<`、`=`、`>` 均不选 | 比较方向属于用户自己的业务选择。 |
| Legs per duty | 输入为空 | 不替用户假设 legs 阈值。 |
| 日期 / 其他筛选 | 不显示 | Jen 当前没有要求该条件提供日期能力。 |

尽管已有 `Award + Any duty`，在用户选择至少一个 Tier、一个比较符并输入有效 legs 数前，`SAVE FAVORITE` 和 `ADD BID` 均保持禁用。

## 3. Portal 交互与视觉

### 3.1 专用弹窗

- 标题为 `Configure Flight Legs per Duty`，不再显示泛化的 `Configure Pairing Bid` 副标题。
- 使用当前 PBS Portal 的白色业务弹窗、TierToggleGroup、Award/Avoid segmented control、footer 和英语 UI 文案；不引入新的 UI 库或独立页面风格。
- 主区依次为：`Tiers · Required`、`Preference`、`Duty match`、`Legs per duty`。
- `Duty match` 显示为 `Any duty | Every duty`，使用户能读出量词作用的对象。
- `Legs per duty` 将 `< | = | >` 与数值输入并列展示；数值范围读取当前 catalog bid 的 `min/max`，不在 UI 中硬编码业务阈值。

### 3.2 2026-07-13 视觉补充：焦点与结果句

用户已确认以下补充，适用于 `Flight Legs per Duty` 专用 editor：

- 数值输入获得焦点时，输入框自身四边切换为完整、连续的 2px `ring` 色 border；该 border 位于相邻 `< | = | >` 控件之上，不能被相邻控件的边框或堆叠层遮挡。
- 右侧静态 `legs` 后缀的堆叠层级始终高于聚焦输入框；聚焦时它不能被输入框背景遮挡，也不应影响输入框的四边焦点 border。
- 不显示 `Award/Avoid pairings with any/every duty having … legs.` 这类实时自然语言结果句；完成度与保存条件仍完全由实际表单字段决定。
- 移除结果句后不保留空的 `aria-live` 容器，也不以另一条动态宣读替代。`Preference`、`Duty match`、比较符和 legs 输入继续各自保有可访问名称与选中/校验状态。
- 不修改 Tier、Preference、Duty match、比较符、数值校验、已有规则回填、`propertyCode=107` payload、后端、SQL、migration 或其它 property 的外观与行为。

验收：

1. 点击或 Tab 聚焦 legs 数值输入，四边 2px 焦点 border（尤其底边）完整可见，右侧 `legs` 后缀仍可见；自动化检查四边宽度与颜色一致、后缀层级高于输入框，人工 QA 保留同一检查。
2. 填完 Tier、比较符和合法数值后，`ADD BID` / `SAVE FAVORITE` 仍可启用，但弹窗中没有自然语言结果句。

## 4. 数据与校验边界

### 4.1 不变的正式 payload

提交仍使用现有 `PbsPairingBidValue`：

```ts
{
  type: "stepper",
  value: number,
  min?: number,
  max?: number,
  operator: "=" | "<" | ">",
}
```

外层 property 继续保存既有：

```ts
{
  propertyCode: 107,
  action: "award" | "avoid",
  quantifier: "any" | "every",
  tiers: string[],
  bid: { ... },
}
```

不修改 contracts、`pbs-server` validation、Pairing Search SQL、数据库、seed 或 migration；旧 `108 / 124 / 130` 继续由现有数据库 visibility 策略隐藏。

### 4.2 空白数值的实现策略

现有通用 stepper 必须携带数值，catalog 默认值是 `2`，而通用完成度判断会把 stepper 视为已完成。为了实现用户确认的“legs 默认空”：

- 新增专用 `FlightLegsPerDutyEditor`，维护仅用于新增弹窗的原始数值输入状态。
- 打开新增弹窗时，数值输入显示为空，比较符为未选；不能将隐藏的 catalog 默认值当作用户填写的值。
- 仅当输入为 catalog `min/max` 范围内的有效整数时，editor 才向外层 draft 写入标准 `stepper.value`。
- footer 启用条件额外要求此显式数值已有效输入；绝不发送空值、`null` 或伪造的新 payload。
- 编辑已保存 property / Search Pairings criterion 时，直接从已有 `stepper.value` 回显数值、operator、action、quantifier 与 tier，不套用新增空白重置规则。

## 5. 实现边界

### 修改

1. Portal 新增 feature-local `FlightLegsPerDutyEditor`。
2. `PairingPropertyConfigDialog` 只对 `propertyCode=107` 接入该 editor、专用标题和新增完成度判断。
3. 复用现有 Tier、Award/Avoid、footer、catalog operator / quantifier options 和当前 add/update/favorite service 链路。
4. 更新已过时的 107 测试 fixture / 断言名称，保持 `Flight Legs per Duty` 一致。

### 不修改

- `pbs-server` SQL / validation / route。
- `packages/contracts` 的 stepper 类型。
- `sql/` schema、seed 或 migration。
- 其他 Pairing property 的默认逻辑、泛型 stepper 控件或现有已保存 bid 数据。

## 6. 验收与测试

### 自动化

1. Portal Vitest：新增弹窗中 `Award`、`Any duty` 默认；Tier、operator、legs 均空，footer 禁用。
2. Portal Vitest：选择 Tier、`Avoid`、`Every duty`、`>`、`3` 后，确认保存 draft 为现有 `107` stepper payload，且不渲染实时自然语言结果句。
3. Portal Vitest：编辑已有 `107` bid 保留原 action、quantifier、operator、legs 与 tiers。
4. Playwright：通过真实 Pairing 页面打开 property `107`，验证默认状态、完整填写、`ADD BID` 启用、提交后 current bid 可见；鼠标点击和 Tab 聚焦数值输入后，使用 focused screenshot 或等价可见边界断言确认焦点未被相邻比较符遮挡；不得直接调用业务写接口。
5. 更新 `docs/test-cases/pbs/pairing/` 下的 Flight Legs per Duty 手工 QA 用例，覆盖 `Avoid + Any duty + > 3`、`Every duty`、边界 legs 值、保存 / 编辑回显，以及仅在 `107` 弹窗内不显示旧的技术入口。

### 验证命令

```bash
cd pbs-portal && npm run build
cd pbs-portal && npx vitest run <flight-legs-related-tests>
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps <flight-legs-test> --reporter=list
npm run check:ui
```

## 7. 风险与缓解

- `Any` 与 `Every` 语义容易被误读：由清晰的字段标签、分段控件的已选状态和现有真实 SQL 逻辑共同表达，不增加重复的动态播报。
- 空白数值不能直接进入既有 stepper contract：仅在 Portal editor 层保存暂态输入，确认前 materialize 为有效数值，避免跨模块 contract 扩张。
- 专用分支可能影响 Search Pairings 的编辑弹窗：其编辑路径必须回显已有值，并由 Playwright / Vitest 覆盖。

## Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 专用 editor、dialog 接入与回归测试共享同一草稿完成度和 payload 边界，拆分会制造交叉修改。
- Suggested split: 不拆分。
- Write boundaries: Portal editor、dialog 接入、Portal / Playwright 测试、QA 文档。
- Conflict risk: Low。
- Execution gate: 本 spec 独立审阅通过后，由用户审阅并明确批准实现；未经新的明确 Git 授权，不提交或推送。
