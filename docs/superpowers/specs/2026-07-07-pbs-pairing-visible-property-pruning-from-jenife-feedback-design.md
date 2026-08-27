# PBS Pairing 可见属性删减留痕（Jenife 反馈）

日期：2026-07-07
状态：待确认，未实施
来源文件：`/Users/lei/Downloads/Jenife_Bidding_Type_Clarification_20260707.docx`

## 背景

Jenife 在反馈文件中希望把 PBS Portal 的 bidding options 合并到更少、更容易理解的选项。Days Off 已先按该方向收窄；本文件记录 Pairing tab 中她明确表达为 `remove`、`turn off`、`can be removed` 的条件，作为后续数据库可见性调整的依据。

本次“删掉”不表示物理删除数据库行，也不删除历史 bid 数据。建议沿用 Days Off 的做法：只把 `pbs_bid_property.is_visible_in_portal` 置为 `0`，让 Portal 的 Add Properties 不再显示这些条件；后端内部 `catalogByCode` 仍保留 active supported property，以便历史 draft、import、existing bid 和算法导出继续解析。

## 目标

- 按 Jenife 文件中明确 remove 的 Pairing 条件，先隐藏无争议项。
- 不做合并后的新交互，不改 property 表单结构。
- 不改旧 bid / favorite / import 数据。
- 为后续第二阶段“改名、合并、增强表单能力”留下清晰边界。

## 明确隐藏范围

以下 Pairing property 在 Jenife 文件中被明确要求 remove / turn off / can be removed，建议第一批设置 `is_visible_in_portal=0`：

| property_code | 当前名称 | Jenife 反馈摘要 | 处理 |
|---:|---|---|---|
| 104 | Any/Every Layover In Airport | 合并进 Airport Preference | 隐藏 |
| 105 | Pairing Total Credit | “remove this” | 隐藏 |
| 108 | Total Legs In Pairing | 用 Flight Legs per Duty 覆盖 | 隐藏 |
| 109 | Average Daily Credit | 等同 most flying in least days | 隐藏 |
| 113 | TAFB | 与 most flying in least days / pairing length 重叠 | 隐藏 |
| 114 | Any/Every Enroute Check-In Time | enroute check-in/out 类先 remove | 隐藏 |
| 115 | Any/Every Leg With Employee Number | HR 场景复杂，先 turn off / remove | 隐藏 |
| 119 | Any/Every Layover Duration | 合并进 Airport Preference | 隐藏 |
| 120 | Any Duty On Time | “can be removed” | 隐藏 |
| 121 | Average Daily Block Time | 等同 most flying in least days | 隐藏 |
| 124 | Total Legs In First Duty | 用 Flight Legs per Duty 覆盖 | 隐藏 |
| 125 | Credit Per Time Away From Base | remove，语义仍是 most/least flying | 隐藏 |
| 126 | Any/Every Enroute Check-Out Time | enroute check-in/out 类先 remove | 隐藏 |
| 127 | Pairing Total Block Time | 与 average block / most in least 重叠 | 隐藏 |
| 130 | Total Legs In Last Duty | 用 Flight Legs per Duty 覆盖 | 隐藏 |
| 165 | Work Start Station | 用户不能 bid base 外站点 | 隐藏 |
| 166 | Any/Every Enroute Check-In Date / Day | 过于复杂，可删除 | 隐藏 |
| 167 | Any/Every Enroute Check-Out Date / Day | 过于复杂，可删除 | 隐藏 |

## 暂不隐藏范围

以下 property 在反馈中不是简单删除，而是要求改名、合并或增强能力；本阶段先不动，后续单独设计：

