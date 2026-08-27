# NPBS July 高覆盖 Playwright 实施计划

## 目标

依据已批准设计，选择 July 2026 的高覆盖 crew，通过真实 PBS Portal UI 建立正式接口改造前的 golden baseline，并在测试结束后把测试 crew 清理回 Existing=0。

## 范围

- 初始结构覆盖 5 人：`2005`、`13637`、`2222`、`2524`、`13428`，但当前运行环境均返回 Portal 403，不可用于真实 UI。
- 当前可登录最优 5 人：`264`、`844`、`906`、`1131`、`1185`，已逐个通过真实认证接口验证。
- 日期：`no-shift`，目标 period `202607`。
- 本阶段不调用正式 crew bid import 接口。
- coverage manifest、真实 fixture、issue JSON 和截图写入临时目录，不提交 Git。

## 步骤

1. Coverage manifest
   - 新增 deterministic greedy coverage 生成器。
   - 第一层 key：`page + action + propertyCode`。
   - 输出全集、每名 crew 的新增覆盖、5/8 人累计覆盖和未覆盖 key。
   - 用合成数据测试算法和 source SHA 绑定。

2. Playwright 数据安全
   - 保留每个页面 Existing=0 的 fail-fast 预检。
   - issue 输出目录支持环境变量，真实员工结果写入 `/tmp`。
   - 增加显式 cleanup 开关，仅清理本轮从零基线创建的页面。
   - cleanup 后逐页面断言 Existing=0，并把 cleanup receipt 写入结果。

3. Fixture 与测试
   - 生成五人 July `no-shift` fixture。
   - 运行 NPBS parser/generator/coverage 单元测试。
   - 校验 source SHA、663 effective crew、五人顺序和 16/20 覆盖率。

4. 真实 UI
   - 使用专用 smoke config、`workers=1`。
   - 跑五人所有实际包含条件的 Bid 页面。
   - 记录 placed/total、blocker、阶段耗时和 cleanup 状态。
   - 最终确认五人 Existing=0。

## 验收

- 全量结构 manifest 可重复得到初始 5 人 16/20、8 人 19/20；当前可登录最优 5 人覆盖 15/20。
- 五人运行前所有目标页面 Existing=0，否则该 crew 中止且不删除。
- 五人运行结果均有 runId/source SHA/placed/total/blocker/耗时。
- cleanup 只在显式开关启用时执行。
- cleanup 后所有本轮触及页面 Existing=0。
- 真实源数据产物不出现在 `git status`。
