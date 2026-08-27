# PBS 算法 Days Off 导出接口设计

## 背景

PBS 后续需要把 Lineholder 当前 bid 数据导出给算法侧。最终交付形态是一个 `.tgz` 压缩包，解压后包含 Days Off、Pairing、Line、Reserve 四类文件。首期只实现 Days Off 文件，但接口形态直接按最终压缩包设计，避免后续再改变调用方式。

用户侧 PBS Portal 不直接使用该接口；它面向管理员或系统调用方，用于按指定 bid period 导出所有 crew 的数据。

## 目标

- 新增管理员导出接口，按必填 `periodCode` 导出所有 crew 的 Current bid Days Off 数据。
- 响应为 `.tgz` 压缩包，首期包内只包含 `DAYSOFF.csv`。
- `DAYSOFF.csv` 按算法所需格式输出明确日期类 Days Off 请求。
- 连续日期不合并，逐日展开。
- 同一 crew、同一天、同一 tier 被多个来源命中时，counter 累加。
- 暂不导出无法落到具体日期的开放条件。

## 非目标

- 首期不导出 Pairing、Line、Reserve 文件。
- 首期不增加 PBS Portal 管理员下载页面或按钮。
- 首期不导出没有明确日期的 Days Off 规则，例如 `Min Consecutive Days Off In Window`、`Minimum Days Off Between Work Blocks`、`Maximize Total Days Off` 等。
- 首期不做本地时区换算；数据库中的日期按 UTC 日期桶输出。
- 首期不支持动态 tier 列；固定输出 `T1-T7`。

## 接口设计

新增接口：

```text
GET /api/admin/algorithm-export?periodCode=<periodCode>
```

参数：

| 参数 | 位置 | 必填 | 说明 |
| --- | --- | --- | --- |
| `periodCode` | query | 是 | 目标 bid period，例如 `Jun 2026` |

响应：

- 成功：返回 `.tgz` 文件。
- 包内文件：`DAYSOFF.csv`。
- 建议下载文件名：`pbs-algorithm-export-<normalized-period-code>.tgz`。
- `periodCode` 缺失或为空：`400`。
- 未登录：沿用现有认证插件返回 `401`。
- 非管理员：`403`。

## 权限设计

现有 `pbs_user` 表有 `is_admin` 字段，但当前 JWT payload 未携带管理员标记。实现时需要：

1. 扩展 `AuthPayload`，增加 `isAdmin: boolean`。
2. 登录成功生成 JWT 时，从 `pbs_user.is_admin` 映射出 `isAdmin`。
3. `getSessionFromPayload()` 保持普通 session 响应兼容，不需要把管理员标记暴露给员工侧页面，除非后续需要管理端 UI。
4. 管理员导出路由检查 `request.authUser?.isAdmin`。

该改动不得改变现有员工接口的认证行为。

## DAYSOFF.csv 格式

表头固定为：

```csv
Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter
```

行粒度：

- 每行代表一个 `Crew_ID + DayOff_Start_Time_UTC + DayOff_End_Time_UTC`。
- 不合并连续日期。
- 日期按 UTC 零点到次日零点输出。

示例：

```csv
Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter
F8030,2026-06-10T00:00:00Z,2026-06-11T00:00:00Z,2,0,1,0,0,0,0
```

其中 `2` 表示同一 crew、同一天、T1 被两个 Days Off 来源命中。

## 数据范围

导出查询范围：

- `pbs_bid.period_code = periodCode`
- `pbs_bid.bid_context = 'Current'`
- 所有 crew，不按当前登录用户过滤
- 固定只统计 `T1-T7`

建议读取对象：

- `pbs_bid`
- `pbs_bid_tier`
- `pbs_bid_group`
- `pbs_bid_property`
- 必要时复用现有 Days Off property 反序列化逻辑

## 日期展开规则

首期只导出可以确定为具体日期的 Days Off 请求。

### Prefer Off

`propertyCode=201`，`bid.type='tag-list'` 的 `values` 按以下规则解析：

