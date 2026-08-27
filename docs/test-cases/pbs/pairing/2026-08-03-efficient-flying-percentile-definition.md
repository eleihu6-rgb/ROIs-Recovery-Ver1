# Efficient Flying Percentile 定义管理验收用例

## 目标

验证管理员可以统一配置 Efficient Flying 百分位，PBS Portal、Pairing Search 和导出随后使用最新定义，同时 Bid 记录只保存方向，不保存百分比。

## 前置条件

- `dictionary` 中恰好存在一行 `PBS_EFFICIENT_FLYING_CONFIG / PERCENTILE`。
- 当前值为 `1–50` 的整数，例如 `20`。
- 准备一个管理员账号和一个可编辑 PBS Bid 的机组账号。

## 管理端配置

1. 管理员进入 Gantt `PBS > Bid Definitions`。
2. 验证存在 `Efficient Flying Percentile`，当前值显示为 `20%`。
3. 点击编辑，分别输入空值、`0`、`20.5` 和 `51`。
4. 验证输入框显示字段级错误，弹窗保持打开，数据库未更新。
5. 输入 `15` 并保存。
6. 验证弹窗关闭，列表立即显示 `15%`，审计人和更新时间已更新。

## Portal 与 Bid 数据

1. 机组账号打开 `Bid > Pairing > Efficient Flying First`。
2. 验证 `Efficient flying` 显示 `Top 15% by average daily credit`，切换后显示 `Bottom 15%`。
3. 关闭弹窗；管理员把定义改为另一个合法值；在同一 Portal 会话再次打开弹窗。
4. 验证弹窗主动请求配置，并显示新值，而不是复用旧缓存。
5. 保存 Current Bid、Standing Bid 和 Favorite 的 Efficient Flying 条件。
6. 验证持久化 payload 只含：

   ```json
   { "type": "efficient-flying-preference", "mode": "efficient" }
   ```

   或 `mode: "inefficient"`，不得出现百分比字段。

## 搜索与导出

1. 定义更新后等待最多 30 秒。
2. 执行 Pairing Search，验证 Top/Bottom cohort 使用最新百分比。
3. 分别执行 pbs-server 与 live-server 的算法导出入口。
4. 验证两条导出结果均按最新 dictionary 值生成；旧 Bid 无需重存。
5. 验证百分位边界仍保持现有规则：四舍五入、至少一条、cutoff 并列值全部纳入。

## 异常与发布门禁

- dictionary 行缺失、重复或值不在 `1–50` 时，配置读取、搜索和导出必须明确失败，不能使用代码默认值。
- 发布前执行只读 SQL，确认该 parent/code 恰好一行且 `code_value` 为 `1–50` 的整数；否则阻止发布。
- 回归 Redeye、Weekend、Credit Window 和 Minimum Base Layover 的读取与保存。
