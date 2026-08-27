# PBS Line Most Flying In Least Working Days 无参数条件设计

日期：2026-06-25  
状态：已确认，进入实现
范围：PBS Line 新增一个无参数 `Most Flying In Least Working Days` 条件，并与现有参数型 `409 Most Flying In Least Working Days (Configured)` 并存。

## 2026-06-25 命名修订

用户确认最终产品文案使用 `Most Flying In Least Working Days`，以贴合 ticket 中 “Most flying out of least of working days” 的业务表述。此前短名 `Most Flying In Least Days` 只作为导入兼容文本保留，不再作为 Portal 主显示名。

本次修订只改命名一致性：

- 新无参数 flag 条件 `428` 显示为 `Most Flying In Least Working Days`。
- 旧参数型条件 `409` 显示为 `Most Flying In Least Working Days (Configured)`。
- 导入 mapper 同时兼容旧文本 `Most Flying In Least Days` 和新文本 `Most Flying In Least Working Days`，均映射到新 `428`。
- 条件语义、property code、bid shape、算法职责不变。

## 背景

系统中已经存在 `409 Most Flying In Least Working Days (Configured)`，当前是参数型 Line 条件：

```json
{
  "type": "credit-density-preference",
  "minimumTotalCredit": "75:00",
  "maximumWorkingDays": 15,
  "strength": "strong"
}
```

用户这次需要的是另一种语义：像 `Max Credit Window` 一样的无参数开关条件。用户只表达 intent：

```text
Most Flying In Least Working Days
```

具体如何在算法里权衡 flying hours 与 flying days，不由 Portal 暴露参数控制，交给算法侧解释。

## 目标

1. 新增一个全新的 Line 条件，显示名为 `Most Flying In Least Working Days`。
2. 新条件使用 `flag` bid，无参数，点击即可加入对应 Tx。
3. 现有 `409 Most Flying In Least Working Days (Configured)` 参数型条件继续保留，不删除历史能力。
4. 为避免 UI 混淆，旧参数型条件显示为 `Most Flying In Least Working Days (Configured)`。
5. Crew bid 导入遇到 legacy 文本时，映射到新的无参数 flag 条件。
6. 算法导出能区分旧参数型规则和新无参数规则。

## 非目标

- 不删除旧 `409` 已保存 bid。
- 不迁移旧 `409` 数据到新条件。
- 不实现算法侧具体 award/optimizer 逻辑。
- 不改变 `Max Credit Window`、`Min Credit Window` 等既有 Line flag 行为。

## 条件设计

新增 Line property：

```text
428 Most Flying In Least Working Days
```

建议使用 `428`，因为 Line AA property 当前已使用到 `427 Reserve`，新条件可顺延，避免复用旧 `409` 的参数结构。

新条件 bid value：

```json
{
  "type": "flag"
}
```

旧条件保留：

```text
409 Most Flying In Least Working Days (Configured)
```

旧条件仍使用 `credit-density-preference`，保留配置弹窗、收藏、校验和历史 draft 读取能力。

## UI 语义

Line 页面：

- `ADD LINE PROPERTIES` 中显示两个可区分条件：
  - `Most Flying In Least Working Days`：新无参数 flag，点击 `+` 直接加入。
  - `Most Flying In Least Working Days (Configured)`：旧参数型条件，点击 `+` 打开配置弹窗。
- Existing row 中：
  - 新条件显示简短 flag 文案，例如 `Enabled` 或 `--`，行为对齐 `Max Credit Window`。
  - 旧条件继续显示参数摘要，例如 `78:00 credit / 14 days / strong`。
- 搜索 `Most Flying` 应能找到两个条件。

## 导入语义

Crew bid import mapper 应识别以下文本，映射到新无参数 Line 条件：

```text
Set Condition Most Flying In Least Days
Set Condition Most Flying In The Least Days
Set Condition Most Flying In Least Amount Of Days
Set Condition Most Flying In The Least Amount Of Days
Set Condition Most Flying In Least Working Days
Set Condition Most Flying Hours In Least Working Day
Set Condition Most Flying Hours In Least Flying Day
```

导入结果：

```json
{
  "bidType": "Line",
  "propertyCode": 428,
  "bid": { "type": "flag" }
}
```

如果未来出现带参数的 legacy 文本，再单独评估是否映射到旧 `409`；本次不引入猜测型参数解析。

## 算法导出

算法导出需要同时支持：

| Property | Rule_ID | Rule_Type | Parameters_JSON |
| --- | ---: | --- | --- |
| `Most Flying In Least Working Days (Configured)` | 409 | `MOST_FLYING_IN_LEAST_WORKING_DAYS_CONFIGURED` 或保留现有 type | 包含 `minimumTotalCredit`、`maximumWorkingDays`、`strength` |
| `Most Flying In Least Working Days` | 428 | `MOST_FLYING_IN_LEAST_WORKING_DAYS` | `{}` 或 flag 语义 |

具体 `Rule_Type` 命名以现有导出约定为准，但必须保证 409 和 428 不混淆。

## 数据库与配置

需要检查并更新：

- `packages/contracts/pbs-line-bids.*`
- `sql/seed/10-pbs-bid-property.sql`
- 必要时新增幂等 migration，让已有环境拿到 `428`。
- Portal 使用的 Line property catalog / bootstrap 数据。

旧 `409` 不下线，只改展示名或 catalog name，以便用户区分。

## 测试范围

后端：

1. Line validation 接受 `428` + `flag`。
2. Line validation 仍接受 `409` + `credit-density-preference`。
3. 导入 mapper 将 `Set Condition Most Flying In Least Days` 与 `Set Condition Most Flying In Least Working Days` 映射到 `428`。
4. 算法导出分别输出 `409` 参数型与 `428` flag 型。

前端：

1. Line available list 同时显示两个条件。
2. 新 `Most Flying In Least Working Days` 点击 `+` 直接保存，不打开配置弹窗。
3. 旧 `Most Flying In Least Working Days (Configured)` 仍打开配置弹窗。
4. Existing row 能区分新旧条件显示。

E2E / Playwright：

1. 在 Line 页面搜索 `Most Flying`。
2. 点击新无参数条件并保存到 T1。
3. 验证 Existing list 中出现新条件。
4. 如导入文件中出现该文本，补充导入 dry-run 或真实录入回归。

## 验收标准

1. 用户能在 Line 页面添加无参数 `Most Flying In Least Working Days`。
2. 添加新条件时不会弹出旧参数配置弹窗。
3. 旧参数型条件仍可用，并显示为 `Most Flying In Least Working Days (Configured)`。
4. 导入 legacy 文本时使用新 `428`，不是旧 `409`。
5. 算法导出能区分两个条件。
6. 不影响已有 Line flag 条件和 `409` 历史数据读取。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动跨 contracts、seed/migration、server、portal、import、export 和测试，但核心是同一条 property contract，拆开容易出现 property code / name / bid type 不一致。
- Suggested split: 暂不拆分。
- Write boundaries: `packages/contracts/pbs-line-bids.*`、`sql/seed/10-pbs-bid-property.sql`、必要 migration、`pbs-server` 与 `live-server` 的 import/export/lineholder 相关文件、`pbs-portal/src/features/line/*`、E2E 和测试文档。
- Conflict risk: Medium。旧 `409` 已经被多个模块使用，新 `428` 必须明确区分，避免算法导出或 UI 搜索混淆。
- Execution gate: 用户 review 本 spec 并确认后，再进入实现。
