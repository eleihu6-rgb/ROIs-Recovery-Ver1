import type { FastifyInstance } from 'fastify'
import { recompute } from './manday-tool.js'
import { liveSchemaName } from '../../utils/db-schema.js'
import { notifyRosterTasksChanged } from '../roster/roster-change-notifier.js'
import { recheckLiveRosterMutation } from '../rule/legality-recheck.js'

export interface MandayOperationInput {
  crewIds: string[]
  startDt: string | Date
  endDt: string | Date
  updatedBy: string
  notify?: boolean
}

export interface MandayOperationResult {
  recompute: Awaited<ReturnType<typeof recompute>>
  crewIds: string[]
}

export interface LiveMutationRefreshInput {
  crewIds?: string[]
  legalityDates: Array<Date | string | null | undefined>
  startDt: string | Date
  endDt: string | Date
  updatedBy: string
}

/**
 * The Live mutation contract: task/crew changes always notify both consumers.
 * The legality child is started and Manday is recomputed in parallel; a failure
 * in either operation rejects the caller so import/publish status is not falsely
 * reported as successful.
 */
export const refreshLiveLegalityAndManday = async (
  fastify: FastifyInstance,
  input: LiveMutationRefreshInput,
): Promise<void> => {
  const crewIds = [...new Set((input.crewIds ?? []).map(String).filter((id) => id.trim().length > 0))]
  await Promise.all([
    recheckLiveRosterMutation(fastify, undefined, input.legalityDates, crewIds),
    recomputeMandayAndNotify(fastify, {
      crewIds,
      startDt: input.startDt,
      endDt: input.endDt,
      updatedBy: input.updatedBy,
    }),
  ])
}

export const recomputeMandayAndNotify = async (
  fastify: FastifyInstance,
  input: MandayOperationInput,
): Promise<MandayOperationResult> => {
  const crewIds = [...new Set(input.crewIds.filter((crewId) => crewId.trim().length > 0))]
  const asDateString = (value: string | Date): string =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value
  const result = await recompute(fastify.pgPool, {
    schema: liveSchemaName(),
    crewIds,
    startDt: asDateString(input.startDt),
    endDt: asDateString(input.endDt),
    updatedBy: input.updatedBy,
  })

  if (input.notify !== false && crewIds.length > 0) {
    await notifyRosterTasksChanged(fastify, {
      schema: liveSchemaName(),
      crewIds,
    })
  }

  return { recompute: result, crewIds }
}
