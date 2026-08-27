import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ScenarioBulkDeleteDialog } from '../scenario-bulk-delete-dialog'
import { READ_ONLY_CAPABILITIES } from '@/components/gantt/source/gantt-pane-source'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

vi.mock('@rois/ui', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  AppDialog: ({ open, children, footer, title, onOpenChange: _onOpenChange, bodyClassName: _bodyClassName, ...props }: { open: boolean; children: React.ReactNode; footer?: React.ReactNode; title?: string; onOpenChange?: unknown; bodyClassName?: string }) =>
    open ? <div {...props}><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...props }: { children: React.ReactNode }) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: { children: React.ReactNode }) => <th {...props}>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children, ...props }: { children: React.ReactNode }) => <tr {...props}>{children}</tr>,
}))

vi.mock('@/stores/timezone-store', () => ({
  useTimezoneStore: (selector: (state: { timezone: string }) => unknown) => selector({ timezone: 'UTC' }),
}))

vi.mock('@/stores/scenario-gantt-store', () => ({
  getScenarioGanttStore: () => ({ getState: () => ({ addPatch: vi.fn() }) }),
}))

const resizeObserver = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
    observe = resizeObserver
    disconnect = vi.fn()
  } as unknown as typeof ResizeObserver
})

const data: ScenarioGanttData = {
  scenarioId: 101,
  scenarioName: 'Bulk delete test',
  fileType: 'RO',
  capabilities: READ_ONLY_CAPABILITIES,
  strDtLoc: '2026-07-01T00:00:00',
  endDtLoc: '2026-07-31T23:59:59',
  scenarioStrDt: '2026-07-01T00:00:00',
  scenarioEndDt: '2026-07-31T23:59:59',
  leadinLive: 0,
  dataSource: 'db',
  crew: [
    { crewId: 'C001', rank: 'CA', base: 'YYZ', division: 'P', seniorityNum: '1', crewName: null },
    { crewId: 'C002', rank: 'FO', base: 'YVR', division: 'P', seniorityNum: '2', crewName: null },
  ],
  pairings: [
    { pairingId: 10, pairingLabel: 'P10', base: 'YYZ', fleet: '737', schStrDtUtc: '2026-07-05T10:00:00Z', schEndDtUtc: '2026-07-05T20:00:00Z', assignmentGroup: 'FLT', assignment: 'FLY', division: 'P', compositions: [] },
    { pairingId: 20, pairingLabel: 'P20', base: 'YVR', fleet: '737', schStrDtUtc: '2026-07-06T10:00:00Z', schEndDtUtc: '2026-07-06T20:00:00Z', assignmentGroup: 'FLT', assignment: 'FLY', division: 'P', compositions: [] },
  ],
  assignments: [
    { crewId: 'C001', pairingId: 10, source: 'CR' },
    { crewId: 'C002', pairingId: 20, source: 'MA' },
  ],
  pairingSegments: [
    { pairingId: 10, dutySeq: 1, segSeq: 1, fltId: 100, fltDt: '2026-07-05', fltNum: '100', airline: 'F8', depArp: 'YYZ', arvArp: 'YVR', segAssignment: 'FLT', schStrDtUtc: '2026-07-05T10:00:00Z', schEndDtUtc: '2026-07-05T13:00:00Z', dutyStrArp: 'YYZ', dutyEndArp: 'YVR', dutySchStrDtUtc: '2026-07-05T10:00:00Z', dutySchEndDtUtc: '2026-07-05T13:00:00Z', dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 180, brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '', pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '' },
    { pairingId: 20, dutySeq: 1, segSeq: 1, fltId: 200, fltDt: '2026-07-06', fltNum: '200', airline: 'F8', depArp: 'YVR', arvArp: 'YYZ', segAssignment: 'FLT', schStrDtUtc: '2026-07-06T10:00:00Z', schEndDtUtc: '2026-07-06T13:00:00Z', dutyStrArp: 'YVR', dutyEndArp: 'YYZ', dutySchStrDtUtc: '2026-07-06T10:00:00Z', dutySchEndDtUtc: '2026-07-06T13:00:00Z', dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: 180, brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '', pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '' },
  ],
  flights: [],
  groundItems: [],
  crewStats: {},
}

const renderDialog = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioBulkDeleteDialog open onOpenChange={() => undefined} data={data} />)
  })
  return { container, root }
}

describe('ScenarioBulkDeleteDialog', () => {
  it('filters by CrewId after Refresh and shows compact flight detail columns', () => {
    const { container, root } = renderDialog()

    const input = container.querySelector('[data-testid="scenario-bulk-delete-crew-id"] input') as HTMLInputElement
    act(() => {
      input.value = 'C001'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    act(() => {
      ;(container.querySelector('[data-testid="scenario-bulk-delete-refresh"]') as HTMLButtonElement).click()
    })
    act(() => {
      ;(Array.from(container.querySelectorAll('label')).find((label) => label.textContent?.includes('FLT / FLY')) as HTMLLabelElement).click()
    })

    expect(container.textContent).toContain('C001')
    expect(container.textContent).not.toContain('C002')
    expect(container.textContent).toContain('CA')
    expect(container.textContent).toContain('100')
    expect(container.textContent).toContain('YYZ')
    expect(container.textContent).toContain('YVR')

    act(() => root.unmount())
    container.remove()
  })
})
