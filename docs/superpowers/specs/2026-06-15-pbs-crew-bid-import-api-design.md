# PBS Crew Bid TXT 导入接口设计

> 日期：2026-06-15  
> 模块：`pbs-server` / PBS Lineholder bid 数据  
> 目标：把客户正式 crew bid TXT 一键导入为目标月份 `Jun 2026` 的 Current bid，并支持 dry-run、结果统计、失败明细和按导入批次清空/回滚。

> 2026-06-16 更新：用户确认接口不保留 JSON `sourceText` 兼容方式。最终调用协议以 `docs/superpowers/specs/2026-06-16-pbs-crew-bid-import-multipart-design.md` 为准，`dry-run` 与正式导入统一使用 `multipart/form-data` 上传 `file`。

## 背景

客户提供的 TXT 文件示例为 `/Users/lei/Downloads/DEC 25/Dec 2025 All in one.txt`，原始周期是 `December 2025`。Jen 建议先用 YEG 基地小场景打磨优化结果，同时准备全量 crew bid 场景。

前期只读分析结果：

- TXT 共约 1120 个 bid block，689 个 crew。
- 有 `Current Bid` 的 crew：626。
- 只有 `Default Bid` 的 crew：63。
- YEG crew：87，其中 `YEG-737-CA` 为 15 人。
- 按“Current 优先；无 Current 用 Default；只取第一个 Pairing Bid Group”策略，预计导入约 5751 条 preference。
- 粗略映射覆盖率：直接映射约 97.8%，需要策略/近似映射约 2.1%，暂未明确映射约 0.1%。

现有数据库模型已具备导入需要的大部分业务结构：

- `pbs_bid`：Current / Default bid 主记录。
- `pbs_bid_tier`：Tx。
- `pbs_bid_group`：主 property group，已包含 `limit_n`、`all_or_nothing`、`minimum_n`、`preference_json`。
- `pbs_bid_condition`：AND 条件链。
- `pbs_bid_pairing_occurrence`：Pairing Number 具体运行日。
- `pbs_bid_error`：已有解析错误记录表，但缺少导入批次维度。

## 目标

1. 提供管理员接口，一键对 TXT 内容执行 dry-run 或正式导入。
2. 导入结果必须可审计：知道成功多少、失败多少、跳过多少、为什么失败。
3. Pairing Number 必须尝试匹配目标月份 live pairing；匹配不到不能静默成功。
4. 支持按 `runId` 清空/回滚本次导入，便于导错后重新导入。
5. 不引入不必要的新依赖，不新增前端 UI 上传能力；第一阶段以 API 调用为主。

## 非目标

- 不在本阶段做 PBS Portal 导入页面。
- 不在本阶段支持客户 TXT 的所有后续 `Pairing Bid Group`，第一阶段只导入第一个 group。
- 不在本阶段扩展优化算法语义，只把可表达的 bid 写入现有 PBS bid 表。
- 不把 `Dec 2025` pairing 直接当作 `Jun 2026` pairing 使用；必须重新按目标月份匹配。
- 不允许普通 crew 用户触发全员导入或清空。

## 方案对比

### 方案 A：脚本导入

新增 `pbs-server/src/scripts/import-crew-bids.ts`，通过命令行读取文件并写库。

优点：

- 实现较快。
- 不需要新增 API contract。

缺点：

- 用户需要登录服务器执行命令，不符合“一键调用接口”。
- 不方便前端或外部工具集成。
- 清空/结果查询也要靠脚本，不利于后续审计。

### 方案 B：管理员 API + JSON sourceText（历史方案，已废弃）

新增 `/api/admin/crew-bid-imports` 相关接口，请求体直接传 TXT 内容字符串和导入选项。

优点：

- 满足“一键调用接口”。
- 不需要新增 multipart 上传依赖。
- dry-run、正式导入、结果查询、清空/回滚都能统一走 API。
- 易于后续加 UI：前端读取本地文件内容后作为 `sourceText` 传给 API。

缺点：

- JSON 请求体会比文件上传稍笨重。
- 需要设置或确认 Fastify body size 上限，避免大 TXT 被拒绝。

### 方案 C：管理员 API + multipart 文件上传（最终方案）

新增 multipart 上传接口，直接上传 TXT 文件。

优点：

- 用户体验更贴近“上传文件导入”。

缺点：

- 当前 `pbs-server` 没有 `@fastify/multipart`，新增依赖需要许可证、安全、维护成本评估。
- 文件上传安全边界更复杂。

