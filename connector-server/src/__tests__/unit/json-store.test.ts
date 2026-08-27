import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('saveRawJson', () => {
  let tmpDir: string
  const OLD_DATA_DIR = process.env['DATA_DIR']

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'json-store-test-'))
    process.env['DATA_DIR'] = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
    if (OLD_DATA_DIR !== undefined) {
      process.env['DATA_DIR'] = OLD_DATA_DIR
    } else {
      delete process.env['DATA_DIR']
    }
  })

  it('writes JSON file and returns the path', async () => {
    const { saveRawJson } = await import('../../utils/json-store.js')
    const filePath = await saveRawJson('flight', 'F8', '2026-01-01', '2026-01-10', [{ id: 1 }])
    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toMatch(/2026-01-01_2026-01-10\.json$/)
  })

  it('includes suffix in filename when provided', async () => {
    const { saveRawJson } = await import('../../utils/json-store.js')
    const filePath = await saveRawJson('roster_ground', 'F8', '2026-01-01', '2026-01-10', [], 'Unknown')
    expect(filePath).toMatch(/Unknown\.json$/)
  })

  it('adds sync/import/timestamp parts when trace options are provided', async () => {
    const { saveRawJson } = await import('../../utils/json-store.js')
    const filePath = await saveRawJson('crew', 'F8', '2026-01-01', '2026-01-10', [], {
      syncId: 'sync-abc',
      importId: 'import-xyz',
      timestamp: '2026-07-22T15:42:00.123Z',
    })
    expect(filePath).toMatch(/2026-01-01_2026-01-10_sync-sync-abc_import-import-xyz_ts-20260722T154200123Z\.json$/)
  })
})

describe('getNextBatchDir', () => {
  let tmpDir: string
  const OLD_DATA_DIR = process.env['DATA_DIR']

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'json-store-batch-'))
    process.env['DATA_DIR'] = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
    if (OLD_DATA_DIR !== undefined) {
      process.env['DATA_DIR'] = OLD_DATA_DIR
    } else {
      delete process.env['DATA_DIR']
    }
  })

  it('当天第一次调用返回 <date>/01，第二次返回 02', async () => {
    const { getNextBatchDir } = await import('../../utils/json-store.js')
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const first = await getNextBatchDir('F8')
    expect(first.endsWith(`${date}/01`)).toBe(true)
    const second = await getNextBatchDir('F8')
    expect(second.endsWith(`${date}/02`)).toBe(true)
  })

  it('saveRawJson 带 batchDir 时写入其下 <entity>/<file>', async () => {
    const { getNextBatchDir, saveRawJson } = await import('../../utils/json-store.js')
    const batchDir = await getNextBatchDir('F8')
    const filePath = await saveRawJson('flight', 'F8', '2026-01-01', '2026-01-10', [{ id: 1 }], { batchDir })
    expect(filePath).toMatch(new RegExp(`${batchDir.replace(/\\/g, '/')}/flight/2026-01-01_2026-01-10\\.json$`))
  })
})
