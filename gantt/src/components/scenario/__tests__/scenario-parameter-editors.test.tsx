import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { TeamRulesEditor } from '../scenario-parameter-editors'

const mocks = vi.hoisted(() => ({
  getGanttData: vi.fn(),
  loadReferences: vi.fn(async (): Promise<void> => undefined),
}))

vi.mock('@/services/scenario-gantt-api', () => ({
  scenarioGanttApi: { getGanttData: mocks.getGanttData },
}))

vi.mock('@/stores/reference-store', () => ({
  useReferenceStore: (selector: (state: unknown) => unknown) => selector({
    bases: [{ base: 'YEG', name: null }],
    ranks: [{ rank: 'CA', division: 'P', isCrewRank: 1, displayOrder: 1 }],
    loading: false,
    load: mocks.loadReferences,
  }),
}))

vi.mock('@/components/common/gantt-date-fields', () => ({
  GanttEnglishDatePicker: ({ ariaLabel, value }: { ariaLabel: string; value: string }) => (
    <input aria-label={ariaLabel} value={value} readOnly />
  ),
}))

vi.mock('@rois/ui', () => ({
  AppDialog: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title: string
    children: React.ReactNode
  }) => open ? <div><h1>{title}</h1>{children}</div> : null,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@tanstack/react-virtual', () => {
  const useVirtualizer = ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        end: (index + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
  })
  return { useVirtualizer }
})

const scenarioDetail = {
  id: 42,
  name: 'Pilot Scenario',
  fileType: 'RO',
  status: 'DRAFT',
  strDtLoc: '2026-06-01',
  endDtLoc: '2026-06-30',
  division: 'P',
  filterParams: {
    crew: {
      bases: ['YEG'],
      ranks: ['CA'],
      fleets: [],
      seniority: { min: null, max: null },
      birthday: { from: '', to: '' },
      status: 'ACTIVE',
    },
    pairing: {
      bases: [],
      fleets: [],
      ranks: [],
      types: [],
      duration: { min: null, max: null },
    },
  },
} as never

