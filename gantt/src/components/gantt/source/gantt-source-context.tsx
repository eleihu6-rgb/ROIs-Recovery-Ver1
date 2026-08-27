// gantt/src/components/gantt/source/gantt-source-context.tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { GanttPaneSource } from './gantt-pane-source'

const GanttSourceContext = createContext<GanttPaneSource | null>(null)

export const GanttSourceProvider = ({
  value,
  children,
}: {
  value: GanttPaneSource
  children: ReactNode
}) => {
  return <GanttSourceContext.Provider value={value}>{children}</GanttSourceContext.Provider>
}

/**
 * 读取当前 Gantt 数据源。展示层组件（pane-canvas / pane-header-canvas / 交互层）
 * 一律通过此 hook 取 viewport/timezone，禁止直连具体 store。
 * 缺少 Provider 时抛错——强制每个 pane 树外层都包了 source。
 */
export const useGanttSource = (): GanttPaneSource => {
  const ctx = useContext(GanttSourceContext)
  if (!ctx) {
    throw new Error('useGanttSource must be used within a <GanttSourceProvider>')
  }
  return ctx
}
