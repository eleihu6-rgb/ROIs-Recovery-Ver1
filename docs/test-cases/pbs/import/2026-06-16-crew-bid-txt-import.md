# PBS Crew Bid TXT 一键导入人工测试用例

## 背景

本用例覆盖客户 crew bid TXT 文件导入 PBS 的管理端接口。目标月份以 `Jun 2026` 为例，输入文件可使用 `/Users/lei/Downloads/DEC 25/Dec 2025 All in one.txt` 的文本内容。

## 前置条件

- 已在目标 PBS schema 执行迁移：`sql/migration/2026-06-16-pbs-crew-bid-import-run.sql`
- 已在目标 PBS schema 执行迁移：`sql/migration/2026-06-16-pbs-hidden-admin-user.sql`
- `pbs-server` 使用正确的 `PBS_SCHEMA`，例如 `f8_pbs`
- 对应 live schema 中已存在目标月份 pairing 数据，例如 `f8.pairing` / `f8.pairing_segment`
- 调用接口的 JWT 用户必须来自隐藏管理员账号 `admin`；不要把 900 等真实 crew 账号设置为 admin

## 接口

- Dry-run：`POST /api/admin/crew-bid-imports/dry-run`
- 正式导入：`POST /api/admin/crew-bid-imports`
- 导入 run 列表：`GET /api/admin/crew-bid-imports?periodCode=Jun%202026`
- 导入 run 详情：`GET /api/admin/crew-bid-imports/:runId`
- 清空/回滚导入：`DELETE /api/admin/crew-bid-imports/:runId`

## Case 1：YEG dry-run

请求使用 `multipart/form-data`：

| 字段 | 类型 | 值 |
|------|------|----|
| `file` | File | `/Users/lei/Downloads/DEC 25/Dec 2025 All in one.txt` |
| `periodCode` | Text | `Jun 2026` |
| `sourcePeriodCode` | Text | `December 2025` |
| `scopeBase` | Text | `YEG` |
| `options` | Text | `{"useCurrentBidWhenAvailable":true,"fallbackToDefaultBid":true,"firstPairingBidGroupOnly":true,"failOnUnmatchedPairing":true}` |

期望：

- 返回 `200`
- `data.mode = "dry_run"`
- `summary.selectedCrew` 等于 YEG 范围内被选中的 crew 数
- `summary.importablePreferenceCount` 大于 0
- 如果文件内有 `Dec 31, 2025`，在 `Jun 2026` 下应出现 `invalid_mapped_date` 或 `invalid_mapped_date_skipped` 问题
- 如果目标月份没有对应 Pairing Number，应出现 `unmatched_pairing_number`
- 不应写入 `pbs_bid`

## Case 2：正式导入 YEG

请求同 dry-run，接口改为 `POST /api/admin/crew-bid-imports`，并额外添加：

| 字段 | 类型 | 值 |
|------|------|----|
| `confirm` | Text | `true` |
| `options` | Text | `{"overwriteCurrentBid":true}` |

期望：

- 返回 `201`
- 返回 `data.runId`
- `summary.importedCrew` 大于 0
- 对被导入 crew，`pbs_bid` 中存在 `period_code = 'Jun 2026'` 且 `bid_context = 'Current'` 的新记录
- 新记录 `remarks` 包含 `crew-bid-import:<runId>`
- Pairing Number 成功匹配时，`pbs_bid_pairing_occurrence` 中有对应稳定 `pairing_id` / `origin_date`

## Case 3：查看 run 详情

请求：

```text
GET /api/admin/crew-bid-imports/:runId
```

期望：

- 返回 `200`
- `items[]` 能看到每个 crew 的 `status`
- `problems[]` 能定位到 `crewId`、`sourceLineNumber`、`sourceSeq`、`rawText`
- 失败和警告数量与导入响应一致

## Case 4：清空/回滚导入

请求：

```json
{
  "confirm": true,
  "restorePrevious": true
}
```

期望：

- 返回 `200`
- `data.status = "rolled_back"`
- 本次导入创建的 `pbs_bid` 被删除
- 如果导入前 crew 已有 `Current` bid，旧 bid 被恢复
- 同一个 `runId` 第二次删除返回冲突或失败，不应重复修改数据

## Case 5：权限保护

使用非 admin token 调用任意导入接口。

期望：

- 返回 `403`
- 响应 message 为 `Admin access is required.`

## 重点核查

- `Current Bid` 优先；没有 current 时才使用 `Default Bid`
- 同一个 crew 多个 current bid 时只取文件顺序第一个
- 只导入第一个 `Pairing Bid Group`
- `If A If B` 被保存为主 `pbs_bid_group` 加 AND `pbs_bid_condition`
- Pairing Number 必须解析到目标月份 live pairing，否则进入问题列表
- `Dec 31, 2025` 映射到 `Jun 2026` 时不能静默写成错误日期
