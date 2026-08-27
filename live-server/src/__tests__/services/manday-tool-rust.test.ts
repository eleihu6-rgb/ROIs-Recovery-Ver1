import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRust } from '../../services/manday/manday-tool-rust.js'

const spawnSyncMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}))

describe('runRust (spawns the ruletool binary)', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset()
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: 'D\tX1\tP\t2026-06-05\t495\t0\t495\t0\t0\t0\nM\tX1\tP\t2026-06\t495\t0\t495\t0\t0\t0\tOK\n',
      stderr: '',
    })
  })

  it('credits a single flying duty into daily + monthly', () => {
    const { D, M } = runRust([
      { crewId: 'X1', division: 'P', localDate: '2026-06-05', kind: 'FLY', a1: 495, a2: -1, a3: 0, flag: '' },
    ])
    // daily: D \t crew \t div \t date \t blh \t dp \t credit \t is_do \t is_al \t is_leave
    const d = D.find((r) => r[1] === 'X1' && r[3] === '2026-06-05')
    expect(d?.[6]).toBe('495') // credit
    const m = M.find((r) => r[1] === 'X1' && r[3] === '2026-06')
    expect(m?.[6]).toBe('495') // monthly credit
  })

  it('appends roster ground actual and scheduled credit to the TSV input', () => {
    runRust([
      {
        crewId: 'G1',
        division: 'P',
        localDate: '2026-06-06',
        kind: 'GND',
        a1: 600,
        a2: 240,
        a3: 0,
        flag: '',
        actCreditMin: 155,
        schCreditMin: 300,
      },
    ])

    const options = spawnSyncMock.mock.calls[0]?.[2]
    expect(options.input).toBe('G1\tP\t2026-06-06\tGND\t600\t240\t0\t\t155\t300\t')
  })
})
