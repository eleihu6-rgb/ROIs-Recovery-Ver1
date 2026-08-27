# PBS Period 移除 Roster Period ID 输入测试

## 目标

确认管理员只通过 `Period Code` 创建和编辑 PBS Period，页面及请求均不再暴露数据库主键 `Roster Period ID`。

## 前置条件

- 使用具备 PBS Admin 权限的账号登录 Gantt。
- 打开 `PBS Admin > Period` 页面。

## 用例

### 1. 新增 Period

1. 点击 `Add Period`。
2. 确认弹窗中不存在 `Roster Period ID` 字段。
3. 填写合法的 `Period Code`、Bid Open、Bid Close 并保存。
4. 确认新增成功，列表显示新 Period。
5. 检查 POST 请求体，确认不存在 `rosterPeriodId`。

### 2. 编辑 Period

1. 点击已有 Period 的编辑按钮。
2. 确认弹窗中不存在 `Roster Period ID` 字段。
3. 修改 Description 并保存。
4. 确认更新成功。
5. 检查 PATCH 请求体，确认不存在 `rosterPeriodId`；更新目标由 URL 中的 Period ID 确定。

### 3. 旧请求兼容边界

1. 向新增接口发送包含 `rosterPeriodId` 的请求体。
2. 确认接口返回 HTTP 400。
3. 向编辑接口发送包含 `rosterPeriodId` 的请求体。
4. 确认接口返回 HTTP 400。

### 4. 自动关联 roster_period

1. 使用能匹配现有 `roster_period.name` 或 `roster_period.roster_period` 的 Period Code 新增。
2. 确认后端更新匹配记录，而不是要求用户提供主键。
3. 使用没有匹配记录的合法 Period Code 新增。
4. 确认后端自动创建对应 `roster_period`。

## 预期结果

- 用户无法查看或填写数据库主键。
- 新增、编辑仍正常完成。
- 后端仅根据业务字段自动匹配或创建 `roster_period`。
- 数据库表结构及现有外键关系不变，无需 migration。
