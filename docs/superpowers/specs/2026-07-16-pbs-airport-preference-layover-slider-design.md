# PBS Airport Preference Preferred Layover Hours Slider 设计

## 背景

用户希望继续对标 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 的标准答案项目，把 Pairing 里的 `Airport Preference` 的 layover hour 输入从手填 `HH:MM` 改成更偏用户习惯的 slider。

当前项目已经有一套 PBS Preference Condition 行为标准，`Airport Preference` 也已经使用统一弹窗、`TIERS`、`Award / Avoid`、机场选择、日期限制和 fulfilment 规则。本次只调整 `Preferred layover hours` 这一块，不重做整个 Airport Preference。

另外需要特别注意：当前对外可用的 algorithm export 压缩包接口在 `live-server`，不是只看 `pbs-server`。因此本次实现不能只保证员工端 Search Pairings 正确，还必须保证 `live-server` 的 `PAIRING_SCORE.csv` 导出链路能识别新的 `airport-preference` payload 并执行同样的 layover hour 过滤。

## 参考项目事实

标准答案项目的 `Airport Preference` 在 `ConfigureBiddingDialog.tsx` 中：

- 当 `appliesTo` 是 `layover` 或 `both` 时展示 `Preferred layover hours`。
- 使用原生 `input type="range"`。
- 范围硬编码为 `13` 到 `18`。
- 步长是 `1`。
- 默认值是 `13`。
- 保存字段是 `params.minLayoverHours`，类型为 number。
- 过滤逻辑是：如果 duty 的 `layover_hours < minLayoverHours`，则该 layover 不命中。
- 生成 `PAIRING_SCORE.csv` 前先用这个 bid option 过滤 pairing；CSV 本身只写 crew / pairing / tier counter，不写 `minLayoverHours` 字段。

标准答案项目没有从管理员配置或字典表读取该范围。

## 当前项目事实

当前 `Airport Preference`：

- propertyCode 是 `168`。
- payload 是 `airport-preference`。
- layover duration 字段是 `minimumLayoverDuration?: string | null`，例如 `13:00`。
- UI 当前是 `MINIMUM LAYOVER DURATION` 开关 + `HH:MM` 文本输入。
- 不打开开关时，保存 `minimumLayoverDuration=null`，不应用 layover hour 条件。
- 打开开关并输入 duration 后，Search Pairings 通过 `layover_minutes >= parseDurationToMinutes(minimumLayoverDuration)` 过滤。
- `pbs-server` Search Pairings 已经通过同一套 pairing search 条件寻找命中 pairing。
- 活跃 algorithm export 压缩包接口在 `live-server`，其 `PAIRING_SCORE.csv` 也会构造 search property，再调用 live-server 自己的 pairing search condition builder 找命中 pairing。当前 live-server 仍有一套 local lineholder `airport-preference` shape，需要同步支持 contracts 里的 `locations` / `minimumLayoverDuration` shape。

因此，只要 slider 最终仍写入现有 `minimumLayoverDuration` 字段，并且 `pbs-server` 与 `live-server` 两条 search/export 链路都识别该字段，Search Pairings 和 `PAIRING_SCORE.csv` 导出语义可以保持正确。

## 目标

1. 保留当前开关语义：只有用户打开开关才设置 layover hour 条件。
2. 把 `HH:MM` 文本输入替换成 slider。
3. UI 上使用 `Preferred layover hours` 表达，视觉上参考 Ant Slider，但不引入 `antd`。
4. slider 范围从字典配置读取，默认对齐标准答案项目：`13-18`，step `1`，default `13`。
5. 保存格式保持现有 contract：`minimumLayoverDuration="13:00"`。
6. Search Pairings 和 `PAIRING_SCORE.csv` 导出必须继续基于同一过滤条件，保证 pairing 过滤正确。
7. `live-server` algorithm export 必须纳入实现和回归测试范围。

## 非目标

- 不引入 `antd`、`rc-slider` 或新的重量级 UI 框架。
- 不改变 `Airport Preference` 的 propertyCode。
- 不改变 `airport-preference` payload 的主结构。
- 不改变 `Award / Avoid`、`TIERS`、机场选择、日期限制、fulfilment 的现有行为。
- 不改变 `PAIRING_SCORE.csv` 文件格式。
- 不把 slider 默认打开；用户未勾选时不设置 layover hour 条件。
- 不迁移旧 bid 数据；旧数据在编辑/保存时按本 spec 标准化。

## 推荐方案

采用“保留开关 + 自研轻量 slider + 字典配置”的方案。

### UI 行为

`AIRPORT EVENT` 的员工端选项显示为：

- `Landing`
- `Layover`
- `Both`

其中 `Both` 对应现有内部 payload 值 `landing_or_layover`。不把内部字段改成 `both`，避免扩大 contract、server、search 和历史数据兼容范围。

当 `AIRPORT EVENT` 是 `Layover` 或 `Both` 时显示：

