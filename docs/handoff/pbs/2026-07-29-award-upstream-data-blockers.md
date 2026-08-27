# PBS Award 上游数据阻塞与后续开发交接

> 日期：2026-07-29
> 状态：留痕 / 待上游数据
> 目的：记录 Award 第一阶段剩余的数据阻塞，后续拿到真实数据后可直接继续开发。

## 1. 当前结论

Award 第一阶段的页面、接口和已具备数据的展示基本完成。当前剩余事项不是普通前端缺字段，而是上游尚未提供可靠的业务结果，或发布快照还没有合适的承载字段。

已完成并可继续保留的能力包括：

- Award 月历、Roster Details、Selected Duty、Reason Report 页面框架。
- Pairing、Day Off、ILL、VAC、CGS、CBT 等已发布项目展示；没有的数据不列出。
- Credit、Block、Fleet、Position、TAFB、Legs 等已具备数据的字段展示。
- `Missing data`、`null`、`undefined` 等占位内容清理。
- 小屏高度下 Selected Duty 与 Reason Report 重叠问题修复。
- Award 运行时只读取已发布快照的边界。

## 2. 数据边界

Award 页面运行时只读取 `roster_publish`，不临时关联以下数据源补值：

- Scenario 表；
- Live `roster_flight`；
- `pairing` / `pairing_segment`；
- Engine 输出目录或 CSV；
- 未发布的计算结果表。

正确链路应为：

```text
权威上游结果
  → Scenario / Live 中间流程
  → Live 发布
  → roster_publish 发布快照
  → pbs-server Award API
  → pbs-portal Award 页面
```

这样可以保证页面展示的是同一次发布的完整快照，出现问题时也能按发布数据追查。

## 3. 阻塞项总览

| 阻塞项 | 业务粒度 | 当前缺少内容 | 后续展示位置 |
|---|---|---|---|
| Award Tier | Crew + Roster Period | 算法最终 Tier 的稳定输出及发布写入 | Award Summary |
| 获得原因 | Crew + 获得的 Pairing | 算法实际原因数据 | Selected Duty / Reason Report |
| 未获得原因 | Crew + 未获得的候选 Pairing | 原因数据，同时缺少发布快照承载方案 | Reason Report |
| Pairing Priority | Crew + 获得的 Pairing | 明确的 `P1–P7` / `PN` / `CN` 输出及发布字段 | Roster Details / Selected Duty |
| PRM | Crew + Roster Period，或可汇总的明细 | 权威国际 Premium 分钟 | Award Summary |

## 4. Award Tier

### 含义

Award Tier 是某位 Crew 在整个 Roster Period 的最终满足层级。Tier 越小，代表越接近其高优先级 Bid。

### 当前情况

- `pbs_award_result.awarded_tier` 字段已经存在，接口代码也能读取它。
- 当前代码库中没有发现可靠的算法或应用写入链路。
- `pbs_award_item.matched_tier` 是单个获奖项目的匹配 Tier，不能替代整月最终 `awarded_tier`。
- 不能从 `comments` 或页面结果反推最终 Tier。

### 期望的上游最小数据

```text
crew_id
period_code（或 roster_period_id）
awarded_tier
```

必须由算法同事确认：

- `awarded_tier` 是整月最终 Tier，而不是单个 Pairing Tier；
- 唯一键和空值规则；
- 同一 Crew、同一 Period 是否只输出一条。

### 发布快照问题

`awarded_tier` 是 Crew + Period 粒度，而 `roster_publish` 是排班明细粒度。如果直接新增 `roster_publish.award_tier`，同一个值会在多行重复。

为了坚持 Award 只读 `roster_publish`，后续需要在 Spec 中明确选择：

1. 在每条已发布排班行重复保存同一个 `award_tier`；或
2. 增加同属发布快照的 Crew + Period 汇总结构。

拿到真实输出前，不执行 Schema 变更。

### 解锁条件

