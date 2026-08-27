import { publishImportProgress } from './import-progress-bus.js'
import type { ImportMaterial, ImportProgressEvent } from '../types/import-progress.js'

type WriteProgressCounters = Partial<Pick<Extract<ImportProgressEvent, { type: 'stage' }>,
  'processed' | 'total' | 'added' | 'updated' | 'deleted' | 'success' | 'failed' | 'skipped' | 'message'
>>

export const publishWriteTerminal = async (
  importId: string | undefined,
  material: ImportMaterial,
  status: 'done' | 'fail',
  message?: string,
  counters: WriteProgressCounters = {},
): Promise<void> => {
  if (!importId) return
  await publishImportProgress({
    type: 'stage',
    importId,
    material,
    stage: 'write',
    status,
    message,
    ...counters,
    at: new Date().toISOString(),
  })
}

export const publishWriteRunning = async (
  importId: string | undefined,
  material: ImportMaterial,
  counters: WriteProgressCounters = {},
): Promise<void> => {
  if (!importId) return
  await publishImportProgress({
    type: 'stage',
    importId,
    material,
    stage: 'write',
    status: 'running',
    ...counters,
    at: new Date().toISOString(),
  })
}

export const publishWriteProgress = publishWriteRunning
