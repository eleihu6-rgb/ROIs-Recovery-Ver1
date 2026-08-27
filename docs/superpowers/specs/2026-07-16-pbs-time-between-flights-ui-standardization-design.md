# PBS Pairing「Time Between Flights」UI 标准化设计

## 1. 背景

`Time Between Flights` 是 `propertyCode=129`，来源于旧 `Any/Every Sit Length`。它不在当前参考项目的标准答案清单里，但已经在本项目中作为 Pairing 条件保留并实现：

- 动态读取允许的最小时长和最大时长；
- 使用 `<`、`=`、`>` 比较一个 `HH:MM` 时长；
- 支持 `Award / Avoid`；
- 支持 `Any / Every`；
- Pairing 页面与后端筛选使用同一套 payload 与搜索语义；Search Pairings 侧只在已有 current-rules / preview / criteria 回显编辑路径中复用同一配置弹窗。

当前问题不在业务语义，而在 UI 还没有完全迁移到我们最近统一的 Pairing 条件标准：

- `TimeBetweenFlightsEditor` 内部手写了 `select + Input`；
- `Any / Every` 仍由外层 `PairingPropertyConfigDialog` 用旧 `PairingPropertyChoiceGroup` 渲染；
- 视觉层级和 `Flight Legs per Duty`、`Month-End Carryover`、`Airport Preference` 这批新标准条件不一致。

本设计只处理 UI 标准化，不重新定义算法、导出或搜索条件。

## 2. 目标与非目标

### 目标

1. 让 `Configure Time Between Flights` 的弹窗布局与当前 Pairing 条件标准一致。
2. 将 `Any / Every` 从外层旧控件迁入 `TimeBetweenFlightsEditor`，作为标准 `MATCH` section。
3. 将时长比较输入改为标准 comparison control 风格，视觉上与 `Flight Legs per Duty` / `Month-End Carryover` 对齐。
4. 保留现有动态 bounds、输入防呆和 footer disabled 规则。
5. 不把 `129` 新增到 Search Pairings criteria picker allowlist；该 picker 当前不展示 `Time Between Flights`，本次不改变入口范围。
6. 更新 focused Vitest、Playwright 和 QA 文档，锁定新 UI 与旧业务语义不变。

### 非目标

- 不改 `propertyCode=129`。
- 不改 payload，仍然保存：

  ```ts
  { type: "duration", value: "HH:MM", operator: "<" | "=" | ">" }
  ```

- 不新增 `Between`。
- 不改 `Award / Avoid`、`Any / Every` 的默认值。
- 不改 pairing search SQL、live-server export、algorithm export 或 migration。
- 不把 `propertyCode=129` 加入 `pairing-search-criteria.ts` 的 picker allowlist；如果未来要让 Search Pairings picker 主动新增该条件，需要单独 spec。
- 不引入 Ant Design 依赖。可以参考 Ant 的滑顺感和视觉密度，但实现必须使用当前项目组件和 Tailwind token。

## 3. 当前实现盘点

### 3.1 已有能力

- `pbs-portal/src/features/pairing/components/time-between-flights-editor.tsx`
  - 已有 `AwardAvoidSegmentedControl`。
  - 已有动态 bounds 校验。
  - 已有 `HH:MM` 单值输入归一化。
  - 已有 `onValidityChange`。
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
  - 已经为 129 读取 `time-between-flights-bounds`。
  - footer 已根据 bounds 和 editor validity 禁用。
  - 但 `Any / Every` 仍由外层旧控件渲染。
- `pbs-portal/src/features/pairing/pairing-search-criteria.ts`
  - 当前 criteria picker allowlist 没有 `129`。
  - 本次不新增 picker 入口，只避免已有回显编辑路径继续使用旧视觉。
- `docs/modules/pbs/pairing-condition-ui-standard.md`
  - 明确新增或改造 Pairing 条件时，默认复用 shared preference primitives。

### 3.2 当前 UI 差异

标准化后的 Pairing 条件通常是：

```text
TIERS
PREFERENCE
MATCH / condition-specific mode
CONDITION FIELD
footer
```

而当前 `Time Between Flights` 是：

```text
TIERS
PREFERENCE  # editor 内
Any / Every # 外层旧 choice group
TIME BETWEEN FLIGHTS # editor 内手写 select + input
footer
```

这会造成视觉层级和维护边界都不一致。

## 4. 推荐方案

采用 **小范围 UI 标准化，不改业务语义**。

### 4.1 弹窗结构

调整后结构：

