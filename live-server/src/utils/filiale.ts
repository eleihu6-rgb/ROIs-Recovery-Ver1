import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { dictionary } from '../models/base/dictionary.js'

const normalizeFiliale = (value: string): string => value.trim().toUpperCase()
const CACHE_TTL_MS = 5 * 60 * 1000

let cachedDictionaryFiliale: { value: string; expiresAt: number } | null = null
let inFlightDictionaryFiliale: Promise<string> | null = null

const configuredFiliale = (): string | null => {
  const value = env.FILIALE?.trim()
  return value ? normalizeFiliale(value) : null
}

export const resolveFiliale = async (fastify: FastifyInstance): Promise<string> => {
  const configured = configuredFiliale()
  if (configured) return configured

  const now = Date.now()
  if (cachedDictionaryFiliale && cachedDictionaryFiliale.expiresAt > now) {
    return cachedDictionaryFiliale.value
  }

  inFlightDictionaryFiliale ??= fastify.db
    .select({ codeValue: dictionary.codeValue })
    .from(dictionary)
    .where(and(eq(dictionary.parentCode, 'DEFAULT'), eq(dictionary.code, 'AIRLINE')))
    .limit(1)
    .then((rows) => {
      const airline = rows[0]?.codeValue?.trim()
      if (!airline) {
        throw new Error('DEFAULT/AIRLINE is not configured in the live dictionary table')
      }
      const value = normalizeFiliale(airline)
      cachedDictionaryFiliale = { value, expiresAt: Date.now() + CACHE_TTL_MS }
      return value
    })
    .finally(() => {
      inFlightDictionaryFiliale = null
    })

  return inFlightDictionaryFiliale
}

export const resolveFilialeLower = async (fastify: FastifyInstance): Promise<string> =>
  (await resolveFiliale(fastify)).toLowerCase()
