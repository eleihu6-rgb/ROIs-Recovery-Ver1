# PBS Line「Credit Window Preference」开发设计

## 1. 背景与依据

Jen 在 `init-docs/Bidding Options V1(2).xlsx` 的 Line 第一条中定义：

- Final Bid Option：`Credit Window Preference`
- Purpose：Crew bids for lower or higher credit.
- Required Fields / Inputs：Low credit / high credit selector, min credit, max credit
- Rules / Defaults：Low credit 不能低于 MMG；High credit 不应超过 overtime threshold，除非 open time requires it。
- Notes for Developers：Combines min credit window and max credit window.

当前系统已有两个旧 Line 条件：

- `401 Max Credit Window`
- `402 Min Credit Window`

它们目前都是 legacy `flag`，没有 `Low / High / Custom` 模式，也不能保存 min / max credit。用户已确认员工端表达应收敛为一个条件：`Low credit`、`High credit` 使用公司定义的固定窗口；只有 `Custom` 允许用户输入具体 credit range。

已确认原型：

- `.superpowers/brainstorm/credit-window-preference-20260714/credit-window-preference-v1.html`
- `docs/superpowers/specs/2026-07-14-pbs-line-credit-window-preference-prototype-design.md`

## 2. 目标与非目标

### 目标

1. 在 Line 条件中新增员工端 `Credit Window Preference`。
2. 用一个条件替代用户可见的旧 `Max Credit Window` / `Min Credit Window` 入口。
3. 支持三种模式：`Low credit`、`High credit`、`Custom`。
4. `Low credit` / `High credit` 由公司配置解析成固定 min / max credit，用户不可编辑。
5. `Custom` 展示 `Minimum credit` / `Maximum credit` 两个 `HH:MM` 输入，用户必须填写。
6. 新建时 `TIERS` 为空，至少选择一个 tier 后才能保存。
7. Current Line 页面、configured favorite、existing bid 编辑和 Standing Lineholder 同步暴露 429，并复用同一契约和同一 UI 控件。
8. Summary、导入和测试能识别新的合并条件。

### 非目标

- 不改变 `Deadhead Flying` 或其他 Line 条件。
- 不把 Low / High 的具体公司阈值硬编码在前端。
- 不在本条件中新增 Award / Avoid；Jen 的 Line row 只表达 credit target。
- 不把 `Low credit` / `High credit` 做成用户可输入的 min / max。
- 不在弹窗中加入规则解释、Rule Preview、MMG / overtime 说明段落。
- 不在未经确认的情况下执行数据清理 migration。
- 不在本轮实现 429 的 algorithm export；导出给算法的契约最后单独设计和修改。

## 3. 产品语义

### 3.1 三种模式

| Mode | UI 行为 | 保存语义 |
| --- | --- | --- |
| `low` | 显示 `Low credit` 选中态；窗口来自公司定义，不展示可编辑输入。 | 系统解析并保存公司 low window 的 min / max credit。 |
| `high` | 显示 `High credit` 选中态；窗口来自公司定义，不展示可编辑输入。 | 系统解析并保存公司 high window 的 min / max credit。 |
| `custom` | 展示 `Minimum credit` / `Maximum credit` 输入。 | 保存用户填写的 min / max credit。 |

`Low credit` / `High credit` 是公司业务定义，不是让员工填写的两个数值。正式 UI 在弹窗里只显示只读 `Company low window` / `Company high window`，不显示具体范围；具体 min / max 由服务端解析并保存。`Custom` 才显示可编辑 credit range。不应在弹窗中加入解释性段落。

### 3.2 Credit 边界

实现必须从 `dictionary` 读取以下边界，不能在前端或服务端散落业务常量：

- MMG：`Low credit` 和 `Custom.minimumCredit` 不能低于 MMG。
- Overtime threshold：`High credit` 和 `Custom.maximumCredit` 不应超过 overtime threshold。
- Company low window：`Low credit` 对应的 min / max credit。
- Company high window：`High credit` 对应的 min / max credit。

配置组固定为 `PBS_LINE_CREDIT_WINDOW_CONFIG`：

