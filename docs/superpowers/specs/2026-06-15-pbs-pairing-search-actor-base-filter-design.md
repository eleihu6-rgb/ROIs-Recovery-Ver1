# PBS Pairing Search 当前用户 Base 过滤设计

## 状态

- 文档状态：已确认，已实现
- 目标页面：`pbs-portal` `/pairing/search`
- 目标后端：`pbs-server` pairing search API
- 目标行为：Pairing search 只返回当前登录人所属 base 的 pairing

## 背景

当前 `/fpqe/pbs/pairing/search` 会按搜索条件返回 live `pairing` 数据，但主搜索结果没有强制使用当前登录人的 base 过滤。这样用户可能看到其他 base 的 pairing；这些 pairing 对当前用户没有实际投标意义，也会干扰搜索结果和 counts。

现状观察：

- `previewPairings`：使用 live `pairing p` 查询结果，没有使用 `actor`。
- `countCurrentRules`：基于同样的 pairing pool 计数，没有使用 `actor`。
- `searchPairingIds`：pairing number autocomplete 没有 base 限制。
- `getPairingDetails`：按 pairing id 返回详情，没有 base 限制。
- `searchPairingOccurrences`：按 pairing id + period 返回 occurrences，没有 base 限制。
- `searchPairingOccurrencesByDate`：已经解析当前用户 base 的 timezone，但未把 `p.base` 限定为 actor base。

## 目标

- Pairing search 页面中所有 pairing pool、pairing list、pairing details 都只来自当前登录人的 base。
- 不让前端传 base，也不信任 URL 或请求体里的 base。
- Base 过滤必须由服务端根据认证用户解析。
- Base 缺失时 fail closed，不返回全航司 pairing。
- 不改变当前搜索页面 UI 和路由。
- 不修改数据库 schema。

## 非目标

- 不新增手动 base filter。
- 不允许用户跨 base 搜 pairing。
- 不改变 pairing property 的业务规则含义。
- 不调整 bidding calendar、dashboard 或 pairing bid 保存逻辑。
- 不改 live `pairing` / `crew_base` / `pbs_user` 表结构。

## 当前用户 Base 来源

服务端统一解析 `actorBase`：

1. 优先使用 PBS 侧 `pbs_user.base`：
   - `pbs_user.crew_id = actor.crewId`
   - `pbs_user.user_code = actor.userCode`
   - `nullif(btrim(pbs_user.base), '')`
2. 如果 `pbs_user.base` 为空，fallback 到 live `crew_base` 当前 prime base：
   - `crew_base.crew_id = actor.crewId`
   - `crew_base.exp_dt is null`
   - `crew_base.is_prime_base = 1`
   - 按 `eff_dt desc, id desc` 取最新一条
3. 解析不到 base 时返回 400：
   - 建议错误信息：`Current user base is required for pairing search.`

说明：

- 该口径复用现有 `searchPairingOccurrencesByDate` 中已经使用的 actor base 查询思路。
- 后续如果 `pbs_user` 同步稳定，实际命中应主要来自 `pbs_user.base`。

## 过滤范围

以下接口都应应用 actor base 过滤：

| 接口 / 方法 | 过滤规则 |
|---|---|
| `previewPairings` | `p.base = actorBase` |
| `countCurrentRules` | `p.base = actorBase` |
| `searchPairingIds` | autocomplete 只返回 actor base 的 pairing |
| `searchFlightNumbers` | flight number 候选只来自 actor base 的 pairing segments |
| `searchPairingOccurrences` | pairing id 的 occurrence 必须属于 actor base |
| `searchPairingOccurrencesByDate` | 日期搜索结果必须属于 actor base |
| `getPairingDetails` | pairing details 必须属于 actor base |

`searchCrewIds` 不属于 pairing pool，不做 base 过滤。本功能不改变 crew id autocomplete。

## 后端设计

### Actor Base Resolver

新增或抽取一个 pairing search 内部 helper，用于生成当前用户 base：

- 输入：
  - `pgPool`
  - `liveSchema`
  - `pbsSchema`
  - `actor`
- 输出：
  - `base: string`
- 行为：
  - 查 `pbs_user.base`，fallback live `crew_base.base`
  - trim 后为空视为未配置
  - 未配置抛 `LineholderBidServiceError(400, ...)`

