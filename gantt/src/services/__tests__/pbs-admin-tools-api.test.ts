import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { downloadAlgorithmPackage, dryRunCrewBidImport } from '../pbs-admin-tools-api'

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('pbs-admin-tools-api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue(new Blob(['package']))
    vi.mocked(api.post).mockResolvedValue({})
  })

  it('sends the exact roster period identity when downloading an algorithm package', async () => {
    await downloadAlgorithmPackage(42, 'Jun 2026', 'current', {
      division: 'P',
      status: 'ACTIVE',
      bases: ['YYZ'],
      fleetQuals: ['737'],
    })

    expect(api.get).toHaveBeenCalledWith(
      '/api/admin/algorithm-export?rosterPeriodId=42&periodCode=Jun+2026&division=P&status=ACTIVE&bases=YYZ&fleetQuals=737',
      { responseType: 'blob', timeout: 120000 },
    )
  })

  it('sends rosterPeriodId instead of a display label for Crew Bid Import', async () => {
    await dryRunCrewBidImport({
      file: new File(['Period: June 2026'], 'bids.txt', { type: 'text/plain' }),
      rosterPeriodId: 42,
      periodCode: 'Jun 2026',
    })

    const formData = vi.mocked(api.post).mock.calls[0]?.[1] as FormData
    expect(formData.get('rosterPeriodId')).toBe('42')
    expect(formData.get('periodCode')).toBeNull()
  })
})
