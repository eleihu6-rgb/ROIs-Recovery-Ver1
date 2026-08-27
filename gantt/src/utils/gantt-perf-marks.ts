/**
 * P2-1 首屏阶段打点（独立模块，无 store/钩子依赖，避免循环引用）。
 *
 * 记录「打开 Gantt → roster 首次出现」关键阶段时间戳（同名仅记首次），用于把空白时间
 * 拆成 网络/服务端/解析/索引构建/绘制 各段。生产构建下 markPhase no-op，不进产物语义。
 */
const phaseMarks = new Map<string, number>()

/** 记录一个阶段时间点（同名仅记首次，便于捕获「first-*」事件）。生产构建 no-op。 */
export const markPhase = (name: string): void => {
  if (import.meta.env.PROD) return
  if (!phaseMarks.has(name)) phaseMarks.set(name, globalThis.performance?.now?.() ?? 0)
}

export const resetPhaseMarks = (): void => phaseMarks.clear()

/** 各阶段绝对时间戳（performance.now）。 */
export const allPhaseMarks = (): Record<string, number> => Object.fromEntries(phaseMarks)

/** 各阶段相对 gantt:open 的耗时（ms）；含 blankObjectTime = 首屏完成 - 打开。 */
export const phasesRelative = (): Record<string, number> => {
  const open = phaseMarks.get('gantt:open')
  const out: Record<string, number> = {}
  for (const [k, v] of phaseMarks) out[k] = open === undefined ? Math.round(v) : Math.round(v - open)
  const painted = phaseMarks.get('roster:first-canvas-painted')
  if (open !== undefined && painted !== undefined) out.blankObjectTime = Math.round(painted - open)
  return out
}
