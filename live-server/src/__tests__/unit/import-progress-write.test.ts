import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportProgressEvent } from '../../types/import-progress.js'

const { publishImportProgress } = vi.hoisted(() => ({
  publishImportProgress: vi.fn(async (_event: ImportProgressEvent) => undefined),
}))

vi.mock('../../utils/import-progress-bus.js', () => ({
  publishImportProgress,
}))

describe('import-progress-write', () => {
  beforeEach(() => {
    publishImportProgress.mockClear()
  })

  it('no-ops when importId is undefined', async () => {
    const { publishWriteRunning, publishWriteTerminal } = await import(
      '../../utils/import-progress-write.js'
    )
    await publishWriteRunning(undefined, 'crew')
    await publishWriteTerminal(undefined, 'crew', 'done')
    await publishWriteTerminal(undefined, 'crew', 'fail', 'boom')

    expect(publishImportProgress).not.toHaveBeenCalled()
  })

  it('publishes write running when importId is set', async () => {
    const { publishWriteRunning } = await import('../../utils/import-progress-write.js')
    await publishWriteRunning('imp-1', 'flight')

    expect(publishImportProgress).toHaveBeenCalledTimes(1)
    const event = publishImportProgress.mock.calls[0][0]
    expect(event).toMatchObject({
      type: 'stage',
      importId: 'imp-1',
      material: 'flight',
      stage: 'write',
      status: 'running',
    })
    expect(typeof event.at).toBe('string')
  })

  it('publishes write done when importId is set', async () => {
    const { publishWriteTerminal } = await import('../../utils/import-progress-write.js')
    await publishWriteTerminal('imp-2', 'pairing', 'done')

    expect(publishImportProgress).toHaveBeenCalledTimes(1)
    const event = publishImportProgress.mock.calls[0][0]
    expect(event).toMatchObject({
      type: 'stage',
      importId: 'imp-2',
      material: 'pairing',
      stage: 'write',
      status: 'done',
    })
    expect(typeof event.at).toBe('string')
  })

  it('publishes write fail with message when importId is set', async () => {
    const { publishWriteTerminal } = await import('../../utils/import-progress-write.js')
    await publishWriteTerminal('imp-3', 'rosterGround', 'fail', 'db down')

    expect(publishImportProgress).toHaveBeenCalledTimes(1)
    const event = publishImportProgress.mock.calls[0][0]
    expect(event).toMatchObject({
      type: 'stage',
      importId: 'imp-3',
      material: 'rosterGround',
      stage: 'write',
      status: 'fail',
      message: 'db down',
    })
    expect(typeof event.at).toBe('string')
  })
})