实现可以有两种方式：

- 推荐：独立 SQL 查询一次 actor base，然后把 base 作为参数传给各查询。
- 可接受：在每个大 SQL 中使用 `actor_base` CTE。

推荐独立 resolver 的原因：

- 多个 query 文件都需要 actor base，复用更清晰。
- 参数顺序更容易控制。
- 单元测试更容易覆盖 base 缺失行为。

### Query Changes

所有涉及 live `pairing p` 的查询追加：

```sql
and p.base = $actorBase
```

对于 `pairing_segment` 查询，例如 flight number autocomplete，应通过 `pairing` join 过滤：

```sql
join live_schema.pairing p
  on p.id = s.pairing_id
 and p.is_deleted = 0
 and p.base = $actorBase
```

### 计数一致性

`previewPairings` 的 summary/count、`countCurrentRules` 的 rule/funnel counts 必须使用同一个 actor base filter。否则页面结果和右侧规则计数会不一致。

### Details 一致性

`getPairingDetails` 如果请求了其他 base 的 pairing id，不返回该 pairing。第一版按空结果处理，不单独暴露“跨 base 被拒绝”的错误，避免泄露其他 base 是否存在该 pairing。

## 前端设计

前端不新增 base 参数。

保持现有调用方式：

- Search page 请求仍只提交 period、criteria、pagination。
- Pairing number autocomplete 不传 base。
- Details 请求不传 base。

前端自然收到服务端过滤后的结果。如果用户 base 缺失，接口返回 400，沿用现有错误展示机制。

## 错误与 Fallback

- actor 未登录：维持现有 401。
- actor base 解析不到：返回 400，不返回全航司数据。
- 请求了其他 base 的 pairing id：返回空结果或空 occurrences。
- periodCode 无法解析：维持现有 400。

## 测试设计

后端自动化测试：

- `previewPairings` SQL 包含 actor base filter，参数包含 actor base。
- `countCurrentRules` 的 count SQL 包含 actor base filter。
- `searchPairingIds` autocomplete 只查 actor base。
- `searchFlightNumbers` 通过 pairing join 限制 actor base。
- `getPairingDetails` 限制 actor base。
- `searchPairingOccurrences` 限制 actor base。
- `searchPairingOccurrencesByDate` 同时保留 actor base timezone 逻辑，并限制 `p.base = actorBase`。
- `pbs_user.base` 为空时 fallback 到 live `crew_base`。
- `pbs_user.base` 和 `crew_base` 都为空时返回 400。

前端自动化测试：

- 不需要新增 base 参数相关测试。
- 可保留现有 search page 测试，确保请求 payload 未增加前端 base 字段。

QA 人工测试：

- 使用 YYZ 用户登录，搜索 pairing，只看到 YYZ pairing。
- 使用另一个 base 用户登录，同样条件下只看到该用户 base 的 pairing。
- 输入明确属于其他 base 的 pairing number，不应出现在 autocomplete。
- 如果直接请求其他 base pairing details，应返回空结果。

## 验收标准

- `/fpqe/pbs/pairing/search` 搜索结果全部属于当前登录人 base。
- Pairing number autocomplete 不出现其他 base pairing。
- Flight number autocomplete 不基于其他 base pairing 生成候选。
- Current rules counts 与 preview results 使用相同 base pool。
- Details / occurrence 查询不返回其他 base pairing。
- 当前用户 base 缺失时返回 400，不泄漏全航司 pairing。
- 不修改前端 UI。

## 风险与后续

- 如果部分测试账号 `pbs_user.base` 未同步，搜索会 fallback 到 live `crew_base`。
- 如果两边都缺 base，用户会看到 400，需要修数据或同步逻辑。
- 如果未来存在跨 base 投标规则，应另开设计，不应把本功能改成前端可选 base filter。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 pairing-search 后端 query/helper 和测试；拆分会增加 SQL 参数顺序、actor base resolver 口径协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/pairing-search/*`、相关测试、必要 QA 文档。
- Conflict risk: 中，主要风险在多个 SQL 查询入口过滤不一致。
- Execution gate: 用户确认本 spec 后再实施。

## 实施门禁

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