原设计曾推荐方案 B。2026-06-16 用户确认后，最终采用方案 C：只接受 multipart 文件上传，不保留 JSON `sourceText` 兼容入口。

## API 设计

所有接口必须 admin-only。复用现有 `algorithm-export` 的 admin 检查风格：`request.authUser?.isAdmin === true`，否则返回 403。

### 1. Dry-run

`POST /api/admin/crew-bid-imports/dry-run`

请求：

```json
{
  "periodCode": "Jun 2026",
  "sourcePeriodCode": "Dec 2025",
  "sourceText": "...完整 TXT 内容...",
  "scope": {
    "base": "YEG",
    "categories": ["YEG-737-CA"],
    "crewIds": []
  },
  "options": {
    "bidSelection": "current_first_default_fallback",
    "groupPolicy": "first_pairing_group_only",
    "dateMapping": "same_day_target_month",
    "invalidDatePolicy": "skip",
    "pairingMatchPolicy": "require_target_month_match",
    "overwriteExistingCurrent": true,
    "maxErrors": 500
  }
}
```

说明：

- `scope.base`、`scope.categories`、`scope.crewIds` 可组合使用；为空表示全量。
- 第一阶段默认建议从 `base=YEG` 或 `categories=["YEG-737-CA"]` 开始。
- `dateMapping=same_day_target_month`：`Dec 24, 2025` 映射为 `2026-06-24`。
- `invalidDatePolicy=skip`：例如 `Dec 31` 映射到 6 月时无 31 号，记录 skipped/error，不写入。
- dry-run 不写入 `pbs_bid` / `pbs_bid_group` / `pbs_bid_condition` / `pbs_bid_pairing_occurrence`。
- dry-run 可以写入或不写入 import run 记录。推荐第一阶段不持久化 dry-run，只返回结果；后续如需要历史 dry-run，再扩展。

响应：

```json
{
  "periodCode": "Jun 2026",
  "mode": "dry_run",
  "summary": {
    "crewBlocks": 689,
    "selectedCrew": 15,
    "currentBidCrew": 15,
    "defaultFallbackCrew": 0,
    "parsedPreferenceLines": 78,
    "importablePreferences": 74,
    "skippedPreferences": 3,
    "failedPreferences": 1,
    "pairingReferences": 42,
    "pairingMatched": 39,
    "pairingUnmatched": 3,
    "wouldOverwriteCurrentBids": 15
  },
  "items": [
    {
      "crewId": "383",
      "category": "YEG-737-CA",
      "sourceBidContext": "Current",
      "status": "success",
      "importableCount": 8,
      "failedCount": 0,
      "skippedCount": 0
    }
  ],
  "problems": [
    {
      "severity": "error",
      "crewId": "247",
      "rawLine": "Award Pairings If Pairing Number E4101",
      "reasonCode": "pairing_not_found",
      "message": "Pairing E4101 was not found in Jun 2026 for this crew/base scope."
    }
  ]
}
```

### 2. 正式导入

`POST /api/admin/crew-bid-imports`

请求与 dry-run 基本相同，额外要求：

```json
{
  "confirm": true
}
```

行为：

1. 服务端先执行与 dry-run 相同的解析、映射和匹配。
2. 如果存在 fatal error，可配置为整体拒绝；推荐第一阶段采用“crew 级部分成功”：
   - 某个 crew 无法解析或无可导入项，则该 crew 标记失败，不写入该 crew。
   - 其他 crew 可继续导入。
3. 若 `overwriteExistingCurrent=true`：
   - 对 scope 内目标 crew 的 `Jun 2026 / Current` bid 先做完整快照。
   - 删除这些 crew 现有 Current bid 及子表数据。
   - 写入导入后的 Current bid。
4. 所有导入写入都必须绑定 `runId`，用于结果查询和清空/回滚。
5. 导入应在数据库事务内执行。若采用 crew 级部分成功，需要明确每个 crew 一个事务，或者主事务内按 crew 捕获并记录失败。推荐每个 crew 一个事务，避免单个 crew 失败导致整批回滚。

事务边界建议：

- 先创建 `pbs_crew_bid_import_run`，状态为 `running`。
- 每个 crew 单独事务：
  - 创建/更新 `pbs_crew_bid_import_item`。
  - 写入覆盖前 backup。
  - 删除该 crew 目标 Current bid。
  - 写入导入后的 bid/tier/group/condition/occurrence。
  - 写入该 crew 的 problems。
