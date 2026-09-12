import { describe, expect, it } from 'vitest'
import {
  SERVICE_TABLE,
  checkRustBins,
  checkServiceTable,
  tcpOpen,
} from '../service-status.js'

describe('system service status', () => {
  it('reports a closed port as not open', async () => {
    // 59999 is not a service this stack starts; nothing should answer.
    expect(await tcpOpen(59999, '127.0.0.1', 300)).toBe(false)
  })

  it('reads the rust-bins manifest and reports which executables are missing', () => {
    const bins = checkRustBins()
    expect(bins.total).toBeGreaterThan(0)
    expect(Array.isArray(bins.missing)).toBe(true)
    expect(['up', 'down']).toContain(bins.state)
    expect(bins.detail).toMatch(/executables present|missing/)
  })

  it('returns exactly one entry per service in the table, with a valid state', async () => {
    const entries = await checkServiceTable()
    expect(entries).toHaveLength(SERVICE_TABLE.length)
    for (const entry of entries) {
      expect(['up', 'down', 'warn', 'off']).toContain(entry.state)
      expect(typeof entry.detail).toBe('string')
    }
  })
})
