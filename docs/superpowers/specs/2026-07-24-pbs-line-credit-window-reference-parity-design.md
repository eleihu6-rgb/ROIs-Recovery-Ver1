# PBS Line「Credit Window Preference」参考项目对齐设计

## 1. 背景

当前 PBS Portal 已有 `429 Credit Window Preference`，但它提供：

- `Low credit`
- `High credit`
- `Custom`
- `minimumCredit` / `maximumCredit`

参考项目 `/Users/lei/Codehub/Flair_PBS_Optimization_Report` 的实际合同更简单：

- 组员只选择 `More credit` 或 `Less credit`。
- 调整幅度由公司统一配置，组员不能修改。
- `More credit` 导出为 `MAX_CREDIT_WINDOW`。
- `Less credit` 导出为 `MIN_CREDIT_WINDOW`。
- `Parameters_JSON` 携带统一的 `deltaHours`。

本设计取代
`docs/superpowers/specs/2026-07-14-pbs-line-credit-window-preference-design.md`
中关于 `Low / High / Custom`、固定窗口和暂不导出 429 的相关设计。`property_code=429`
继续作为 Portal 内合并后的条件身份，算法 CSV 仍使用既有的 401/402 规则身份。

## 2. 目标

1. 保留当前 PBS Portal 的弹窗框架、Tier 选择和视觉规范，只调整本条件内容。
2. 删除 `Custom`，只允许组员选择 `More credit` 或 `Less credit`。
3. 组员不能输入或修改 credit window 数值。
4. 公司统一调整幅度存入 Live schema 的 `dictionary` 表。
5. 手动添加、编辑、收藏、Standing Lineholder、TXT 批量导入使用同一 Bid 数据结构。
6. `line_rules.csv` 与参考项目的规则类型、规则 ID 和参数结构对齐。
7. Existing Bid、Search Criteria 和其他摘要位置使用同一组用户可读文案。

## 3. 非目标

- 本轮不开发 Live 管理端配置页面；只建立字典配置，后续由 Live 页面维护。
- 本轮不允许按组员、Tier 或 Bid Period 设置不同的 `deltaHours`。
- 本轮不新增 Credit Window 数值输入框。
- 本轮不修改其他 Line 条件。
- 本轮只保证 PBS 导出的 CSV 合同与参考项目一致；不把参考项目尚未接通的 solver
  行为视为本任务验收内容。
- Gantt Admin Tools 当前调用的实际批量导入与算法包导出入口位于 `live-server`；本轮以
  `live-server` 为生产权威路径。`pbs-server` 中仍存在的同合同实现必须保持编译和结果一致，
  但不得反过来成为 UI 或 Admin Tools 的新依赖。

## 4. 产品语义与 UI

### 4.1 组员可选项

| UI 选项 | 含义 | 算法规则 |
| --- | --- | --- |
| `More credit` | 目标高于组员本周期 credit target，但不超过其 credit max。 | `MAX_CREDIT_WINDOW` |
| `Less credit` | 目标低于组员本周期 credit target，但不低于其 credit min。 | `MIN_CREDIT_WINDOW` |

删除 `Custom` 以及 `Minimum credit` / `Maximum credit` 输入。

新建条件默认选择 `More credit`；Tier 仍按当前规则由组员选择，至少选择一个 Tier
才能保存。

### 4.2 提示文案

弹窗沿用当前 PBS Portal UI，只在选项下方增加只读说明：

- `More credit`：
  `Aims for up to {N}h above the crew's period credit target, capped at their credit max.`
- `Less credit`：
  `Aims for up to {N}h below the crew's period credit target, floored at their credit min.`
- 两种方向共同显示：
  `The ±{N}h credit-window adjustment is company-defined.`

`{N}` 来自后端读取的字典配置。组员端没有修改入口。

### 4.3 摘要文案

以下位置统一显示方向，不显示内部 JSON：

