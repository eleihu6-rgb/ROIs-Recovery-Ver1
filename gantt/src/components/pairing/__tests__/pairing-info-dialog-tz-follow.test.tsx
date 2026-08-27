import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui-store'

const getPairingInfoWithLocalFirst = vi.hoisted(() => vi.fn())
const loadAirportTz = vi.hoisted(() => vi.fn(async () => undefined))
// Mutable toolbar-timezone state — each test sets UTC or a Base before render.
const tzState = vi.hoisted(() => ({ timezone: 'UTC', timezoneAirport: 'UTC' }))

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
  }) => unknown) => selector({
    timezoneOptions: [],
    timezone: tzState.timezone,
    timezoneAirport: tzState.timezoneAirport,
  }),
}))

vi.mock('@/stores/airport-tz-store', () => ({
  useAirportTzStore: (selector: (state: { map: Record<string, string>; load: () => Promise<void> }) => unknown) =>
    selector({ map: {}, load: loadAirportTz }),
}))

import { PairingInfoDialog } from '../pairing-info-dialog'

const detail = {
  pairing: {
    id: 10,
    pairingLabel: 'P10',
    base: 'YVR',
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
    depArp: 'YVR',
    arvArp: 'YYZ',
    schStrDtUtc: '2026-08-01T08:00:00Z',
    schEndDtUtc: '2026-08-01T12:00:00Z',
    actStrDtUtc: '2026-08-01T08:00:00Z',
    actEndDtUtc: '2026-08-01T12:00:00Z',
    segAssignment: 'FLT',
    dutyRefTz: -420,
    dutyActCreditedMinutes: null,
  }],
  compositions: [],
}

const crew = [{ crewId: 'C1', name: 'One', base: 'YVR', actingRank: 'FO', source: 'CR', creditMin: null }]
const bundle = { detail, crew, rosterDutyRefs: [] }

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

/** First row's STD cell (segment table column index 9). */
const firstStd = (container: HTMLDivElement): string => {
  const row = container.querySelector('[data-testid="pairing-info-segments"] tbody tr')
  const td = row?.querySelectorAll('td')[9]
  return (td?.textContent ?? '').trim()
}

const allStd = (container: HTMLDivElement): string[] =>
  [...container.querySelectorAll('[data-testid="pairing-info-segments"] tbody tr')]
    .map((r) => (r.querySelectorAll('td')[9]?.textContent ?? '').trim())

afterEach(() => {
  useUiStore.getState().closePairingInfo()
  getPairingInfoWithLocalFirst.mockReset()
  tzState.timezone = 'UTC'
  tzState.timezoneAirport = 'UTC'
  document.body.innerHTML = ''
})

describe('PairingInfoDialog — timezone default follows the Toolbar', () => {
  it('Toolbar UTC → UTC mode active by default; Airport button reads "Airport"', async () => {
    tzState.timezone = 'UTC'
    tzState.timezoneAirport = 'UTC'
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const utcBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-utc"]')!
    const airportBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-airport"]')!
    expect(utcBtn.className).toContain('bg-primary')
    expect(airportBtn.className).not.toContain('bg-primary')
    expect(airportBtn.textContent).toBe('Airport')
    expect(firstStd(container)).toBe('8/1 08:00') // UTC
    act(() => root.unmount())
  })

  it('Toolbar Base (YVR) → Airport(YVR) active by default; times render in the Base zone', async () => {
    tzState.timezone = 'America/Vancouver'
    tzState.timezoneAirport = 'YVR'
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const utcBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-utc"]')!
    const airportBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-airport"]')!
    expect(airportBtn.className).toContain('bg-primary')
    expect(utcBtn.className).not.toContain('bg-primary')
    expect(airportBtn.textContent).toBe('YVR')
    // 08:00Z in America/Vancouver (PDT, UTC-7 on 2026-08-01) → 01:00.
    expect(firstStd(container)).toBe('8/1 01:00')
    act(() => root.unmount())
  })

  it('manual override (click UTC) wins over the Toolbar Base; reopen resets to the default', async () => {
    tzState.timezone = 'America/Vancouver'
    tzState.timezoneAirport = 'YVR'
    getPairingInfoWithLocalFirst.mockResolvedValue(bundle)
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const utcBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-utc"]')!
    await act(async () => { utcBtn.click() })
    expect(utcBtn.className).toContain('bg-primary')
    expect(firstStd(container)).toBe('8/1 08:00') // manual override → UTC

    // Reopen: manual override cleared, default follows the Toolbar Base again.
    act(() => { useUiStore.getState().closePairingInfo() })
    act(() => { useUiStore.getState().openPairingInfo(10) })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await Promise.resolve()
    })
    const airportBtn = container.querySelector<HTMLButtonElement>('[data-testid="pairing-info-tz-airport"]')!
    expect(airportBtn.className).toContain('bg-primary')
    expect(firstStd(container)).toBe('8/1 01:00')
    act(() => root.unmount())
  })

  it('DST-aware: same UTC hour renders with the DST-varying offset (EST vs EDT)', async () => {
    tzState.timezone = 'America/Toronto'
    tzState.timezoneAirport = 'YOW'
    const seg = detail.segments[0]
    const d = {
      ...detail,
      pairing: { ...detail.pairing, schStrDtUtc: '2026-01-15T08:00:00Z' },
      segments: [
        { ...seg, id: 1, segSeq: 1, schStrDtUtc: '2026-01-15T08:00:00Z', schEndDtUtc: '2026-01-15T12:00:00Z', actStrDtUtc: '2026-01-15T08:00:00Z', actEndDtUtc: '2026-01-15T12:00:00Z' },
        { ...seg, id: 2, segSeq: 2, schStrDtUtc: '2026-07-15T08:00:00Z', schEndDtUtc: '2026-07-15T12:00:00Z', actStrDtUtc: '2026-07-15T08:00:00Z', actEndDtUtc: '2026-07-15T12:00:00Z' },
      ],
    }
    getPairingInfoWithLocalFirst.mockResolvedValue({ detail: d, crew, rosterDutyRefs: [] })
    useUiStore.getState().openPairingInfo(10)
    const { container, root } = await renderDialog()

    const stds = allStd(container)
    expect(stds[0]).toBe('1/15 03:00') // EST = UTC-5
    expect(stds[1]).toBe('7/15 04:00') // EDT = UTC-4
    act(() => root.unmount())
  })
})
