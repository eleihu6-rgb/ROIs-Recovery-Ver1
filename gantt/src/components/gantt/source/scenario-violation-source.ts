// gantt/src/components/gantt/source/scenario-violation-source.ts
import { useMemo } from 'react'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import type { RuleViolation } from '@/types/rule-check'
import type { GanttViolationSource } from './gantt-pane-source'

/**
 * Stable empty array so `useViolations` returns the SAME reference when a target
 * has no violations — avoids spurious re-renders in subscribers.
 */
const EMPTY: RuleViolation[] = []

/**
 * Scenario violation data source — adapts the per-scenario violation store to the
 * GanttViolationSource interface consumed by the shared presentation layer.
 *
 * NOTE: `useViolations` calls the zustand hook-store, so it IS a React hook and must
 * be called unconditionally by consumers (the scenario pane wires it that way in the
 * next task). This mirrors how getScenarioGanttStore(id)((s)=>...) is used elsewhere.
 */
export const useScenarioViolationSource = (scenarioId: number): GanttViolationSource =>
  useMemo<GanttViolationSource>(() => ({
    useViolations: (targetType, targetId) =>
      getScenarioViolationStore(scenarioId)((s) => s.violations.get(`${targetType}:${targetId}`) ?? EMPTY),
    runPreCheck: (crewIds, simulated, current) =>
      getScenarioViolationStore(scenarioId).getState().runPreCheck(crewIds, simulated, current),
  }), [scenarioId])