- Existing Bid Properties
- Search Criteria
- 收藏条件
- Standing Lineholder

摘要分别为：

- `More credit`
- `Less credit`

## 5. 字典配置

### 5.1 存储位置

使用 Live schema 的现有 `dictionary` 表，在已有父配置下新增：

| parent_code | code | name | code_value |
| --- | --- | --- | --- |
| `PBS_LINE_CREDIT_WINDOW_CONFIG` | `DELTA_HOURS` | `Credit window adjustment hours` | `5` |

`dictionary` 是项目统一的系统参数和枚举配置表；PBS Server 已经从
`f8.dictionary` 读取 `PBS_LINE_CREDIT_WINDOW_CONFIG`，因此不新增表，也不把该值写进
Crew Bid。

### 5.2 校验与生效方式

- `DELTA_HOURS` 必须是 `1..20` 的整数，与参考项目范围一致。
- 缺失或非法时，Credit Window 弹窗显示配置不可用，保存接口拒绝新增或更新。
- PBS Server 不信任前端提交的任何 `deltaHours`。
- Live 管理端后续修改字典值后，新生成的 `line_rules.csv` 使用新值。
- 该配置当前为 F8 公司级全局值，不区分 Bid Period。
- 已保存的 Crew Bid 只保存方向，因此修改字典不会改写 Bid；重新导出时使用最新公司配置。

### 5.3 PBS 配置 API

保留现有受认证路由：

```text
GET /api/line-bids/credit-window-config
```

共享 contract 改为：

```ts
type PbsLineCreditWindowConfig =
  | {
      available: true;
      deltaHours: number;
    }
  | {
      available: false;
    };
```

- `packages/contracts` 定义唯一响应类型。
- `pbs-server` route/service 从 `f8.dictionary` 读取、解析并返回该结构。
- `pbs-portal` 只消费 `available` 和 `deltaHours`，不再接收旧 MMG、overtime、
  low/high range。
- `available: false` 时 Portal 禁止保存 429，并展示配置不可用状态。

### 5.4 旧字典字段

旧配置项：

- `MMG_CREDIT`
- `OVERTIME_THRESHOLD`
- `LOW_MIN_CREDIT`
- `LOW_MAX_CREDIT`
- `HIGH_MIN_CREDIT`
- `HIGH_MAX_CREDIT`

在新合同中不再参与 Credit Window Preference。迁移删除这些已无消费者的子项，保留父配置
`PBS_LINE_CREDIT_WINDOW_CONFIG`，并新增 `DELTA_HOURS`。Seed 与 migration 均保持幂等。

## 6. Bid 数据合同

### 6.1 Portal 内部身份

继续使用：

```ts
pbsLineF8PropertyCodes.creditWindowPreference = 429
```

429 是 Portal 中面向组员的合并条件。401/402 不重新暴露为两个可添加条件。

### 6.2 Bid value

统一改为：

```ts
type PbsLineCreditWindowPreferenceBid = {
  type: "credit-window-preference";
  direction: "more" | "less";
};
```

Bid 中不保存：

- `deltaHours`
- `minimumCredit`
- `maximumCredit`
- 公司 credit min / max

手动填写、编辑、favorite、Standing Lineholder 和 TXT 导入都必须生成上述同一结构。

### 6.3 当前开发数据迁移

项目尚未上线，不继续兼容旧 payload。迁移规则为：

- `pbs_bid_group.param_a` 内 `mode: "high"` → 新
  `{ type: "credit-window-preference", direction: "more" }`。
- `pbs_bid_group.param_a` 内 `mode: "low"` → 新
  `{ type: "credit-window-preference", direction: "less" }`。
