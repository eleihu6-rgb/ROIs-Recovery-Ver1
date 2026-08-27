import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui-store'

const getPairingInfoWithLocalFirst = vi.hoisted(() => vi.fn())
const loadAirportTz = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div data-testid="mock-dialog"><div>{title}</div>{children}</div> : null,
  formatUiDate: (value: string) => value,
}))

vi.mock('@/services/pairing-info-service', () => ({
  getPairingInfoWithLocalFirst,
}))

vi.mock('@/utils/scenario-pairing-adapter', () => ({
  buildScenarioPairingInfo: vi.fn(),
}))

vi.mock('@/stores/timezone-store', () => ({
  useTimezoneStore: (selector: (state: {
    timezoneOptions: never[]
    timezone: string
    timezoneAirport: string
  }) => unknown) => selector({ timezoneOptions: [], timezone: 'UTC', timezoneAirport: 'UTC' }),
}))

vi.mock('@/stores/airport-tz-store', () => ({
  useAirportTzStore: (selector: (state: { map: Record<string, string>; load: () => Promise<void> }) => unknown) =>
    selector({ map: {}, load: loadAirportTz }),
}))

import { PairingInfoDialog } from '../pairing-info-dialog'
import { buildScenarioPairingInfo } from '@/utils/scenario-pairing-adapter'
import { destroyScenarioGanttStore, getScenarioGanttStore } from '@/stores/scenario-gantt-store'

const detail = {
  pairing: {
    id: 10,
    pairingLabel: 'P10',
    base: 'YYZ',
    schStrDtUtc: '2026-08-01T08:00:00Z',
    tags: null,
  },
  segments: [{
    id: 1,
    pairingId: 10,
    dutySeq: 1,
    segSeq: 1,
    fltNum: '100',
    airline: 'F8',
    depArp: 'YYZ',
    arvArp: 'YVR',
    schStrDtUtc: '2026-08-01T08:00:00Z',
    schEndDtUtc: '2026-08-01T12:00:00Z',
    actStrDtUtc: '2026-08-01T08:00:00Z',
    actEndDtUtc: '2026-08-01T12:00:00Z',
    segAssignment: 'FLT',
    dutyRefTz: -240,
    dutyActCreditedMinutes: null,
  }],
  compositions: [],
}

const crew = [
  { crewId: 'C1', name: 'One', base: 'YYZ', actingRank: 'FO', source: 'CR', creditMin: null },
  { crewId: 'C2', name: 'Two', base: 'YYZ', actingRank: 'FO', source: 'CR', creditMin: null },
]

const bundle = {
  detail,
  crew,
  rosterDutyRefs: [
    { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -300 },
    { crewId: 'C2', pairingId: 10, dutySeq: 1, dutyRefTz: 60 },
  ],
}

const renderDialog = async (): Promise<{ container: HTMLDivElement; root: Root }> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<PairingInfoDialog />)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    await Promise.resolve()
  })
  return { container, root }
}

afterEach(() => {
  useUiStore.getState().closePairingInfo()
  getPairingInfoWithLocalFirst.mockReset()
  vi.mocked(buildScenarioPairingInfo).mockReset()
  destroyScenarioGanttStore(7)
  document.body.innerHTML = ''
})

describe('PairingInfoDialog crew-specific Ref', () => {
  it('defaults pairing-pane entry to the first crew and updates Ref when the selector changes', async () => {
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="pairing-info-crew-selector"]')
    const refCell = container.querySelector<HTMLElement>('[data-duty-seq="1"]')
    expect(selector?.value).toBe('C1')
    expect(refCell?.textContent).toBe('-5:00')

    await act(async () => {
      selector!.value = 'C2'
      selector!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(refCell?.textContent).toBe('+1:00')
    act(() => root.unmount())
  })

  it('locks the roster-entry crew and renders that crew Ref', async () => {
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10, undefined, 'C2')
    const { container, root } = await renderDialog()

    const selector = container.querySelector<HTMLSelectElement>('[data-testid="pairing-info-crew-selector"]')
    const refCell = container.querySelector<HTMLElement>('[data-duty-seq="1"]')
    expect(selector?.value).toBe('C2')
    expect(selector?.disabled).toBe(true)
    expect(refCell?.textContent).toBe('+1:00')
    act(() => root.unmount())
  })

  it('rebuilds scenario Ref TZ when gantt dataRevision bumps after recheck reload', async () => {
    const emptyRefs = {
      ...bundle,
      rosterDutyRefs: [{ crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: null }],
    }
    const filledRefs = {
      ...bundle,
      rosterDutyRefs: [{ crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -360 }],
    }
    vi.mocked(buildScenarioPairingInfo)
      .mockReturnValueOnce(emptyRefs)
      .mockReturnValueOnce(filledRefs)

    const store = getScenarioGanttStore(7)
    store.setState({ dataRevision: 1 })
    useUiStore.getState().openPairingInfo(10, 7, 'C1')
    const { container, root } = await renderDialog()

    expect(container.querySelector('[data-duty-seq="1"]')?.textContent).toBe('')

    await act(async () => {
      store.setState({ dataRevision: 2 })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(buildScenarioPairingInfo).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-duty-seq="1"]')?.textContent).toBe('-6:00')
    act(() => root.unmount())
  })
})