- `PREFERRED LAYOVER HOURS` 开关。
- 默认关闭。
- 关闭时：
  - 不显示 slider。
  - `minimumLayoverDuration=null`。
  - Search / export 不应用 layover hour 过滤。
- 打开时：
  - 显示 slider。
  - 默认值取字典配置的 `defaultHours`，默认 `13`。
  - slider 显示 min / max 标记，例如 `13` 和 `18`。
  - 当前值显示为 `13 hours`。
  - 拖动后即时更新 `minimumLayoverDuration`。

当 `AIRPORT EVENT` 切回 `Landing` 时：

- 清空 `minimumLayoverDuration`。
- 不显示 layover hour 开关和 slider。

当 `AIRPORT EVENT` 是 `Both` 时：

- slider 只作用于 layover 事件。
- 保留现有提示：`Applies to layovers only`。

### 保存格式

内部仍保存：

```json
{
  "type": "airport-preference",
  "event": "layover",
  "locations": [{ "code": "YYZ", "kind": "airport" }],
  "dateScope": null,
  "minimumLayoverDuration": "13:00",
  "minimumRequired": null,
  "maximumRequired": null
}
```

slider 的小时值映射：

- `13` -> `13:00`
- `14` -> `14:00`
- `18` -> `18:00`

如果开关关闭：

```json
"minimumLayoverDuration": null
```

### 搜索和导出

Search Pairings 保持现有 SQL 语义：

```text
airport_events.layover_minutes >= parseDurationToMinutes(minimumLayoverDuration)
```

精确语义：

- `event=layover`：只看 layover event，必须满足 layover airport 命中且 `layover_minutes >= threshold`。
- `event=landing_or_layover`，UI 显示 `Both`：landing 命中不受 layover hour threshold 限制；layover 命中才要求 `layover_minutes >= threshold`。
- `event=landing`：不允许携带 `minimumLayoverDuration`。

`PAIRING_SCORE.csv` 导出继续复用 pairing search 条件：

1. 从保存的 pairing bid group 反序列化 `airport-preference`。
2. 构造 search property。
3. 运行 pairing search 过滤匹配 pairing。
4. 对命中的 pairing 写入 tier counter。

CSV 不新增 `Preferred layover hours` 列。

实现时必须同时覆盖：

- `pbs-server` Search Pairings / preview 条件。
- `live-server` algorithm export 的 `PAIRING_SCORE.csv` 条件构造和匹配查询。

## 字典配置

新增系统参数：

```text
parent_code = SYS_PARAM
code = PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE
name = PBS Airport Preference Layover Hours Range
code_value = {"min":13,"max":18,"step":1,"default":13}
```

解析规则：

- `min`、`max`、`step`、`default` 必须是安全整数。
- `min >= 0`。
- `max >= min`。
- `step >= 1`。
- `default` 必须在 `[min, max]` 内。
- 配置缺失或非法时，后端兜底为 `13-18 / step 1 / default 13`，并不阻塞 Airport options。

数据来源建议：

- 使用现有 `dictionary` / `SYS_PARAM` 模式。
- 通过 `pairing-search/airport-options` 的 response 返回给前端，避免新增单独 round trip。

新增 response 字段建议：

```ts
type PbsAirportPreferenceLayoverHoursConfig = {
  minHours: number;
  maxHours: number;
  stepHours: number;
  defaultHours: number;
};

type PbsPairingAirportOptionsResponse = {
  airportPreferenceOptions: PbsPairingAirportPreferenceOption[];
  landingAirports: string[];
  layoverAirports: string[];
  workStartStations: string[];
  airportPreferenceLayoverHours: PbsAirportPreferenceLayoverHoursConfig;
};
```

## 旧数据处理

旧保存数据可能存在：

- `minimumLayoverDuration=null`
- `minimumLayoverDuration="12:00"`
- `minimumLayoverDuration="13:00"`
- `minimumLayoverDuration="13:30"`
- 其他合法 `HH:MM`

处理规则：

- `null`：开关关闭。
- 合法 `HH:MM`：开关打开。
- 如果小时值在字典范围内且分钟为 `00`，slider 直接回显该小时。
- 如果分钟不是 `00`，编辑时 slider 回显为不低于原阈值的最近 step。例如 `13:30` 在 step `1` 下回显 `14`，重新保存为 `14:00`，避免把原过滤条件放宽。
- 如果值低于配置最小值，编辑时回显 `min`；重新保存后标准化为 `min:00`。
- 如果值高于配置最大值，编辑时回显 `max`；重新保存后标准化为 `max:00`。
- 如果值格式非法，现有 validation 继续拒绝。

## 组件方案

新增轻量组件，例如：

```text
pbs-portal/src/shared/components/preferences/preference-hour-slider.tsx
```

或与现有 primitives 同文件导出。

组件职责：

- 接收 `minHours`、`maxHours`、`stepHours`、`valueHours`。
- 用 native `input type="range"` 实现。
- 视觉参考 Ant Slider：细 track、主色 progress、圆形 thumb、当前值 pill。
- 使用项目现有 token / Tailwind 标准，不使用 `text-[Npx]` 等 UI gate hard violation。
- 支持 keyboard 和 aria label。