- 获得一份真实算法输出样本；
- 明确字段定义、粒度、唯一键和空值规则；
- 确认发布快照承载方式；
- 补齐发布写入、API、页面和测试。

## 5. 获得原因与未获得原因

### 当前已具备的下游能力

- Scenario `roster_flight.comments` 可导入 Live。
- Live `roster_flight.comments` 可在发布时写入 `roster_publish.comments`。
- Award API 已支持解析受控格式 `PBS_AWARD_V1|...`。
- Selected Duty 和 Reason Report 已能消费符合要求的“获得原因”。
- 只有来源可追踪且同一 Pairing 各 Segment 内容一致的说明才会展示。

### 获得原因

获得原因可以附着到实际获得的 Pairing，并随该 Pairing 的发布行进入 `roster_publish.comments`。

建议算法结果至少包含：

```text
crew_id
period_code
result_type = awarded
pairing_id
bid_tier
reason_code（如有）
reason_text
```

### 未获得原因

未获得的 Pairing 不会形成 `roster_publish` 排班行，因此当前 `roster_publish.comments` 没有自然的挂载位置。这不是单纯增加解析代码即可解决的问题。

后续必须先明确一种“已发布结果快照”承载方式，使未获得原因也属于同一次发布，并且 Award 页面仍然只读取发布快照。拿到真实算法输出后再单独写 Spec 决定，不能临时运行时读取 Engine CSV。

### 输出安全要求

面向 Crew 的原因只能包含可解释的业务结论，不应暴露：

- 其他 Crew 的身份或 Bid；
- Solver 内部迭代、评分明细或调试信息；
- 原始异常、路径、SQL 或内部系统字段；
- 尚未发布的结果。

### 解锁条件

- 算法提供真实的 `bid_explanation_report.csv` 或替代格式样本；
- 确认文件格式已稳定，而不是临时版本；
- 明确获得与未获得原因的粒度、关联键和重复规则；
- 明确未获得原因的发布快照存储方案。

## 6. Pairing Priority：P1–P7 / PN / CN

### 含义

- `P1–P7`：Pairing 来自 Crew 对应的 Bid Tier / Priority。
- `PN`：Pairing None / open-time fallback。
- `CN`：Coverage Needed / 为满足覆盖需要而分配。

### 当前情况

- 接口契约已有 `matchedTier` 和 `awardPriority`。
- `matchedTier` 与 `awardPriority` 不是同一个概念：
  - `matchedTier` 表示匹配到的 Bid Tier；
  - `awardPriority` 表示最终分配来源，除 `P1–P7` 外还包括 `PN`、`CN`。
- 当前 `awardPriority` 固定为空。
- `pbs_award_item.matched_tier` 存在，但没有发现可靠的上游写入链路。
- `PN`、`CN` 必须由算法明确输出，不能根据“没有 Tier”或原因文本猜测。

### 期望的上游最小数据

```text
crew_id
period_code
pairing_id
award_priority（P1–P7、PN、CN）
matched_tier（如适用）
```

同一 Pairing 有多个 Segment 时，优先级必须保持一致。

### 后续发布方式

为了维持 publish-only 边界，预计需要在 `roster_publish` 增加 Pairing 级发布字段，并在同一 Pairing 的各 Segment 上重复保存；最终字段设计需在真实输出稳定后通过 Spec 确认。

### 解锁条件

- 算法明确输出 `P1–P7`、`PN`、`CN`；
- 提供生成规则和真实样本；
- 确认字段写入及多 Segment 一致性规则；
- 完成 Migration、发布链路、API、UI 和测试。

## 7. PRM

### 含义

AA 参考文档中的 PRM 是 Bid Month 内的国际 Premium Pay 总量，包含 IPD / NIPD 国际 Premium，不等同于普通 Block、Credit 或 Per Diem。

### 当前情况