- 单个 crew 事务失败时，只回滚该 crew，并把 item 标记为 `failed`；其他 crew 继续执行。
- 全部 crew 处理结束后，汇总统计并更新 run：
  - 全部成功且无 warning：`completed`。
  - 至少一个 warning/skip/crew failed，但至少一个 crew 成功：`completed_with_warnings`。
  - 没有任何 crew 成功：`failed`。

这种边界能保证“一人失败不拖垮整批”，同时 run 级结果仍完整可查。

响应：

```json
{
  "runId": "20260615-crew-bid-import-0001",
  "periodCode": "Jun 2026",
  "mode": "import",
  "status": "completed_with_warnings",
  "summary": {
    "selectedCrew": 87,
    "importedCrew": 82,
    "failedCrew": 5,
    "createdBids": 82,
    "overwrittenBids": 80,
    "restorableBackups": 80,
    "importedPreferences": 512,
    "skippedPreferences": 17,
    "failedPreferences": 5,
    "pairingReferences": 220,
    "pairingMatched": 210,
    "pairingUnmatched": 10
  }
}
```

### 3. 查询导入结果

`GET /api/admin/crew-bid-imports/:runId`

返回：

- run 基本信息。
- 请求 scope/options 摘要。
- 总体统计。
- crew 级结果。
- problem 明细，可分页。

建议支持 query：

- `severity=error|warning|info`
- `crewId=...`
- `status=success|failed|skipped`
- `limit=100`
- `offset=0`

### 4. 清空/回滚导入结果

`DELETE /api/admin/crew-bid-imports/:runId`

请求：

```json
{
  "restorePrevious": true,
  "confirm": true
}
```

行为：

1. 仅允许清空状态为 `completed` / `completed_with_warnings` 的 run。
2. 删除本 run 创建的 Current bid 及子表数据。
3. 如果 `restorePrevious=true`，恢复导入前被覆盖的 Current bid 快照。
4. 如果导入后的 bid 已被用户手工修改，默认拒绝清空并返回冲突：
   - 判断方式：导入写入时记录 `bidId`、`draftVersion`、`updatedAt`、`updatedBy`。
   - 清空时若当前值不匹配，返回 `409 import_run_modified_after_import`。
   - 可后续扩展 `force=true`，第一阶段不建议提供。
5. 回滚完成后 run 标记为 `rolled_back`，不能重复回滚。

响应：

```json
{
  "runId": "20260615-crew-bid-import-0001",
  "status": "rolled_back",
  "summary": {
    "deletedImportedBids": 82,
    "restoredPreviousBids": 80,
    "skippedRestore": 0
  }
}
```

## 数据库设计

需要新增 migration，不直接修改已确认的历史 schema 文件。

### `pbs_crew_bid_import_run`

记录一次 dry-run 或正式导入的批次。第一阶段正式导入必须持久化；dry-run 可不持久化。

字段建议：

- `id bigint generated always as identity primary key`
- `run_key varchar(80) not null unique`
- `period_code varchar(20) not null`
- `source_period_code varchar(20)`
- `mode varchar(20) not null`：`dry_run` / `import`
- `status varchar(30) not null`：`running` / `completed` / `completed_with_warnings` / `failed` / `rolled_back`
- `scope_json jsonb not null default '{}'::jsonb`
- `options_json jsonb not null default '{}'::jsonb`
- `summary_json jsonb not null default '{}'::jsonb`
- `source_hash varchar(80) not null`
- `created_by/created_at/updated_by/updated_at`

不保存完整 source TXT，避免把客户正式 bid 文本长期落库。只保存 hash、统计和失败明细。若后续审计确实需要保存原文，需单独确认数据安全策略。

### `pbs_crew_bid_import_item`

记录 crew 级结果。

字段建议：

- `id`
- `run_id bigint not null references pbs_crew_bid_import_run(id)`
- `crew_id varchar(30) not null`
- `category varchar(40)`
- `source_bid_context varchar(10)`：`Current` / `Default`
- `status varchar(20)`：`success` / `failed` / `skipped`
- `bid_id bigint`
- `previous_bid_id bigint`
- `imported_preferences integer`
- `failed_preferences integer`
- `skipped_preferences integer`
- `summary_json jsonb`
- 审计字段

### `pbs_crew_bid_import_problem`

记录 rule 级失败/警告/跳过明细。

字段建议：

