import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pbsCrewBidImportRoutes } from '../../../../packages/contracts/pbs-crew-bid-imports.js'

const h = vi.hoisted(() => ({
  service: {
    dryRun: vi.fn(),
    startImport: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
    rollbackRun: vi.fn(),
  },
}))

vi.mock('../../config/index.js', () => ({
  env: {
    PBS_SCHEMA: 'f8_pbs',
  },
}))

vi.mock('../../services/crew-bid-import/crew-bid-import-service.js', () => ({
  createPbsCrewBidImportService: vi.fn(() => h.service),
}))

import pbsCrewBidImportsAdminRoutes from './pbs-crew-bid-imports.js'

const VALID_CREW_BID_TEXT = [
  'Period: December 2025',
  'Seniority 123 Category YEG-737-CA Employee # 274',
  'Current Bid',
  '1. Bid Request',
  '',
].join('\n')

const buildMultipartPayload = (
  fields: Record<string, string>,
  fileContent?: string | Buffer,
  fileOptions: {
    filename?: string
    contentType?: string
  } = {},
) => {
  const boundary = `----codex-${Math.random().toString(16).slice(2)}`
  const chunks: Buffer[] = []
  const push = (value: string) => chunks.push(Buffer.from(value, 'utf8'))

  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
    push(`${value}\r\n`)
  }

  if (fileContent !== undefined) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="file"; filename="${fileOptions.filename ?? 'Dec 2025 All in one.txt'}"\r\n`)
    push(`Content-Type: ${fileOptions.contentType ?? 'text/plain'}\r\n\r\n`)
    chunks.push(Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent, 'utf8'))
    push('\r\n')
  }

  push(`--${boundary}--\r\n`)

  return {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(chunks),
  }
}

const buildApp = async (isAdmin = 1) => {
  const app = Fastify()
  app.decorate('pgPool', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    ;(request as { authUser?: unknown }).authUser = {
      userCode: isAdmin ? 'admin' : 'crew',
      userName: isAdmin ? 'Admin' : 'Crew',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(multipart)
  await app.register(pbsCrewBidImportsAdminRoutes, { prefix: '/api' })
  return app
}

describe('PBS crew bid import admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.service.dryRun.mockResolvedValue({
      mode: 'dry_run',
      status: 'completed',
      periodCode: 'Jun 2026',
      sourcePeriodCode: 'December 2025',
      startedAt: '2026-06-16T00:00:00.000Z',
      completedAt: '2026-06-16T00:00:01.000Z',
      summary: {
        totalBlocks: 1,
        totalCrew: 1,
        selectedCrew: 1,
        readyCrew: 1,
        importedCrew: 0,
        skippedCrew: 0,
        failedCrew: 0,
        parsedPreferenceCount: 1,
        importablePreferenceCount: 1,
        importedPreferenceCount: 0,
        skippedPreferenceCount: 0,
        failedPreferenceCount: 0,
        matchedPairingCount: 1,
        unmatchedPairingCount: 0,
      },
      items: [],
      problems: [],
    })
  })

  it('accepts valid text uploads before dry-run import', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      rosterPeriodId: '6',
    }, VALID_CREW_BID_TEXT)

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(200)
    expect(h.service.dryRun).toHaveBeenCalledWith(
      { userCode: 'admin' },
      expect.objectContaining({
        rosterPeriodId: 6,
        sourceText: expect.stringContaining('Bid Request'),
      }),
    )

    await app.close()
  })

  it('rejects uploads without a valid roster period identity', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({}, VALID_CREW_BID_TEXT)

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('A valid rosterPeriodId is required.')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })

  it('parses strict pairing and airport matching options', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      rosterPeriodId: '6',
      options: JSON.stringify({
        failOnUnmatchedPairing: true,
        failOnUnmatchedAirport: true,
      }),
    }, VALID_CREW_BID_TEXT)

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(200)
    expect(h.service.dryRun).toHaveBeenCalledWith(
      { userCode: 'admin' },
      expect.objectContaining({
        options: {
          failOnUnmatchedPairing: true,
          failOnUnmatchedAirport: true,
        },
      }),
    )

    await app.close()
  })

  it('rejects non-admin uploads before parsing the file', async () => {
    const app = await buildApp(0)
    const multipartPayload = buildMultipartPayload({
      periodCode: 'Jun 2026',
    }, VALID_CREW_BID_TEXT)

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().message).toBe('Admin access required')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects non-txt crew bid uploads', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      periodCode: 'Jun 2026',
    }, VALID_CREW_BID_TEXT, {
      filename: 'Dec 2025 All in one.csv',
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Crew bid import file must be a .txt file.')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects invalid utf-8 crew bid uploads', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      periodCode: 'Jun 2026',
    }, Buffer.from([0xff, 0xfe, 0xfd]))

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Crew bid import file must be valid UTF-8 text.')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects text uploads with nul bytes', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      periodCode: 'Jun 2026',
    }, `${VALID_CREW_BID_TEXT}\0`)

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Crew bid import file format is invalid.')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects disallowed upload mime types', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      periodCode: 'Jun 2026',
    }, VALID_CREW_BID_TEXT, {
      contentType: 'application/pdf',
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Crew bid import file type is not allowed.')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })

  it('rejects files without crew bid structure', async () => {
    const app = await buildApp()
    const multipartPayload = buildMultipartPayload({
      periodCode: 'Jun 2026',
    }, 'Bid Request')

    const response = await app.inject({
      method: 'POST',
      url: `/api${pbsCrewBidImportRoutes.dryRun}`,
      headers: multipartPayload.headers,
      payload: multipartPayload.payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toBe('Crew bid import file format is invalid.')
    expect(h.service.dryRun).not.toHaveBeenCalled()

    await app.close()
  })
})
