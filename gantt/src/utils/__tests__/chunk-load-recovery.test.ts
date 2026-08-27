import { describe, expect, it } from 'vitest'
import { isDynamicImportLoadError, maybeReloadForChunkLoadError } from '@/utils/chunk-load-recovery'

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('chunk-load-recovery', () => {
  it('recognizes Vite dynamic import load failures', () => {
    expect(
      isDynamicImportLoadError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://crew-f8-usva-sit.roiscloud.com/altair/assets/scenario-roster-pane-Bby36VAO.js',
        ),
      ),
    ).toBe(true)
  })

  it('reloads once per build id for dynamic import failures', () => {
    const storage = createStorage()
    let reloadCount = 0
    const error = new TypeError('Failed to fetch dynamically imported module: /altair/assets/chunk.js')

    expect(maybeReloadForChunkLoadError(error, {
      buildId: 'abc123',
      storage,
      reload: () => { reloadCount += 1 },
    })).toBe(true)
    expect(maybeReloadForChunkLoadError(error, {
      buildId: 'abc123',
      storage,
      reload: () => { reloadCount += 1 },
    })).toBe(false)
    expect(reloadCount).toBe(1)
  })

  it('does not reload for ordinary render errors', () => {
    let reloadCount = 0

    expect(maybeReloadForChunkLoadError(new Error('Cannot read properties of undefined'), {
      buildId: 'abc123',
      storage: createStorage(),
      reload: () => { reloadCount += 1 },
    })).toBe(false)
    expect(reloadCount).toBe(0)
  })
})
