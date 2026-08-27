import { isProdLikeEnv } from './env.js'

/**
 * Parse a comma-separated CORS_ORIGIN value into a trimmed, non-empty allowlist.
 * Mirrors the pattern already used by pbs-server.
 */
export const parseCorsOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

/**
 * Resolve the @fastify/cors `origin` option from CORS_ORIGIN.
 * In production-like environments, refuse wildcard / reflect-all / empty allowlists
 * so the Live Server never reflects arbitrary browser origins in front of a client.
 */
export const resolveCorsOrigin = (
  value: string,
  prodLike: boolean = isProdLikeEnv,
): string[] => {
  const origins = parseCorsOrigins(value)
  const hasWildcard = origins.includes('*') || origins.includes('true')
  if (prodLike && (origins.length === 0 || hasWildcard)) {
    throw new Error(
      'CORS_ORIGIN must be an explicit allowlist (no "*", "true", or empty) in production-like environments.',
    )
  }
  return origins
}
