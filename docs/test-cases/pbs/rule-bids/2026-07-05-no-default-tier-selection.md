# PBS Portal 新增 Bid 不默认选择 T1 回归测试

## 前置条件

- 使用可编辑 bid period 的 PBS Portal 账号登录。
- Days Off、Line、Pairing、Reserve 页面可正常加载真实草稿数据。
- 当前草稿允许新增 bid。

## 测试步骤

1. 进入 Days Off，打开一个需要配置的新增 property 弹窗。
2. 观察 `TIERS` 区域。
3. 不选择任何 `T1-T7`，尝试查看 `ADD BID` 状态。
4. 选择任意一个 tier，例如 `T2`，再点击 `ADD BID`。
5. 进入 Line，重复步骤 1-4。
6. 进入 Pairing，打开一个 catalog property 的新增配置弹窗，重复步骤 1-4。
7. 进入 Reserve Legacy 模式，点击 calendar 日期打开 Reserve Day On popover，重复步骤 2-4。
8. 在 Reserve Legacy 模式点击 `ADD SHORT CALL TYPE`，重复步骤 2-4。
9. 编辑一个已有 bid，确认已保存的 tiers 仍然按原值显示。
10. 添加一个已保存 Favorite，确认 Favorite 继续按保存时的 tiers 直接添加。

## 预期结果

- 所有普通新增弹窗/弹层打开时，`T1-T7` 全部未选中。
- 未选择 tier 时，`ADD BID` / `SAVE FAVORITE` 不可点击。
- 选择至少一个 tier 后，可以提交新增 bid。
- 提交后保存的 tiers 只包含用户显式选择的 tier。
- 编辑已有 bid 时不会清空原有 tier。
- Favorite 保持保存时的 tier 配置，不被强制清空。

## 异常与边界

- 选择 `T2` 而不选择 `T1` 时，保存结果中 `T1` 应为 inactive，`T2` 应为 active。
- Reserve calendar 在未选择 tier 时不能创建 Reserve Day On / Prefer Off。
- Short Call Type 在未选择 tier 时不能创建 bid。
- 如果新增 bid 与同 tier 已有规则冲突，应继续显示原有冲突提示。

## 回归范围

- Days Off 新增 property 配置弹窗。
- Line 新增 property 配置弹窗。
- Pairing 新增 catalog property 配置弹窗。
- Reserve calendar 新增 bid popover。
- Reserve Short Call Type 新增弹窗。
- 已有 bid 编辑、Favorite 直接添加、Tier review 页面不在本次行为变更范围内。
