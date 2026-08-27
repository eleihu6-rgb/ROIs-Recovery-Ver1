import { mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { format } from 'date-fns'

const dataDir = () => process.env['DATA_DIR'] ?? path.join(process.cwd(), 'data')

export interface RejectionRecord {
  crewId: string
  reason: string
  raw: unknown
}

export async function saveRejectedRecords(
  entity: string,
  filiale: string,
  records: RejectionRecord[],
): Promise<string> {
  const dir = path.join(dataDir(), 'rejected', filiale.toLowerCase(), entity)
  await mkdir(dir, { recursive: true })

  const ts = format(new Date(), 'yyyyMMdd_HHmmss')
  const filename = `${ts}_rejected.json`
  const finalPath = path.join(dir, filename)
  const tmpPath = `${finalPath}.tmp`

  const payload = {
    count: records.length,
    generatedAt: new Date().toISOString(),
    records,
  }

  await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8')
  await rename(tmpPath, finalPath)

  return finalPath
}