- `pbs_bid_line_favorite.bid_payload` 使用相同的 high/low 转换。
- `mode: "custom"` 无法无损表达：
  - 对 Current 与 Standing `pbs_bid`，只删除 `property_code=429` 且属于同一
    `property_group_key` 的 `pbs_bid_group`；依赖的 condition row 由该 group 的
    `ON DELETE CASCADE` 清理。
  - 只删除 `property_code=429` 且 payload 为 custom 的
    `pbs_bid_line_favorite` 行。
  - 不删除整个 `pbs_bid`、`pbs_bid_tier`、其他 property group、普通的 429 property
    收藏入口或其他条件。
  - 删除后重新计算受影响 Tier 内剩余 group 的 `group_seq`；Tier 即使变空也继续保留，
    与当前允许空 Tier 的行为一致。
  - 同步把受影响 `pbs_bid_tier.total_groups` 重算为该 Tier 的实际剩余 group 数；空 Tier
    写为 `0`，不得留下与 `pbs_bid_group` 数量不一致的汇总值。
- 迁移后不保留 `minimumCredit` / `maximumCredit`。

迁移只能处理 `property_code=429`，不得清理其他条件。

## 7. TXT 批量导入

Legacy NPBS 条件统一映射为：

| 源条件 | 429 Bid value |
| --- | --- |
| `Maximum Credit Window` | `{ type: "credit-window-preference", direction: "more" }` |
| `Minimum Credit Window` | `{ type: "credit-window-preference", direction: "less" }` |

导入器不写 `deltaHours`，也不从源文本推断自定义上下限。所有导入和手动填写的数据结构一致。

Gantt Admin Tools 当前使用 `live-server/src/services/crew-bid-import/**`，因此它是本轮
导入实现和回归测试的权威路径。`pbs-server/src/services/crew-bid-import/**` 保持相同映射，
避免两个仍可调用的后端入口产生不同数据。

## 8. `line_rules.csv` 合同

### 8.1 More credit

```text
Code_ID=401
Rule_ID=401
Rule_Type=MAX_CREDIT_WINDOW
Parameters_JSON={"deltaHours":N}
```

### 8.2 Less credit

```text
Code_ID=402
Rule_ID=402
Rule_Type=MIN_CREDIT_WINDOW
Parameters_JSON={"deltaHours":N}
```

其中 `N` 在每次导出时由实际导出服务从
`dictionary.PBS_LINE_CREDIT_WINDOW_CONFIG / DELTA_HOURS` 读取。

Portal 的 `property_code=429` 不直接写入 CSV 的 `Code_ID` / `Rule_ID`。它先根据
`direction` 转换为算法已识别的 401 或 402。Tier、Crew ID、日期范围和其他 CSV 字段继续走
现有 Line export 流程。

CSV metadata 中 401/402 的参数说明同步由空对象 `{}` 更新为
`{"deltaHours": integer}`。

Gantt Admin Tools 下载算法包时走
`live-server/src/services/algorithm-export/**`，因此 429→401/402 转换、字典读取、
metadata 和 CSV 测试以 `live-server` 为生产权威实现。`pbs-server` 中保留的旧导出入口同步
同一合同和 focused tests，防止直接调用旧 route 时生成不同 CSV；不新增第三套转换逻辑，
共享 contract 和相同 fixture 作为一致性门禁。

## 9. 服务端校验与错误处理

- 保存 429 时只接受 `direction: "more" | "less"`。
- 出现 `custom`、旧 `mode`、min/max 字段或前端提交的 `deltaHours` 时返回 400。
- 只有待导出的 scope 实际包含 429 时，导出才读取并校验 `DELTA_HOURS`。
- 待导出数据包含 429 且配置不可用时，本次导出明确失败并返回可读错误，不静默跳过
  Credit Window 条件。
- 待导出数据不包含 429 时，即使 `DELTA_HOURS` 缺失，其他 Line 条件仍正常导出。
- 出错必须发生在写出压缩包之前，不能产生缺少 429 的“部分成功”算法包。

## 10. 验收标准

