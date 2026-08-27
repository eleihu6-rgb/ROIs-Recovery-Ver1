# PBS Mixed Line Bid 支持 Reserve Short Call 设计

## 背景

Mixed Line Bid 目前只支持三态偏好：

- Mixed Line
- Reserve Only
- Pairing Only

参考项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 已经把 Reserve Short Call 合并进 Mixed Line Bid 配置界面：用户在 Mixed Line Bid 内维护 short-call bids，但底层仍保存为独立的 `301 RESERVE_SHORT_CALL_TYPE` rows。当前项目需要对齐这个行为，同时保持现有 Reserve tab 不变。

用户补充要求：

- Current Line Bid 中也要支持日期范围，复用现有日期范围公共组件和现有 UI 风格。
- Standing Bid 也要同步支持 Mixed Line Bid 内的 Reserve Short Call，但 Standing 没有真实日期，不支持具体日期或日期范围。
- 最终必须用 Playwright 驱动真实 UI 验证。

## 目标

1. 只修改 Mixed Line Bid 这个 Line 条件，让它能够配置 Reserve Short Call。
2. Reserve tab / Reserve Preference 现有功能保持原样，不做迁移、不删除入口。
3. Current Line Bid 的 Mixed Line Bid 支持：
   - `Mixed Line / Reserve Only / Pairing Only`
   - 多条 Reserve Short Call bid
   - 每条 short call 支持 `Award / Avoid`
   - 每条 short call 支持 call type
   - 每条 short call 支持 whole month 或 date range
4. Standing Bid 的 Mixed Line Bid 支持：
   - 同样入口和 short-call 语义
   - 只支持 `Whole Month / First Half / Second Half`
   - 不显示具体日期 picker，不允许 `date_range` / `specific_dates`
5. 导出到 solver 的语义和参考项目一致：
   - Mixed Line 中性状态不写 `427 RESERVE`
   - Reserve Only 写 `427 RESERVE` action=`award`
   - Pairing Only 写 `427 RESERVE` action=`avoid`
   - Reserve Short Call 每条写独立 `301 RESERVE_SHORT_CALL_TYPE`

## 非目标

- 不移除 Reserve tab 中现有 Reserve Preference / Short Call 入口。
- 不把 Reserve tab 的完整日期能力全部搬进 Standing。
- 不改变 Pairing、Days Off、Reserve 其他页面的行为。
- 不做新的规则格式或新 property code。
- 不改变 existing bid 的通用列表布局，除非为了展示 Mixed Line Bid 内的 short-call 摘要必须局部补充。

## 参考项目行为

参考文件：

- `Flair_PBS_Optimization_Report/src/frontend/src/unittest/ConfigureLineBiddingDialog.tsx`
- `Flair_PBS_Optimization_Report/src/frontend/src/unittest/lineRulesCsv.ts`
- `Flair_PBS_Optimization_Report/src/frontend/src/unittest/lineRulesCsv.test.ts`

确认到的参考行为：

- `Mixed Line` 是 UI 中性状态，不写 `427`。
- `Reserve Only` / `Pairing Only` 才写 `427`。
- `RESERVE_SHORT_CALL_TYPE` 是 one bid = one `301` row。
- Mixed Line Bid 卡片是否算已配置：`reserve != null || shortCalls.length > 0`。
- Pairing Only 与 short-call 冲突，切换时要求清空 short-call。

## 当前项目现状

已存在可复用能力：

- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
  - 已有 Mixed Line Bid 三态 UI。
  - 已有 `LIMIT TO A DATE RANGE` 交互样式，可参考 Commuter Pattern。
- `pbs-portal/src/shared/components/preferences/pbs-date-picker.tsx`
  - Current Bid 日期范围 picker 公共组件。
- `pbs-portal/src/features/reserve/components/reserve-preference-editor.tsx`
  - 已有 Reserve Preference 的 call type + date scope 编辑能力。
- `pbs-portal/src/features/standing-bid/components/standing-bid-dialog.tsx`
  - 已有 Standing `reserve-call-type-date-scope` 控件。
  - Standing 已限制 date scope 为 `whole_month / first_half / second_half`。
- `pbs-server/src/services/algorithm-export/line-rules-entry.ts`
  - 已能把 bidType=`Reserve` 且 propertyCode=`301` 的 row 导出为 `RESERVE_SHORT_CALL_TYPE`。

需要补齐的问题：

- Line 页 catalog 不直接暴露 `301`，Mixed Line Bid 内需要显式构造/维护 301 short-call draft properties。
- Current Line export 目前 `RESERVE_LINE_RULE_DATE_SCOPE_MODES` 只允许 `whole_month`，需要补 `date_range`，否则 UI 选 date range 后导出会跳过。
- Line draft validation 需要显式校验 301 short-call，不能只靠通用 schema 放行。
- Standing 需要同步入口，但继续禁止真实日期范围。

