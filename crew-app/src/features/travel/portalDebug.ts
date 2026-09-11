// ─── Portal debug storage (enhance-Ver5 #2) ──────────────────────────────────
// Crew-portal capture writes diagnostic snapshots to AsyncStorage for local
// inspection. Those payloads can contain credentials, JWTs, cookies and raw
// auth headers, and the full-capture blob was multi-megabyte — neither belongs
// in a production build. All writes go through these helpers, which:
//   • no-op entirely unless __DEV__ (production retains nothing), and
//   • redact sensitive fields + cap size before writing.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Size caps for debug writes (was an unbounded 4,000,000-char blob).
export const PREVIEW_LIMIT = 8_000;
export const FULL_PAYLOAD_LIMIT = 200_000;

// Object keys whose VALUE must never be stored (case-insensitive, exact match).
const SENSITIVE_KEYS = /^(authorization|cookie|set-cookie|password|passwords|captcha|uniquecode)$/i;
// JWT / Bearer token shapes scrubbed out of any string value.
const JWT_RE = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]{8,}/gi;

function redactString(s: string): string {
  return s.replace(JWT_RE, '[redacted-jwt]').replace(BEARER_RE, 'Bearer [redacted]');
}

/**
 * Recursively redact credential-bearing material from a value before it is
 * persisted: sensitive keys are blanked, and JWT/Bearer strings are scrubbed
 * out of any remaining string. Returns a safe-to-store copy.
 */
export function redactPortalDebug(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(v => redactPortalDebug(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : redactPortalDebug(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Persist a redacted, size-capped string. No-op in production. */
export function debugSetItem(key: string, value: string): void {
  if (!__DEV__) {
    return;
  }
  AsyncStorage.setItem(key, redactString(value).slice(0, FULL_PAYLOAD_LIMIT)).catch(() => {});
}

/** Persist a redacted, size-capped JSON snapshot. No-op in production. */
export function debugSetJson(key: string, value: unknown, limit = FULL_PAYLOAD_LIMIT): void {
  if (!__DEV__) {
    return;
  }
  try {
    AsyncStorage.setItem(key, JSON.stringify(redactPortalDebug(value)).slice(0, limit)).catch(() => {});
  } catch {
    // Non-fatal — debug only.
  }
}
