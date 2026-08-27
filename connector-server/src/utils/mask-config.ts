import type { ConnectorConfig, AuthConfig } from '../models/index.js'

const SECRET_MASK = '***'

/**
 * Mask secret material in a connector's authConfig before returning it from
 * admin read endpoints (list/get/create/update responses).
 *
 * Secrets (apiSecret, clientSecret) are replaced with '***' and a boolean
 * `hasApiSecret` / `hasClientSecret` marker is added so the UI can show whether
 * a secret is configured without ever transmitting it. Identifiers (apiKey,
 * clientId, tokenUrl, scopes) are non-secret and remain visible.
 *
 * The write path (create/update request bodies) is unaffected — secrets are
 * still accepted and stored; only outbound responses are masked.
 */
export const maskAuthConfig = (
  authConfig: AuthConfig,
): AuthConfig & { hasApiSecret: boolean; hasClientSecret: boolean } => {
  const hasApiSecret = Boolean(authConfig.apiSecret)
  const hasClientSecret = Boolean(authConfig.clientSecret)
  return {
    ...authConfig,
    apiSecret: hasApiSecret ? SECRET_MASK : undefined,
    clientSecret: hasClientSecret ? SECRET_MASK : undefined,
    hasApiSecret,
    hasClientSecret,
  }
}

/**
 * Return a copy of a connector config with its authConfig secrets masked.
 */
export const maskConnectorConfig = (config: ConnectorConfig): ConnectorConfig => ({
  ...config,
  authConfig: maskAuthConfig(config.authConfig as AuthConfig),
})