## 产品设计

### Current Line Bid

打开 `Configure Mixed Line Bid`：

1. 顶部仍显示 `APPLY TO TIERS`。
2. `PREFERENCE` 保持三态：
   - Mixed Line
   - Reserve Only
   - Pairing Only
3. 在三态下方新增 `RESERVE SHORT CALL BIDS` 区域。
4. 当选择 `Mixed Line` 或 `Reserve Only`：
   - 允许添加 short-call row。
   - 空状态显示轻量提示，不做警告态。
5. 当选择 `Pairing Only`：
   - 不允许新增 short-call。
   - 如果已有 short-call，显示冲突提示，并提供清空动作。
   - 切换到 Pairing Only 时若存在 short-call，弹确认或本地拦截，避免静默保留冲突配置。

每条 Short Call row：

- `Award / Avoid` 分段按钮。
- `Short-call type` 下拉。
- `LIMIT TO A DATE RANGE` 开关。
- 开关关闭：保存 `{ mode: "whole_month" }`。
- 开关打开：显示现有 `PbsDatePicker` range UI，保存 `{ mode: "date_range", from, to }`。
- Remove 操作。

确认按钮规则：

- 如果只选择 `Mixed Line` 且没有 short-call，不能新增，因为它不产生任何 bid row。
- 如果选择 `Mixed Line` 且有 short-call，可以保存，只写 301，不写 427。
- 如果选择 `Reserve Only / Pairing Only`，按现有规则写 427。
- 如果同时有 `Reserve Only` 和 short-call，则写 427 + N 条 301。

### Standing Bid

Standing Mixed Line Bid 同步入口和语义，但不使用具体日期 picker：

- 支持 `Mixed Line / Reserve Only / Pairing Only`。
- 支持多条 Reserve Short Call bid。
- 每条 short call 支持 `Award / Avoid` 和 call type。
- date scope 只显示：
  - Whole Month
  - First Half
  - Second Half
- 不显示 `LIMIT TO A DATE RANGE`。
- 不允许保存 `date_range` / `specific_dates`，服务端保持 400 校验。

## 数据与接口设计

### Current Line 保存

Mixed Line Bid 弹窗确认后，前端需要把一次 UI 操作展开成多个 draft property：

- 可选 `427 RESERVE`
- 0 到 N 条 `301 RESERVE_SHORT_CALL_TYPE`

建议采用现有 draft property 格式，不引入新 composite payload：

```ts
{
  propertyCode: 301,
  name: "Reserve Preference",
  action: "award" | "avoid",
  bid: {
    type: "reserve-call-type-date-scope",
    callType: string,
    options: string[],
    dateScope:
      | { mode: "whole_month" }
      | { mode: "date_range"; from: string; to: string }
  },
  tiers: RuleBidTierOption[]
}
```

原因：

- 后端和导出链路已经认识 301。
- Reserve tab 也使用同一种 bid type。
- 不需要新增数据库字段或 API schema。

### Standing 保存

Standing 使用同样的 301 payload，但 date scope 限制为：

```ts
{ mode: "whole_month" }
| { mode: "first_half" }
| { mode: "second_half" }
```

后端现有 Standing 校验已经会拒绝 `date_range` / `specific_dates`，实现时只需保证 UI 不提供这些选项，并补回归测试。

## 后端调整

Current Line 需要补齐：

1. `line-validation.ts`
   - 将 `301` 作为 Line draft 中可保存的 Reserve Short Call property 明确校验。
   - 校验 call type 在允许列表中。
   - 校验 date scope 支持 `whole_month` 和 `date_range`。
   - `date_range` 必须是合法 ISO 日期，且 `to >= from`。
2. `line-rules-metadata.ts`
   - `RESERVE_LINE_RULE_DATE_SCOPE_MODES` 从 `whole_month` 扩展到 `whole_month + date_range`。
   - 更新 metadata/readme 文案，避免仍写 whole-month only。
3. `line-rules-entry.ts`
   - 导出 301 时保留 compact date scope。
   - 描述文案覆盖 date range。
4. 测试覆盖：
   - line draft 保存 301 whole month。
   - line draft 保存 301 date range。
   - date range 非法时返回 400。
   - Line Rules export 输出 `RESERVE_SHORT_CALL_TYPE` 的 date range JSON。

Standing 后端保持当前限制：

- 不允许具体日期。
- 继续拒绝 date range / specific dates。
- 补测试确认没有被 Current Line 扩展误放开。

## 前端调整

建议拆分小组件，避免把 Line dialog 继续堆大：