| property_code | 当前名称 | 后续方向 |
|---:|---|---|
| 101 | Any Landing In Airport | 合并为 Airport Preference，可选 landing / overnight / both |
| 102 | Pairing Number | 改名 Pairing Preference，增加日期范围、min/max |
| 103 | Pairing Check-In Time | 与 Check-Out 合并为 Pairing Check-In/Check-Out Time |
| 107 | Any/Every Duty Legs | 改名 Flight Legs per Duty |
| 110 | Any/Every Duty On Date / Day | 改名 Work day preference |
| 111 | Pairing Check-Out Time | 与 Check-In 合并 |
| 112 | Pairing Length | 保留，并考虑增加 date range |
| 116 | Any Flight Number | 改名 Flight number preference |
| 117 | Any Leg Is Redeye | 改名 Redeye，并显示 red-eye 定义 |
| 118 | Any/Every Duty Duration | 保留，考虑增加 specific date / date range |
| 122 | Deadhead Legs | 与 Deadhead Day 合并为 Deadhead flying |
| 123 | Any/Every Layover On Date / Day | 需要随 Airport Preference 合并方案再判断 |
| 128 | Deadhead Day | 与 Deadhead Legs 合并为 Deadhead flying |
| 129 | Any/Every Sit Length | 改名 Time between Flights |
| 163 | Carry-Out Days | 改名 Month End Carryover，范围限制 1-5 |
| 164 | Departure Time | 文件倾向 Check-In Time 和 Departure Time 二选一，但不是明确 remove；先不动 |

## 实施方案

推荐沿用 Days Off 可见性开关方案：

1. 新增 migration，把上述明确隐藏的 property 设置为 `is_visible_in_portal=0`。
2. 更新 `sql/seed/10-pbs-bid-property.sql`，确保新初始化环境默认也隐藏这些 Pairing property。
3. 不修改 `packages/contracts/pbs-pairing-bids.js`，因为隐藏 property 仍需被后端支持，用于历史数据解析。
4. 不修改前端硬编码。PBS Portal Add Properties 已从后端 `propertyCatalog` 派生，后端 catalog 已由 `pbs_bid_property.is_visible_in_portal` 控制。
5. 如当前环境已有 Redis catalog cache，实施后清理 Pairing property catalog 相关缓存或重启 `pbs-server`。

## 验收标准

- Pairing Add Properties 不再显示明确隐藏范围中的 18 个 property。
- 暂不隐藏范围中的 property 仍可见。
- 已保存 / 已导入的历史 Pairing bid 若包含隐藏 property，仍可在现有 bid 展示或解析链路中处理，不因 catalog 隐藏而报 unsupported。
- Search Pairings / Pairing 主页面共用同一后端 visible catalog，不出现某个入口仍显示隐藏 property 的分叉。

## 建议验证

自动化验证：

- `pbs-server` focused tests：Pairing current draft / catalog route 返回的 `propertyCatalog` 不含隐藏 property。
- `pbs-portal` focused tests：Pairing Add Properties 列表和搜索不显示隐藏 property。

人工 QA：

- 登录 PBS Portal，进入 Pairing。
- 打开 Add Properties。
- 搜索 `TAFB`、`Work Start Station`、`Enroute Check-In`、`Pairing Total Credit`，应无结果。
- 搜索 `Pairing Number`、`Check-In Time`、`Flight Number`、`Carry-Out Days`，应仍可找到。

## 非目标

- 本阶段不做 property 改名。
- 本阶段不做合并表单，如 Airport Preference / Deadhead flying / Pairing Check-In/Check-Out Time。
- 本阶段不改变算法语义。
- 本阶段不删除数据库中的 `pbs_bid_property` 行。
- 本阶段不清理历史 bid 数据。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 主要是 SQL migration、seed 和测试/QA 文档，范围小，单线程更稳。
- Suggested split: 不拆分。
- Write boundaries: `sql/migration`、`sql/seed/10-pbs-bid-property.sql`、`docs/test-cases/pbs/pairing`。
- Conflict risk: 低；但需要避免误动后续改名/合并设计。
- Execution gate: 用户确认本文隐藏范围后再实施。
