// R'Bot chat client.
//
// Mirrors the existing crew-app API clients (absenceApi / notificationsApi):
// plain global `fetch`, a JSON body, and a light parse of the response so a
// server-side shape change surfaces as a readable error instead of a crash
// deep inside the chat screen.
//
// Backend contract (ai-server, POST /ai/crew/chat):
//   { messages: [{role,content}], context: {airline,crewId,today,...} }
//   -> { role: 'assistant', content: string, actions: RbotAction[] }
// The route never 500s on an LLM failure — it answers with content and no
// actions — so an HTTP error here means the service itself is unreachable.
import {NativeModules} from 'react-native';
import type {
  RbotAction,
  RbotAlarmAction,
  RbotChatMessage,
  RbotChatResponse,
  RbotContext,
  RbotNavTarget,
} from './types';

const RBOT_API_SIMULATOR_FALLBACK = 'http://127.0.0.1:3005';
/** ai-server's port, for deriving the dev host from the Metro bundle URL. */
const RBOT_API_PORT = 3005;

/**
 * The public origin ai-server is published on: the same host the crew app
 * already uses for its crew API (`cr.rois.one/api`), so a phone that is NOT on
 * the same Wi-Fi as the dev machine can still reach R'Bot. The route is scoped
 * to `/ai/crew/*` and `/ai/health` on the tunnel — not the whole ai-server.
 * No `/ai` suffix here: `rbotChatUrl` appends the full `/ai/crew/chat` path,
 * so adding it here doubled it to `/ai/ai/crew/chat` and 404'd on device.
 */
export const RBOT_PUBLIC_API_BASE = 'https://cr.rois.one';

/**
 * The host the JS bundle was loaded from — i.e. the Mac running Metro. On a
 * real iPhone that is the Mac's LAN address (`http://192.168.1.24:8081/…`),
 * while on the simulator it is localhost. R'Bot must call ai-server on the SAME
 * machine: a hard-coded 127.0.0.1 makes the phone call itself, which is exactly
 * how a device build ends up saying "Network request failed" (Ryan, 2026-09-11).
 */
export function devApiBaseFromScriptUrl(scriptUrl: string | undefined): string | null {
  const match = scriptUrl?.match(/^https?:\/\/(\[[^\]]+\]|[^/:]+)(?::\d+)?\//i);
  const host = match?.[1];
  return host ? `http://${host}:${RBOT_API_PORT}` : null;
}

/**
 * Resolves the ai-server base URL. Same rules as the roster API resolvers in
 * `features/auth/airlines.ts`: an explicit native setting wins, otherwise a
 * development-only localhost fallback, and plain HTTP is refused outside
 * development so a crew's chat can never leave the phone unencrypted.
 */
export function resolveRbotApiBaseUrl(
  configuredUrl: string | null | undefined,
  development: boolean,
  devScriptUrl?: string,
): string | null {
  const raw = configuredUrl?.trim();
  if (!raw) {
    if (!development) return null;
    // Dev: prefer the machine serving the bundle (works on device AND sim).
    return devApiBaseFromScriptUrl(devScriptUrl) ?? RBOT_API_SIMULATOR_FALLBACK;
  }
  // Hermes' URL does not implement `.protocol`; read the scheme off the string.
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase() ?? null;
  if (scheme !== 'https' && scheme !== 'http') {
    throw new Error('Invalid R\'Bot API URL');
  }
  if (!development && scheme !== 'https') {
    throw new Error('R\'Bot API must use HTTPS outside development');
  }
  return raw.replace(/\/+$/, '');
}

const configuredRbotApiUrl = NativeModules.SettingsManager?.settings
  ?.RBotChatApiBaseURL as string | undefined;
export const devScriptUrl = NativeModules.SourceCode?.scriptURL as string | undefined;

export function rbotChatUrl(baseUrl: string | null): string | null {
  return baseUrl ? `${baseUrl}/ai/crew/chat` : null;
}

/**
 * Every base R'Bot may call, in order. Local first (fast: same machine as the
 * dev bundle), then the public origin — which is what makes an off-LAN phone
 * work without anyone setting a build flag.
 */
export function rbotApiBaseCandidates(
  configuredUrl: string | null | undefined,
  development: boolean,
  devScriptUrl?: string,
): string[] {
  const explicit = resolveRbotApiBaseUrl(configuredUrl, development, devScriptUrl);
  const configured = configuredUrl?.trim();
  // An explicitly configured base is the only one to use: someone who set it
  // knows their environment, and silently falling back would hide a typo.
  if (configured) return explicit ? [explicit] : [];
  const local = explicit ?? (development ? RBOT_API_SIMULATOR_FALLBACK : null);
  return local ? [local, RBOT_PUBLIC_API_BASE] : [RBOT_PUBLIC_API_BASE];
}

const NAV_TARGETS: readonly RbotNavTarget[] = [
  'home', 'schedule', 'roster_calendar', 'route_map', 'timeline', 'next_trip',
  'trip_details', 'explore', 'alerts', 'upcoming_alarms', 'alarm_settings',
  'absence', 'time_zone', 'preferences', 'appearance', 'personal_info', 'help',
  'global', 'profile',
];

