import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ScenarioContextMenu } from '../scenario-context-menu'
import { useUiStore } from '@/stores/ui-store'
import { destroyScenarioLayoutStore, getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioGanttStore, destroyScenarioGanttStore } from '@/stores/scenario-gantt-store'
import type { ScenarioGanttData } from '@/types/scenario-gantt'
import { READ_ONLY_CAPABILITIES } from '@/components/gantt/source/gantt-pane-source'

const SCENARIO_ID = 990501

const renderScenarioContextMenu = (): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioContextMenu />)
  })

  return { container, root }
}

describe('ScenarioContextMenu', () => {
  afterEach(() => {
    act(() => {
      useUiStore.getState().closeContextMenu()
      getScenarioRosterSelectionStore(SCENARIO_ID).getState().clear()
    })
    destroyScenarioLayoutStore(SCENARIO_ID)
    destroyScenarioGanttStore(SCENARIO_ID)
    document.body.innerHTML = ''
  })

  it('pins and unpins selected scenario roster crew rows from the context menu', () => {
    const selectionStore = getScenarioRosterSelectionStore(SCENARIO_ID).getState()

    act(() => {
      selectionStore.selectCrewRow('295', 'single', ['295'])
      useUiStore.getState().openContextMenu(
        80,
        80,
        { id: -1, crewId: '295', pairingId: null } as never,
        'scenario-roster',
        0,
        SCENARIO_ID,
      )
    })

    const { root } = renderScenarioContextMenu()
    expect(document.body.querySelector('button')?.textContent).toContain('Crew Info')
    const pinButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Pin 1 Selected Row'),
    )

    expect(pinButton?.textContent).toContain('Pin 1 Selected Row')

    act(() => {
      pinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getScenarioLayoutStore(SCENARIO_ID).getState().panes.get('roster-1')?.frozenCrewIds).toEqual(['295'])
    expect(Array.from(getScenarioRosterSelectionStore(SCENARIO_ID).getState().selectedCrewIds)).toEqual([])

    act(() => {
      useUiStore.getState().openContextMenu(
        80,
        80,
        { id: -1, crewId: '295', pairingId: null } as never,
        'scenario-roster',
        0,
        SCENARIO_ID,
      )
    })

    act(() => {
      root.render(<ScenarioContextMenu />)
    })

    const unpinButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Unpin All (1)'),
    )

    expect(unpinButton).toBeTruthy()

    act(() => {
      unpinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getScenarioLayoutStore(SCENARIO_ID).getState().panes.get('roster-1')?.frozenCrewIds).toEqual([])

    act(() => {
      root.unmount()
    })
  })

  it('offers ground-task deletion only for CR tasks and creates the full patch', () => {
    const data = {
      capabilities: {
        ...READ_ONLY_CAPABILITIES,
        roster: { canAssign: true, canRemove: true, canReassign: true },
      },
    } as ScenarioGanttData
    getScenarioGanttStore(SCENARIO_ID).setState({
      data,
      lockStatus: { locked: true, owner: 'me', ttl: 600, isOwner: true },
    })

    act(() => {
      useUiStore.getState().openContextMenu(
        80,
        80,
        {
          id: 10,
          crewId: 'C1',
          pairingId: null,
          source: 'CR',
          schStrDtUtc: '2026-07-01T08:00:00Z',
          schEndDtUtc: '2026-07-01T16:00:00Z',
          assignmentGroup: 'GRD',
          assignment: 'SIM',
        } as never,
        'scenario-roster',
        0,
        SCENARIO_ID,
      )
    })

    const { root } = renderScenarioContextMenu()
    const deleteButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Delete task'),
    )
    expect(deleteButton).toBeTruthy()

    act(() => deleteButton?.click())
    expect(getScenarioGanttStore(SCENARIO_ID).getState().pendingChanges).toEqual([{
      op: 'remove',
      crewId: 'C1',
      pairingId: null,
      startDtUtc: '2026-07-01T08:00:00Z',
      endDtUtc: '2026-07-01T16:00:00Z',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
    }])
    act(() => root.unmount())
  })

  it('does not offer deletion for MA/PA/IMP tasks', () => {
    const data = {
      capabilities: {
        ...READ_ONLY_CAPABILITIES,
        roster: { canAssign: true, canRemove: true, canReassign: true },
      },
    } as ScenarioGanttData
    getScenarioGanttStore(SCENARIO_ID).setState({
      data,
      lockStatus: { locked: true, owner: 'me', ttl: 600, isOwner: true },
    })

    for (const source of ['MA', 'PA', 'IMP']) {
      act(() => {
        useUiStore.getState().openContextMenu(
          80,
          80,
          { id: 10, crewId: 'C1', pairingId: null, source } as never,
          'scenario-roster',
          0,
          SCENARIO_ID,
        )
      })
      const { root } = renderScenarioContextMenu()
      expect(document.body.textContent).not.toContain('Delete task')
      act(() => root.unmount())
      act(() => useUiStore.getState().closeContextMenu())
    }
  })
})
