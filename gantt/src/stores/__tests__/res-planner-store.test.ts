// gantt/src/stores/__tests__/res-planner-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { FALLBACK_CALL_OPTIONS, useResPlannerStore } from '../res-planner-store'

describe('res-planner-store default selectedAssignments', () => {
  beforeEach(() => {
    useResPlannerStore.setState({
      division: 'P',
      callOptions: {
        P: [...FALLBACK_CALL_OPTIONS.P],
        C: [...FALLBACK_CALL_OPTIONS.C],
      },
      selectedAssignments: FALLBACK_CALL_OPTIONS.P.slice(0, 2).map((o) => o.assignment),
    })
  })

  it('initial Pilot selection includes all fallback call codes including PRPM', () => {
    useResPlannerStore.getState().setDivision('P')
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(
      FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
    )
    expect(useResPlannerStore.getState().selectedAssignments).toContain('PRPM')
  })

  it('setDivision Cabin selects all cabin call codes', () => {
    useResPlannerStore.getState().setDivision('C')
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(
      FALLBACK_CALL_OPTIONS.C.map((o) => o.assignment),
    )
  })

  it('setCallOptions falls back to all codes when selection empty for active division', () => {
    useResPlannerStore.setState({ division: 'P', selectedAssignments: [] })
    useResPlannerStore.getState().setCallOptions('P', [...FALLBACK_CALL_OPTIONS.P])
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(
      FALLBACK_CALL_OPTIONS.P.map((o) => o.assignment),
    )
  })

  it('setCallOptions keeps non-empty intersection', () => {
    useResPlannerStore.setState({
      division: 'P',
      selectedAssignments: ['PRPM'],
    })
    useResPlannerStore.getState().setCallOptions('P', [...FALLBACK_CALL_OPTIONS.P])
    expect(useResPlannerStore.getState().selectedAssignments).toEqual(['PRPM'])
  })
})
