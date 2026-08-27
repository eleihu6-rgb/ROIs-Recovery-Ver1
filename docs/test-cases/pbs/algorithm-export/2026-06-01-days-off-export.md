# PBS 算法 Days Off 导出人工测试用例

## 前置条件

- PBS Server 正常启动。
- 测试库存在隐藏管理员账号 `admin`，`pbs_user.is_admin = 1`；不要把真实 crew 账号设置为 admin。
- 测试库存在至少一个普通员工账号，`pbs_user.is_admin = 0`。
- 指定 `periodCode` 下存在若干 Current bid Days Off 数据，至少覆盖：
  - 单日 Prefer Off
  - `Between YYYY-MM-DD - YYYY-MM-DD`
  - `Monday` 等星期值
  - `Weekends`
  - 同一 crew、同一天、同一 tier 多来源重复命中

## 用例 1：管理员成功下载导出包

1. 使用管理员账号登录 PBS，获取 Bearer token。
2. 请求：
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3002/api/admin/algorithm-export?periodCode=Jun%202026" \
     -o pbs-algorithm-export-Jun-2026.tgz
   ```
3. 解压文件：
   ```bash
   tar -xzf pbs-algorithm-export-Jun-2026.tgz
   ```

预期结果：

- HTTP 状态码为 `200`。
- 响应头包含 `Content-Disposition`，文件名后缀为 `.tgz`。
- 解压后存在 `DAYSOFF.csv`。
- CSV 表头为：
  ```csv
  Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter
  ```

## 用例 2：普通员工不能下载

1. 使用普通员工账号登录 PBS，获取 Bearer token。
2. 请求管理员导出接口。

预期结果：

- HTTP 状态码为 `403`。
- 响应 message 为 `Admin access is required.`。

## 用例 3：缺少 periodCode 返回 400

1. 使用管理员 token 请求：
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3002/api/admin/algorithm-export"
   ```

预期结果：

- HTTP 状态码为 `400`。
- 响应 message 为 `periodCode is required.`。

## 用例 4：日期展开和 counter 累加

1. 准备同一 crew 在同一 period 下的 T1 Days Off：
   - 单日 `2026-06-14`
   - `Weekends`
2. 管理员下载对应 period 的导出包并查看 `DAYSOFF.csv`。

预期结果：

- `2026-06-14` 只出现为单独一天，不与其他日期合并。
- 如果 `2026-06-14` 是周末，则对应行 `T1_Award_Counter = 2`。
- `DayOff_Start_Time_UTC = 2026-06-14T00:00:00Z`。
- `DayOff_End_Time_UTC = 2026-06-15T00:00:00Z`。

## 用例 5：开放条件不导出

1. 准备 `Min Consecutive Days Off In Window` 或 `Minimum Days Off Between Work Blocks` 等 Days Off 规则。
2. 管理员下载对应 period 的导出包。

预期结果：

- 这些规则不会单独生成 `DAYSOFF.csv` 行。
- 已有明确日期类 Days Off 仍正常导出。

## 回归范围

- PBS 普通员工登录、session 恢复、登出不受影响。
- Pairing / Line / Reserve / Tier 页面现有接口不受影响。
- Days Off 页面保存 current draft 后，管理员导出接口能读取最新 Current bid 数据。
