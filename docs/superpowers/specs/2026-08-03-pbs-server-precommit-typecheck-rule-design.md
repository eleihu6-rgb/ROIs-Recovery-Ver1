# PBS Server 提交前 TypeScript 编译检查规则设计

## 目标

防止 `pbs-server` 的 TypeScript 类型错误进入提交并阻塞后续十分钟打包流程。

## 规则

- 提交前使用以下命令判断最终暂存内容是否包含 `pbs-server/**/*.ts`：
  `git diff --cached --name-only -- ':(glob)pbs-server/**/*.ts'`
- 仅在命中时执行：
  `cd pbs-server && pnpm exec tsc --noEmit --pretty false`
- 命令失败时不得提交，并向用户报告编译错误。
- `npm test` 通过不能替代该 TypeScript 编译检查。
- 检查应在最终暂存完成后执行一次，避免使用暂存范围变化前的旧结果。
- `AGENTS.md` 与 `CLAUDE.md` 保持相同要求，分别约束 Agent/Codex 与 Claude。

## 不在范围内

- 不修改 cron、十分钟打包任务、CI、Git Hook 或 `package.json`。
- 不扩大到其他 TypeScript 模块。
- 不增加全仓测试或全仓构建要求。

## 验收标准

1. 最终暂存区包含 `pbs-server/**/*.ts` 时，Agent/Claude 使用仓库已安装的 TypeScript 运行无输出文件的编译检查。
2. 编译失败时不执行提交。
3. 没有 `pbs-server` TypeScript 变更时不运行该检查。
4. 现有十分钟打包流程不发生任何变化。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两个规则文件需要保持一致，改动很小，单人修改更安全。
- Suggested split: 不拆分。
- Write boundaries: 根目录 `AGENTS.md`、根目录 `CLAUDE.md`。
- Conflict risk: Low。
- Execution gate: 用户确认本设计后实施。