1. 弹窗只显示 `More credit`、`Less credit`，不显示 `Custom` 或数值输入框。
2. 提示文案展示当前公司配置的 `{N}h`，组员不能修改。
3. 手动添加、编辑、favorite、Standing Lineholder 和 TXT 导入都保存
   `{ type, direction }`。
4. Existing Bid Properties 与 Search Criteria 对同一 429 显示相同摘要。
5. `More credit` 导出 401 / `MAX_CREDIT_WINDOW` / `{"deltaHours":N}`。
6. `Less credit` 导出 402 / `MIN_CREDIT_WINDOW` / `{"deltaHours":N}`。
7. 非法或缺失的 `DELTA_HOURS` 会阻止保存和导出，不产生静默错误。
8. 旧 `high/low` 开发数据完成方向迁移，旧 `custom` 仅删除 429 相关数据。
9. 其他 Days Off、Pairing 和 Line 条件行为不变。

## 11. 测试与验证

### 自动化

- Contracts / Server Vitest：
  - 新 Bid union 只接受 `direction`。
  - 字典读取、`1..20` 边界、缺失和非法配置。
  - high/low 数据迁移与 custom 定向清理。
  - custom 清理后 `group_seq` 连续、`pbs_bid_tier.total_groups` 与实际 group 数一致，
    空 Tier 为 `0`，其他 property group 与整个 Bid 保留。
  - `live-server` 权威 TXT importer 的 Maximum/Minimum 映射，以及 `pbs-server`
    同合同映射。
  - `live-server` 权威导出的 429 到 401/402 转换和 `deltaHours`，以及
    `pbs-server` 同合同导出。
  - 配置非法时导出失败而不是静默跳过。
  - 无 429 时不读取/不要求 Credit Window 配置。
- Portal Vitest：
  - More/Less 两个选项、默认 More、删除 Custom。
  - 提示文案和只读 `{N}h`。
  - 新增、编辑、summary、favorite 和 Standing 回显。
- Playwright：
  - 在真实 Bid → Line 页面新增 More credit 并验证 Existing。
  - 编辑为 Less credit并验证 Existing。
  - 验证页面不存在 Custom 和数值输入。
- QA 文档：
  - 更新 `docs/test-cases/pbs/line/` 下 Credit Window 用例。
  - 加入 CSV 样例核对步骤。

### 必跑命令

```bash
npm --prefix live-server test -- <focused credit-window/export/import tests>
npm --prefix pbs-server test -- <focused credit-window/export/import tests>
npm --prefix pbs-portal test -- <focused credit-window/summary tests>
npm --prefix live-server run build
npm --prefix pbs-server run build
npm --prefix pbs-portal run build
npm run check:ui
npx playwright test <focused Credit Window spec>
git diff --check
```

涉及 migration 时，还需对授权目标库执行 dry-run/结果核对；数据库执行范围在实施前单独确认。

## 12. 方案比较

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 429 保存方向，导出时转换为 401/402，并从字典读取 `DELTA_HOURS` | **采用** | 与组员 UI、参考 CSV 和公司统一配置三者同时对齐。 |
| 保留现有 low/high/custom payload，只在导出层转换 | 不采用 | 手动填写、导入和参考数据结构仍不一致，继续保留无业务用途的 Custom。 |
| 仅调整 UI，不改保存和 CSV | 不采用 | 表面一致但算法合同仍错误，无法满足本需求。 |

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No.
- Rationale: Contract、Portal 控件、导入器和 CSV 转换都围绕同一个紧密耦合的
  `credit-window-preference` payload；并行编辑容易造成中间合同不一致。
- Suggested split: 主 agent 按 contract → server → portal → migration → tests 的顺序完成。
- Write boundaries: 单 agent 负责所有业务代码；spec reviewer 只审阅文档，不写实现。
- Conflict risk: 多 agent 同时修改 contracts、summary 和测试的冲突风险高。
- Execution gate: 本 spec 经审阅且用户明确批准后，才编写实施计划并修改代码。
