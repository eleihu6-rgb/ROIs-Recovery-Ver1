# PBS Work Day Preference 原型 v2 实施计划

日期：2026-07-13
状态：已获用户批准，待执行

## 目标

重做独立的 Work Day Preference 可交互原型，使其视觉和交互贴合已确认的 PBS Pairing 弹窗，同时保持 property 110 的日期 / 星期与 Any / Every 语义。

## 步骤

1. 更新两个开发期 HTML 原型副本，采用紧凑 Pairing 弹窗、统一的 Tier / segmented control / footer 比例。
2. 用自定义英文日期触发器和日历弹层替换原生日期输入；实现多个日期 chip、星期选择及 From / To 范围选择。
3. 删除 Rule Preview、实时结果句、模式帮助小字和浮层说明；切换模式时保留各自草稿，只用 footer 表达完成度。
4. 通过浏览器逐项验证默认值、具体日期 / 星期模式、范围模式、非法范围禁用、模式草稿保留和无网络请求。

## 写入边界

- 仅：`.superpowers/brainstorm/work-day-preference-20260713/work-day-preference-v1.html` 与 `pbs-portal/.superpowers/work-day-preference-v1.html`。
- 不修改：`pbs-portal/src`、contracts、server、SQL、产品测试或产品运行链路。
- 不提交、不推送 Git；原型文件为开发期预览资产。
