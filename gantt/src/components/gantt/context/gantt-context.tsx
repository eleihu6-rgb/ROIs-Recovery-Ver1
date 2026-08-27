import { createContext, useContext, type ReactNode } from 'react'
import type { GanttContextId } from '@/types/gantt-context'

/** Default 'live' so existing Live trees resolve correctly even before the provider is mounted. */
const GanttContextIdContext = createContext<GanttContextId>('live')

export const GanttContextProvider = ({
  contextId,
  children,
}: {
  contextId: GanttContextId
  children: ReactNode
}) => <GanttContextIdContext.Provider value={contextId}>{children}</GanttContextIdContext.Provider>

export const useGanttContextId = (): GanttContextId => useContext(GanttContextIdContext)

export type { GanttContextId }
