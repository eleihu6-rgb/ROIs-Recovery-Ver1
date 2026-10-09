// Native client for a ROIS crew portal's own API (`…/<tenant>/apiPortal`).
//
// Until Duty Swap, the app only talked to the portal from inside the login
// WebView (portalInjectedJs.ts `directAuth`), and the token died with it. Duty
// Swap needs live calls (search, compare, submit), so this does the same login
// natively: GET /system/getPublicKey → RSA-encrypt the password → POST /login →
// `data.token`. The token is kept in memory only (never persisted); the password
// comes from the signed-in session (Keychain-backed). An expired/invalid token
// triggers exactly one re-login. Spec:
// docs/superpowers/specs/2026-10-07-crew-app-duty-swap-concept-d-design.md §3.1
import { airlineByCode } from '../auth/airlines';
import { rsaEncrypt } from './rsa';

export interface PortalCredentials {
  airline: string;
  crewId: string;
  password: string;
}

export interface PortalSite {
  /** e.g. https://crew-pal-sea-tst.roiscloud.com/pefg/apiPortal */
  apiBase: string;
  /** Fixed email-code the TEST tenant accepts (`portalConfig.loginOutCaptcha`). */
  outCaptcha?: string;
}

/** The portal's response envelope. `code 0` = OK, anything else = business error. */
export interface Envelope<T> {
  code: number;
  message: string | null;
  data: T;
}

export class PortalError extends Error {
  constructor(message: string, readonly code: number, readonly status: number, readonly failureCode: string | null = null) {
    super(message);
    this.name = 'PortalError';
  }
}

export type QueryValue = string | number | boolean | string[] | null | undefined;
export type Query = Record<string, QueryValue>;

/** Derive the API base from the airline's portal login URL (same rule as the
 *  injected login script: `/portal…` → `/apiPortal`). Null when no portal. */
export function portalSiteFor(airlineCode: string): PortalSite | null {
  const a = airlineByCode(airlineCode);
  if (!a.portalUrl || a.portalKind !== 'rois') return null;
  const m = /^(https?:\/\/[^/]+)(\/.*)?$/.exec(a.portalUrl);
  if (!m) return null;
  const path = (m[2] ?? '').replace(/\/portal.*$/, '/apiPortal');
  return { apiBase: m[1] + path, outCaptcha: a.portalConfig?.loginOutCaptcha };
}

/** Query string with arrays as repeated keys (`k=a&k=b`); empty values dropped. */
export function toQuery(q: Query | undefined): string {
  if (!q) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    const vals = Array.isArray(v) ? v : [String(v)];
    for (const x of vals) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(x)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** A dead/foreign token comes back as HTTP 401 or as `code 1` with a JWT parse message. */
export function isAuthFailure(status: number, message: string | null | undefined): boolean {
  if (status === 401 || status === 403) return true;
  return !!message && /\bJW[STE]\b|token|unauthori|not log/i.test(message);
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PortalClient {
  /** The session token (cached, else a fresh login). The roster capture WebView
   *  needs it: the portal's CSP blocks the JSEncrypt CDN the in-page login used. */
  token(): Promise<string>;
  get<T>(path: string, query?: Query): Promise<T>;
  send<T>(method: 'POST' | 'PUT', path: string, opts?: { query?: Query; body?: unknown; timeoutMs?: number }): Promise<T>;
  /** Raw envelope, for callers that must read a business error (`code 1`) themselves. */
  raw<T>(method: 'GET' | 'POST' | 'PUT', path: string, opts?: { query?: Query; body?: unknown; timeoutMs?: number }): Promise<Envelope<T>>;
}

// In-memory token cache, per portal + crew. Never written to disk.
const tokens = new Map<string, string>();
export function clearPortalTokens(): void {
  tokens.clear();
}

export function createPortalClient(
  creds: PortalCredentials,
  deps: { site?: PortalSite | null; fetchImpl?: FetchLike; encrypt?: (publicKey: string, plain: string) => string } = {},
): PortalClient {
  const site = deps.site ?? portalSiteFor(creds.airline);
  if (!site) throw new PortalError('This airline has no crew portal.', -1, 0);
  const doFetch: FetchLike = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const encrypt = deps.encrypt ?? rsaEncrypt;
  const key = `${site.apiBase}|${creds.crewId}`;

  async function login(): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const pkRes = await doFetch(`${site!.apiBase}/system/getPublicKey`, { signal: ctrl.signal });
      const pk = (await pkRes.json()) as Envelope<string>;
      if (pk.code !== 0 || !pk.data) throw new PortalError(pk.message || 'Portal key unavailable.', pk.code, pkRes.status);
      const user: Record<string, string> = {
        passwords: encrypt(pk.data, creds.password),
        userCode: creds.crewId,
        captcha: '',
        uniqueCode: '',
      };
      if (site!.outCaptcha != null) user.outCaptcha = site!.outCaptcha;
      const res = await doFetch(`${site!.apiBase}/login`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer null' },
        body: JSON.stringify({ user }),
      });
      const env = (await res.json()) as Envelope<{ token?: string; failMessage?: string | null } | string | null>;
      const data = env.data;
      const token = typeof data === 'string' ? data : data?.token;
      if (env.code !== 0 || !token) {
        const fail = typeof data === 'object' && data ? data.failMessage : null;
        const reason = fail === 'ERROR_WRONG_PASSWORD' ? 'The crew portal did not accept your password.' : fail || env.message;
        throw new PortalError(reason || 'Portal sign-in failed.', env.code, res.status, fail ?? null);
      }
      tokens.set(key, token);
      return token;
    } catch (error) {
      if (ctrl.signal.aborted) throw new PortalError('Portal sign-in timed out.', -1, 0);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function call<T>(
    method: 'GET' | 'POST' | 'PUT', path: string,
    opts: { query?: Query; body?: unknown; timeoutMs?: number } = {}, retried = false,
  ): Promise<{ env: Envelope<T>; status: number }> {
    const token = tokens.get(key) ?? (await login());
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, userId: creds.crewId };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await doFetch(`${site!.apiBase}${path}${toQuery(opts.query)}`, {
        method, headers, signal: ctrl.signal,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } finally {
      clearTimeout(timer);
    }
    let env: Envelope<T>;
    try {
      env = (await res.json()) as Envelope<T>;
    } catch {
      throw new PortalError(`Portal error (HTTP ${res.status}).`, -1, res.status);
    }
    if (!retried && (res.status === 401 || (env.code !== 0 && isAuthFailure(res.status, env.message)))) {
      tokens.delete(key);
      return call<T>(method, path, opts, true);
    }
    return { env, status: res.status };
  }

  const unwrap = <T>({ env, status }: { env: Envelope<T>; status: number }): T => {
    if (env.code !== 0) throw new PortalError(env.message || 'The portal rejected the request.', env.code, status);
    return env.data;
  };

  return {
    token: async () => tokens.get(key) ?? login(),
    get: async <T>(path: string, query?: Query) => unwrap(await call<T>('GET', path, { query })),
    send: async <T>(method: 'POST' | 'PUT', path: string, opts?: { query?: Query; body?: unknown; timeoutMs?: number }) =>
      unwrap(await call<T>(method, path, opts)),
    raw: async <T>(method: 'GET' | 'POST' | 'PUT', path: string, opts?: { query?: Query; body?: unknown; timeoutMs?: number }) =>
      (await call<T>(method, path, opts)).env,
  };
}
