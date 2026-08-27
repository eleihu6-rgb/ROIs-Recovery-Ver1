/**
 * 全局仓库版本号（repo-level，借鉴 EVACC 项目的版本递增约定）
 *
 * 格式：`Ver:B{backend}/F{frontend}/R{rule}`
 *
 * 递增规则（详见根目录 CLAUDE.md「版本号管理」，强制执行）：
 * - 任何**前端**模块（gantt / pbs-portal / packages/ui 等）改动 → `FRONTEND_VERSION` +1
 * - 任何**后端**模块（live-server / pbs-server / engine-server /
 *   connector-server / po-engine / ro-engine 等）改动 → `BACKEND_VERSION` +1
 * - 任何 **rule-engine** 模块改动（checker / calculator / 数据模型 / API）→ `RULE_VERSION` +1
 * - 改动同时跨多个维度 → 各自 +1
 *
 * 这是整个仓库共用的**单一计数器**，不区分具体模块；后端开发者改动后端代码时，
 * 同样在此文件递增对应版本号（与 EVACC 在前端文件里维护版本的做法一致）。
 * 目前仅在 gantt 前端展示（ThemeSwitcher 下拉里）。
 */
export const BACKEND_VERSION = 231  // GET /rules returns updated_by for the Update By column
export const FRONTEND_VERSION = 449 // Full Data, Legality, System, and PBS Help menu coverage
export const RULE_VERSION = 40  // rule-engine-rs: RuleSet-driven enabled_functions gate in check_line

/** 展示用版本串，如 `Ver:B1/F1/R1`。 */
export const APP_VERSION = `Ver:B${BACKEND_VERSION}/F${FRONTEND_VERSION}/R${RULE_VERSION}`

/**
 * PBS 模块专属版本号（独立计数器，只在 pbs-portal / pbs-server 有改动时递增）
 *
 * - PBS_FRONTEND_VERSION：pbs-portal 前端改动 → +1
 * - PBS_BACKEND_VERSION ：pbs-server 后端改动 → +1
 */
export const PBS_BACKEND_VERSION = 42  // PBS common API performance warmup
export const PBS_FRONTEND_VERSION = 86  // PBS Flight Legs per Duty contract label

/** PBS 版本展示串，如 `Ver:B1/F1`。 */
export const PBS_APP_VERSION = `Ver:B${PBS_BACKEND_VERSION}/F${PBS_FRONTEND_VERSION}`
