const CHUNK_LOAD_RELOAD_KEY_PREFIX = 'rois:chunk-load-reload:'

const CHUNK_LOAD_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /chunkloaderror/i,
  /loading chunk \S+ failed/i,
  /loading css chunk \S+ failed/i,
]

interface ChunkLoadRecoveryOptions {
  buildId?: string
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  reload?: () => void
}

const errorText = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}\n${error.message}\n${error.stack ?? ''}`
  return String(error)
}

export const isDynamicImportLoadError = (error: unknown): boolean => {
  const text = errorText(error)
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

export const maybeReloadForChunkLoadError = (
  error: unknown,
  options: ChunkLoadRecoveryOptions = {},
): boolean => {
  if (!isDynamicImportLoadError(error)) return false

  const buildId = options.buildId?.trim() || 'unknown'
  const storage = options.storage ?? globalThis.sessionStorage
  const reload = options.reload ?? (() => globalThis.location.reload())
  const reloadKey = `${CHUNK_LOAD_RELOAD_KEY_PREFIX}${buildId}`

  try {
    if (storage.getItem(reloadKey) === '1') return false
    storage.setItem(reloadKey, '1')
  } catch {
    return false
  }

  reload()
  return true
}