- `id`
- `run_id`
- `item_id`
- `crew_id`
- `severity varchar(10)`：`error` / `warning` / `info`
- `reason_code varchar(80)`
- `raw_line text`
- `normalized_pattern varchar(300)`
- `message varchar(1000)`
- `metadata_json jsonb`
- 审计字段

### `pbs_crew_bid_import_backup`

记录被覆盖 Current bid 的恢复快照。

字段建议：

- `id`
- `run_id`
- `crew_id`
- `period_code`
- `previous_bid_id bigint`
- `snapshot_json jsonb not null`
- `restore_status varchar(20)`：`pending` / `restored` / `not_needed` / `conflict`
- 审计字段

快照内容应包含：

- `pbs_bid`
- `pbs_bid_tier`
- `pbs_bid_group`
- `pbs_bid_condition`
- `pbs_bid_pairing_occurrence`
- `pbs_bid_day_off`
- 与 Current bid 直接相关的 favorite/configured favorite，如当前服务会读取这些数据。

## 导入解析规则

### Bid block 解析

每个 block 由以下信息组成：

- `Seniority`
- `Category`
- `Employee #`
- `Confirmation`
- `Default Bid` / `Current Bid`
- `Bid Preferences`

同一 crew 的选择规则：

1. 若存在 `Current Bid`，选择 Current。
2. 否则选择 Default。
3. 若有多个同类 block，第一阶段选择 confirmation 时间最新的一条；如果无法解析时间，记录 warning 并选择文件中第一条。

### Group 选择

第一阶段只导入第一个 `Pairing Bid Group` 段。

段边界：

- 从第一条 `Pairing Bid Group` 后开始。
- 遇到下一条 `Pairing Bid Group`、`Reserve Bid Group`、`Line Bid Group` 或文件 block 结束时停止。
- `Award Pairings` 这类分隔行不作为 property。
- 后续 group 记录为 skipped problem，`reason_code=ignored_extra_group`。

说明：虽然第一阶段只导入第一个 group，但该 group 内的 `Prefer Off`、`Set Condition`、`Award/Avoid Pairings` 都应保留并映射到对应 bid type，而不是只导入 Pairing 类条件。

### Tier 策略

客户 TXT 的第一 group 内没有明确 Tx 概念。第一阶段导入到 `T1`。

后续若要把多个 Pairing Bid Group 映射到多个 Tx，可另开 spec：第 1 个 group -> T1，第 2 个 group -> T2，或按 `Clear Schedule and Start Next Bid Group` 控制。

## 日期转换规则

源周期：`Dec 2025`。目标周期：`Jun 2026`。

第一阶段规则：

- `Dec D, 2025` -> `2026-06-D`。
- 日期范围两端分别转换。
- `Dec 31, 2025` -> 6 月无 31 号，按 `invalidDatePolicy=skip` 记录为 skipped/error。
- 若范围转换后 `from > to`，记录 `invalid_date_range`。不自动反转，避免误解用户原意。
- 星期几文本（如 `Saturday, Sunday`）不按源月份转换，保留为 daysOfWeek。

可选后续增强：

- `clip_to_month_end`：无效日期裁剪到目标月最后一天。
- `preserve_weekday_nearest`：按星期几找目标月最近日期。

这些策略会改变业务语义，第一阶段不默认启用。

## Property 映射策略

第一阶段必须有集中映射表，不允许把正则散落在 route 或 service 里。

建议新增模块：

- `pbs-server/src/services/crew-bid-import/crew-bid-txt-parser.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-pairing-resolver.ts`
- `pbs-server/src/services/crew-bid-import/crew-bid-import-service.ts`

主要映射：

