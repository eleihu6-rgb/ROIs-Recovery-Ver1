import type { GanttContextId } from '@/types/gantt-context'
export type { GanttContextId }

/**
 * Registry of per-context store instances. Live uses the permanent 'live' key
 * (effectively a singleton); each scenario uses its numeric scenarioId.
 * Generalizes the existing getScenarioGanttStore(id) pattern to also serve Live.
 */
export function createContextStoreRegistry<S>(factory: (id: GanttContextId) => S) {
  const registry = new Map<GanttContextId, S>()
  const get = (id: GanttContextId): S => {
    let inst = registry.get(id)
    if (!inst) {
      inst = factory(id)
      registry.set(id, inst)
    }
    return inst
  }
  const destroy = (id: GanttContextId): void => {
    registry.delete(id)
  }
  return { get, destroy }
}
