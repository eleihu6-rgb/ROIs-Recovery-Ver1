import { describe, expect, it, vi, beforeEach } from 'vitest'
import { scenarioGanttApi } from '../scenario-gantt-api'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('scenarioGanttApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({})
  })

  it('uses a longer timeout for scenario gantt data loads', async () => {
    await scenarioGanttApi.getGanttData(546)

    expect(api.get).toHaveBeenCalledWith('/api/scenario/546/gantt-data', {
      timeout: 120_000,
    })
  })
})