`AirportPreferenceEditor` 使用该组件，不直接手写 range input。

## 备选方案

### 方案 A：直接引入 `antd` Slider

不推荐。

原因：

- `pbs-portal` 当前没有 `antd`。
- 模块规则不希望随意引入重量级 UI 框架。
- 只为一个 slider 引入 Ant 运行时不划算。

### 方案 B：继续保留 `HH:MM` 文本输入

不推荐。

原因：

- 用户明确倾向 slider。
- 标准答案项目也是 slider。
- 文本输入容易造成格式错误，且不利于表达固定范围。

### 方案 C：自研轻量 slider，保留 payload

推荐。

原因：

- 对齐标准答案项目交互。
- 不引入重依赖。
- 不改 `PAIRING_SCORE.csv`。
- 不改当前 search/export 核心链路。
- 可以通过字典配置支持管理员后续调整范围。

## 测试与验收

### 前端自动化

- `AirportPreferenceEditor`：
  - Layover 模式下默认开关关闭。
  - 开关关闭时不写 `minimumLayoverDuration`。
  - 打开开关后默认写 `13:00`。
  - 拖动 slider 到 `16` 后写 `16:00`。
  - 切回 Landing 后清空 layover duration。
- Pairing 页面：
  - 配置弹窗显示 slider，不再显示 `HH:MM` 文本输入。
  - 保存 payload 中 `minimumLayoverDuration` 正确。

### 后端自动化

- Airport options response 返回 layover hours config。
- 字典配置缺失/非法时 fallback 正确。
- `pbs-server` Search condition 测试：
  - `minimumLayoverDuration=null` 不生成 layover minute 条件。
  - `minimumLayoverDuration="13:00"` 生成 `layover_minutes >= 780`。
  - `event=landing_or_layover` / UI `Both` 时 landing 命中不被 layover hour 过滤掉。
  - Landing + duration 仍拒绝。
- `live-server` `PAIRING_SCORE.csv` export 测试：
  - Airport Preference with `13:00` 只导出 layover_minutes >= 780 的 matching pairing。
  - 未勾选 slider 时不按 layover hour 过滤。
  - `event=landing_or_layover` / UI `Both` 时 landing 命中仍能进入导出结果。
  - live-server lineholder deserialization 能正确识别 contracts 里的 `locations` / `minimumLayoverDuration` payload。

### E2E / UI gate

- Playwright 覆盖 Airport Preference 配置：
  - 开关开启。
  - slider 拖动。
  - Add Bid。
  - Search Pairings / saved payload 验证。
- `npm run check:ui` 必须 0 hard violations。

### QA 人工测试

新增或更新：

```text
docs/test-cases/pbs/pairing/<YYYY-MM-DD>-airport-preference-layover-slider.md
```

至少覆盖：

- 不打开 `PREFERRED LAYOVER HOURS` 时，Search Pairings 不按 layover hours 过滤。
- 打开后默认显示配置值 `13 hours`。
- 拖动到 `16 hours` 后保存，重新编辑仍回显 `16 hours`。
- `Both` 下 landing 机场命中不被 layover hours 过滤，layover 命中才受 hours 限制。
- algorithm export 生成的 `PAIRING_SCORE.csv` 只包含命中的 pairing counter。

## 数据库与迁移

需要新增 migration / seed：

- 在 `dictionary` 下 upsert `SYS_PARAM / PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE`。
- 默认值为 `{"min":13,"max":18,"step":1,"default":13}`。
- migration 幂等。

是否立即执行 migration 需要用户单独确认。

## 风险

- Airport options response 增加字段，会影响 contract、server、portal 测试。
- 活跃 algorithm export 在 `live-server`，如果只改 `pbs-server` 会导致页面搜索正确但压缩包导出漏掉 Airport Preference。
- 旧保存的 `12:00` 等值在编辑后可能被 clamp 到配置范围内，需要测试确认。
- 旧保存的 `13:30` 等非整点值会在编辑后向上标准化为最近 step，需要在 QA 说明中明确。
- Search Pairings 和 algorithm export 都依赖同一 search condition，必须加导出回归，避免 UI 正确但 CSV 过滤不正确。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次虽然跨前端、后端、contract、SQL 和测试，但核心合同是同一个 `minimumLayoverDuration` 字段，拆多人容易在 API shape 和测试上冲突。
- Suggested split: 不拆；单 agent 先改 contract/config，再改 Portal slider，再补 `pbs-server` search 和 `live-server` export 支持，最后补测试。
- Write boundaries: `packages/contracts`、`pbs-server/src/services/pairing-search`、`live-server/src/services/pairing-search`、`live-server/src/services/algorithm-export`、`pbs-portal/src/shared/components/preferences`、`pbs-portal/src/features/pairing/components`、`sql/seed`、`sql/migration`、相关 tests/docs。
- Conflict risk: Medium。
- Execution gate: 用户确认本 spec 后再实现。
