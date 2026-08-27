import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { env } from '../config/index.js'
import { version, name, description } from '../../package.json'

// 外部访问地址（可通过环境变量配置）
const externalBaseUrl = env.EXTERNAL_BASE_URL || `http://localhost:${env.PORT}`

/**
 * Swagger/OpenAPI documentation plugin
 * Provides interactive API documentation at /api/docs
 */
export default fp(async (fastify: FastifyInstance) => {
  // Register swagger
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: name || 'Connector Server API',
        description: description || 'External system integration service for ROIS-AI',
        version: version || '0.1.0',
        contact: {
          name: 'ROIS-AI Team',
        },
      },
      servers: [
        {
          url: externalBaseUrl,
          description: 'Production server',
        },
        {
          url: `http://localhost:${env.PORT}/api`,
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'inbound', description: 'Inbound data push endpoints' },
        { name: 'outbound', description: 'Outbound data query endpoints' },
        { name: 'admin', description: 'Admin management endpoints' },
      ],
      components: {
        securitySchemes: {
          ApiKeyHmac: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Api-Key',
            description: 'API Key + HMAC signature authentication',
          },
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Bearer token from OAuth 2.0',
          },
        },
      },
    },
  })

  // Register swagger UI
  await fastify.register(swaggerUI, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  fastify.log.info('Swagger documentation available at /api/docs')
})