| parent_code | code | code_value |
| --- | --- | --- |
| `SYS_PARAM` | `PBS_LINE_CREDIT_WINDOW_CONFIG` | `null` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `MMG_CREDIT` | 例如 `70:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `OVERTIME_THRESHOLD` | 例如 `90:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `LOW_MIN_CREDIT` | 例如 `70:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `LOW_MAX_CREDIT` | 例如 `78:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `HIGH_MIN_CREDIT` | 例如 `82:00` |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `HIGH_MAX_CREDIT` | 例如 `90:00` |

这些数值是 seed / migration 的可改默认值，目的是让员工端功能先可用；后续管理端上线后由管理端维护这些字典项。若配置缺失或非法，编辑器显示不可保存状态，后端保存接口也必须拒绝请求。`open time requires it` 的 overtime 例外需要明确数据来源后再实现；第一阶段不在 UI 中暴露手工 override。

### 3.3 默认值

- `Preference` 默认选中 `Low credit`，与已确认原型一致。
- `TIERS` 默认空。
- `Custom` 的 `Minimum credit` / `Maximum credit` 默认空，不自动填入 MMG 或 overtime threshold。
- 切换离开 `Custom` 后，保存 payload 不提交旧的自定义输入；编辑器内部可以保留草稿以便切回来继续编辑。

## 4. UI 设计

正式 UI 必须遵守 `docs/modules/pbs/pairing-condition-ui-standard.md`。

### 4.1 弹窗结构

顺序固定为：

1. 标题：`Credit Window Preference`
2. `TIERS`
3. `PREFERENCE`
4. `WINDOW`
5. Footer：`CANCEL`、`SAVE FAVORITE`、`ADD BID` / `UPDATE BID`

### 4.2 控件映射

| 区块 | 标准组件 |
| --- | --- |
| Dialog shell | `PbsDialogFrame` |
| Tiers | `TierToggleGroup` |
| Section | `PreferenceConditionSection`、`PreferenceSectionTitle` |
| Low / High / Custom | `PreferenceSegmentedControl` |
| Custom min / max | `PreferenceNumberRange` 或同等共享 credit range primitive |
| Footer | `PairingPropertyDialogFooter` |

如果当前 Line 弹窗还没有完全迁移到这些 primitives，本条件实现只做必要范围内的迁移，不重构无关 Line 条件。

### 4.3 保存启用条件

- `Low credit` / `High credit`：至少一个 tier active，且公司窗口配置可解析。
- `Custom`：至少一个 tier active；min / max 都是合法 `HH:MM`；min <= max；min >= MMG；max <= overtime threshold。
- 加载配置或配置缺失期间，`SAVE FAVORITE` / `ADD BID` 禁用。
- 错误信息只在用户触发非法输入后显示；初始空状态不显示红色错误。

## 5. 数据契约

### 5.1 Property code

推荐新增合并属性：

```ts
pbsLineF8PropertyCodes.creditWindowPreference = 429
```

新增 `429 Credit Window Preference`，并将 `401 Max Credit Window`、`402 Min Credit Window` 从用户可见 portal catalog / recommended list 中移除或隐藏。这样不会把新语义塞进旧 flag，也能保留 legacy code 给导入、历史数据和算法对照说明使用。

备选方案是复用 `401` 并退役 `402`，但这会让 `MAX_CREDIT_WINDOW` 的历史含义变成合并条件，导出和旧数据解释风险更高。本设计不采用。

### 5.2 Bid value

新增 Line bid value type：

```ts
type PbsLineCreditWindowPreferenceBid = {
  type: "credit-window-preference";
  mode: "low" | "high" | "custom";
  minimumCredit: string;
  maximumCredit: string;
};
```

说明：

- `minimumCredit` / `maximumCredit` 使用规范化 `HH:MM`。
- `Low` / `High` 也保存解析后的实际 min / max，便于 summary、后续 algorithm export 和审计稳定。
- 前端不允许用户编辑 Low / High 的 min / max；这些值由服务端按当前 bid period 配置解析。
- 后端保存接口必须重新解析并校验 Low / High，不能信任前端提交的隐藏值。

示例：

```json
{
  "type": "credit-window-preference",
  "mode": "custom",
  "minimumCredit": "72:00",
  "maximumCredit": "84:00"
}
```

### 5.3 配置读取

新增受认证保护的轻量 API，供 Current Line、Standing Lineholder 和 favorite 编辑共用：