| value 形态 | 展开规则 |
| --- | --- |
| `YYYY-MM-DD` | 单日 |
| `Between YYYY-MM-DD - YYYY-MM-DD` | 闭区间逐日展开 |
| `Monday` / `Tuesday` / ... / `Sunday` | 展开为 `periodCode` 所属月份内所有对应星期 |
| `Weekends` | 展开为 `periodCode` 所属月份内所有周六、周日 |
| `Window HH:mm-HH:mm` | 首期忽略时间窗本身；它不单独生成日期 |

日期范围如果跨出目标 period 月份，首期建议只保留目标月份内日期，避免导出非本周期数据。

### 其他 Days Off 规则

以下规则首期不导出，因为无法直接确定具体 day off 日期，或语义不是明确日期请求：

- `Minimum Days Off Between Work Blocks`
- `Maximize Weekend Days Off`
- `Maximize Total Days Off`
- `Maximize Block of Days Off`
- `String of Days Off Starting on Date`
- `String of Days Off Ending on Date`
- `Waive Minimum Days Off`
- `Max Consecutive Days On`
- `Min Consecutive Days Off`
- `Min Consecutive Days Off In Window`
- `Days Off / Days On Pattern`
- `Shared Days Off With Employee`

如果后续算法要求这些规则，也应单独定义算法文件字段或规则表达方式，不混入明确日期 counter。

## Counter 聚合

聚合 key：

```text
crewId + isoDate + tier
```

每一次来源命中时，对对应 `Tn_Award_Counter` 加 1。

示例：

- Crew `F8030` 在 T1 里保存了 `2026-06-14`
- 同时 T1 里保存了 `Weekends`
- 如果 `2026-06-14` 是周末，则 T1 counter 输出 `2`

最终 CSV 按 `Crew_ID`、日期排序，列固定输出 `T1-T7`。

## 打包设计

首期包结构：

```text
DAYSOFF.csv
```

后续扩展：

```text
DAYSOFF.csv
PAIRING.csv
LINE.csv
RESERVE.csv
```

实现时可先建立 `algorithm-export` service，内部包含：

- Days Off rows builder
- CSV serializer
- `.tgz` packager

这样后续新增 Pairing / Line / Reserve 时，只需增加文件 builder 并写入同一个包。

## 错误处理

- `periodCode` 缺失：`400`, message 可为 `periodCode is required.`
- 非管理员：`403`, message 可为 `Admin access is required.`
- period 不存在但没有数据：建议仍返回空 `DAYSOFF.csv`（只有表头），便于算法侧稳定处理。
- 内部异常：`500`，记录 server log，不泄露 SQL 或敏感数据。

## 测试计划

后端自动化测试：

- route 测试：
  - 管理员可下载 `.tgz`
  - 非管理员返回 `403`
  - 缺少 `periodCode` 返回 `400`
  - 未登录返回 `401`
- service / helper 测试：
  - 单日 `YYYY-MM-DD` 展开
  - `Between` 日期范围逐日展开
  - `Monday` 等星期值按 period 月份展开
  - `Weekends` 展开周六、周日
  - 重复命中 counter 累加
  - T8-T24 不进入 CSV
  - 不可确定日期的规则被跳过
- 构建验证：
  - `npm --prefix pbs-server test`
  - `npm --prefix pbs-server run build`

QA 人工测试案例：

- 新增 `docs/test-cases/pbs/algorithm-export/<YYYY-MM-DD>-days-off-export.md`
- 覆盖管理员下载、非管理员拒绝、空数据、重复命中累加、weekday/weekends/range 展开。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 首期改动集中在后端 contract、权限、导出 service、route 和测试，拆分会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: `packages/contracts`、`pbs-server/src/services/admin 或 algorithm-export`、`pbs-server/src/routes`、`pbs-server/src/app.ts`、认证 payload、相关测试、spec 文档。
- Conflict risk: 中低，主要注意不要影响普通员工接口。
- Execution gate: 用户确认本 spec 后才进入实现。