| TXT 模式 | 目标 |
|---|---|
| `Award/Avoid Pairings If Pairing Number ...` | Pairing `102` |
| `Any Landing In ...` | Pairing `101` |
| `Any Landing In (Counting Deadhead Legs) ...` | Pairing `101` + warning：deadhead counting nuance ignored |
| `Any Layover In ...` | Pairing `104` |
| `Pairing Check-In Time ...` | Pairing `103` |
| `Pairing Check-In Time Between <date time> And <date time>` | Pairing `139` 或 Pairing `103` + warning，按实现验证决定 |
| `Pairing Check-Out Time ...` | Pairing `111` |
| `Pairing Check-Out Time Between <date time> And <date time>` | Pairing `140` 或 Pairing `111` + warning，按实现验证决定 |
| `Pairing Total Credit ...` | Pairing `105` |
| `Average Daily Credit ...` | Pairing `109` |
| `Average Daily Block Time ...` | Pairing `121` |
| `Credit Per Time Away From Base ...` | Pairing `125` |
| `Departing On ...` | Pairing `106` |
| `Any Duty On ...` | Pairing `110` |
| `Any Duty On ... with Time ...` | Pairing `110` + Pairing `120` AND condition，若无法表达则 warning |
| `Any Duty Legs ...` | Pairing `107` |
| `Total Legs In Pairing ...` | Pairing `108` |
| `Total Legs In First Duty ...` | Pairing `124` |
| `Total Legs In Last Duty ...` | Pairing `130` |
| `TAFB ...` | Pairing `113` |
| `Any Flight Number ...` | Pairing `116` |
| `Any Leg With Employee Number ...` | Pairing `115` |
| `Any Leg Is Redeye` | Pairing `117` |
| `Deadhead Legs ...` | Pairing `122` |
| `Deadhead Day` | Pairing `128` |
| `Prefer Off ...` | DaysOff `201` |
| `Prefer Off Weekends Minimum N` | DaysOff `201` + `minimum_n=N` |
| `Prefer Off ... All or Nothing` | DaysOff `201` + `all_or_nothing=1` |
| `Set Condition N Consecutive Days Off In A Row Between ...` | DaysOff `204` |
| `Set Condition N Consecutive Days Off In A Row` | DaysOff `203` |
| `Set Condition Minimum Days Off In A Row N` | DaysOff `203` |
| `Set Condition Maximum Days On In A Row N` | DaysOff `202` |
| `Set Condition Pattern Between A and B Days On, with C Days Off (Minimum)` | DaysOff `205` 或 Line `408` |
| `Set Condition Minimum Credit Window` | Line `402` |
| `Set Condition Maximum Credit Window` | Line `401` |
| `Clear Schedule and Start Next Bid Group` | Line `403` |
| `Set Condition No Same Day Pairings` | Line `404` |
| `Waive No Same Day Duty Starts` | Line `405` |
| `Forget Line N` | Line `406` |
| `Set Condition Minimum Base Layover HHH:MM` | Line `407` |
| `Set Condition Short Call Type ...` | Reserve `301` |

`Limit N`：

- 若 TXT line 包含 `Limit N`，写入 `pbs_bid_group.limit_n=N`。
- 如果该 property 当前验证/导出链路不支持 `limit_n`，导入仍保存，但 problem 记录 warning：`limit_semantics_may_not_be_enforced`。

`Else Start Next Bid Group`：

- 第一阶段只导入第一个 group，因此该后缀记录 warning/skipped metadata。
- 不额外创建下一 group。

## Pairing Number 匹配

Pairing Number 导入不能只保存文本。应尝试解析为目标月份具体 occurrence：

1. 从 TXT 提取 pairing number 列表，例如 `E4101, E4101A`。
2. 若 line 中有 `Check-In Date Dec D, 2025`，转换为目标 origin/check-in date。
3. 查询 Jun 2026 live pairing：
   - 按 `pairing_number` 匹配。
   - 若有 date，则加 date 匹配。
   - 按当前 crew base/category 可用范围过滤，沿用现有 Pairing search base 过滤规则。
4. 匹配唯一时，写入 `pbs_bid_pairing_occurrence`。
5. 无匹配：记录 `pairing_not_found`，该 pairing reference 失败。
6. 多匹配且无日期：记录 `pairing_ambiguous`，不自动选。

Pairing Number property 的处理结果：

- 若同一 TXT line 部分 pairing 匹配成功、部分失败：
  - 写入成功 occurrence。
  - problem 记录失败 pairing。
  - item 统计为 `completed_with_warnings`。
- 若全部失败：
  - 不写该 property group。
  - 记录 error。

## 清空/回滚安全策略

清空不能只按 crew/period 删除，否则会误删用户后续手工修改。

推荐策略：

1. 正式导入创建 run。
2. 导入前对即将覆盖的 Current bid 做 snapshot。
3. 导入写入的新 bid 在 `created_by`、`updated_by`、`remarks` 中包含 run key，例如：
   - `created_by='crew-bid-import'`
   - `remarks='crew-bid-import:<runKey>'`
4. `pbs_crew_bid_import_item` 记录 `bid_id` 和导入完成时的 `draft_version/updated_at/updated_by`。
5. 清空时先检查这些 bid 是否仍保持导入后状态。
6. 无冲突时删除导入 bid，恢复 snapshot。
7. 有冲突时返回 409，不默认强删。

