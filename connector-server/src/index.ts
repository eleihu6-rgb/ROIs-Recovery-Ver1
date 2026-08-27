import 'dotenv/config'
import Fastify from 'fastify'
import formbody from '@fastify/formbody'
import { env } from './config/index.js'
import databasePlugin from './plugins/database.js'
import redisPlugin from './plugins/redis.js'
import bullmqPlugin from './plugins/bullmq.js'
import metricsPlugin from './plugins/metrics.js'
import securityHeadersPlugin from './plugins/security-headers.js'
import authPlugin from './plugins/auth.js'
import swaggerPlugin from './plugins/swagger.js'
import { registerRoutes } from './routes/index.js'
import bullBoardPlugin from './plugins/bull-board.js'
import { connectorConfigService, connectorScheduler } from './services/connector/index.js'
import { oauth2Auth, f8TokenAuth } from './services/auth/index.js'
import { createRosterOutboundWorker, createPollInboundWorker } from './workers/index.js'

const logger = process.stdout.isTTY && env.APP_ENV === 'development'
  ? {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    }
  : { level: env.LOG_LEVEL }

const fastify = Fastify({ logger })

// Register plugins
const start = async () => {
  try {
    // Register security response headers (helmet) early, before routes
    await fastify.register(securityHeadersPlugin)

    // Register database
    await fastify.register(databasePlugin)

    // Register Redis
    await fastify.register(redisPlugin)

    // Register BullMQ queues
    await fastify.register(bullmqPlugin)

    // Register metrics endpoint
    await fastify.register(metricsPlugin)

    // Register formbody parser (for OAuth form-urlencoded)
    await fastify.register(formbody)

    // Register auth
    await fastify.register(authPlugin)

    // Register Swagger (before routes)
    await fastify.register(swaggerPlugin)

    // Register Bull Board UI (admin dashboard for queue monitoring)
    await fastify.register(bullBoardPlugin)

    // Initialize services with Fastify instance
    connectorConfigService.setFastify(fastify)
    connectorConfigService.setRedis(fastify.redis)
    connectorScheduler.setFastify(fastify)
    oauth2Auth.setRedis(fastify.redis)
    f8TokenAuth.setRedis(fastify.redis)

    // Register routes
    registerRoutes(fastify)

    // Start workers
    const rosterWorker = createRosterOutboundWorker(fastify)
    const pollWorker = createPollInboundWorker(fastify)

    // Handle graceful shutdown
    fastify.addHook('onClose', async () => {
      await rosterWorker.close()
      await pollWorker.close()
    })

    // Start server
    await fastify.listen({ host: env.HOST, port: env.PORT })
    console.log(`Connector server listening on ${env.HOST}:${env.PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
