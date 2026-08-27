import crypto from 'node:crypto'

/**
 * Generate HMAC-SHA256 signature for API authentication
 * Format: HMAC-SHA256(apiKey + "." + timestamp + "." + SHA256(body), secret)
 */
export const generateHmacSignature = (
  apiKey: string,
  timestamp: number,
  body: string,
  secret: string
): string => {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const payload = `${apiKey}.${timestamp}.${bodyHash}`
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Verify HMAC-SHA256 signature
 */
export const verifyHmacSignature = (
  apiKey: string,
  timestamp: number,
  body: string,
  signature: string,
  secret: string
): boolean => {
  const expected = generateHmacSignature(apiKey, timestamp, body, secret)

  // Check signature length first (SHA256 hex = 64 chars)
  if (signature.length !== 64) {
    return false
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Check if timestamp is within acceptable range (±300 seconds)
 */
export const isTimestampValid = (timestamp: number, maxDriftSeconds = 300): boolean => {
  const now = Math.floor(Date.now() / 1000)
  const drift = Math.abs(now - timestamp)
  return drift <= maxDriftSeconds
}

/**
 * SHA256 hash of a string
 */
export const sha256 = (input: string): string => {
  return crypto.createHash('sha256').update(input).digest('hex')
}