import { describe, expect, it, vi } from 'vitest'
import {
  PermissionReferenceValidationError,
  adminProfileService,
} from '../../services/admin/permission-admin-service.js'

type MenuRow = {
  menuCode: string
  parentMenuCode?: string
  systemType: string
}

function buildDb(rows: MenuRow[]) {
  const where = vi.fn()
  const values = vi.fn()
  let selectCount = 0
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        selectCount += 1
        const result = selectCount === 1 ? rows : []
        return Object.assign(Promise.resolve(result), { where: vi.fn(async () => []) })
      }),
    })),
    delete: vi.fn(() => ({ where })),
    insert: vi.fn(() => ({ values })),
  }
  return { db, where, values }
}

const redis = { incr: vi.fn(async () => 2), del: vi.fn(async () => 1) }

describe('adminProfileService permission reference validation', () => {
  it('rejects unknown menu codes before deleting existing privileges', async () => {
    const { db, where } = buildDb([{ menuCode: 'LIVE', systemType: 'M' }])

    await expect(
      adminProfileService.setMenus(db as never, redis as never, 'f8', 7, ['UNKNOWN'], 'admin'),
    ).rejects.toBeInstanceOf(PermissionReferenceValidationError)

    expect(db.delete).not.toHaveBeenCalled()
    expect(where).not.toHaveBeenCalled()
  })

  it('writes only canonical non-button menu references', async () => {
    const { db, values } = buildDb([
      { menuCode: 'LIVE', systemType: 'M' },
      { menuCode: 'LIVE_SAVE', parentMenuCode: 'LIVE', systemType: 'B' },
    ])

    await expect(
      adminProfileService.setMenus(db as never, redis as never, 'f8', 7, ['LIVE'], 'admin'),
    ).resolves.toEqual(['LIVE'])

    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledTimes(1)
    expect(values.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ menuCode: 'LIVE', isHidden: 'N' })])
  })

  it('rejects a mismatched control pair before deleting existing privileges', async () => {
    const { db, where } = buildDb([
      { menuCode: 'LIVE_SAVE', parentMenuCode: 'LIVE', systemType: 'B' },
    ])

    await expect(
      adminProfileService.setCtrls(db as never, redis as never, 'f8', 7, [{ menuCode: 'PBS', ctlCode: 'LIVE_SAVE' }], 'admin'),
    ).rejects.toBeInstanceOf(PermissionReferenceValidationError)

    expect(db.delete).not.toHaveBeenCalled()
    expect(where).not.toHaveBeenCalled()
  })

  it('writes a canonical control pair', async () => {
    const { db, values } = buildDb([
      { menuCode: 'LIVE_SAVE', parentMenuCode: 'LIVE', systemType: 'B' },
    ])

    await expect(
      adminProfileService.setCtrls(db as never, redis as never, 'f8', 7, [{ menuCode: 'LIVE', ctlCode: 'LIVE_SAVE' }], 'admin'),
    ).resolves.toEqual([{ menuCode: 'LIVE', ctlCode: 'LIVE_SAVE' }])

    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith([expect.objectContaining({ menuCode: 'LIVE', menuCtlCode: 'LIVE_SAVE' })])
  })
})
