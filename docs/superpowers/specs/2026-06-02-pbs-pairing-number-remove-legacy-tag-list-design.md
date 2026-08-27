# PBS Pairing Number 移除旧 tag-list 兼容设计

## 背景

Pairing Number 已经改为稳定 ID 语义：

- 整月选择使用 `pairing-id-list`，保存稳定的 `pairing.id`。
- 指定日期 / 具体 run 选择使用 `pairing-occurrence-list`，保存 `pairingId + originDate`。
- `value` / `label` / `pairingNumber` 只用于展示和搜索，不作为保存或查询主键。

旧实现中仍残留 Pairing Number 的 `tag-list` / `tag-list-date` 兼容路径，会让语义不干净，也容易重新引入“展示字符串当主键”的问题。

## 目标

清理 Pairing Number 的旧 bid 类型兼容：

- Pairing Number 不再接受 `tag-list`。
- Pairing Number 不再接受 `tag-list-date`。
- 后端收到旧类型直接返回 400。
- 前端 Pairing Number 配置弹窗只根据 `pairing-id-list` / `pairing-occurrence-list` 判断整月或指定日期模式。
- 非 Pairing Number 条件继续保留 `tag-list` / `tag-list-date`，不扩大删除范围。

## 范围

本次只改 Pairing Number 链路：

- 后端 Pairing draft normalization。
- 后端 Pairing Number 指定日期 day-off 冲突检测。
- 前端 Pairing Number 配置弹窗初始化和编辑逻辑。
- 相关单元测试。

不改：

- Days Off / Reserve / Line 的 `tag-list`。
- Pairing 里机场、城市、航班号、员工号等正常 `tag-list` 条件。
- 数据库结构。
- 全局 contract 的 `tag-list` 类型定义。

## 设计

### 后端

`propertyCode === 102` 时：

- `pairing-id-list`：整月 Pairing Number，校验 `pairingIds` 必须是稳定数字 ID。
- `pairing-occurrence-list`：指定日期 / run，校验每项必须有稳定 `pairingId` 和 `originDate`。
- 其他 bid 类型：直接 400，错误文案保持“必须从列表选择 Pairing IDs”语义。

删除旧逻辑：

- 不再把 Pairing Number 的 `tag-list + paramB(date)` 反序列化成 `tag-list-date`。
- 不再 merge Pairing Number 的 `tag-list-date`。
- day-off 冲突检测只处理 `pairing-occurrence-list` 指定 run。

### 前端

Pairing Number 配置弹窗：

- `pairing-occurrence-list` 打开时进入 Specific Date。
- 其他 Pairing Number 新草稿默认 `pairing-id-list`，进入 Entire Month。
- 不再使用 `tag-list-date` 判断 Pairing Number 模式。
- 不再为旧 `tag-list-date` 自动选择 run。

### 测试

补充 / 修改测试以覆盖：

- Pairing Number 旧 `tag-list` / `tag-list-date` 保存失败。
- Pairing Number 整月保存 `pairing-id-list` 正常。
- Pairing Number 指定日期保存 `pairing-occurrence-list` 正常。
- 指定日期 day-off 冲突检测只基于 `pairing-occurrence-list`。

## 验收标准

- Pairing Number payload 中不再出现 `tag-list` / `tag-list-date`。
- Pairing Number 旧类型请求不会被兼容转换。
- Pairing Number 添加、编辑、收藏仍正常。
- Pairing 页面和 pairing-search 相关测试通过。
- 非 Pairing Number 的 `tag-list` / `tag-list-date` 功能不受影响。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动都围绕 Pairing Number bid 类型语义，前后端和测试强耦合，拆分会增加同步成本。
- Suggested split: 不拆。
- Write boundaries: 单人串行修改 Pairing 后端、Pairing 前端、相关测试。
- Conflict risk: 中等，当前工作区已有 Pairing Number stable id 相关未提交改动，需要在其基础上继续。
- Execution gate: 用户已确认按该边界移除旧兼容。