const ALARM_KINDS = ['enable', 'disable', 'set_offsets', 'set_agenda_filter'];
const AGENDA_FILTERS = ['all', 'work', 'personal'];
const SETTING_KEYS = ['time_zone_mode', 'theme', 'avatar', 'explore_interests'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Number-ish guard: the model sometimes returns "4" for an hour offset. */
function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/**
 * Accepts one server action, or nothing. Anything unrecognised — an unknown
 * `type`, a nav target we do not have a route for, a malformed date — is
 * dropped rather than dispatched, so a hallucinated action is a no-op instead
 * of a wrong screen or a bad request to Crew Control.
 */
export function parseRbotAction(raw: unknown): RbotAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const label = asString(a.label);

  switch (a.type) {
    case 'navigate': {
      const target = a.target as RbotNavTarget;
      if (!NAV_TARGETS.includes(target)) return null;
      const month = asString(a.month);
      const tripId = asString(a.tripId);
      return {
        type: 'navigate',
        target,
        ...(month && MONTH_RE.test(month) ? {month} : {}),
        ...(tripId ? {tripId} : {}),
        ...(label ? {label} : {}),
      };
    }
    case 'request_absence': {
      const fromDate = asString(a.fromDate);
      const toDate = asString(a.toDate);
      if (!fromDate || !toDate) return null;
      if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) return null;
      // An inverted range would be rejected by the server anyway; drop it here
      // so the crew sees the assistant's words, not a broken form.
      if (fromDate > toDate) return null;
      const note = asString(a.note);
      return {
        type: 'request_absence',
        fromDate,
        toDate,
        ...(note ? {note} : {}),
        ...(label ? {label} : {}),
      };
    }
    case 'set_alarm': {
      const kind = asString(a.action);
      if (!kind || !ALARM_KINDS.includes(kind)) return null;
      const wakeUpHours = asNumber(a.wakeUpHours);
      const leaveHomeHours = asNumber(a.leaveHomeHours);
      const filter = asString(a.filter);
      return {
        type: 'set_alarm',
        action: kind as RbotAlarmAction['action'],
        ...(wakeUpHours !== undefined ? {wakeUpHours} : {}),
        ...(leaveHomeHours !== undefined ? {leaveHomeHours} : {}),
        ...(filter && AGENDA_FILTERS.includes(filter)
          ? {filter: filter as 'all' | 'work' | 'personal'}
          : {}),
        ...(label ? {label} : {}),
      };
    }
    case 'change_setting': {
      const setting = asString(a.setting);
      if (!setting || !SETTING_KEYS.includes(setting)) return null;
      const value = a.value;
      const valid =
        typeof value === 'number' ||
        typeof value === 'string' ||
        (Array.isArray(value) && value.every(v => typeof v === 'string'));
      if (!valid) return null;
      return {
        type: 'change_setting',
        setting: setting as 'time_zone_mode' | 'theme' | 'avatar' | 'explore_interests',
        value: value as string | number | string[],
        ...(label ? {label} : {}),
      };
    }
    default:
      return null;
  }
}

/** Parses the chat envelope; actions that fail their guard are dropped. */
export function parseChatResponse(payload: unknown): RbotChatResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid R\'Bot response');
  }
  const p = payload as Record<string, unknown>;
  const content = asString(p.content) ?? '';
  const actions = Array.isArray(p.actions)
    ? (p.actions.map(parseRbotAction).filter(Boolean) as RbotAction[])
    : [];
  if (!content && actions.length === 0) {
    throw new Error('Invalid R\'Bot response');
  }
  return {role: 'assistant', content, actions};
}

export const RBOT_HISTORY_LIMIT = 12;

export async function sendCrewChat(
  messages: RbotChatMessage[],
  context: RbotContext,
  signal?: AbortSignal,
): Promise<RbotChatResponse> {
  const urls = rbotApiBaseCandidates(configuredRbotApiUrl, __DEV__, devScriptUrl)
    .map(rbotChatUrl)
    .filter((u): u is string => !!u);
  if (urls.length === 0) {
    throw new Error('R\'Bot is not configured for this build');
  }
  // Only the recent turns travel — the same bound the server applies, applied
  // here too so a long thread never grows the request payload.
  const trimmed = messages.slice(-RBOT_HISTORY_LIMIT).map(m => ({
    role: m.role,
    content: m.content.slice(0, 4000),
  }));

  let response: Response | null = null;
  const tried: string[] = [];
  for (const url of urls) {
    tried.push(url);
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({messages: trimmed, context}),
        signal,
      });
      break;
    } catch {
      // This origin is not reachable from where the phone is (a device off the
      // LAN cannot see the dev machine) — try the next one.
    }
  }
  if (!response) {
    // React Native's own message ("Network request failed") does not say where
    // it tried — name every URL so a device-build problem is diagnosable.
    throw new Error(`R'Bot could not reach the AI service (tried ${tried.join(', ')})`);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Fall through to the status-based message.
  }
  if (!response.ok) {
    throw new Error(`R'Bot is unavailable (${response.status})`);
  }
  return parseChatResponse(payload);
}
