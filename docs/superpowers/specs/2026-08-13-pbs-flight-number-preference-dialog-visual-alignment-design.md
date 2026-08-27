# PBS Flight Number Preference 弹窗视觉规整设计

日期：2026-08-13
状态：已实施，验证通过
范围：PBS Portal `Configure Flight Number Preference` 弹窗视觉规整；不改变 bid payload、校验规则、接口、搜索逻辑或后端。

## 1. 问题

当前 `Flight Number Preference` 弹窗中多个控件的视觉规格不一致：

- `Award / Avoid` segmented control 宽度较短，和下面的 `TYPE` select、`FLIGHT NUMBERS` 输入区不在同一视觉宽度体系内。
- `TYPE` select 是 `rounded-md`、`h-9`，`FLIGHT NUMBERS` tag-list 是 `rounded-3xl`、`py-3`，圆角和高度不一致。
- `FLIGHT NUMBERS` 输入区高度显著大于 select，边框曲率也更大，造成页面看起来像不同组件拼出来。
- `LIMIT TO FLIGHT DATE` 上方分隔线和底部 footer 之间空间尚可保留，但主体控件需要统一尺寸、边框和圆角。

## 2. 目标

让这个弹窗看起来像一套统一的 PBS Portal 表单：

1. `Preference`、`Type`、`Flight Numbers` 三个主体控件左边界对齐。
2. `Type` 和 `Flight Numbers` 使用一致的最大宽度、边框颜色、圆角和基础高度。
3. `Award / Avoid` segmented control 使用同一宽度策略，不再显得短一截。
4. `Flight Numbers` 在无 tag 时高度不要过大；有 tag 时允许自然增高，但边框和圆角保持同一视觉语言。
5. 不改变 `flight-number-preference` 的数据结构、autocomplete、date scope、Add Bid / Save Favorite enable 逻辑。

## 3. 建议方案

采用局部 UI 修复，不做大范围重构：

- 在 `FlightNumberPreferenceEditor` 内定义统一 field 宽度容器，例如 `max-w-[520px]` / `w-full`。
- 给 `AwardAvoidSegmentedControl` 传入局部 class 或使用外层 wrapper，让它和下面字段同宽。
- 给 `PreferenceClearableSelect` 传入局部 class，让它占满同一宽度。
- 给 `TagListControl` 使用现有 `fieldClassName` / `inputClassName` 参数，局部收敛为：
  - 同一边框色；
  - 同一圆角级别；
  - 更接近 select 的基础高度；
  - placeholder 大小、颜色与其他输入一致。
- 保持 `OptionalEventDateScopeEditor` 现有结构，仅确认其 divider 和 switch 与新字段间距协调。

不建议直接改所有 shared preference 控件的默认样式，因为这些控件被多个条件复用，容易把其他弹窗一起改坏。

## 4. 影响文件

预计只触达：

- `pbs-portal/src/features/pairing/components/flight-number-preference-editor.tsx`
- `pbs-portal/src/features/pairing/components/flight-number-preference-editor.test.tsx` 如现有覆盖不足则新增
- 可能更新 `e2e/tests/pbs-portal/condition-default-favorites.spec.ts` 中 `PBS-3523`，做真实弹窗 smoke

不触达：

- `pbs-server`
- `packages/contracts`
- pairing search flight number API
- bid 保存 / favorite 保存 payload
- 当前工作树已有 Bid Feedback / endpoint reliability 改动

## 5. 验收标准

- 打开 `Configure Flight Number Preference`：
  - `Award / Avoid`、`TYPE`、`FLIGHT NUMBERS` 主体区域视觉宽度一致。
  - `TYPE` 和 `FLIGHT NUMBERS` 的边框、圆角、高度语言一致。
  - 空的 `FLIGHT NUMBERS` 输入区不再像一个过大的胶囊框。
  - 按钮 footer 和 `LIMIT TO FLIGHT DATE` 不出现重叠或错位。
- 原功能不回归：
  - 选择 type 后 flight number autocomplete 仍按 type 搜索。
  - 添加 flight number 后仍保存 `flight-number-preference.flightNumbers`。
  - 开关 `LIMIT TO FLIGHT DATE` 后 date scope 仍能保存。
  - `ADD BID` enable/disable 逻辑不变。

## 6. 验证计划

- `pnpm --dir pbs-portal exec vitest run src/features/pairing/components/flight-number-preference-editor.test.tsx`
- `pnpm --dir pbs-portal exec vitest run src/features/pairing/pages/pairing-page.test.tsx`
- `pnpm --dir e2e exec playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/condition-default-favorites.spec.ts -g "PBS-3523"`
- `pnpm --dir pbs-portal run build`
- `npm run check:ui`

## 7. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复范围集中在一个弹窗 editor 和少量测试，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: `FlightNumberPreferenceEditor` 及对应测试。
- Conflict risk: 中等；当前工作树已有 Bid Feedback / endpoint reliability 改动，实施时必须避开。
- Execution gate: 用户确认本 spec 后再改代码。
