# PBS Business Time Override 设计

日期：2026-05-01  
作者：Codex  
状态：已确认，已实施

## 背景

当前真实日期已经进入 2026-05-01，但 live `f8.pairing` 主要只有 2026-03、2026-04 的 pairing 数据：

- 2026-05 originate pairing 数量为 0。
- 2026-04 originate 但跨进 2026-05 的 carry-out pairing 有 33 条。
- `f8_pbs.pbs_period` 当前为空，因此 PBS 当前 period 很容易 fallback 到真实当前月份。

这会影响 PBS Portal / PBS Server 的功能测试：真实时间进入 5 月后，用户希望继续回到 4 月业务语境测试 Days Off、Pairing、Tier 和日历闭环。

## 目标

1. 在 PBS 模块内提供一个“业务当前时间”开关。
2. 不修改服务器系统时间。
3. 配置开启后，PBS 业务时间从指定 anchor 开始，随着真实时间继续推进。
4. 配置关闭后，PBS 使用真实当前时间。
5. 只影响 PBS 的业务时间判断，例如 current period、current draft、calendar、bid window 等。
6. 不影响数据库审计时间、日志时间、JWT 过期、cache TTL、服务健康检查。
7. 不生成不存在的 live pairing 数据；如果 5 月没有 pairing，把业务时间切到 5 月也不会凭空出现 5 月 pairing。

## 时间模型

采用 `ROLLING` 模式作为第一版默认语义。

```text
business_now = anchor_business_time + (real_now - anchor_real_time)
```

例如：

```text
PBS_BUSINESS_TIME_MODE        = ROLLING
PBS_BUSINESS_TIME_ANCHOR      = 2026-04-01T12:00:00Z
PBS_BUSINESS_TIME_ANCHOR_REAL = 2026-05-01T18:00:00Z
```

真实设置完成时，PBS 业务时间为：

```text
2026-04-01T12:00:00Z
```

真实经过 10 分钟后，PBS 业务时间为：

```text
2026-04-01T12:10:00Z
```

因此，如果用户在这 10 分钟后添加 Off 或 Pairing，业务语义上就是在 `2026-04-01T12:10:00Z` 进行操作。

但第一版不新增 `business_created_at` / `business_updated_at` 字段。保存数据时：

- 业务判断使用 `business_now`。
- `created_at` / `updated_at` / `last_modified_at` 继续使用真实时间。

## 配置存储

不新增业务表，复用现有 `dictionary` 表。

新增 `SYS_PARAM` 参数：

```text
parent_code = SYS_PARAM
code        = PBS_BUSINESS_TIME_MODE
code_value  = ROLLING
```

```text
parent_code = SYS_PARAM
code        = PBS_BUSINESS_TIME_ANCHOR
code_value  = 2026-04-01T12:00:00Z
```

```text
parent_code = SYS_PARAM
code        = PBS_BUSINESS_TIME_ANCHOR_REAL
code_value  = 2026-05-01T18:00:00Z
```

关闭 override 的方式：

- 删除 `PBS_BUSINESS_TIME_ANCHOR`，或
- 将 `PBS_BUSINESS_TIME_ANCHOR.code_value` 置空。

`PBS_BUSINESS_TIME_MODE` 第一版只支持：

- `ROLLING`
- 可预留 `FROZEN`，但本轮可以不实现 UI 和完整行为。

## 设置方式

第一版不做 Portal 配置页面。

通过 migration 先注册参数 key，但默认不启用 override：

- `PBS_BUSINESS_TIME_MODE = ROLLING`
- `PBS_BUSINESS_TIME_ANCHOR = ''`
- `PBS_BUSINESS_TIME_ANCHOR_REAL = ''`

开发或测试时执行 SQL 修改参数。推荐 SQL 模板：

```sql
update dictionary
set code_value = 'ROLLING', updated_by = 'system', updated_at = now()
where parent_code = 'SYS_PARAM' and code = 'PBS_BUSINESS_TIME_MODE';

update dictionary
set code_value = '2026-04-01T12:00:00Z', updated_by = 'system', updated_at = now()
where parent_code = 'SYS_PARAM' and code = 'PBS_BUSINESS_TIME_ANCHOR';

update dictionary
set code_value = now()::text, updated_by = 'system', updated_at = now()
where parent_code = 'SYS_PARAM' and code = 'PBS_BUSINESS_TIME_ANCHOR_REAL';
```

关闭 override：

```sql
update dictionary
set code_value = '', updated_by = 'system', updated_at = now()
where parent_code = 'SYS_PARAM'
  and code in ('PBS_BUSINESS_TIME_ANCHOR', 'PBS_BUSINESS_TIME_ANCHOR_REAL');
```