```ts
GET /api/line-bids/credit-window-config?periodCode=...
```

响应：

```ts
type PbsLineCreditWindowConfig =
  | { available: false }
  | {
      available: true;
      mmgCredit: string;
      overtimeThreshold: string;
      low: { minimumCredit: string; maximumCredit: string };
      high: { minimumCredit: string; maximumCredit: string };
    };
```

配置来源：

- 第一阶段读取 `dictionary` 中 `PBS_LINE_CREDIT_WINDOW_CONFIG` 父子配置项，避免在多个表之间推断业务值。
- migration / seed 写入可配置默认值；后续管理端直接维护这些字典项。
- 单元测试和 Playwright fixture 使用同一字段结构；生产可保存状态依赖这些字典字段合法可解析。

## 6. 实现范围

### 6.1 Contracts 与 catalog

- 更新 `packages/contracts/pbs-line-bids.js` / `.d.ts`：
  - 新增 `pbsLineF8PropertyCodes.creditWindowPreference = 429`。
  - 新增 `credit-window-preference` bid value type。
  - 在 supported Line catalog 中加入 `Credit Window Preference`。
  - 从用户可见推荐顺序中用 429 替换 402/401。
- 更新 `packages/contracts/pbs-standing-bids.js`：Standing Lineholder 使用 429，不再展示 401/402 作为可新增条件。

### 6.2 SQL seed 与 migration

- 在 `sql/seed/10-pbs-bid-property.sql` 中新增 429：
  - `bid_type='Line'`
  - `property_name='Credit Window Preference'`
  - `validation_json` 标识 `credit_window_preference`
  - `is_visible_in_portal=1`
  - 推荐顺序位于 Line 条件第一位。
- 将 401/402 从 portal 可新增 / 可收藏 catalog 中隐藏，但保持 legacy property metadata 可读。
- forward migration 不清理旧 401/402 数据。
- 旧 401/402 saved bid / favorite 的处理策略：
  - existing draft 中已有 401/402 时继续显示 legacy summary；
  - 用户可以删除旧 401/402；
  - 用户不能新增、编辑或重新收藏旧 401/402；
  - 旧 401/402 仍按 legacy rule 导出，直到用户删除或数据自然过期。

### 6.3 Portal

- 新增 `LineCreditWindowPreferenceControl`，只服务 429。
- `LineBidDialog` 对 429 打开专属配置 UI，不再落到通用 `PairingBidControl`。
- `CONFIGURABLE_LINE_PROPERTY_CODES` 加入 429。
- Existing property summary：
  - `Low credit`
  - `High credit`
  - `Custom credit 72:00 - 84:00`
- 429 的 favorite 保存、existing 编辑、tier 切换和 optimistic cache 继续走现有 Line draft 流程。
- 旧 401/402 existing row 只保留 legacy display 和 delete action，不打开 429 editor，也不允许从 favorite tab 重新添加。
- UI 文案使用英文。

### 6.4 PBS Server

- 新增 credit window config service / route，读取 MMG、overtime threshold、company low/high window。
- 保存 Line draft / favorite 时校验 429 payload：
  - mode 合法；
  - Low / High 按服务端配置覆盖 min / max；
  - Custom 的 min / max 合法且在边界内；
  - tier 至少一个。
- 更新 summary formatter，输出合并后的用户可读文案。
- 更新 crew bid importer：
  - `Maximum Credit Window` 映射为 429 `low`，并记录来源 warning；
  - `Minimum Credit Window` 映射为 429 `high`，并记录来源 warning；
  - 不再从新导入结果写入 401/402。

### 6.5 Algorithm export

本轮不实现 429 的 algorithm export。

- 旧 401/402 existing data 仍按 legacy rule 导出。
- 新 429 暂不进入 `LINE_RULES.csv`；导出给算法的 429 rule metadata、`Parameters_JSON`、兼容策略和测试最后单独设计。
- 本轮只要求现有 export 不因 429 数据存在而崩溃；如果当前 export 会遇到未知 Line property 报错，实施时做最小保护：跳过 429 并保留后续导出 TODO 文档，不定义算法语义。

