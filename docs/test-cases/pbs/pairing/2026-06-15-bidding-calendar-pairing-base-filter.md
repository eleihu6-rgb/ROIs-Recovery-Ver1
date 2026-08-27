# Bidding Calendar Pairing Number 按当前用户 Base 过滤测试用例

日期：2026-06-15  
模块：PBS Portal / Pairing / Bidding Calendar  
关联设计：`docs/superpowers/specs/2026-06-15-pbs-bidding-calendar-pairing-base-filter-design.md`

## 前置条件

- 测试用户已登录 PBS Portal。
- 测试用户在 `pbs_user.base` 或 live `crew_base` 中有明确 base，例如 `YYZ`。
- 当前 bid period 有已保存的 Pairing Number bid。
- 测试数据中至少准备两个 saved Pairing Number：
  - 一个 live `pairing.base = 当前用户base`。
  - 一个 live `pairing.base != 当前用户base`。

## 测试步骤

1. 进入 `/fpqe/pbs/pairing`。
2. 等待左侧 `BIDDING CALENDAR` 加载完成。
3. 查看 calendar 中由 saved Pairing Number bid 生成的 pairing event。
4. 点击可见的 pairing event，打开 pairing bid detail。
5. 在右侧 `ADD PAIRING PROPERTIES` 中添加或编辑 `Pairing Number` 条件，输入同一组 pairing number 前缀。
6. 查看 autocomplete / occurrence 结果。

## 预期结果

- 左侧 `BIDDING CALENDAR` 只显示当前用户 base 的 Pairing Number bid event。
- 非当前用户 base 的 saved Pairing Number 不显示在左侧日历上。
- 点击可见 pairing event 后，detail 弹窗只包含当前用户 base 的 pairing。
- 右侧 Pairing Number autocomplete / occurrence 结果与左侧日历口径一致，均不出现其他 base 的 pairing。
- 页面不新增 base 下拉框或 base 参数输入。

## 异常与边界场景

- 如果当前用户 base 缺失，左侧 Pairing Number bid event 不应无过滤展示；允许后端返回 warning。
- 如果当前 bid 没有 saved Pairing Number bid，左侧 weekend / Prefer Off 等其他事件仍应正常展示。
- 如果 saved Pairing Number 同时包含当前 base 和其他 base pairing，只展示当前 base 的部分。

## 回归范围

- `/fpqe/pbs/pairing` 左侧 `BIDDING CALENDAR`。
- Pairing Number 条件 autocomplete。
- Pairing Number occurrence 选择。
- 点击 calendar pairing event 后的 pairing detail 弹窗。
- `SEARCH PAIRINGS` 和 current rules counts 不应受影响。
