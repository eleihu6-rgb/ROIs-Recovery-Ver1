import crypto from 'node:crypto'
import { ConnectorConfig, AuthConfig } from '../../models/index.js'
import { verifyHmacSignature, isTimestampValid } from '../../utils/crypto.js'

/**
 * API Key + HMAC authentication service
 */
export class ApiKeyAuthService {
  /**
   * Verify HMAC signature for a connector request
   */
  verifySignature(
    config: ConnectorConfig,
    timestamp: number,
    body: string,
    signature: string
  ): boolean {
    const authConfig = config.authConfig as AuthConfig
    if (!authConfig.apiKey || !authConfig.apiSecret) {
      return false
    }

    // Check timestamp validity first
    if (!isTimestampValid(timestamp)) {
      return false
    }

    return verifyHmacSignature(
      authConfig.apiKey,
      timestamp,
      body,
      signature,
      authConfig.apiSecret
    )
  }

  /**
   * Generate signature headers for outgoing requests
   */
  generateSignatureHeaders(
    apiKey: string,
    apiSecret: string,
    body: string
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000)
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
    const payload = `${apiKey}.${timestamp}.${bodyHash}`
    const signature = crypto.createHmac('sha256', apiSecret).update(payload).digest('hex')

    return {
      'X-Api-Key': apiKey,
      'X-Timestamp': String(timestamp),
      'X-Signature': signature,
    }
  }
}

export const apiKeyAuth = new ApiKeyAuthService()