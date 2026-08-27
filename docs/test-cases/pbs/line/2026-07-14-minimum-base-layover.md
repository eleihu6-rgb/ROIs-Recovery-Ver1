# PBS Line Minimum Base Layover 人工测试用例

## 范围

- 条件：`Minimum Base Layover`
- Bid type：`Line`
- property code：`407`
- 系统最小值：从 `dictionary` 的 `PBS_LINE_MINIMUM_BASE_LAYOVER` 读取，当前默认 `013:00`

## 前置条件

1. 已执行 `sql/migration/2026-07-14-pbs-minimum-base-layover.sql`。
2. PBS Portal 可以登录到 Line Bid 页面。
3. 当前 bid period 可编辑。

## 用例

### 1. Catalog 展示

1. 打开 Line Bid 页面。
2. 在 Add Line Properties 中搜索 `Minimum Base Layover`。

期望：

- 可看到 `Minimum Base Layover`。
- 不再显示旧名称 `Min Base Layover`。

### 2. 默认配置弹窗

1. 点击 `Minimum Base Layover` 的新增按钮。

期望：

- 弹窗标题为 `Configure Minimum Base Layover`。
- 先显示 `TIERS`，默认至少有一个 tier 可保存。
- 条件区域标题为 `MINIMUM BASE LAYOVER`。
- 时长输入框显示公司最小值，当前为 `13:00`。
- 下方提示 `Minimum 13:00`。

### 3. 保存有效值

1. 输入 `14:00`。
2. 点击 `ADD BID`。

期望：

- 新 bid 保存成功。
- 右侧 existing summary 显示类似 `At least 14:00 base layover`。
- 刷新页面后仍能看到该条件和值。

### 4. 拒绝低于系统最小值

1. 打开 `Minimum Base Layover`。
2. 输入 `12:59`。

期望：

- 页面提示 `Minimum Base Layover must be at least 13:00.`。
- `ADD BID` 禁用或保存失败。

### 5. 格式校验

1. 输入 `13:75` 或非时长文本。

期望：

- 页面提示 `Minimum Base Layover must use HH:MM.`。
- 不能保存。

### 6. Favorite

1. 输入 `17:00`。
2. 点击 `SAVE FAVORITE`。
3. 切换到 favorited tab 后新增该 favorite。

期望：

- favorite 保存成功。
- 从 favorite 新增后 bid 值仍为 `17:00`。

## 回归点

- `Credit Window Preference` 的 Low/High/Custom 行为不变。
- `Commuter Pattern` 的专用弹窗不变。
- Pairing / Days Off / Reserve / Standing Bid 页面不应出现 `Minimum Base Layover`。
