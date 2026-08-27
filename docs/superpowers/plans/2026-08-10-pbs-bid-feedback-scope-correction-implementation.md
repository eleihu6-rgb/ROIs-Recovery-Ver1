# PBS Bid Feedback 候选范围修复实施计划

## 1. 实施目标

修复 Bid Feedback 在全量 Live Pairing 上先匹配、再用 Rank/Base 大量打叉的问题，使所有 Pairing Bid 先进入当前 Crew 的日期有效可申请池，并修正 PA 与算法方向的边界。

## 2. 实施步骤

1. 在 `pbs-server` 回归测试中锁定：Base Local Origin Date、逐日 Prime Base/Rank、Composition Rank、Occurrence 精确匹配、PA-only 与 exportDirection 行为。
2. 修改 Feedback 查询：候选池先执行有效 FLY、Period Origin Date、Crew 当日 Prime Base、Crew 当日 Rank/Composition 过滤；Occurrence 使用 `(pairingId, originDate)` 独立分支。
3. 修改资格组装：`IMP/MA/CR` 不参与 Pre-assignment；`PA overlap` 只产生 UI 原因，不改变算法导出方向。
4. 调整 Portal 列表状态：正常行白底灰勾、不合格行浅红红叉、选中不合格行保持浅蓝选中态并保留红色状态标记。
5. 更新自动化与人工 QA 用例，运行定向测试、Playwright、UI 标准检查和两个模块构建。

## 3. 验收标准

- Crew `19` 的 Feedback 不再出现其他 Base 或 CA/FO Pairing。
- `rawMatches` 在 Tier 合并前已完成 Period/FLY/Base/Rank 过滤。
- Period 内换 Base/Rank 时按 Pairing Origin Local Day 正确解析。
- Pairing Number/Occurrence 不绕过候选池。
- 只有 `source='PA'` 产生 overlap；PA 不清空 `exportDirection`。
- 页面不再出现满屏红叉，状态颜色与参考产品语义一致。
- 后端测试、Portal 测试、Playwright、`check:ui` 与 build 有明确结果。

## 4. 改动边界

- 不新增 migration、数据库字段、依赖或配置。
- 不修改 PBS Engine 和算法 CSV 格式。
- 不实现 Team Rule，也不处理失效历史 Pairing 选择的新展示契约。
- 不提交 Git，除非用户在本阶段另行明确授权。

