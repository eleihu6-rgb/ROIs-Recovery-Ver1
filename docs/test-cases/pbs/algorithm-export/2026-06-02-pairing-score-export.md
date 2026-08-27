# PBS Algorithm Export Pairing Score QA 测试案例

日期：2026-06-02  
模块：PBS Server / Algorithm Export  
接口：`GET /api/admin/algorithm-export?periodCode=<periodCode>`

## 前置条件

- 使用管理员账号登录 PBS Server。
- 目标 bid period 存在 Current bid 数据，例如 `Jun 2026`。
- 至少准备一名 crew，其 Pairing 页面已有 Current Pairing bid：
  - 一条 award 条件能命中某个 live pairing。
  - 一条 avoid 条件能命中同一个或另一个 live pairing。
  - 可选：一条不支持搜索的 Pairing property，用于验证跳过日志。
- live schema 中目标 pairing 有 `pairing.id`，并尽量包含 `pairing.interface_id`。

## 测试步骤

1. 使用管理员 token 调用：

   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "http://localhost:3002/api/admin/algorithm-export?periodCode=Jun%202026" \
     -o pbs-algorithm-export-Jun-2026.tgz
   ```

2. 解压导出包：

   ```bash
   tar -tzf pbs-algorithm-export-Jun-2026.tgz
   tar -xzf pbs-algorithm-export-Jun-2026.tgz
   ```

3. 检查包内文件。
4. 打开 `PAIRING_SCORE.csv`。
5. 对照 Search Pairings 页面或数据库，确认目标 Pairing bid 条件命中的 pairing。

## 预期结果

- `.tgz` 包内包含：
  - `DAYSOFF.csv`
  - `PAIRING_SCORE.csv`
- `PAIRING_SCORE.csv` 表头为：

  ```csv
  Crew_ID,Pairing_ID,Interface_ID,T1_Award_Counter,T1_Avoid_Counter,T2_Award_Counter,T2_Avoid_Counter,T3_Award_Counter,T3_Avoid_Counter,T4_Award_Counter,T4_Avoid_Counter,T5_Award_Counter,T5_Avoid_Counter,T6_Award_Counter,T6_Avoid_Counter,T7_Award_Counter,T7_Avoid_Counter
  ```

- 只输出被 Pairing bid 条件命中的 pairing，不输出全量 0 counter 行。
- `Pairing_ID` 使用 live `pairing.id`。
- `Interface_ID` 使用 live `pairing.interface_id`；缺失时为空。
- award 条件命中时，对对应 `Tn_Award_Counter` 加 1。
- avoid 条件命中时，对对应 `Tn_Avoid_Counter` 加 1。
- 同一 crew、同一 pairing、同一 tier、同一 action 多次命中时，counter 累加。
- 不支持搜索的 Pairing property 不导致整体导出失败，服务端日志记录跳过原因。

## 异常与边界场景

- 非管理员调用接口应返回 `403`。
- 未登录调用接口应返回 `401`。
- 缺少 `periodCode` 应返回 `400`。
- 目标 period 没有 Pairing bid 时，`PAIRING_SCORE.csv` 只有表头。
- T8 及以上 Pairing bid 不进入 `PAIRING_SCORE.csv`。
- `DAYSOFF.csv` 仍保持原有导出行为。

## 回归范围

- Algorithm Export 管理员下载接口。
- Days Off 导出文件存在性和表头。
- Pairing Search 条件语义，尤其是 Flight Number、Redeye、Pairing Number。
- Pairing Number stable id 语义：保存和导出均使用 `pairingId`，不使用 label 作为主键。
