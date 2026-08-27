import { describe, expect, it } from 'vitest'

import { parseArgs, resolveWindow } from '../../services/manday/live-manday-refresh-cli.js'

describe('live manday refresh CLI arguments', () => {
  it('parses an explicit window', () => {
    expect(parseArgs(['--start=2026-06-01', '--end=2026-06-30'])).toEqual({
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      recentDays: undefined,
    })
  })

  it('resolves recent-days relative to a supplied clock date', () => {
    expect(resolveWindow({ recentDays: 60 }, new Date('2026-07-07T12:00:00Z'))).toEqual({
      startDt: '2026-05-09',
      endDt: '2026-07-07',
    })
  })

  it('rejects incomplete explicit windows', () => {
    expect(() => parseArgs(['--start=2026-06-01'])).toThrow('--start and --end must be provided together')
  })
})
