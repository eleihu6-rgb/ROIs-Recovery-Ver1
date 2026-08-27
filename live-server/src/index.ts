import 'dotenv/config'
import Fastify from 'fastify'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import zlib from 'node:zlib'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import multipart from '@fastify/multipart'
import formbody from '@fastify/formbody'
import { env } from './config/index.js'
import { resolveCorsOrigin } from './config/cors.js'
import securityHeadersPlugin from './plugins/security-headers.js'
import databasePlugin from './plugins/database.js'
import redisPlugin from './plugins/redis.js'
import websocketPlugin from './plugins/websocket.js'
import authPlugin from './plugins/auth.js'
import permissionPlugin from './plugins/permission.js'
import notFoundPlugin from './plugins/not-found.js'
import metricsPlugin from './plugins/metrics.js'
import healthRoutes from './routes/health.js'
import versionRoutes from './routes/version.js'
import publicConfigRoutes from './routes/public-config.js'
import baseRoutes from './routes/base/index.js'
import crewRoutes from './routes/crew/index.js'
import flightRoutes from './routes/flight/index.js'
import pairingRoutes from './routes/pairing/index.js'
import rosterRoutes from './routes/roster/index.js'
import ganttRoutes from './routes/gantt/index.js'
import scenarioRoutes from './routes/scenario/index.js'
import authRoutes from './routes/auth/auth.js'
import authMenusRoutes from './routes/auth/menus.js'
import ssoRoutes from './routes/auth/sso.js'
import lockRoutes from './routes/lock/lock.js'
import draftRoutes from './routes/draft/draft.js'
import dashboardRoutes from './routes/dashboard/index.js'
import dataRoutes from './routes/data/index.js'
import metadataRoutes from './routes/metadata/index.js'
import ruleRoutes from './routes/rule/index.js'
import aiRoutes from './routes/ai/index.js'
import bullmqPlugin from './plugins/bullmq.js'
import { startBatchCrewWorker } from './workers/batch-crew-worker.js'
import { startBatchOrchestratorWorker } from './workers/batch-orchestrator-worker.js'
import { startFlightInboundWorker } from './workers/flight-inbound-worker.js'
import { startCrewInboundWorker } from './workers/crew-inbound-worker.js'
import { startPairingInboundWorker } from './workers/pairing-inbound-worker.js'
import { startRosterInboundWorker } from './workers/roster-inbound-worker.js'
import { startRosterGroundInboundWorker } from './workers/roster-ground-inbound-worker.js'
import { startMandayInboundWorker } from './workers/manday-inbound-worker.js'
import { startRosterBulkDeleteWorker } from './workers/roster-bulk-delete-worker.js'
import { startMandayRecomputeWorker } from './workers/manday-recompute-worker.js'
import { startScenarioKpiRecomputeWorker } from './workers/scenario-kpi-recompute-worker.js'

import { startScenarioLegalitySweepWorker } from './workers/scenario-legality-sweep.js'
import { startPartitionManagerWorker } from './workers/partition-manager-worker.js'
import { startRosterRetentionCleanupWorker } from './workers/roster-retention-cleanup-worker.js'
import ruleCheckRouteGroup from './routes/rule-check/index.js'
import pbsRoutes from './routes/pbs/index.js'
import rosterEventRoutes from './routes/roster/roster-event-routes.js'
import rosterPairingsByCrewRoutes from './routes/roster/roster-pairings-by-crew.js'
import rosterViolationsRoutes from './routes/roster/roster-violations.js'
import pairingCompositionRefreshAdminRoutes from './routes/admin/pairing-composition-refresh.js'
import mandayCreditRefreshAdminRoutes from './routes/admin/manday-credit-refresh.js'
import scenarioKpiBackfillRoutes from './routes/admin/scenario-kpi-backfill.js'
import schedulerAdminRoutes from './routes/admin/scheduler.js'
import pbsAlgorithmExportAdminRoutes from './routes/admin/pbs-algorithm-export.js'
import pbsCrewBidImportsAdminRoutes from './routes/admin/pbs-crew-bid-imports.js'
import dataQualityAdminRoutes from './routes/admin/data-quality.js'
import pbsBusinessTimeAdminRoutes from './routes/admin/pbs-business-time.js'
import permissionAdminRoutes from './routes/admin/permission-admin.js'
import pbsSimulatedCrewPortalAdminRoutes from './routes/admin/pbs-simulated-crew-portal.js'
import crewMemoRoutes from './routes/crew-memo/index.js'
import resPairingRoutes from './routes/res-pairing/res-pairing.js'
import { bumpBackendVersion, formatAppVersion } from './utils/app-version.js'
import { resolveFiliale } from './utils/filiale.js'
import { flushRosterPublishAdjustBatches } from './services/roster/roster-publish-outbound-service.js'
import { createSchedulerService } from './services/scheduler/scheduler-service.js'
import { runLegalityOnStartup } from './services/rule/legality-coldstart.js'