- Award API 已预留 `premiumMinutes`，Portal 在值为空时不展示 PRM。
- 服务端目前返回 `premiumMinutes: null`。
- `roster_publish` 已有 `act_lh_per_diem_mins`、`sch_lh_per_diem_mins` 等字段，但开发、SIT、UAT 的现有发布数据没有可用值。
- Airport 的国内/国际标记只能说明航段可能涉及国际运行，不能计算 Premium 分钟，也不能准确区分 IPD / NIPD 计薪规则。

### 禁止替代计算

不能直接用以下数据代替 PRM：

- 国际航段的 Block；
- Duty Credit；
- Route 时长；
- 机场国内/国际标记；
- Long-haul Per Diem 字段名称本身，而没有业务方确认其语义。

### 需要上游确认

PRM 的权威来源可能是 Payroll、Operations 或算法结果。需要明确：

```text
crew_id
period_code
premium_minutes
premium_type（如需区分 IPD / NIPD）
```

如果提供的是 Duty / Pairing / Segment 明细，还必须说明如何去重和汇总。

### 解锁条件

- 确认 PRM 的业务 Owner 和权威来源；
- 确认单位为分钟及汇总规则；
- 获得至少一个 Period 的真实数据样本；
- 将权威结果写入发布快照，再开放页面展示。

## 8. 给上游同事的数据清单

算法 Award 结果建议一次性确认：

```text
crew_id
period_code
awarded_tier
result_type（awarded / unawarded）
pairing_id（或 date_off）
matched_tier
award_priority（P1–P7 / PN / CN）
reason_code
reason_text
```

同时需要他们回答：

1. 每个字段的业务定义是什么？
2. 每行数据的粒度和唯一键是什么？
3. 一个 Pairing 多个 Segment 是否只输出一次？
4. 空值、未知值和未计算分别如何表示？
5. `awarded_tier` 是否为 Crew 整月最终结果？
6. `PN`、`CN` 是否会明确输出，而不是要求下游推断？
7. 原因文本是否已经过面向 Crew 的信息安全处理？
8. 文件名、版本号和向后兼容规则是什么？

PRM 应单独向其权威数据 Owner 确认，不默认归算法负责。

## 9. 拿到数据后的继续开发顺序

1. 保存真实输出样本和数据字典，核对粒度、唯一键、空值及重复规则。
2. 按 Source-of-Truth Migration Gate 编写并确认正式 Spec。
3. 实现上游解析或导入；不修改由其他团队负责的优化算法。
4. 增加必要的发布快照字段或结构、Migration 和数据库映射。
5. 补齐 Scenario / Live / Publish 写入链路。
6. 扩展 pbs-server 查询、Mapper 和共享 Contract。
7. Portal 只在字段有真实值时展示，不再出现 `Missing`。
8. 补齐后端测试、Playwright、人工 QA 和远端数据库只读验证。
9. Migration 执行必须单独确认环境和权限；不能仅因代码完成就默认已执行。

## 10. 当前未实施内容

截至本文日期，以下事项均未因本轮留痕而实施：

- 未新增 `roster_publish.award_tier`；
- 未新增 `roster_publish.award_priority`；
- 未新增未获得原因的发布存储结构；
- 未实现 PRM 计算或写入；
- 未执行相关 Migration；
- 未修改优化算法；
- 未提交 Git。

## 11. 参考资料

- `docs/superpowers/specs/2026-07-03-pbs-award-roster-publish-complete-design.md`
- `docs/superpowers/specs/2026-07-28-pbs-award-comments-explanation-pipeline-design.md`
- `docs/superpowers/specs/2026-07-29-pbs-award-reason-report-phase-one-design.md`
- `docs/superpowers/specs/2026-07-29-pbs-award-short-viewport-overlap-fix-design.md`
- `docs/architecture/source-of-truth-migration-gate.md`
- `init-docs/AA-Flight-Attendant-PBS-Guide_10JAN19.pdf`
- `packages/contracts/pbs-award-results.d.ts`
- `pbs-server/src/services/award/award-results-service.ts`
- `pbs-server/src/services/award/award-results-mapper.ts`
