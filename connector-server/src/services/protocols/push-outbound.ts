import { ProtocolHandler, ExecuteResult } from './protocol-handler.js'
import { ConnectorConfig, AuthConfig, EndpointConfig } from '../../models/index.js'
import { getTransform, StandardRecord } from '../../transform/index.js'
import { oauth2Auth, apiKeyAuth, f8TokenAuth } from '../auth/index.js'

interface PushOutboundExtra {
  records?: StandardRecord[]
  payload?: unknown
  recordCount?: number
}

const rawErrorDetails = (err: unknown): string =>
  err instanceof Error ? err.stack ?? err.message : String(err)

const hasBusinessFailure = (responseBody: string): boolean => {
  try {
    const parsed = JSON.parse(responseBody) as { code?: unknown }
    return parsed.code === 1 || parsed.code === '1'
  } catch {
    return false
  }
}

/**
 * Push outbound handler
 * Pushes data to external systems
 * Called by roster-outbound-worker when consuming connector:roster:outbound queue
 */
export class PushOutboundHandler implements ProtocolHandler {
  async execute(
    config: ConnectorConfig,
    extra?: unknown
  ): Promise<ExecuteResult> {
    const startTime = Date.now()
    const transform = getTransform(config.transformPlugin)
    const { records = [], payload, recordCount } = (extra as PushOutboundExtra) || { records: [] }
    const recordsIn = recordCount ?? records.length

    try {
      const endpointConfig = config.endpointConfig as EndpointConfig
      const authConfig = config.authConfig as AuthConfig

      const body = JSON.stringify(payload ?? records.map(record => transform.fromStandard(record)))

      // Build request with auth headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...endpointConfig.headers,
      }

      // Add authentication
      await this.applyAuthHeaders(config, authConfig, headers, body)

      let response = await this.post(endpointConfig, headers, body)

      if ((response.status === 401 || response.status === 403) && config.authType === 'f8_token') {
        const accessToken = await f8TokenAuth.getAccessToken(config, true)
        headers['AuthorizationToken'] = accessToken
        response = await this.post(endpointConfig, headers, body)
      }

      const responseBody = await response.text()

      if (!response.ok) {
        return {
          status: 'fail',
          recordsIn,
          recordsOut: 0,
          errorMessage: `External API returned ${response.status}`,
          durationMs: Date.now() - startTime,
          responseStatus: response.status,
          responseBody,
        }
      }

      if (hasBusinessFailure(responseBody)) {
        return {
          status: 'fail',
          recordsIn,
          recordsOut: 0,
          errorMessage: 'External API returned code 1',
          durationMs: Date.now() - startTime,
          responseStatus: response.status,
          responseBody,
        }
      }

      return {
        status: 'success',
        recordsIn,
        recordsOut: recordsIn,
        durationMs: Date.now() - startTime,
        responseStatus: response.status,
        responseBody,
      }
    } catch (err) {
      return {
        status: 'fail',
        recordsIn,
        recordsOut: 0,
        errorMessage: rawErrorDetails(err),
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async applyAuthHeaders(
    config: ConnectorConfig,
    authConfig: AuthConfig,
    headers: Record<string, string>,
    body: string,
  ): Promise<void> {
    if (config.authType === 'f8_token') {
      const accessToken = await f8TokenAuth.getAccessToken(config)
      headers['AuthorizationToken'] = accessToken
      return
    }

    if (config.authType === 'oauth2_cc') {
      const accessToken = await oauth2Auth.getAccessToken(config)
      headers['Authorization'] = `Bearer ${accessToken}`
      return
    }

    if (config.authType === 'api_key' && authConfig.apiKey && authConfig.apiSecret) {
      const signatureHeaders = apiKeyAuth.generateSignatureHeaders(
        authConfig.apiKey,
        authConfig.apiSecret,
        body,
      )
      Object.assign(headers, signatureHeaders)
    }
  }

  private async post(
    endpointConfig: EndpointConfig,
    headers: Record<string, string>,
    body: string,
  ): Promise<Response> {
    return fetch(endpointConfig.url, {
      method: 'POST',
      headers: { ...headers },
      body,
      signal: endpointConfig.timeout
        ? AbortSignal.timeout(endpointConfig.timeout)
        : undefined,
    })
  }
}
