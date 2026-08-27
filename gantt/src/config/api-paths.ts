/**
 * Backend service base paths — proxied by nginx (see /etc/nginx/conf.d/f8.conf).
 * Override the prefix with VITE_API_PREFIX at build time (e.g. "dev" for the dev
 * environment) so that multiple environments can coexist behind the same nginx without
 * conflicting API routes.
 */
const _prefix = (import.meta.env.VITE_API_PREFIX ?? 'altair').replace(/^\/|\/$/g, '')
const _seg = _prefix ? `/${_prefix}` : ''
export const LIVE_API_BASE = `${_seg}/live`
export const RULE_API_BASE = `${_seg}/rule`
export const ENGINE_API_BASE = `${_seg}/engine`
export const AI_API_BASE = `${_seg}/ai`

/** WebSocket endpoint on live-server (path is relative to LIVE_API_BASE) */
export const LIVE_WS_PATH = '/ws/locks'

/** Azure SSO 登录入口；可用 VITE_SSO_LOGIN_URL 覆盖 */
export const SSO_LOGIN_URL =
  import.meta.env.VITE_SSO_LOGIN_URL ?? `${LIVE_API_BASE}/api/auth/sso/login`
