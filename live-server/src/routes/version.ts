import type { FastifyInstance } from 'fastify'
import { formatAppVersion, formatPbsVersion, readVersionState } from '../utils/app-version.js'
import { success } from '../utils/response.js'

export default async function versionRoutes(fastify: FastifyInstance) {
  fastify.get('/api/version', async (_request, reply) => {
    const state = readVersionState()
    return success(reply, {
      appVersion: formatAppVersion(state),
      pbsVersion: formatPbsVersion(state),
      state,
    })
  })
}
