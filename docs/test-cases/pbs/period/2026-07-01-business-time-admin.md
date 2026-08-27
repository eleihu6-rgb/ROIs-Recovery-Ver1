# PBS Business Time 管理端回归用例

## 目标

验证 Gantt 管理端 `PBS Business Time` 能控制 PBS Portal 当前申请周期选择所使用的业务时间口径，并且不绕过 period 生命周期校验。

## 前置条件

- 管理员可访问 `Gantt > PBS Period`。
- PBS Portal 可登录 Cabin 用户。
- `F8/C` 至少存在 `Jun 2026`、`Aug 2026` period。
- `Aug 2026` 的 `bid_open_at` / `bid_close_at` 覆盖 `2026-07-03 08:00 Asia/Shanghai` 对应的业务时间，且状态可改为 `OPEN`。

## 用例 1：查看当前 Business Time 状态

1. 打开 `Gantt > PBS Period`。
2. 查看 `PBS Business Time` 卡片。

期望：

- 页面显示 `Source` 为 `SYSTEM TIME` 或 `OVERRIDE`。
- 页面显示 `Real Now` 与 `Business Now`。
- 页面不显示旧的 `Portal Active Period`、`Selection Mode`、`Manual Period` 管理入口。

## 用例 2：清空 override，恢复真实时间

1. 点击 `Use Real Time`。
2. 等待保存成功提示。
3. 点击 `Refresh`。
4. 打开 PBS Portal。

期望：

- 管理端显示 `SYSTEM TIME`。
- `Business Now` 接近服务器真实时间。
- Portal `Automatic` 按真实时间选择当前 period。

## 用例 3：设置 Business Time 到 Aug 申请窗口

1. 在 `PBS Business Time` 输入 `2026-07-03 08:00`。
2. 点击 `Set Business Time`。
3. 确认 `F8/C Aug 2026` 状态为 `OPEN`，且申请窗口覆盖该业务时间。
4. 等待最多 60 秒或重启 `pbs-server`。
5. 刷新 PBS Portal。

期望：

- 管理端显示 `OVERRIDE`。
- `Business Now` 接近 `2026-07-03 08:00 CST`。
- Portal 显示 `Aug 2026`。
- 如果 `Aug 2026` 为 `OPEN` 且在窗口内，申请入口可用。

## 用例 4：Business Time 不在窗口内时只读

1. 将 `PBS Business Time` 设置到目标 period 的 `bid_open_at` 之前或 `bid_close_at` 之后。
2. 刷新 PBS Portal。

期望：

- Portal 显示系统自动选中的当前周期。
- 如果 Business Time 不在申请窗口内，Portal 只读。
- 后端写接口仍拒绝保存。

## 回归范围

- `PBS Business Time` 卡片 status / set / clear。
- Portal Bidding Calendar / Line / Days Off / Pairing 当前周期显示与只读状态。