- `features/line/components/mixed-line-short-call-editor.tsx`
  - Current Line Mixed Line Bid 内部 short-call list。
  - 复用 `PbsDatePicker` 和 `PreferenceInlineSwitch`。
- `features/line/components/mixed-line-short-call-types.ts`
  - short-call draft type、默认值、clone、validate、summary helpers。
- Standing 可复用同一数据 helper，但 UI 使用 Standing 现有 `ReserveDateScopeControl`，并传 `allowedModes=["whole_month","first_half","second_half"]`。

UI 风格要求：

- 继续使用 Portal 现有白色轻量弹窗风格。
- 分段按钮、toggle、date range picker 使用现有 preference components。
- 不新增新的视觉体系、颜色或大圆角样式。
- 文案保持英文 UI。
- 不能出现表单控件挤压、重叠或按钮文字溢出。

## 测试计划

### 自动化单元/组件测试

前端：

- `line-page.test.tsx`
  - Mixed Line + short call 可保存，结果出现 Short Call summary。
  - Reserve Only + short call 可保存。
  - Pairing Only 与 short call 冲突时要求清空或阻止。
  - date range picker 选中范围后 payload 包含 `date_range`。
- `standing-bid-page.test.tsx`
  - Standing Mixed Line Bid 可添加 short call。
  - Standing short call 只显示 Whole Month / First Half / Second Half。
  - Standing 不显示 `LIMIT TO A DATE RANGE`。

后端：

- `line-validation.test.ts` 或现有 route/service 测试：
  - 301 whole month 通过。
  - 301 date range 通过。
  - 301 bad date range 拒绝。
- `line-rules-export.test.ts`
  - 301 date range 正确输出到 `LINE_RULES.csv`。
- `standing-bid-service.test.ts`
  - Standing 继续拒绝 301 date range。

### Playwright UI 验收

必须新增或更新真实 UI E2E：

1. Current Line：
   - 登录测试账号。
   - 进入 Line Bid。
   - 打开 Mixed Line Bid。
   - 选择 tier。
   - 添加 Reserve Short Call。
   - 打开 `LIMIT TO A DATE RANGE`。
   - 用 date picker 选择范围。
   - 保存。
   - 断言 Existing Line Properties 中能看到 Mixed Line Bid / short-call 信息。
2. Standing：
   - 进入 Standing Bid。
   - 打开 Mixed Line Bid。
   - 添加 Reserve Short Call。
   - 断言不显示 date range picker。
   - 断言只显示相对 scope。
   - 保存并断言 existing row。

Playwright 截图检查：

- Current Mixed Line Bid 弹窗中的 date range 控件与当前 Commuter Pattern 的 `LIMIT TO A DATE RANGE` 风格一致。
- Standing 弹窗不出现日期 picker。
- 1920x1080 下弹窗内容不重叠、不溢出。

## 验收标准

- Reserve tab 视觉和行为无回归。
- Current Mixed Line Bid 可以保存：
  - Mixed Line + 301 short call
  - Reserve Only + 301 short call
  - 301 short call + date range
- Current Line Rules export 包含 date range 的 `301 RESERVE_SHORT_CALL_TYPE`。
- Standing Mixed Line Bid 可以保存 301 short call，但不能保存 date range。
- Pairing Only 冲突有明确提示或阻止，不静默保存冲突 short-call。
- Playwright 真实 UI 测试通过。
- 前端样式符合 PBS Portal 现有组件风格。

## 风险与处理

- 风险：一次弹窗确认需要保存多个 properties，现有 `RuleBidRightPanel` 默认一次只处理一个 property。
  - 处理：实现时优先扩展 Line/Standing 页面内部的 confirm orchestration，不改全局面板契约；必要时只给 Mixed Line Bid 特例。
- 风险：Current Line 扩展 301 date range 可能影响 Standing。
  - 处理：Standing 后端校验单独保留，补测试防止误放开。
- 风险：现有 existing rows 里 301 是 Reserve bidType，Line 页如何展示需要谨慎。
  - 处理：只在 Mixed Line Bid 相关展示中合并/摘要 301，不改变 Reserve tab。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这个改动涉及同一个 UI 契约从弹窗到 draft 保存再到导出，拆成多个 agent 容易出现前后端 payload 不一致。
- Suggested split: 不建议并行实现；可以先做后端校验/导出，再做前端弹窗，最后统一 Playwright 验证。
- Write boundaries: 单 agent 按模块顺序修改，避免多个 agent 同时改 `line-bid-dialog.tsx` / `standing-bid-dialog.tsx` / draft mapper。
- Conflict risk: Medium。主要风险在 301 同时属于 Reserve 和 Line Rules export。
- Execution gate: 用户 review 并确认本 spec 后再开始实现。
