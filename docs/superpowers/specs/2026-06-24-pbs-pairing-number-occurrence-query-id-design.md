# PBS Pairing Number Occurrence 查询参数修复设计

## 背景

导入文件里的 Pairing Number（例如 `T4542`）需要映射到系统内部的 `pairing.id` 后再保存。导入逻辑已经按目标周期、base/rank 查找对应 pairing，并把内部 `pairingId` 写入 `pairing-occurrence-list`。

当前问题发生在编辑 Pairing Number 条件时：弹窗展示应显示用户可读的 Pairing Number，但查询 run dates 的 `/pairing-search/pairing-occurrences` 接口仍要求内部数字 `pairingId`。前端把显示值 `T4542` 传给接口后，后端校验 `pairingId` 为纯数字失败，页面显示 “Unable to load pairing run dates right now.”。

## 目标

- 保持导入保存结果与手动录入一致：业务关联字段使用内部 `pairingId`，显示字段使用 Pairing Number。
- 编辑弹窗展示仍显示 `T4542` / `M4959` 这类 Pairing Number。
- 查询 run dates 时传内部 `pairingId`，不再把显示值当作接口参数。

## 范围

- 修改 `pbs-portal` Pairing Number 配置弹窗的 occurrence 查询参数来源。
- 更新现有前端测试，覆盖新增和编辑 existing `pairing-occurrence-list` 时都用内部 `pairingId` 调接口。
- 不修改导入解析、数据库结构、后端接口契约。

## 验收标准

- 打开导入生成的 Pairing Number specific-date bid，弹窗里仍显示 Pairing Number，不显示内部数字 id。
- 弹窗请求 `/pairing-search/pairing-occurrences` 时 `pairingId` 使用内部数字 id。
- 已有 Pairing Number specific-date 测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复点集中在一个前端组件和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx` 与相关测试。
- Conflict risk: 低。
- Execution gate: 用户已确认“要这么做”后执行。
