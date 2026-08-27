# Pairing Info 时区跟随 Toolbar Base 时区 — Design

> 2026-08-06 · gantt 前端 · Live / Scenario 共用路径

## 背景

Pairing Info 弹窗（`gantt/src/components/pairing/pairing-info-dialog.tsx`）有一个 4 档手动时区切换
（`Local` / `Airport` / `UTC` / `By DEP`），默认停在 `UTC` 档。Toolbar（Live `gantt-sub-toolbar`、
Scenario `scenario-gantt-toolbar`）上的 `TimezoneSwitcher` 会把选中的 Base 时区写入全局
`useTimezoneStore`（`timezone` = IANA zoneId，`timezoneAirport` = 机场代码）。

现状问题：即便 Toolbar 选了某个 Base（如 YVR），打开 Pairing Info 仍默认显示 UTC，不跟随。

## 目标行为

| Toolbar 时区选择 | Pairing Info 默认选中 | Airport 按钮显示 | 时刻渲染 |
|---|---|---|---|
| `UTC` | `UTC` | `Airport` | UTC |
| 某个 Base（如 `YVR`） | `Airport`（跟随 Base） | `YVR` | 按 `America/Vancouver` 换算 |
| 其他非 UTC 机场 | `Airport`（跟随） | 该机场代码 | 按该机场 zone 换算 |

「跟随」语义：

- **打开弹窗时**：默认档 = 跟随 Toolbar 当前选择（UTC → `utc`，非 UTC → `airport`）。
- **弹窗打开期间**：若用户**未手动点过**时区档，Toolbar 时区变化时 Pairing Info 实时跟随
  （`airport` 档渲染使用响应式 `displayZone`）。
- **手动覆盖**：用户手动点过 `Local`/`UTC`/`By DEP` 后，尊重手动选择，不被 Toolbar 覆盖；
  下次打开弹窗回到跟随默认。

## 实现

改动只在 `gantt/src/components/pairing/pairing-info-dialog.tsx`。

把单一 `tzMode` state 改为「手动覆盖 + 派生默认」：

```ts
const [manualTzMode, setManualTzMode] = useState<TzMode | null>(null)
useEffect(() => { if (open) setManualTzMode(null) }, [open])   // 每次打开回到跟随默认

const tzMode: TzMode = manualTzMode
  ?? (displayAirport !== 'UTC' && displayZone !== 'UTC' ? 'airport' : 'utc')
```

- 4 个时区按钮 `onClick` 由 `setTzMode(mode)` 改为 `setManualTzMode(mode)`；激活态判断仍用 `tzMode`。
- **Airport 按钮 label 无需改**：现有 `displayAirport !== 'UTC' ? displayAirport : 'Airport'` 已满足要求。
- **`airport` 档渲染逻辑无需改**：`zoneForCell` 返回 `displayZone`（Toolbar 选的 Base zone）。

## 夏令时 / 冬令时

现有换算全部走 `Intl.DateTimeFormat(..., { timeZone: zoneId })` 与 `zoneOffsetMin()`（在**具体时刻**
上求 IANA 时区偏移），天然 DST-aware，无需改代码。由测试证明（见下）。

## Live / Scenario 一致性

Pairing Info 是**同一个共享组件**（Live 与 Scenario 都打开 `PairingInfoDialog`）。Scenario 路径
`applyScenarioTimezone` 已把 scenario 保存的时区写进全局 store，故 `displayZone`/`displayAirport`
在 Scenario 中即该 scenario 的 Base。共享组件天然保证两者一致，无分叉代码。

## 测试（§Playwright-Required / §No-Illusion）

1. **Playwright（Live，非 UTC 默认跟随）**：`addInitScript` 预置 `localStorage['gantt-timezone']` 为
   `YVR`，打开 Pairing Info → 断言 `pairing-info-tz-airport` 激活（`bg-primary`）且文字为 `YVR`；
   切到 `utc` 抓基线，用 `e2e/utils/pairing-info.ts` 的 `validateTzCells` 交叉验证 airport 档时刻
   = UTC + DEP/ARR 偏移（Base 时区换算正确）。
2. **Playwright（Live，UTC 默认）**：Toolbar 为 UTC → `pairing-info-tz-utc` 激活、
   `pairing-info-tz-airport` 显示 `Airport`。
3. **Playwright（Scenario）**：复用现有 scenario 夹具，Scenario toolbar 选 Base → Pairing Info 默认跟随。
4. **DST 证明**：现有 `pairing-info-timezone.spec.ts` 的交叉校验本身 DST-aware（打印偏移来自该时刻
   真实偏移）；新增一个跨 DST 边界的断言，证明非恒定偏移换算正确。

## 成功标准

- [ ] Live：Toolbar=UTC 时打开 Pairing Info，`UTC` 档激活、Airport 按钮显示 `Airport`。
- [ ] Live：Toolbar=Base 时打开 Pairing Info，Airport 按钮（显示 Base 代码）激活，时刻按 Base 时区换算。
- [ ] 弹窗打开期间 Toolbar 时区变化，未手动点过档位时实时跟随。
- [ ] Scenario 行为与 Live 一致。
- [ ] 新增/更新 Playwright 测试全部 PASS。
