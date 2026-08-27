# PBS 算法导出 Days Off 按 Crew Base 时区转 UTC 设计

## 背景

当前 `DAYSOFF.csv` 的 `DayOff_Start_Time_UTC` / `DayOff_End_Time_UTC` 直接把日期 `YYYY-MM-DD` 当成 UTC 自然日：

```text
2026-06-11 -> 2026-06-11T00:00:00Z / 2026-06-12T00:00:00Z
```

这不符合算法接口需要。用户在 Days Off 日历选择的是 crew 本地基地日期，导出应表达“该 crew base 本地日历日”的 UTC 区间。

## 目标

- `DayOff_Start_Time_UTC` 按 crew 主基地本地 `00:00` 转 UTC。
- `DayOff_End_Time_UTC` 按 crew 主基地本地下一天 `00:00` 转 UTC。
- 支持 DST，不使用固定 UTC offset。
- 不改变 Days Off 页面和数据库存储方式。
- 保持 CSV 表头和 counter 口径不变。

## 数据来源

- Crew ID：`pbs_bid.crew_id`
- Crew base：优先使用 PBS 同步投影表 `pbs_user.base`
- Base timezone：live schema 中 `airport.zone_id`
- Live schema：沿用现有 PBS 服务模式，由 `env.PBS_SCHEMA.replace(/_pbs$/i, "")` 推导，例如 `f8_pbs -> f8`

本地库验证：

- `Jun 2026` Current bid 有 14 条。
- 14 条都有 `pbs_user.base`。
- 14 条都能 join 到 `airport.zone_id`。
- 示例 zone：`America/Toronto`、`America/Montreal`、`America/Vancouver`、`America/Edmonton`。

## 转换规则

对每个导出行：

```text
local_start = <date> 00:00:00 in crew_base_zone
local_end   = <date> 23:59:59 in crew_base_zone
```

导出：

```text
DayOff_Start_Time_UTC = local_start converted to UTC
DayOff_End_Time_UTC   = local_end converted to UTC
```

示例：

```text
YYZ / America/Toronto / 2026-06-11
start = 2026-06-11T04:00:00Z
end   = 2026-06-12T03:59:59Z
```

冬令时会自动不同，例如 Toronto 冬季是 `05:00:00Z`。

## 缺失数据处理

如果某个 crew 缺少 `base` 或 `zone_id`，导出仍继续，但该 crew 对应行的时间字段导出为空：

```text
DayOff_Start_Time_UTC = ""
DayOff_End_Time_UTC   = ""
```

理由：算法导出是管理员批量包，少量主数据缺失不应导致整个包失败；但时间留空能明确暴露该 crew 主基地时区数据缺失，方便后续补数据或排查。

## 实施范围

- `pbs-server/src/services/algorithm-export/algorithm-export-service.ts`
  - 给服务增加 `liveSchema` 配置。
- `pbs-server/src/app.ts`
  - 创建 algorithm export service 时传入 `env.PBS_SCHEMA.replace(/_pbs$/i, "")`。
- `pbs-server/src/services/algorithm-export/days-off-export.ts`
  - 查询 Days Off rows 时带出 `base` 和 `zoneId`。
  - 序列化 CSV 时按 `zoneId` 计算 UTC start/end。
  - 增加 DST-aware 的 local date to UTC 工具函数。
- 测试
  - 覆盖 Toronto 夏令时 `2026-06-11 -> 04:00Z`。
  - 覆盖 Vancouver / Edmonton 不同时区。
  - 覆盖缺失 base / zone 时 start/end 留空。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 主要是一个后端导出服务的口径修正，改动集中，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/algorithm-export/*`、`pbs-server/src/app.ts`、相关测试。
- Conflict risk: 低；但当前工作区已有算法导出未提交改动，需要在现有改动上继续。
- Execution gate: 用户确认本 spec 后实施。
