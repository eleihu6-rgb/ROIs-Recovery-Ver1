# PBS 无用 demo 与构建缓存清理说明

## 背景

本次清理范围限定在 `pbs-portal` 与 `pbs-server`。排查发现 `pbs-portal` 根目录存在一套静态切图式 demo 文件，以及一个被 Git 跟踪的 TypeScript 增量构建缓存文件。这些文件不参与当前 Vite 应用入口、业务运行链路或测试链路。

## 清理目标

- 删除确认无引用的静态 demo 文件，减少误导和维护噪音。
- 删除误提交的 TypeScript 构建缓存文件。
- 更新 `.gitignore`，防止后续 `*.tsbuildinfo` 再次进入版本库。
- 保留仍被业务页面、映射器或测试引用的 mock 数据文件，避免破坏当前页面与回归测试。

## 变更范围

### 删除文件

- `pbs-portal/demo.html`
- `pbs-portal/demo.css`
- `pbs-portal/tsconfig.node.tsbuildinfo`

### 修改文件

- `.gitignore`
  - 将单一的 `tsconfig.tsbuildinfo` 忽略规则调整为 `*.tsbuildinfo`。

## 明确保留

- `pbs-portal/src/features/*/mock.ts`
  - 这些文件仍被页面、数据映射器或单元测试引用，不能作为无用文件直接删除。
- `pbs-portal/.env.example`
- `pbs-server/.env.example`
  - 环境变量示例文件属于项目配置说明，不是废弃文件。
- `node_modules` 内第三方依赖自带的 example/mock 文件
  - 不属于项目源码清理范围。

## 验收方式

- 搜索确认 `demo.html`、`demo.css`、`tsconfig.node.tsbuildinfo` 无残留引用。
- 执行 `npm --prefix pbs-portal run test`。
- 执行 `npm --prefix pbs-portal run build`。
- 不执行 Git 提交，由用户统一提交。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次清理范围小，单 agent 完成更直接，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: 根目录 `.gitignore`、`docs/superpowers/specs/`、`pbs-portal`。
- Conflict risk: 低。
- Execution gate: 用户已确认后实施。