```text
TIERS

PREFERENCE
[ Award ] [ Avoid ]

MATCH
[ Any ] [ Every ]

TIME BETWEEN FLIGHTS
[ > ] [ 01:30  hours : min ]

footer
```

说明：

- `TIERS` 继续由外层 dialog 统一渲染。
- `PREFERENCE` 继续在 `TimeBetweenFlightsEditor` 内渲染。
- `MATCH` 迁入 `TimeBetweenFlightsEditor`，使用 `PreferenceSegmentedControl`。
- 外层 dialog 对 `isTimeBetweenFlightsProperty` 不再渲染旧 `PairingPropertyChoiceGroup`。
- `TIME BETWEEN FLIGHTS` 使用标准 comparison 输入视觉。

### 4.2 Comparison 控件策略

现有 `PreferenceComparisonValueControl` 默认使用 `type="number"`，适合 `legs`、`days`，不适合 `HH:MM`。

本次采用最小扩展：

- 为 `PreferenceComparisonValueControl` 增加可选文本输入能力，例如：
  - `inputType?: "number" | "text"`，默认仍为 `number`；
  - `inputMode?: HTMLInputModeAttribute`，默认仍为 `numeric`；
  - `inputPattern?: string`，仅文本输入需要时使用；
  - `suffix` 继续保留，用于显示 `hours : min`；
  - 增加长 suffix 的 padding / 宽度适配能力，例如 `suffixClassName` 或 `inputPaddingClassName`，默认仍保持当前数字输入的 `pr-12`，`Time Between Flights` 使用等价于当前 `pr-20` 的空间，避免 `hours : min` 和输入文字重叠。
- 现有 `Flight Legs per Duty`、`Month-End Carryover`、`Deadhead Flying` 不需要改调用方式，默认行为不变。
- `Time Between Flights` 使用该控件的 text mode，保留当前 `HH:MM` 归一化逻辑。

这样可以统一视觉骨架，同时避免新建一个只服务单条件的重复组件。

### 4.3 状态与 payload

不改变当前保存语义：

- `operator`：仍为 `<`、`=`、`>`。
- `value`：仍为标准化 `HH:MM`。
- `quantifier`：仍保存在 property 层，不进入 bid value。
- `action`：仍保存在 property 层。
- `tiers`：仍由外层统一处理。

切换规则：

- 切换 `Any / Every` 只调用现有 `onQuantifierChange`。
- 切换 `< / = / >` 只更新 operator，不清空合法时长草稿。
- 输入非法时长或越界时，editor 仍上报 invalid，footer 禁用。
- bounds 未加载时，editor disabled，footer 禁用。

### 4.4 文案与可访问性

保留现有稳定可访问名称，避免破坏自动化测试和用户路径：

- operator select：`Time Between Flights operator`
- duration input：`Time Between Flights duration`
- match buttons：`Any`、`Every`
- preference buttons：`Award`、`Avoid`

错误文案继续沿用当前逻辑：

- 小于下限或大于上限时显示 `Enter 00:45 to 04:20.` 这类动态提示。
- 初始空值不显示红色错误，只禁用 footer。

## 5. 方案比较

| 方案 | 内容 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| A. 只改 CSS class | 保持现有手写 select/input，只调样式 | 改动最小 | 仍然复制标准控件逻辑，后续继续分叉 | 不采用 |
| B. 扩展 `PreferenceComparisonValueControl` 支持 text duration | 复用标准 comparison 骨架，Time Between 用 text mode | 视觉和代码都统一，影响面可控 | 需要确保默认 numeric 用户不受影响 | **采用** |
| C. 新增 `PreferenceDurationComparisonControl` | 单独做 duration 版 comparison | 不影响现有控件 | 又多一个近似组件，标准更分散 | 暂不采用 |

## 6. 实现范围

### 6.1 Portal

预计修改：

- `pbs-portal/src/shared/components/preferences/preference-condition-primitives.tsx`
  - 扩展 `PreferenceComparisonValueControl` 的输入类型能力，默认行为保持不变。
- `pbs-portal/src/features/pairing/components/time-between-flights-editor.tsx`
  - 使用 `PreferenceComparisonValueControl`。
  - 新增 `MATCH` section，使用 `PreferenceSegmentedControl`。
  - 接收并回传 `quantifier` / `quantifierOptions` / `onQuantifierChange`。
  - 保留当前时长输入归一化和 bounds 校验。
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
  - 对 `Time Between Flights` 不再渲染外层旧 quantifier 控件。
  - 将 quantifier props 传入 `TimeBetweenFlightsEditor`。

### 6.2 Tests / QA

预计更新：

