import { describe, expect, it, vi, beforeEach } from 'vitest'
import { scenarioApi } from '../scenario-api'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('scenarioApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
  })

  it('sends broad scenario search as search query parameter', async () => {
    await scenarioApi.list({ page: 1, pageSize: 20, search: '577', fileType: 'RO' })

    expect(api.get).toHaveBeenCalledWith('/api/scenario', {
      params: {
        page: 1,
        pageSize: 20,
        search: '577',
        fileType: 'RO',
      },
    })
  })

  it('requests S3 Pairing PO targets', async () => {
    await scenarioApi.listS3PairingPoTargets()

    expect(api.get).toHaveBeenCalledWith('/api/scenario/import-targets/po')
  })

  it('lists Pairing Sc. options from PO scenario import targets', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      items: [{
        id: 692,
        worksetId: 721,
        name: 'Imported PO',
        status: 'DRAFT',
        strDtLoc: '2026-06-01',
        endDtLoc: '2026-06-30',
      }],
    })

    await expect(scenarioApi.listPairingScenarioOptions()).resolves.toEqual([{
      id: 692,
      worksetId: 721,
      name: 'Imported PO',
      status: 'DRAFT',
      strDtLoc: '2026-06-01',
      endDtLoc: '2026-06-30',
    }])
    expect(api.get).toHaveBeenCalledWith('/api/scenario/import-targets/po')
  })

  it('posts Kick off run with a long timeout matching engine-server kickoff', async () => {
    vi.mocked(api.post).mockResolvedValue({ taskId: 'task-743' })

    await expect(scenarioApi.run(743)).resolves.toEqual({ taskId: 'task-743' })

    expect(api.post).toHaveBeenCalledWith(
      '/api/scenario/743/run',
      {},
      expect.objectContaining({ timeout: 600_000 }),
    )
  })

  it('posts S3 Pairing import as multipart form data', async () => {
    vi.mocked(api.post).mockResolvedValue({
      scenarioId: 800,
      createdScenario: false,
      importedPairings: 1,
      importedSegments: 2,
      importedCompositions: 2,
      warnings: [],
    })
    const file = new File(['PRG'], 'sample.PRG')

    await scenarioApi.importS3Pairing({
      file,
      targetMode: 'existing',
      targetScenarioId: 800,
      clearBeforeImport: true,
    })

    expect(api.post).toHaveBeenCalledWith(
      '/api/scenario/s3-pairing-import',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
      }),
    )
    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData
    expect(formData.get('file')).toBe(file)
    expect(formData.get('targetMode')).toBe('existing')
    expect(formData.get('targetScenarioId')).toBe('800')
    expect(formData.get('clearBeforeImport')).toBe('true')
  })

  it('posts S3 Pairing new target without a base filter', async () => {
    vi.mocked(api.post).mockResolvedValue({
      scenarioId: 801,
      createdScenario: true,
      importedPairings: 1,
      importedSegments: 2,
      importedCompositions: 2,
      warnings: [],
    })
    const file = new File(['PRG'], 'sample.PRG')

    await scenarioApi.importS3Pairing({
      file,
      targetMode: 'new',
      newStrDtLoc: '2026-01-31',
      newEndDtLoc: '2026-02-28',
      newDivision: 'P',
    })

    const formData = vi.mocked(api.post).mock.calls[0][1] as FormData
    expect(formData.get('targetMode')).toBe('new')
    expect(formData.get('newStrDtLoc')).toBe('2026-01-31')
    expect(formData.get('newEndDtLoc')).toBe('2026-02-28')
    expect(formData.get('newDivision')).toBe('P')
    expect(formData.get('newBases')).toBeNull()
    expect(formData.get('newBase')).toBeNull()
  })
})