## 7. 方案比较

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 新增 429 合并条件，隐藏 401/402 | **采用** | 语义清晰，保留 legacy code，避免把新 payload 塞进旧 flag。 |
| 复用 401 并退役 402 | 不采用 | `MAX_CREDIT_WINDOW` 历史含义会被覆盖，导出和旧数据解释风险高。 |
| 保持 401/402 两个按钮，再增加 Custom | 不采用 | 员工端仍是两个旧条件，不符合已确认的一个 `Credit Window Preference` 表达。 |

## 8. 验收标准与测试

### 自动化测试

1. Contract：429 catalog、bid value union、supported Line catalog、Standing catalog。
2. Portal Vitest：
   - 初始 `Low credit`、tiers 空、footer 禁用；
   - 选 tier 后 Low/High 可保存；
   - Custom 展开 min/max，空值、非法格式、min > max、低于 MMG、高于 overtime 均禁用；
   - 切换 Low/High/Custom 时 `aria-pressed`、视觉选中态和 payload 同步；
   - existing bid / favorite 回显三种模式。
3. Server Vitest：
   - config route 成功、配置缺失、边界非法；
   - 保存 Low/High 时由服务端解析覆盖 min/max；
   - 保存 Custom 时完整校验；
   - importer 将 `Maximum Credit Window` 映射为 `low`、`Minimum Credit Window` 映射为 `high`。
4. Export guard Vitest：如果 429 出现在 draft 中，现有 algorithm export 不崩溃；429 不导出，旧 401/402 继续 legacy export。
5. Playwright：真实 Line 页面添加 429，覆盖 Low、High、Custom 保存和回显；Standing Lineholder 同步覆盖主路径。
6. QA 文档：新增 `docs/test-cases/pbs/line/2026-07-14-credit-window-preference.md`，覆盖 Current Line、Standing Lineholder、legacy 401/402 只读显示、Low/High/Custom 三种保存路径；algorithm export QA 不在本轮。

### 交付命令

实施后最小验证顺序：

```bash
npm --prefix pbs-portal test -- line
npm --prefix pbs-server test -- line
npm --prefix pbs-server run build
npm --prefix pbs-portal run lint -- --quiet
npm --prefix pbs-portal run build
npm run check:ui
npm run verify:pbs
git diff --check
```

UI 变更必须补跑对应 Playwright。若 migration 涉及真实数据清理，必须先获得用户批准并单独列出 dry-run 结果。

## 9. 风险与实施前门槛

1. `PBS_LINE_CREDIT_WINDOW_CONFIG` 先写入 dictionary 默认值，后续由管理端维护；若业务给出更准确的 F8 数值，只需要改字典项。
2. 旧 401/402 不清理、不迁移，只保留 legacy display / delete / export；如产品要求清理，需要另开 migration 设计。
3. 429 的 algorithm export 是后续独立需求；本轮不以算法确认作为启动门槛。

## 10. Implementation Start Gates

用户批准本 spec 即代表确认以下实施策略：

- 使用新 `property_code=429`，不复用 401/402。
- Standing Lineholder 同步上 429。
- 旧 401/402 不清理、不迁移，只保留 legacy display / delete / export。
- Legacy importer 映射：`Maximum Credit Window` → `low`，`Minimum Credit Window` → `high`。

开始写代码前还必须满足一个外部 gate：

- [ ] 产品 / 业务确认或调整 `PBS_LINE_CREDIT_WINDOW_CONFIG` 字典默认值。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: Yes, after spec approval.
- Rationale: 实现会同时触达 contracts / SQL / pbs-server / pbs-portal / tests，可按边界拆分。
- Suggested split:
  - Main agent：先落 contract、property code、payload 类型和 migration skeleton，锁定共享契约。
  - Worker A：Portal 429 editor、Line page 回显、Portal Vitest。
  - Worker B：pbs-server config/validation/import 和 Server Vitest。
  - Main agent：集成、Playwright、UI standard gate、最终验证。
- Write boundaries:
  - Worker A 只写 `pbs-portal/src/features/line/**`、相关 shared UI 测试和 Playwright。
  - Worker B 只写 `pbs-server/src/**` 和 server tests；不写 algorithm export 语义。
  - Main agent 写 `packages/contracts/**`、`sql/**` 并做最终整合。
- Conflict risk: Medium；contracts 是共享依赖，必须先由 main agent 固定后再并行。
- Execution gate: 用户审阅并批准本 spec 后，才进入实施计划和代码修改。
