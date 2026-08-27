# PBS Pairing 129「Any/Every Sit Length」前端控件修正设计

## 背景

当前 `pbs-portal` 中 `Any/Every Sit Length(propertyCode=129)` 的配置弹窗展示不正确：

- `MODE` 已正确显示 `Award / Avoid`
- `QUANTIFIER` 已正确显示 `Any / Every`
- 但 `BID` 区域仍渲染成普通文本输入框

旧库和后端当前语义都表明，`129` 应该是 `duration` 类条件，而不是自由文本条件。前端这里只需要把控件类型修正回来，避免用户看到和旧库不一致的输入形态。

## 目标

1. 将 `Any/Every Sit Length` 的 `BID` 控件从普通文本框改为 duration 输入控件。
2. 保持 `MODE = Award / Avoid`。
3. 保持 `QUANTIFIER = Any / Every`。
4. 不改后端 SQL，不改后端校验，不改 property 语义。

## 范围

### 本次要改

- `pbs-portal` 中 `propertyCode=129` 的前端控件映射
- 相关前端测试

### 本次不改

- `pbs-server` 的校验逻辑
- `pbs-server` 的 search SQL
- `packages/contracts` 里 129 的后端语义定义
- 其他 `duration` / `time` / `stepper` 条件

## 现状问题

当前 129 的 contract 仍是：

```ts
{
  propertyCode: 129,
  name: "Any/Every Sit Length",
  defaultBid: { type: "text", value: "01:00" },
  supportedActions: ["award", "avoid"],
  supportedOperators: [">"],
  supportedQuantifiers: ["any", "every"],
  defaultQuantifier: "any",
}
```

这会导致前端把它渲染成普通文本框，和它真实的 `duration` 语义不一致。

## 设计方案

### 推荐方案：将默认 bid 改为 duration

把 129 的默认 bid 从 `text` 改成 `duration`，例如：

```ts
{ type: "duration", value: "01:00", operator: ">" }
```

这样前端可复用现有 duration 控件能力：

- 输入 `HH:MM`
- 保留 `Any / Every`
- 保留 `>` 运算符
- 不显示 `=` 和 `Between`

### 备选方案：单独为 129 写专用控件

优点是可更细粒度控制样式和文案。  
缺点是会打破现有 Pairing 条件控件复用，增加维护成本，不建议。

### 备选方案：继续沿用 text，但在前端强行格式化

优点是改动表面很小。  
缺点是语义仍然错误，用户仍会把它理解成普通文本框，不建议。

## 预期交互

- `MODE`：`Award / Avoid`
- `QUANTIFIER`：`Any / Every`
- `BID`：duration 输入框
- 默认显示一个合法 duration 值
- 不出现自由文本样式
- 不引入新的 operator 选项

## 数据与行为约束

- 前端不改变 `129` 的业务语义
- 前端不重新定义 `Any / Every` 的含义
- 前端不改后端返回的 property catalog
- 前端只负责把既有语义用正确控件表现出来

## 测试计划

### 自动化测试

- 更新 `pbs-portal` 的 property catalog 测试，确认 `129` 的 `defaultBid.type` 为 `duration`
- 更新弹窗测试，确认 `Any/Every Sit Length` 打开后展示 duration 输入控件，而不是普通文本框
- 如有必要，补一条回归测试，确认 `Any / Every` 仍正常显示

### 人工测试

- 打开 Pairing 页面
- 找到 `Any/Every Sit Length`
- 打开配置弹窗
- 确认：
  - `MODE` 正常
  - `QUANTIFIER` 正常
  - `BID` 为 duration 输入框
  - 不再出现普通文本输入样式

## 验收标准

- `Any/Every Sit Length` 的弹窗不再显示成普通文本框
- `BID` 使用 duration 控件
- `Any / Every` 保持可见且可切换
- 前端测试通过
- 不影响其他 Pairing 条件

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单点前端控件修正，范围很小，拆分收益不高。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后再实施。
