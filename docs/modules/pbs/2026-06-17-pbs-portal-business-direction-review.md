# PBS Portal 当前业务方向审阅

> 日期：2026-06-17  
> 范围：Dashboard、Days Off、Pairing、Line、Reserve、Tier、Help  
> 目的：通过扩写 `/help` 操作手册，反向核对当前 PBS Portal 业务开发方向是否一致、可解释、可继续扩展。

## 1. 总体判断

当前方向整体是正确的：Portal 已经形成了“Dashboard review → 各 bid 页面编辑 → Tier 汇总复核”的闭环雏形。

当前最清晰的主线是：

- `Dashboard` 作为 review 起点，展示 crew/profile、bid period、calendar、entry detail。
- `Days Off`、`Pairing`、`Line`、`Reserve` 分别承担业务编辑入口。
- `Tier` 作为跨模块 review 工作台，按 `T1-T7` 汇总、检查、部分 retier/delete。
- `/help` 现在应作为用户操作手册，而不是内部设计说明。

需要注意：当前还不是完整 PBS 交付闭环，因为最终 bid submit / standing bid / admin 管理端规则同步仍未完整落地。

## 2. 已开发功能地图

| 模块 | 当前定位 | 关键 UI / 行为 |
| --- | --- | --- |
| Dashboard | Review 起点 | `BIDDING CALENDAR`、T1-T7 tier matrix、calendar entry detail、profile/bid info |
| Days Off | Date-based bid 编辑 | `EXISTING DAYS OFF PROPERTIES`、`ADD DAYS OFF PROPERTIES`、`Configure Days Off Bid` |
| Pairing | Pairing rules 主工作台 | `EXISTING PAIRING PROPERTIES`、pool counts、`VIEW RULES`、`SEARCH PAIRINGS`、Search Pairings page |
| Line | Line bid 编辑 | shared Rule Bid panel、`Configure Line Bid`、复杂 Line property dialog |
| Reserve | Reserve bid 编辑 | `Legacy Reserve` / `AA Prefer Off`、`RESERVE COVERAGE`、`ADD SHORT CALL TYPE` |
| Tier | 跨模块 review | `BID STATISTICS`、`BID REVIEW`、`BID SUMMARY`、detail dialog、`Edit Tx`、`View Pairing Set` |
| Help | 用户操作手册 | 六类 topic，不写未开发 Standing Bid 操作 |

## 3. 当前方向正确的点

- 信息架构已经按用户工作流拆分，不是按技术接口拆分：用户能从 Dashboard 开始，再进入具体 bid 页面，最后到 Tier 复核。
- `Tier / T1-T7 / Tx` 术语已经成为 Portal 当前主术语，方向上应继续统一，避免再回到旧 `Layer` 表述。
- Pairing 的方向合理：既能配置 property，又能用 pool counts 和 Search Pairings 提供“为什么这个 bid 有意义”的反馈。
- Reserve 当前用 mode toggle 区分 `Legacy Reserve` 与 `AA Prefer Off`，比把所有 reserve properties 混在一个 catalog 里更清晰。
- Tier detail 已经能够解释 review-only、unsupported、outside T1-T7、source page edit 等状态，有利于用户理解“为什么这里不能改”。
- Help 独立为最终用户手册，不混入内部技术债和未来承诺，这是正确边界。

## 4. 需要业务确认或后续规划的缺口

### 4.1 Standing Bid 未开发

当前 top nav 和 Help 不应写 Standing Bid 操作步骤。后续如果 Standing Bid 要进入 Portal，需要先明确：

- Standing Bid 与 Line/Pairing/Days Off/Reserve 的数据边界。
- Standing Bid 是否也进入 Tier summary。
- Standing Bid 是否需要独立 Help category。
- Standing Bid 是否依赖管理端 Gantt 的配置或规则数据。

### 4.2 最终提交流缺位

现有页面能编辑 current draft，也能在 Tier review，但尚未看到用户完成最终 submission 的明确入口和状态流。

建议后续确认：

- 是否需要 `Submit Bid` / `Review & Submit` 页面或动作。
- 提交后 draft 是否锁定。
- 提交失败、校验失败、重复提交如何提示。
- Dashboard / Tier 是否需要显示 submitted 状态。

### 4.3 Dashboard 的可编辑能力需要产品界定

Dashboard 当前不只是只读 review：在可编辑模式下，calendar date 可以创建 Days Off / Pairing Number 相关 action；Pairing Bid detail 也可保存 tiers。

建议产品明确：

- Dashboard 是否定位为纯 review 页，还是允许快捷编辑。
- 如果允许快捷编辑，需要 UI 上更清楚地区分 review-only entry 和 editable entry。
- Help 已按当前实现描述，但后续产品方向需要固定下来。

### 4.4 Pairing 搜索命名需继续统一

代码与 UI 当前按钮是 `SEARCH PAIRINGS`，功能含义是“按当前 active draft rules 搜索 pairings”。早期文档/测试里曾出现 `Search Current Rules` 说法。

建议：

- 用户可见 UI 统一使用 `SEARCH PAIRINGS`。
- 文档中可以解释 “searches using current active draft rules”，但不要把解释写成按钮名。

### 4.5 Shared Rule Bid 空状态有复用风险

代码中 shared `RuleBidPropertyTable` 的 available empty state 固定为：

```text
No days off properties match the current filters.
```

这在 Days Off 中正确，但 Line / Reserve 若未来显示 available list，可能出现业务文案错误。Pairing 已有独立空状态 `No pairing properties match the current filters.`。

建议后续把 shared empty state 参数化为 module-specific copy。

### 4.6 Reserve 当前隐藏 available-property 区

Reserve 的 `ADD RESERVE BID` 是页面级 add label，但当前实际入口是：

- calendar date action：`Reserve Day On` 或 `Reserve Prefer Off`
- `ADD SHORT CALL TYPE`

建议确认：

- 是否未来仍要显示普通 Reserve available catalog。
- 如果不显示，`ADD RESERVE BID` 是否还应作为 loading/add label 存在。
- 是否需要在 UI 上给用户一个更明显的“从日历添加 reserve bid”的入口说明。

## 5. 推荐优先级

| 优先级 | 建议 |
| --- | --- |
| P0 | 明确 final submission 流程，避免 edit/review 完成后没有业务终点。 |
| P1 | 继续统一 `SEARCH PAIRINGS`、`Edit Tx`、`T1-T7` 等用户可见术语。 |
| P1 | 参数化 shared Rule Bid empty state，避免 Line/Reserve 未来复用时显示 Days Off 文案。 |
| P1 | 明确 Dashboard 是 review-only 还是快捷编辑入口。 |
| P2 | Standing Bid 开发前先补独立 spec，不要直接在 Help 中预写操作。 |
| P2 | Reserve add label 与实际入口可进一步收敛，降低用户理解成本。 |

## 6. 本次 Help 扩写对业务方向的结论

本次 Help 扩写没有发现当前已开发六个模块的主方向冲突。最大风险不是现有页面方向错误，而是“编辑与 review 已经具备，但最终提交、Standing Bid、管理端配置闭环还没有被同等清晰地定义”。

下一阶段建议优先把 PBS 最终业务闭环补齐：current draft 如何提交、提交后如何锁定/回滚/重新打开、Tier review 如何进入 submit，以及管理端 Gantt 配置如何影响 Portal 可见 bid 行为。