describe('TeamRulesEditor', () => {
  it('uses Scenario Division and scope candidates instead of legacy Team Division or preview rows', async () => {
    mocks.getGanttData.mockResolvedValue({
      crew: [],
      pairings: [],
      pairingSegments: [],
      scenarioStrDt: '2026-06-01',
      strDtLoc: '2026-06-01',
      scenarioEndDt: '2026-06-30',
      endDtLoc: '2026-06-30',
    })

    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor
          value={{
            teams: [{ id: 't1', name: 'Legacy', crew_filter: { ranks: [], base: '', division: 'C' } }],
            rules: [],
          }}
          scenarioDetail={scenarioDetail}
          disabled={false}
          saving={false}
          onChange={onChange}
        />,
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const edit = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Edit')
    expect(edit).toBeDefined()
    await act(async () => { edit?.click() })

    const division = container.querySelector<HTMLInputElement>('[data-testid="scenario-team-division"]')
    expect(division?.value).toBe('P')
    expect(division?.readOnly).toBe(true)
    expect(container.textContent).toContain('CA')
    expect(container.querySelector('option[value="YEG"]')).not.toBeNull()

    const done = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Done')
    await act(async () => { done?.click() })

    const saved = onChange.mock.calls.at(-1)?.[0] as {
      teams: Array<{ crew_filter: Record<string, unknown> }>
    }
    expect(saved.teams[0].crew_filter).not.toHaveProperty('division')
    await act(async () => { root.unmount() })
  })

  it('keeps the read-only Division empty when Scenario detail has no division', async () => {
    mocks.getGanttData.mockResolvedValue({
      crew: [],
      pairings: [],
      pairingSegments: [],
      scenarioStrDt: '2026-06-01',
      strDtLoc: '2026-06-01',
      scenarioEndDt: '2026-06-30',
      endDtLoc: '2026-06-30',
    })

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor
          value={{ teams: [{ id: 't1', name: 'Team', crew_filter: {} }], rules: [] }}
          scenarioDetail={{ ...scenarioDetail, division: '' } as never}
          disabled={false}
          saving={false}
          onChange={vi.fn()}
        />,
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const edit = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Edit')
    await act(async () => { edit?.click() })

    expect(container.querySelector<HTMLInputElement>('[data-testid="scenario-team-division"]')?.value).toBe('')
    await act(async () => { root.unmount() })
  })

  it('Add Team defaults all crews selected, unchecking one persists crew_ids on Done', async () => {
    mocks.getGanttData.mockResolvedValue({
      crew: [
        { crewId: 'F8001', crewName: 'Alice', rank: 'CA', base: 'YEG', seniorityNum: '12', division: 'P' },
        { crewId: 'F8002', crewName: 'Bob', rank: 'CA', base: 'YEG', seniorityNum: '9', division: 'P' },
        { crewId: 'F8003', crewName: 'Carol', rank: 'CA', base: 'YEG', seniorityNum: '7', division: 'P' },
      ],
      pairings: [],
      pairingSegments: [],
      scenarioStrDt: '2026-06-01',
      strDtLoc: '2026-06-01',
      scenarioEndDt: '2026-06-30',
      endDtLoc: '2026-06-30',
    })

    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor value={{ teams: [], rules: [] }} scenarioDetail={scenarioDetail} disabled={false} saving={false} onChange={onChange} />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const addTeam = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '+ Add Team')
    await act(async () => { addTeam?.click() })

    const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
    expect(rowCheckboxes).toHaveLength(3)
    expect(rowCheckboxes.every((input) => input.checked)).toBe(true)

    // Uncheck the middle crew.
    await act(async () => {
      container.querySelector<HTMLInputElement>('tbody input[aria-label="Select F8002"]')?.click()
    })

    const name = container.querySelector<HTMLInputElement>('input[placeholder="e.g. Senior YVR CAs"]')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(name, 'YVR CAs')
      name!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const done = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Done')
    await act(async () => { done?.click() })

    const saved = onChange.mock.calls.at(-1)?.[0] as { teams: Array<{ crew_ids: string[] }> }
    expect(saved.teams[0].crew_ids).toEqual(['F8001', 'F8003'])
    await act(async () => { root.unmount() })
  })

  it('Add Rule defaults all pairings selected and persists pairing_ids on Done', async () => {
    mocks.getGanttData.mockResolvedValue({
      crew: [],
      pairings: [
        { pairingId: 1, sourcePairingId: 2001, pairingLabel: 'P2001', assignment: 'FLT', assignmentGroup: 'FLT', base: 'YEG', division: 'P', schStrDtUtc: '2026-06-01T00:00:00Z', schEndDtUtc: '2026-06-02T00:00:00Z', compositions: [{ rank: 'CA', plan: 1, fill: 1 }] },
        { pairingId: 2, sourcePairingId: 2002, pairingLabel: 'P2002', assignment: 'FLT', assignmentGroup: 'FLT', base: 'YEG', division: 'P', schStrDtUtc: '2026-06-01T00:00:00Z', schEndDtUtc: '2026-06-02T00:00:00Z', compositions: [{ rank: 'CA', plan: 1, fill: 1 }] },
      ],
      pairingSegments: [],
      scenarioStrDt: '2026-06-01',
      strDtLoc: '2026-06-01',
      scenarioEndDt: '2026-06-30',
      endDtLoc: '2026-06-30',
    })

    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor
          value={{ teams: [{ id: 't1', name: 'Team A', crew_filter: {} }], rules: [] }}
          scenarioDetail={scenarioDetail}
          disabled={false}
          saving={false}
          onChange={onChange}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const addRule = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '+ Add Rule')
    await act(async () => { addRule?.click() })

    const rowCheckboxes = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
    expect(rowCheckboxes).toHaveLength(2)
    expect(rowCheckboxes.every((input) => input.checked)).toBe(true)

    await act(async () => {
      container.querySelector<HTMLInputElement>('tbody input[aria-label="Select 2001"]')?.click()
    })

    const name = container.querySelector<HTMLInputElement>('input[placeholder="e.g. No redeyes"]')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(name, 'No redeyes')
      name!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const done = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Done')
    await act(async () => { done?.click() })

    const saved = onChange.mock.calls.at(-1)?.[0] as { rules: Array<{ pairing_ids: string[] }> }
    expect(saved.rules[0].pairing_ids).toEqual(['2002'])
    await act(async () => { root.unmount() })
  })

  it('blocks deleting a Team that still has Team Rules and lists them', async () => {
    mocks.getGanttData.mockResolvedValue({ crew: [], pairings: [], pairingSegments: [], scenarioStrDt: '2026-06-01', strDtLoc: '2026-06-01', scenarioEndDt: '2026-06-30', endDtLoc: '2026-06-30' })
    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor
          value={{
            teams: [{ id: 't1', name: 'Team A', crew_ids: ['F8001'] }],
            rules: [{ id: 'r1', name: 'No redeyes', team_id: 't1', mode: 'not_do', pairing_ids: ['2001'] }],
          }}
          scenarioDetail={scenarioDetail}
          disabled={false}
          saving={false}
          onChange={onChange}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const teamsSection = [...container.querySelectorAll<HTMLElement>('section')]
      .find((section) => section.textContent?.includes('+ Add Team'))
    const teamDelete = [...(teamsSection?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent === 'Delete')
    await act(async () => { teamDelete?.click() })

    expect(container.textContent).toContain('delete these Team Rules first')
    expect(container.textContent).toContain('No redeyes')
    expect(onChange).not.toHaveBeenCalled()

    // Deleting the rule first unblocks the team delete.
    const rulesSection = [...container.querySelectorAll<HTMLElement>('section')]
      .find((section) => section.textContent?.includes('No redeyes'))
    const ruleDelete = [...(rulesSection?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent === 'Delete')
    await act(async () => { ruleDelete?.click() })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rules: [] }))

    // Re-render with the parent-applied value (rules now empty), then the team delete succeeds.
    const updatedValue = onChange.mock.calls.at(-1)?.[0] as { teams: unknown[]; rules: unknown[] }
    await act(async () => {
      root.render(
        <TeamRulesEditor
          value={updatedValue}
          scenarioDetail={scenarioDetail}
          disabled={false}
          saving={false}
          onChange={onChange}
        />,
      )
    })
    const teamsSectionAfter = [...container.querySelectorAll<HTMLElement>('section')]
      .find((section) => section.textContent?.includes('+ Add Team'))
    const teamDeleteAgain = [...(teamsSectionAfter?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent === 'Delete')
    await act(async () => { teamDeleteAgain?.click() })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ teams: [] }))

    await act(async () => { root.unmount() })
  })

  it('deletes a Team immediately when it has no rules', async () => {
    mocks.getGanttData.mockResolvedValue({ crew: [], pairings: [], pairingSegments: [], scenarioStrDt: '2026-06-01', strDtLoc: '2026-06-01', scenarioEndDt: '2026-06-30', endDtLoc: '2026-06-30' })
    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor
          value={{ teams: [{ id: 't1', name: 'Team A', crew_ids: ['F8001'] }], rules: [] }}
          scenarioDetail={scenarioDetail}
          disabled={false}
          saving={false}
          onChange={onChange}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const teamDelete = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Delete')
    await act(async () => { teamDelete?.click() })

    const saved = onChange.mock.calls.at(-1)?.[0] as { teams: unknown[] }
    expect(saved.teams).toEqual([])
    await act(async () => { root.unmount() })
  })

  it('Add Team backfills all crews when preview data arrives after the dialog opens', async () => {
    let resolveData!: (value: unknown) => void
    mocks.getGanttData.mockReturnValue(new Promise((resolve) => { resolveData = resolve }))
    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <TeamRulesEditor value={{ teams: [], rules: [] }} scenarioDetail={scenarioDetail} disabled={false} saving={false} onChange={onChange} />,
      )
    })
    await act(async () => { await Promise.resolve() })

    const addTeam = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '+ Add Team')
    await act(async () => { addTeam?.click() })

    // Dialog is open but the preview-data promise is still pending → no rows yet.
    expect([...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]).toHaveLength(0)

    // Resolve the preview data now that the dialog is already mounted.
    await act(async () => {
      resolveData({
        crew: [
          { crewId: 'F8001', crewName: 'Alice', rank: 'CA', base: 'YEG', seniorityNum: '12', division: 'P' },
          { crewId: 'F8002', crewName: 'Bob', rank: 'CA', base: 'YEG', seniorityNum: '9', division: 'P' },
          { crewId: 'F8003', crewName: 'Carol', rank: 'CA', base: 'YEG', seniorityNum: '7', division: 'P' },
        ],
        pairings: [],
        pairingSegments: [],
        scenarioStrDt: '2026-06-01',
        strDtLoc: '2026-06-01',
        scenarioEndDt: '2026-06-30',
        endDtLoc: '2026-06-30',
      })
    })

    const after = [...container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')]
    expect(after).toHaveLength(3)
    expect(after.every((input) => input.checked)).toBe(true)
    await act(async () => { root.unmount() })
  })
})
