# Line Property 删除与 Tx 修改并发控制 QA 测试案例

## 前置条件

- 测试账号可登录 PBS Portal。
- 当前 bid period 已打开。
- Line 页面可正常加载旧库可见 property。
- 浏览器 DevTools Network 面板已打开，用于观察接口调用。

## 用例 1：新增不同 Tx 的相同 Line Property

步骤：

1. 打开 Line 页面。
2. 添加一个 Line property，例如 `Max Credit Window`，选择 `T2`。
3. 确认该 property 已出现在 `EXISTING LINE PROPERTIES`。
4. 在右侧新增区选择同一个 property，但只选择 `T1`。
5. 点击 Add。

预期结果：

- 第二条 `T1` property 可以新增成功。
- Network 中新增只调用一次 `POST /api/line-bids/current/properties`。
- 不出现 `This property already exists.`，除非 active tiers、bid、modifier 完全一致。

## 用例 2：完全重复新增被拦截

步骤：

1. Line 页面已有 `Max Credit Window` + `T1`。
2. 在新增区保持同一个 property、同一个 bid、同一个 `T1`。
3. 点击 Add。

预期结果：

- 前端提示 `This property already exists.`。
- 不发起新增接口。

## 用例 3：删除 Existing Property 只调用逐条接口

步骤：

1. Line 页面已有至少一条 existing property。
2. 快速连续点击该 property 的删除图标。
3. 观察 Network。

预期结果：

- 只调用一次 `DELETE /api/line-bids/current/properties/:propertyGroupKey`。
- 不调用 `PUT /api/line-bids/current` 整份 draft 保存。
- 删除进行中，其他 Add / Tx 操作短暂禁用。
- 删除成功后该 property 从列表移除，Tier 页面相关数据刷新。

## 用例 4：修改 Existing Property 的 Tx 只调用逐条接口

步骤：

1. Line 页面已有一条 existing property。
2. 快速连续点击该 property 的某个 Tx 按钮，例如 `T2`。
3. 观察 Network。

预期结果：

- 只调用一次 `PATCH /api/line-bids/current/properties/:propertyGroupKey`。
- 不调用 `PUT /api/line-bids/current` 整份 draft 保存。
- PATCH pending 时 existing Tx 和新增区 Tx 不可继续点击。
- 成功后 Tx 状态保持更新，draftVersion 正常推进。

## 用例 5：并发版本冲突提示

步骤：

1. 在两个浏览器窗口打开同一账号的 Line 页面。
2. 窗口 A 修改一条 existing property 的 Tx 并成功保存。
3. 不刷新窗口 B，继续修改同一 draft 的 property 或删除 property。

预期结果：

- 窗口 B 返回 409 时显示保存失败提示。
- 不静默覆盖窗口 A 的最新 draft。
- 刷新后窗口 B 能看到窗口 A 的最新结果。

## 回归范围

- Line property add / delete / patch。
- Line favorite / unfavorite 不受影响。
- Days Off 和 Pairing 的 RuleBid 通用面板行为不回退。
- Tier 页面数据刷新不丢失。
- 关键接口本地响应时间应小于 2 秒。
