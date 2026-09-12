import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceStatusPill } from '../service-status-pill'

const baseData = {
  checkedAt: '2026-09-12T18:31:29.211Z',
  services: [
    { name: 'live-server', port: 3000, livePort: 3000, mandatory: true, state: 'up', detail: 'HTTP 200' },
    { name: 'rule-engine', port: 3001, livePort: 3001, mandatory: true, state: 'down', detail: 'no listener' },
  ],
  rustBins: { state: 'down', total: 25, missing: ['check-1001'], detail: '25/25 missing (check-1001, …)' },
  infrastructure: { database: 'ok', redis: 'ok' },
}

let container: HTMLDivElement
let root: Root

function mockStatus(data: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ code: 200, message: 'ok', data }),
  }))
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ServiceStatusPill', () => {
  it('counts a down mandatory service and the missing rust bins as problems', async () => {
    mockStatus({ ...baseData, ok: false })
    await act(async () => { root.render(<ServiceStatusPill />) })

    expect(container.textContent).toContain('2 degraded')

    const button = container.querySelector('[data-testid="service-status-pill"]') as HTMLElement
    await act(async () => { button.click() })
    expect(container.textContent).toContain('rule-engine:3001 down')
    expect(container.textContent).toContain('rust release bins')
  })

  it('shows a green "Services OK" when every mandatory check passes', async () => {
    mockStatus({
      ...baseData,
      ok: true,
      services: [baseData.services[0]],
      rustBins: { state: 'up', total: 25, missing: [], detail: '25/25 executables present' },
    })
    await act(async () => { root.render(<ServiceStatusPill />) })

    expect(container.textContent).toContain('Services OK')
  })

  it('reports the status API itself as unreachable when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')))
    await act(async () => { root.render(<ServiceStatusPill />) })

    expect(container.textContent).toContain('Status unknown')
  })
})
