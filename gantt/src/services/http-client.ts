import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

export interface HttpClientOptions {
  /** Base URL for all requests */
  baseURL: string
  /** Request timeout in ms (default 30s) */
  timeout?: number
  /** Called on 401 responses — typically wired to auth store logout */
  onUnauthorized?: () => void
  /** Called on every outgoing request — used for idle-timeout activity tracking */
  onRequest?: (config: InternalAxiosRequestConfig) => void
}

export const getHttpErrorStatus = (error: unknown): number | null => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

const createNormalizedHttpError = (message: string, status?: number): Error & { status?: number } =>
  Object.assign(new Error(message), status === undefined ? {} : { status })

/**
 * Errors that originate from menu-gated endpoints and surface as a 403 to a
 * non-admin user without the required menu profile grant. Call sites typically
 * pipe the error message into notify.error(...) — but the user is not supposed
 * to know the feature exists, so we strip the message before it ever reaches a
 * toast. The `status` is preserved so call sites that branch on
 * `getHttpErrorStatus(...)` still work.
 */
const silenceIfAccessDenied = (message: string, status: number | undefined): string => {
  if (status === 403 && /missing menu permission/i.test(message)) return ''
  return message
}

/**
 * Create an axios instance with the project-standard response envelope handling.
 *
 * Backend convention (live-server / rule-engine / pbs-server):
 *   success → { code: 200, data: T, message: 'ok' }
 *   failure → { code: number, data: null, message: string }
 *
 * The interceptor unwraps `data` on success and rejects with the `message` on failure.
 * Network errors (no response) are normalized to `Error('Network Error')`.
 */
export const createHttpClient = (options: HttpClientOptions): AxiosInstance => {
  const { baseURL, timeout = 30000, onUnauthorized, onRequest } = options

  const client = axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
  })

  if (onRequest) {
    client.interceptors.request.use((config) => {
      onRequest(config)
      return config
    })
  }

  client.interceptors.response.use(
    (response) => {
      const body = response.data
      if (body && typeof body === 'object' && 'code' in body) {
        if (body.code === 200) {
          return body.data
        }
        return Promise.reject(createNormalizedHttpError(
          silenceIfAccessDenied(body.message || 'API Error', response.status),
          response.status,
        ))
      }
      return response.data
    },
    (error) => {
      if (error.response?.status === 401 && onUnauthorized) {
        onUnauthorized()
      }
      const rawMessage = error.response?.data?.message || error.message || 'Network Error'
      const message = silenceIfAccessDenied(rawMessage, error.response?.status)
      return Promise.reject(createNormalizedHttpError(message, error.response?.status))
    },
  )

  return client
}