const server = Fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
})

const start = async () => {
  try {
    const runtimeVersion = bumpBackendVersion()
    server.log.info({ version: formatAppVersion(runtimeVersion) }, 'runtime backend version bumped')

    // 插件
    // 安全响应头（helmet）：尽早注册，覆盖后续所有路由响应
    await server.register(securityHeadersPlugin)
    await server.register(cors, {
      // CORS 白名单（替换原 `origin: true` 反射）：仅放行 CORS_ORIGIN 列出的来源；
      // 生产类环境拒绝通配 / 空白名单（见 config/cors.ts）。
      origin: resolveCorsOrigin(env.CORS_ORIGIN),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      // 跨洲链路（亚洲客户端 / 加拿大服务端，RTT ~150-250ms）下，每次写操作的 CORS
      // 预检（OPTIONS）都要多花一个往返。让浏览器缓存预检结果 1h，消除重复预检。
      maxAge: 3600,
    })
    // 响应压缩（R1 性能增强）：大 JSON 负载（如 /api/roster 可达 ~17MB）按需 br/gzip 压缩，
    // 跨洲链路下显著降低传输耗时。仅压缩 > 1KB 的响应。
    // brotli 质量从默认 11 降到 5：对 ~17MB 负载大幅降低服务端压缩 CPU 耗时，压缩率仅略降。
    await server.register(compress, {
      global: true,
      threshold: 1024,
      encodings: ['br', 'gzip', 'deflate'],
      brotliOptions: {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
      },
    })
    await server.register(multipart, {
      limits: {
        files: 1,
        fileSize: 25 * 1024 * 1024,
        fields: 16,
        parts: 20,
      },
    })
    await server.register(formbody)
    await server.register(databasePlugin)
    await server.register(redisPlugin)
    await server.register(websocketPlugin)
    await server.register(authPlugin)
    await server.register(permissionPlugin)
    await server.register(metricsPlugin)
    await server.register(bullmqPlugin)

    const { queue: partitionQueue } = startPartitionManagerWorker(server)
    const { queue: rosterRetentionCleanupQueue } = startRosterRetentionCleanupWorker(server)
    const { queue: scenarioLegalitySweepQueue } = startScenarioLegalitySweepWorker(server)
    await partitionQueue.removeRepeatable('manage', { pattern: '0 1 1 * *' }).catch(() => undefined)
    await scenarioLegalitySweepQueue.removeRepeatable('sweep', { pattern: '0 3 * * *' }).catch(() => undefined)
    const schedulerService = createSchedulerService(server, [
      {
        jobCode: 'roster_publish_outbound',
        jobName: 'Roster Publish Outbound Callback',
        jobType: 'interval',
        scheduleType: 'fixed_delay',
        intervalSeconds: Math.max(1, Math.round(env.ROSTER_PUBLISH_OUTBOUND_INTERVAL_MS / 1000)),
        handler: async () => {
          const sentBatches = await flushRosterPublishAdjustBatches(
            server,
            10,
            env.ROSTER_PUBLISH_OUTBOUND_RETRY_COOLDOWN_MS,
          )
          return { message: `sentBatches=${sentBatches}` }
        },
      },
      {
        jobCode: 'partition_manager',
        jobName: 'Partition Manager',
        jobType: 'bullmq_repeat',
        scheduleType: 'cron',
        cronExpr: '0 1 1 * *',
        handler: async () => {
          const job = await partitionQueue.add('manage', { action: 'manage' })
          return { message: `queuedJobId=${job.id ?? ''}` }
        },
      },
      {
        jobCode: 'scenario_legality_sweep',
        jobName: 'Scenario Legality Sweep',
        jobType: 'bullmq_repeat',
        scheduleType: 'cron',
        cronExpr: '0 3 * * *',
        handler: async () => {
          const job = await scenarioLegalitySweepQueue.add('sweep', {})
          return { message: `queuedJobId=${job.id ?? ''}` }
        },
      },
      {
        jobCode: 'roster_retention_cleanup',
        jobName: 'Roster Soft Delete Retention Cleanup',
        jobType: 'interval',
        scheduleType: 'fixed_delay',
        intervalSeconds: Math.max(1, Math.round(env.ROSTER_SOFT_DELETE_CLEANUP_INTERVAL_MS / 1000)),
        handler: async () => {
          const job = await rosterRetentionCleanupQueue.add('cleanup', {})
          return { message: `queuedJobId=${job.id ?? ''}` }
        },
      },
    ], env.SCHEDULER_POLL_INTERVAL_MS)
    server.decorate('schedulerService', schedulerService)

    // 路由
    await server.register(healthRoutes)
    await server.register(versionRoutes)
    await server.register(publicConfigRoutes)
    await server.register(baseRoutes)
    await server.register(crewRoutes)
    await server.register(flightRoutes)
    await server.register(pairingRoutes)
    await server.register(resPairingRoutes, { prefix: '/api' })
    await server.register(rosterRoutes)
    await server.register(ganttRoutes)
    await server.register(scenarioRoutes)
    await server.register(authRoutes, { prefix: '/api/auth' })
    await server.register(authMenusRoutes, { prefix: '/api/auth' })
    if (env.SSO_ENABLED) {
      await server.register(ssoRoutes, { prefix: '/api/auth' })
    }
    await server.register(lockRoutes, { prefix: '/api/locks' })
    await server.register(draftRoutes, { prefix: '/api/draft' })
    await server.register(dashboardRoutes, { prefix: '/api/dashboard' })
    await server.register(dataRoutes, { prefix: '/api/data' })
    await server.register(metadataRoutes, { prefix: '/api/metadata' })
    await server.register(ruleRoutes)
    await server.register(aiRoutes)
    await server.register(ruleCheckRouteGroup)
    await server.register(pbsRoutes)
    await server.register(rosterEventRoutes, { prefix: '/api' })
    await server.register(rosterPairingsByCrewRoutes, { prefix: '/api' })
    await server.register(rosterViolationsRoutes, { prefix: '/api' })
    await server.register(pairingCompositionRefreshAdminRoutes, { prefix: '/api/admin' })
    await server.register(mandayCreditRefreshAdminRoutes, { prefix: '/api/admin' })
    await server.register(scenarioKpiBackfillRoutes, { prefix: '/api/admin' })
    await server.register(schedulerAdminRoutes, { prefix: '/api/admin' })
    await server.register(pbsAlgorithmExportAdminRoutes, { prefix: '/api' })
    await server.register(pbsCrewBidImportsAdminRoutes, { prefix: '/api' })
    await server.register(dataQualityAdminRoutes, { prefix: '/api/admin' })
    await server.register(permissionAdminRoutes, { prefix: '/api/admin' })
    await server.register(pbsBusinessTimeAdminRoutes, { prefix: '/api/admin' })
    await server.register(pbsSimulatedCrewPortalAdminRoutes, { prefix: '/api/admin' })
    await server.register(crewMemoRoutes, { prefix: '/api' })

    // 兜底 404（不回显 URL）必须在所有路由注册之后生效
    await server.register(notFoundPlugin)

    const scriptsDir = path.resolve(__dirname, '..', 'scripts')
    const { assertRustReleaseBins } = await import(
      pathToFileURL(path.join(scriptsDir, 'assert-rust-bins.mjs')).href
    )
    await assertRustReleaseBins()

    schedulerService.start()

    // 启动
    await server.listen({ host: env.HOST, port: env.PORT })
    server.log.info(`Live server running at http://${env.HOST}:${env.PORT}`)

    startBatchCrewWorker(server)
    startBatchOrchestratorWorker(server)
    startFlightInboundWorker(server)
    startCrewInboundWorker(server)
    startPairingInboundWorker(server)
    startRosterInboundWorker(server)
    startRosterGroundInboundWorker(server)
    startMandayInboundWorker(server)
    startRosterBulkDeleteWorker(server)
    startMandayRecomputeWorker(server)
    startScenarioKpiRecomputeWorker(server)

    const filiale = await resolveFiliale(server)
    server.log.info('Rule check workers started')
    server.log.info(`${filiale} inbound workers started`)

    // cold-start: recompute live violations with the Rust rule engine so the gantt
    // bell and Alert Center reflect current roster state without manual intervention.
    // Runs detached (non-blocking) — startup is not delayed if the compute is slow.
    runLegalityOnStartup(server, filiale)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
