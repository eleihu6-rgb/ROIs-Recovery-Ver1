import { access, mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

const dataDir = () => process.env['DATA_DIR'] ?? path.join(process.cwd(), 'data')

export interface RawJsonTraceOptions {
  suffix?: string
  syncId?: string
  importId?: string
  timestamp?: string
  /** 批次目录（data/raw/<filiale>/<yyyy-mm-dd>/<seq>）；设置后写入其下 <entity>/<file> */
  batchDir?: string
}

const dateStr = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 计算本批次目录：data/raw/<filiale>/<yyyy-mm-dd>/<seq>。
 * 当天第一次导入 → 01，第二次 → 02，依此类推（seq = 已有最大序号 + 1）。
 */
export async function getNextBatchDir(filiale: string): Promise<string> {
  const base = path.join(dataDir(), 'raw', filiale.toLowerCase(), dateStr(new Date()))
  let seq = 1
  for (;;) {
    const dir = path.join(base, String(seq).padStart(2, '0'))
    try {
      await access(dir)
      seq += 1
    } catch {
      await mkdir(dir, { recursive: true })
      return dir
    }
  }
}

const sanitizeFilePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'none'

const timestampPart = (value: string): string =>
  sanitizeFilePart(value.replace(/[-:.]/g, ''))

const normalizeOptions = (suffixOrOptions?: string | RawJsonTraceOptions): RawJsonTraceOptions => {
  if (typeof suffixOrOptions === 'string') return { suffix: suffixOrOptions }
  return suffixOrOptions ?? {}
}

export async function saveRawJson(
  entity: string,
  filiale: string,
  startDt: string,
  endDt: string,
  data: unknown[],
  suffixOrOptions?: string | RawJsonTraceOptions,
): Promise<string> {
  const options = normalizeOptions(suffixOrOptions)
  const dir = options.batchDir
    ? path.join(options.batchDir, entity)
    : path.join(dataDir(), 'raw', filiale.toLowerCase(), entity)
  await mkdir(dir, { recursive: true })
  const hasTrace = Boolean(options.syncId || options.importId || options.timestamp)
  const traceParts = [
    hasTrace && options.syncId ? `sync-${sanitizeFilePart(options.syncId)}` : null,
    hasTrace ? `import-${sanitizeFilePart(options.importId ?? 'none')}` : null,
    hasTrace && options.timestamp ? `ts-${timestampPart(options.timestamp)}` : null,
    options.suffix ? sanitizeFilePart(options.suffix) : null,
  ].filter((part): part is string => Boolean(part))
  const filename = traceParts.length > 0
    ? `${startDt}_${endDt}_${traceParts.join('_')}.json`
    : `${startDt}_${endDt}.json`
  const finalPath = path.join(dir, filename)
  const tmpPath = `${finalPath}.tmp`

  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmpPath, finalPath)

  return finalPath
}