- 新增 `pbs-portal/src/features/pairing/components/time-between-flights-editor.test.tsx`
  - 当前没有独立 editor test；本次需要补一个 focused test，覆盖 `MATCH` section、operator、duration、防呆和 validity。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - 更新弹窗结构断言，确认 `Any / Every` 在同一标准 editor 区域内。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
  - 不新增 picker 入口测试。
  - 使用现有可编辑 criteria/current-rule fixture 或直接构造 `propertyCode=129` 的 criteria item，验证回显编辑时打开同一个标准化 `Configure Time Between Flights` dialog，且保存后 payload 不变。
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
  - 更新 `PBS-3527`，保留真实 UI 保存路径。
- `docs/test-cases/pbs/condition-properties/2026-07-14-time-between-flights.md`
  - 补充 UI 标准化验收步骤。

不需要修改：

- `pbs-server` 搜索 SQL；
- `live-server` export；
- `packages/contracts`；
- `sql/migration` 或 seed；
- `pbs-portal/src/features/pairing/pairing-search-criteria.ts` 的 supported property allowlist。

## 7. 验收标准

1. 打开 `Configure Time Between Flights`：
   - `TIERS` 仍默认空；
   - `Award` 默认选中；
   - `Any` 默认选中；
   - operator 默认 `>`；
   - duration placeholder 显示动态 bounds，例如 `00:45 – 04:20`。
2. `PREFERENCE`、`MATCH`、`TIME BETWEEN FLIGHTS` 使用当前 Pairing preference section 视觉。
3. 输入 `0045-2405` 后仍归一化为单值 `00:45`。
4. 输入 `00:44` 时 footer 禁用，并显示动态错误。
5. 输入合法值并选择 Tier 后，payload 仍为：

   ```json
   {
     "propertyCode": 129,
     "action": "award",
     "quantifier": "every",
     "tiers": ["T1"],
     "bid": {
       "type": "duration",
       "value": "01:30",
       "operator": "="
     }
   }
   ```

6. Search Pairings picker 仍不主动展示 `Time Between Flights`；已有回显/编辑路径如果出现 `129`，应打开同一个标准化 dialog，保存 payload 不变。
7. `Flight Legs per Duty`、`Month-End Carryover`、`Deadhead Flying` 的 comparison 输入不出现回归。

## 8. 验证计划

最小验证：

```bash
cd pbs-portal && npx vitest run src/features/pairing/components/time-between-flights-editor.test.tsx
cd pbs-portal && npx vitest run src/features/pairing/pages/pairing-page.test.tsx --testNamePattern "Time Between Flights"
cd pbs-portal && npx vitest run src/features/pairing/pages/search-pairings-page.test.tsx --testNamePattern "Time Between Flights"
npx playwright test e2e/tests/pbs-portal/condition-default-favorites.spec.ts --grep "PBS-3527" --project pbs-portal --no-deps
cd pbs-portal && npm run lint -- --quiet
cd pbs-portal && npm run build
npm run check:ui
git diff --check
```

如果 shared primitive 的扩展影响面超出预期，需要补跑：

```bash
cd pbs-portal && npx vitest run src/features/pairing/components/flight-legs-per-duty-editor.test.tsx src/features/pairing/components/month-end-carryover-editor.test.tsx
```

## 9. 风险与控制

- 风险：扩展 `PreferenceComparisonValueControl` 影响其它数字比较条件。
  - 控制：新增 props 默认保持 numeric 行为；现有调用不改参数。
- 风险：把 `Any / Every` 移入 editor 后，外层 dialog validity 或 payload 丢失。
  - 控制：只改变渲染位置，仍使用现有 `handleQuantifierChange` 和 property 层字段。
- 风险：当前工作区有其它 Pairing 未提交改动，容易混入提交。
  - 控制：实现前记录 `git status --short`；实现后逐文件审查 diff；提交时对 `pairing-page.test.tsx`、`condition-default-favorites.spec.ts`、`preference-condition-primitives.tsx` 等混合文件使用 hunk-level staging，不能用 `git add .`。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个 editor 的 UI 标准化，涉及同一个 dialog 和 shared primitive；拆分会增加冲突风险。
- Suggested split: 不拆。
- Write boundaries: `time-between-flights-editor.tsx`、`preference-condition-primitives.tsx`、`pairing-property-config-dialog.tsx`、相关测试和 QA 文档。
- Conflict risk: Medium，当前工作树已有其它 Pairing 改动，必须精确控制 staging 范围。
- Execution gate: 用户确认本 spec 后再实现；实现完成前不提交 git，除非用户明确要求。
