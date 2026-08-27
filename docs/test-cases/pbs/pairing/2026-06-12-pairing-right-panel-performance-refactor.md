# Pairing 右侧面板性能重构回归测试案例

日期：2026-06-12  
范围：PBS Portal Pairing 右侧面板、Pairing bid 控件、pool counts 展示、available properties 分页与搜索。

## 前置条件

- PBS Server 和 PBS Portal 可正常启动。
- 测试账号已登录 PBS Portal。
- 当前 bid month 有 Pairing property catalog、已有 Pairing bid 和至少一个可添加 property。

## 操作步骤与预期结果

1. 打开 `/pairing` 页面。
   - 预期：右侧 `Existing Pairing Properties` 与 `Add Pairing Property` 区域正常显示。
   - 预期：pool counts summary 初始状态、刷新按钮、当前 Tx 标签显示正常。

2. 切换左侧 `BIDDING CALENDAR` 的 active tier。
   - 预期：右侧 pool counts 自动按当前 tier 刷新或显示刷新中状态。
   - 预期：页面无空白、无布局跳动、无控制台错误。

3. 在 available properties 中切换 `All / Favorites`、输入搜索关键字、切换分页。
   - 预期：列表过滤和分页结果与重构前一致。
   - 预期：隐藏 tiers 时仍保持两列表格布局；favorites 中 tiers 控件显示正常。

4. 添加一个普通 catalog property。
   - 预期：配置弹窗、Add、成功提示、Existing 列表更新正常。
   - 预期：pool counts 进入需要刷新或刷新中状态，左侧日历相关数据不回退。

5. 编辑一个 existing property 的 bid 值或 tier。
   - 预期：保存成功提示正常，draftVersion / draft identity 不丢失。
   - 预期：规则冲突仍能阻止保存并显示错误提示。

6. 删除一个 existing property。
   - 预期：删除成功后该 property 从 Existing 列表移除。
   - 预期：刷新页面后结果仍一致。

7. 使用 Pairing bid 控件覆盖以下输入类型：
   - Date、Time、Duration、Percent、Percent or Duration、Date or DOW、Tag List、Pairing ID List。
   - 预期：输入、失焦格式化、Enter/逗号提交 tag、autocomplete loading/empty/error 状态均正常。

## 异常与边界场景

- 网络慢或 pool counts 接口失败时，summary 显示错误状态且页面其他操作可继续。
- autocomplete 搜索无结果时显示 empty label，不影响手动输入允许的 property。
- 当前 Tx 没有 active property 时，summary 显示 `No active pairing properties`。

## 回归范围

- Pairing property add / edit / delete。
- Pairing favorites save / remove。
- Search Pairings preview 入口。
- Bidding Calendar tier 与 Pairing right panel pool counts 联动。
- Pairing bid 控件基础输入行为。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- pairing-bid-control.test.tsx pairing-right-panel-layout.test.ts pairing-pool-counts.test.ts
npm test
npm run lint
npm run build
```
