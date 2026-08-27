import { createClient, type RedisClientType } from 'redis'
import { env } from '../config/index.js'
import {
  IMPORT_PROGRESS_HISTORY_MAX_EVENTS,
  IMPORT_PROGRESS_STATE_TTL_SEC,
  importProgressChannel,
  importProgressHistoryKey,
  importProgressStateKey,
  type ImportProgressEvent,
} from '../types/import-progress.js'

let publisher: RedisClientType | null = null

const getPublisher = async (): Promise<RedisClientType> => {
  if (publisher?.isOpen) return publisher
  publisher = createClient({ url: env.BULLMQ_REDIS_URL }) as RedisClientType
  publisher.on('error', () => undefined)
  await publisher.connect()
  return publisher
}

/** Test helper: drop the cached publisher so the next call reconnects. */
export const resetImportProgressPublisher = (): void => {
  publisher = null
}

export const publishImportProgress = async (event: ImportProgressEvent): Promise<void> => {
  const client = await getPublisher()
  const channel = importProgressChannel(event.importId)
  const payload = JSON.stringify(event)
  const historyKey = importProgressHistoryKey(event.importId)
  if (event.type === 'started') {
    await client.del(historyKey)
  }
  await client.publish(channel, payload)
  await client.rPush(historyKey, payload)
  await client.lTrim(historyKey, -IMPORT_PROGRESS_HISTORY_MAX_EVENTS, -1)
  await client.expire(historyKey, IMPORT_PROGRESS_STATE_TTL_SEC)
  await client.set(importProgressStateKey(event.importId), payload, {
    EX: IMPORT_PROGRESS_STATE_TTL_SEC,
  })
}

export const readImportProgressSnapshot = async (
  importId: string,
): Promise<ImportProgressEvent[] | null> => {
  const client = await getPublisher()
  const history = await client.lRange(importProgressHistoryKey(importId), 0, -1)
  const events = history.flatMap((raw): ImportProgressEvent[] => {
    try {
      return [JSON.parse(raw) as ImportProgressEvent]
    } catch {
      return []
    }
  })
  if (events.length > 0) return events

  const raw = await client.get(importProgressStateKey(importId))
  if (!raw) return null
  try {
    return [JSON.parse(raw) as ImportProgressEvent]
  } catch {
    return null
  }
}