## 错误与状态码

- 400：请求参数错误、sourceText 缺失、periodCode 缺失。
- 401：未登录。
- 403：非管理员。
- 404：runId 不存在。
- 409：清空时发现导入后的 bid 已被修改；或同一 run 已回滚。
- 413：sourceText 超过服务端允许大小。
- 500：未预期错误。

业务 problem reason code 建议：

- `crew_not_found`
- `crew_out_of_scope`
- `no_current_or_default_bid`
- `no_pairing_group`
- `ignored_extra_group`
- `unsupported_pattern`
- `invalid_date`
- `invalid_date_range`
- `property_mapping_failed`
- `property_validation_failed`
- `pairing_not_found`
- `pairing_ambiguous`
- `partial_pairing_match`
- `limit_semantics_may_not_be_enforced`
- `deadhead_counting_ignored`

## 测试策略

### 单元测试

新增：

- `crew-bid-txt-parser.test.ts`
  - 解析 block、crew、category、Current/Default。
  - Current 优先、Default fallback。
  - 第一个 Pairing Bid Group 边界。
- `crew-bid-property-mapper.test.ts`
  - 主流 property 映射。
  - 日期转换。
  - `Limit N`。
  - `All or Nothing` / `Minimum N`。
  - unsupported pattern 进入 problem。
- `crew-bid-pairing-resolver.test.ts`
  - pairing 唯一匹配。
  - pairing not found。
  - ambiguous。
  - date mapping 后匹配。

### Route / Service 测试

新增：

- admin-only 验证。
- dry-run 不写业务表。
- import 写入 run/item/problem/bid/tier/group/condition/occurrence。
- overwrite 前创建 backup。
- clear run 删除导入结果并恢复 backup。
- clear run 遇到手工修改返回 409。

### 回归验证

PBS Server：

- `npm test`
- `npm run build`

跨 PBS 流程若影响 Portal 当前 bid 展示：

- 仓库根 `npm run verify:pbs`

### QA 人工测试文档

新增：

- `docs/test-cases/pbs/import/2026-06-15-crew-bid-txt-import.md`

内容至少覆盖：

- YEG-737-CA dry-run。
- YEG-737-CA 正式导入。
- 查询 run 结果。
- 清空 run 并恢复。
- pairing not found 明细。
- 非管理员访问失败。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务涉及 parser/mapping、数据库 run tracking、admin routes/contracts、测试文档，边界可拆。
- Suggested split:
  - Agent A：TXT parser + property mapper + unit tests。
  - Agent B：DB migration + import run/backup persistence + clear service。
  - Agent C：admin API contract/routes + route tests。
  - Main agent：集成、端到端 service tests、QA 文档、验证。
- Write boundaries:
  - Agent A 只写 `pbs-server/src/services/crew-bid-import/*parser*/*mapper*` 和对应 tests。
  - Agent B 只写 migration、models、persistence service/tests。
  - Agent C 只写 contracts、routes、route tests。
  - Main agent 负责冲突合并和最终验证。
- Conflict risk: Medium。Service 类型和 contract 会交叉，必须由主 agent 控制公共类型。
- Execution gate: 只有本 spec 经用户确认并进入 implementation plan 后，才允许启动多 agent。

## 验收标准

1. `POST /api/admin/crew-bid-imports/dry-run` 可以返回 YEG/YEG-737-CA 的导入预览，不写业务 bid。
2. `POST /api/admin/crew-bid-imports` 可以正式导入，返回 `runId` 和完整统计。
3. Pairing Number 无匹配时出现在 problem 明细中，不静默成功。
4. `GET /api/admin/crew-bid-imports/:runId` 可以查询导入摘要和失败明细。
5. `DELETE /api/admin/crew-bid-imports/:runId` 可以删除本次导入并恢复导入前 Current bid 快照。
6. 清空时若检测到导入后的 bid 已被用户修改，返回 409。
7. 导入逻辑不新增不合规依赖，不记录客户 TXT 全文到数据库。
8. 新增自动化测试和 QA 人工测试文档。

## 待确认事项

1. 第一阶段 API 是否只接受 JSON `sourceText`，暂不支持 multipart 文件上传。
2. 日期无效时是否保持 `skip` 策略，不自动裁剪到月末。
3. Pairing Number 多匹配时是否保持 `ambiguous -> error`，不自动选择第一条。
4. 正式导入是否先从 `YEG-737-CA` 开始验证，再扩大到 YEG 全部和全量 689 人。
