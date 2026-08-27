# PBS Business Time CLI 设计

日期：2026-05-01  
作者：Codex  
状态：已确认，已实施

## 背景

PBS Server 已支持 Business Time Override：

- 配置存储在 `dictionary` 的 `SYS_PARAM` 下。
- `PBS_BUSINESS_TIME_MODE` 第一版使用 `ROLLING`。
- `PBS_BUSINESS_TIME_ANCHOR` 表示业务时间锚点。
- `PBS_BUSINESS_TIME_ANCHOR_REAL` 表示真实时间锚点。
- 业务时间只影响 current period/current draft/calendar 等业务判断，不影响审计时间、日志、JWT、cache TTL。

目前修改这些值需要手写 SQL，不方便日常测试。需要在 `pbs-server/src/scripts` 下新增一个便捷脚本，让开发者可以一条命令切换或恢复 PBS 业务时间。

## 目标

1. 提供一个 `pbs-server` npm script，方便设置 PBS business time。
2. 不带时间参数时，恢复真实当前时间。
3. 带紧凑时间参数时，设置 PBS 业务时间锚点。
4. 支持查看当前业务时间配置状态。
5. 脚本只修改 `dictionary` 中 PBS business time 相关参数，不修改业务数据。
6. 输入格式简单、明确，适合复制和日常调试。

## 命令设计

新增 npm script：

```bash
npm run business-time
```

等价于恢复真实时间：

```bash
npm run business-time -- clear
```

设置 PBS 业务时间：

```bash
npm run business-time -- 20260401120000
```

查看当前状态：

```bash
npm run business-time -- status
```

## 时间输入规则

设置命令的时间格式固定为：

```text
YYYYMMDDHHmmss
```

例如：

```text
20260401120000
```

含义为：

```text
2026-04-01 12:00:00
```

第一版按 `Asia/Shanghai` 解释输入时间，然后转换成 UTC ISO 字符串写入数据库。

例如在中国时区输入：

```bash
npm run business-time -- 20260401120000
```

数据库中写入的业务锚点应是：

```text
2026-04-01T04:00:00.000Z
```

同时 `PBS_BUSINESS_TIME_ANCHOR_REAL` 自动写成脚本执行时的真实 UTC 时间。

## 行为设计

### 无参数 / clear

执行：

```bash
npm run business-time
```

或：

```bash
npm run business-time -- clear
```

行为：

- `PBS_BUSINESS_TIME_MODE` 保持 `ROLLING`。
- `PBS_BUSINESS_TIME_ANCHOR` 设置为空字符串。
- `PBS_BUSINESS_TIME_ANCHOR_REAL` 设置为空字符串。
- PBS Server 随后 fallback 到真实系统时间。

### 设置业务时间

执行：

```bash
npm run business-time -- 20260401120000
```

行为：

- 校验参数必须匹配 `YYYYMMDDHHmmss`。
- 校验日期时间本身有效。
- 将输入按 `Asia/Shanghai` 解释。
- 转换为 UTC ISO 后写入 `PBS_BUSINESS_TIME_ANCHOR`。
- 将脚本执行时的真实 UTC 时间写入 `PBS_BUSINESS_TIME_ANCHOR_REAL`。
- 将 `PBS_BUSINESS_TIME_MODE` 写为 `ROLLING`。

语义：

```text
business_now = anchor_business_time + (real_now - anchor_real_time)
```

所以脚本执行 10 分钟后，PBS business time 也推进 10 分钟。

### status

执行：

```bash
npm run business-time -- status
```

输出应包含：

- 当前 mode。
- 当前 anchor。
- 当前 anchor real。
- 当前真实 UTC 时间。
- 计算出来的当前 PBS business time。
- 当前 source：`system` 或 `override`。

## 文件设计

沿用现有 `pbs-server/src/scripts` 风格，拆成 CLI 入口、core 逻辑和测试：

```text
pbs-server/src/scripts/pbs-business-time.ts
pbs-server/src/scripts/pbs-business-time-core.ts
pbs-server/src/scripts/pbs-business-time.test.ts
```

更新：

```text
pbs-server/package.json
```

新增：

```json
"business-time": "tsx src/scripts/pbs-business-time.ts"
```

## 数据访问

脚本使用 `pbs-server/.env` 中的 `DATABASE_URL`。

脚本启动时应确保以下配置项存在：

- `PBS_BUSINESS_TIME_MODE`
- `PBS_BUSINESS_TIME_ANCHOR`
- `PBS_BUSINESS_TIME_ANCHOR_REAL`

如果缺失，脚本应幂等插入。

脚本只允许操作：

```sql
dictionary
```

且只允许操作：

```text
parent_code = 'SYS_PARAM'
code in (
  'PBS_BUSINESS_TIME_MODE',
  'PBS_BUSINESS_TIME_ANCHOR',
  'PBS_BUSINESS_TIME_ANCHOR_REAL'
)
```

## 错误处理

非法输入示例：

```bash
npm run business-time -- 2026-04-01
npm run business-time -- abc
npm run business-time -- 20261301120000
```

行为：

- 输出明确错误说明。
- 不写数据库。
- 退出码非 0。

数据库连接失败：

- 输出简短错误。
- 不打印数据库密码或完整连接串。
- 退出码非 0。

## 不做范围

1. 不新增 Portal 配置页面。
2. 不支持 `FROZEN` 模式。
3. 不支持多时区参数。
4. 不修改服务器系统时间。
5. 不修改 live pairing 数据。
6. 不修改审计字段语义。

## 测试计划

新增单元测试覆盖：

1. `20260401120000` 可以解析为 `2026-04-01T04:00:00.000Z`。
2. 非法紧凑时间会被拒绝。
3. 无参数解析为 `clear`。
4. `status` 不写入配置。
5. set/clear 只更新 PBS business time 三个 key。

整体验证：

```bash
npm run verify:pbs
```

## 验收标准

1. `npm run business-time` 可以恢复真实时间。
2. `npm run business-time -- 20260401120000` 可以将 PBS 业务时间设为 `2026-04-01 12:00:00 Asia/Shanghai`。
3. `npm run business-time -- status` 可以看到当前 source 和计算后的 business time。
4. 脚本不会打印敏感连接信息。
5. `npm run verify:pbs` 通过。