## 服务端设计

新增 PBS business clock helper，例如：

```text
pbs-server/src/services/business-time/business-clock.ts
```

职责：

1. 从 `dictionary` 读取 PBS business time 参数。
2. 校验时间格式。
3. 返回 `businessNow`。
4. 返回必要 warning，用于日志或后续 API debug。
5. 使用短 TTL cache，例如 30 秒或 60 秒，避免每个请求都查库。

第一版错误策略：

- anchor 为空：关闭 override，返回真实时间。
- mode 缺失：默认 `ROLLING`。
- mode 非法：fallback 到真实时间，并记录 warning。
- anchor 非法：fallback 到真实时间，并记录 warning。
- anchor_real 非法或为空：fallback 到真实时间，并记录 warning。

这样配置写错不会把 PBS 服务打挂。

## Current Period 设计

当前 `resolveCurrentPeriod` 逻辑：

1. 优先取 status = `OPEN` 的 period。
2. 没有 OPEN 则取最新 period。
3. `pbs_period` 为空时 fallback 到真实当前月份。

第一版要改为：

1. 调用 `businessClock.getBusinessNow()`。
2. 如果 `pbs_period` 中存在覆盖 `businessNow` 的 OPEN period，优先使用它：

```text
status = OPEN
bid_open_at <= businessNow
businessNow <= bid_close_at
```

3. 如果没有匹配的 OPEN period，但存在其他 period，可继续沿用当前的 latest fallback，避免破坏现有数据。
4. 如果 `pbs_period` 为空，使用 `businessNow` 生成 fallback period code，例如 `Apr 2026`。

这样在当前 `pbs_period` 空表场景下，只要配置：

```text
PBS_BUSINESS_TIME_ANCHOR = 2026-04-01T12:00:00Z
```

PBS current period 就会 fallback 到 `Apr 2026`，从而继续使用现有 4 月 pairing 数据测试。

## 前端影响

第一版尽量不让 `pbs-portal` 直接判断业务当前时间。

前端继续消费后端返回的：

- `periodCode`
- `bidContext`
- calendar events
- draft meta

只有未来出现“Today 高亮 / 倒计时 / 当前业务时间显示”时，才需要新增 API 返回 `businessNow`。

## 不做范围

1. 不修改服务器系统时间。
2. 不修改 live pairing / pairing_segment 数据。
3. 不新增 `business_created_at` / `business_updated_at` 字段。
4. 不接入 live-server、gantt、rule-engine、po-engine、ro-engine。
5. 不做 Portal 配置页面。
6. 不生成 5 月或 6 月 pairing 测试数据。
7. 不让审计字段、日志、JWT、cache TTL 使用 business time。

## 数据库变更

只新增 migration SQL，用于注册 dictionary 参数；如果目标 PBS schema 还没有基础 `dictionary` 表，则按 `sql/schema/01-base_pg.sql` 的基础定义补齐该系统表：

```text
sql/migration/YYYY-MM-DD-add-pbs-business-time-override-config.sql
```

该 migration 必须幂等：

- 确保 `dictionary` 基础系统表存在。
- 确保 `SYS_PARAM` 顶级节点存在。
- 插入或保留 `PBS_BUSINESS_TIME_MODE`。
- 插入或保留 `PBS_BUSINESS_TIME_ANCHOR`。
- 插入或保留 `PBS_BUSINESS_TIME_ANCHOR_REAL`。

默认不启用 override，即 anchor 值为空。

## 测试计划

后端：

1. business clock 无配置时返回真实时间。
2. business clock 在 ROLLING 模式下按真实经过时间推进。
3. business clock 配置非法时 fallback 真实时间并返回 warning。
4. `resolveCurrentPeriod` 在 `pbs_period` 空表时使用 business time 生成 fallback period code。
5. `resolveCurrentPeriod` 在存在覆盖 businessNow 的 OPEN period 时选择该 period。
6. Days Off / Pairing / Calendar service 继续使用同一 current period 逻辑。

前端：

1. 原有页面不需要知道 override 细节。
2. existing tests 不回归。

验证：

```bash
npm run verify:pbs
```

## 验收标准

1. 配置为空时，PBS 行为保持现状。
2. 配置为 `ROLLING + 2026-04-01T12:00:00Z + anchor_real` 后，PBS current period fallback 为 `Apr 2026`。
3. 真实经过 10 分钟后，business now 推进 10 分钟。
4. Days Off、Pairing、Bidding Calendar 使用同一个 business current period。
5. `created_at` / `updated_at` 等审计字段仍使用真实时间。
6. `npm run verify:pbs` 通过。
