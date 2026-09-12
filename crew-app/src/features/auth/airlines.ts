// Airlines the crew can log in to (doc/App Flow Ver1). Every airline has its own
// crew portal; today only THAI (ROIS Cloud) is wired. The `portalKind` selects
// which capture/parse adapter to use, so new airlines are added by (1) adding an
// entry here and (2) implementing/【reusing】a portal adapter — no other changes.

// Which roster-capture adapter an airline's portal uses. Add new kinds as more
// airline portals are supported (e.g. 'aims', 'sabre', 'netline').
import {NativeModules} from 'react-native';

export type PortalKind = 'rois' | 'rois-api';

const EK_SIMULATOR_API_FALLBACK = 'http://127.0.0.1:8000/api';
const F8_SIMULATOR_API_FALLBACK = 'http://127.0.0.1:3000/api';
const F8_PRODUCTION_API_FALLBACK = 'https://cr.rois.one/api';

export function resolveEkRosterApiBaseUrl(
  configuredUrl: string | null | undefined,
  development: boolean,
): string | null {
  const raw = configuredUrl?.trim();
  if (!raw) {
    return development ? EK_SIMULATOR_API_FALLBACK : null;
  }
  // React Native's Hermes `URL` implements the constructor but NOT the
  // `.protocol` getter — reading it throws "URL.protocol is not implemented",
  // which crashed app start-up as soon as a non-empty endpoint was configured.
  // Parse the scheme from the string instead of constructing a URL to read it.
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase() ?? null;
  if (scheme !== 'https' && scheme !== 'http') {
    throw new Error('Invalid EK roster API URL');
  }
  if (!development && scheme !== 'https') {
    throw new Error('EK roster API must use HTTPS outside development');
  }
  return raw.replace(/\/+$/, '');
}

export function resolveF8RosterApiBaseUrl(
  configuredUrl: string | null | undefined,
  development: boolean,
): string {
  const raw = configuredUrl?.trim();
  if (!raw) {
    return development ? F8_SIMULATOR_API_FALLBACK : F8_PRODUCTION_API_FALLBACK;
  }
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase() ?? null;
  if (scheme !== 'https' && scheme !== 'http') {
    throw new Error('Invalid F8 roster API URL');
  }
  if (!development && scheme !== 'https') {
    throw new Error('F8 roster API must use HTTPS outside development');
  }
  return raw.replace(/\/+$/, '');
}

const configuredEkRosterApiUrl = NativeModules.SettingsManager?.settings
  ?.EKRosterApiBaseURL as string | undefined;
const ekRosterApiBaseUrl = resolveEkRosterApiBaseUrl(configuredEkRosterApiUrl, __DEV__);
const configuredF8RosterApiUrl = NativeModules.SettingsManager?.settings
  ?.F8RosterApiBaseURL as string | undefined;
const f8RosterApiBaseUrl = resolveF8RosterApiBaseUrl(configuredF8RosterApiUrl, __DEV__);

// Per-airline knobs for the shared ROIS capture/parse engine. The engine itself
// is one code path (portalInjectedJs.ts / portalCapture.ts / dutyDisplay.ts); the
// only things that differ per airline are captured here, so a new ROIS carrier is
// wired by adding an Airline entry — no engine edits. TG's values are the historic
// hardcoded defaults, so a missing config == TG behaviour (byte-identical).
export interface PortalConfig {
  /** Crew home base IATA. A rotation starts when the crew leaves base and ends on
   *  return, so this groups out-and-back legs into one trip. (TG=BKK, PR=MNL) */
  baseAirport: string;
  /** Fixed minutes to SUBTRACT from the roster's base wall-clock times
   *  (startDateTime/endDateTime) to get true UTC. These bases never observe DST,
   *  so a constant offset is correct. (TG=420 / UTC+7, PR=480 / UTC+8) */
  baseOffsetMin: number;
  /** Value auto-filled into the portal's `outCaptcha` (邮箱验证码 / email-code)
   *  login field. TG has no captcha (undefined). PR's TEST tenant accepts a FIXED
   *  code here; a PROD tenant would send a real one-time emailed code instead, so
   *  this hardcoded value is test-only and must become real OTP entry for prod. */
  loginOutCaptcha?: string;
}

export interface Airline {
  code: string;
  name: string;
  /** Crew-portal base URL, or null if no portal is available yet. */
  portalUrl: string | null;
  /** API base URL, when the airline uses an API-backed roster adapter. */
  apiBaseUrl?: string | null;
  /** Roster API base URL when the roster is NOT served by `apiBaseUrl`.
   *  Emirates is the only case today: its roster comes from the ROIS
   *  live-server mobile-roster contract (`rosterApiBaseUrl`) while its
   *  crew-app notifications / FDP discretion still use the EVACC gateway
   *  (`apiBaseUrl`). Defaults to `apiBaseUrl` when omitted. */
  rosterApiBaseUrl?: string | null;
  /** Flight-number prefix / carrier code used to build flight numbers (e.g. TG319). */
  carrier: string;
  /** Capture/parse adapter for this portal, or null when no portal yet. */
  portalKind: PortalKind | null;
  /** ROIS engine knobs (base tz/airport, login captcha). Null when no portal. */
  portalConfig?: PortalConfig | null;
}

// Airlines that already have a wired crew portal. THAI (ROIS Cloud) is the only
// live one today; the rest of the list (below) is the selectable catalogue —
// crews pick their carrier even before its portal adapter ships.
const WIRED: Airline[] = [
  {
    code: 'TG',
    name: 'THAI',
    portalUrl: 'https://crew-sea-test.roiscloud.com/tg/portal/',
    carrier: 'TG',
    portalKind: 'rois',
    portalConfig: { baseAirport: 'BKK', baseOffsetMin: 420 },
  },
  {
    // Philippine Airlines — same ROIS multi-tenant infra as TG, different tenant
    // (`pefg`), Manila base (UTC+8), and a fixed login email-code on the TEST
    // tenant. Login/roster reverse-engineered live 2026-08-12 (crew 433535); the
    // roster API schema is identical to TG so the shared parser is reused.
    code: 'PR',
    name: 'Philippine Airlines',
    portalUrl: 'https://crew-pal-sea-tst.roiscloud.com/pefg/portal/login',
    carrier: 'PR',
    portalKind: 'rois',
    portalConfig: { baseAirport: 'MNL', baseOffsetMin: 480, loginOutCaptcha: '202604' },
  },
  {
    // Emirates is a ROIS mobile-roster carrier (like F8/ET): the crew's REAL
    // roster (e.g. K1003, Khalid Al Nuaimi, CA/A380/DXB) is served by
    // live-server POST /api/mobile-roster/session. The old EVACC crew-app
    // gateway (ai.rois.one -> /api/crew-app/v1/roster) only ever held the
    // synthetic C9000xx demo crews, so a genuine EK crew could never sign in
    // "as EK" (Ryan, 2026-09-12 — set EK's default login to K1003 and prove
    // the schedule). The crew-app notifications / discretion still use that
    // gateway, so only the ROSTER moved.
    code: 'EK',
    name: 'Emirates',
    portalUrl: null,
    apiBaseUrl: ekRosterApiBaseUrl,
    rosterApiBaseUrl: f8RosterApiBaseUrl,
    carrier: 'EK',
    portalKind: 'rois-api',
  },
  {
    code: 'F8',
    name: 'Flair Airlines',
    portalUrl: null,
    apiBaseUrl: f8RosterApiBaseUrl,
    carrier: 'F8',
    portalKind: 'rois-api',
  },
  {
    // Ethiopian Airlines — served by the same ROIS live-server mobile-roster
    // endpoint as F8 (crew recovery solution); carrier code differs only.
    code: 'ET',
    name: 'Ethiopian Airlines',
    portalUrl: null,
    apiBaseUrl: f8RosterApiBaseUrl,
    carrier: 'ET',
    portalKind: 'rois-api',
  },
  { code: 'RA', name: 'Royce Air', portalUrl: null, carrier: 'RA', portalKind: null },
  { code: 'FA', name: 'Flair Air', portalUrl: null, carrier: 'FA', portalKind: null },
];

// Catalogue of selectable carriers (no portal adapter yet — portalUrl null). The
// login dropdown is searchable, so this scales to hundreds without UI changes.
// [IATA, display name] pairs.
const CATALOGUE: ReadonlyArray<readonly [string, string]> = [
  ['AA', 'American Airlines'], ['AC', 'Air Canada'], ['AF', 'Air France'],
  ['AI', 'Air India'], ['AM', 'Aeroméxico'], ['AR', 'Aerolíneas Argentinas'],
  ['AS', 'Alaska Airlines'], ['AT', 'Royal Air Maroc'], ['AV', 'Avianca'],
  ['AY', 'Finnair'], ['AZ', 'ITA Airways'], ['BA', 'British Airways'],
  ['BR', 'EVA Air'], ['CA', 'Air China'], ['CI', 'China Airlines'],
  ['CM', 'Copa Airlines'], ['CX', 'Cathay Pacific'], ['CZ', 'China Southern'],
  ['DL', 'Delta Air Lines'], ['EK', 'Emirates'], ['EN', 'Air Dolomiti'],
  ['ET', 'Ethiopian Airlines'], ['EY', 'Etihad Airways'], ['FJ', 'Fiji Airways'],
  ['FR', 'Ryanair'], ['GA', 'Garuda Indonesia'], ['GF', 'Gulf Air'],
  ['HA', 'Hawaiian Airlines'], ['HU', 'Hainan Airlines'], ['HX', 'Hong Kong Airlines'],
  ['IB', 'Iberia'], ['JL', 'Japan Airlines'], ['JQ', 'Jetstar'],
  ['KE', 'Korean Air'], ['KL', 'KLM'], ['KQ', 'Kenya Airways'],
  ['LA', 'LATAM Airlines'], ['LH', 'Lufthansa'], ['LO', 'LOT Polish Airlines'],
  ['LX', 'SWISS'], ['LY', 'El Al'], ['MH', 'Malaysia Airlines'],
  ['MS', 'EgyptAir'], ['MU', 'China Eastern'], ['NH', 'ANA'],
  ['NZ', 'Air New Zealand'], ['OS', 'Austrian Airlines'], ['OZ', 'Asiana Airlines'],
  ['QF', 'Qantas'], ['QR', 'Qatar Airways'],
  ['SA', 'South African Airways'], ['SK', 'SAS'], ['SQ', 'Singapore Airlines'],
  ['SU', 'Aeroflot'], ['SV', 'Saudia'], ['TK', 'Turkish Airlines'],
  ['TP', 'TAP Air Portugal'], ['UA', 'United Airlines'], ['UL', 'SriLankan Airlines'],
  ['UX', 'Air Europa'], ['VA', 'Virgin Australia'], ['VN', 'Vietnam Airlines'],
  ['VS', 'Virgin Atlantic'], ['WN', 'Southwest Airlines'], ['WS', 'WestJet'],
  ['3U', 'Sichuan Airlines'], ['5J', 'Cebu Pacific'], ['6E', 'IndiGo'],
  ['9W', 'Jet Airways'], ['B6', 'JetBlue'], ['D7', 'AirAsia X'],
  ['DE', 'Condor'], ['EW', 'Eurowings'], ['FZ', 'flydubai'],
  ['G3', 'Gol'], ['JT', 'Lion Air'], ['MF', 'XiamenAir'],
  ['OK', 'Czech Airlines'], ['PK', 'Pakistan Intl'], ['RJ', 'Royal Jordanian'],
  ['SC', 'Shandong Airlines'], ['TR', 'Scoot'], ['U2', 'easyJet'],
  ['VJ', 'VietJet Air'], ['W6', 'Wizz Air'], ['WY', 'Oman Air'],
  ['ZH', 'Shenzhen Airlines'], ['BI', 'Royal Brunei'], ['PG', 'Bangkok Airways'],
  ['FD', 'Thai AirAsia'], ['WE', 'Thai Smile'], ['DD', 'Nok Air'],
  ['SL', 'Thai Lion Air'], ['OD', 'Malindo Air'], ['AK', 'AirAsia'],
  ['TG2', 'THAI Cargo'], ['QV', 'Lao Airlines'], ['K6', 'Cambodia Angkor Air'],
  ['8M', 'Myanmar Airways'], ['UB', 'Myanmar National'], ['BG', 'Biman Bangladesh'],
];

export const AIRLINES: Airline[] = [
  ...WIRED,
  ...CATALOGUE.filter(([code]) => !WIRED.some(w => w.code === code)).map(
    ([code, name]): Airline => ({ code, name, portalUrl: null, carrier: code, portalKind: null }),
  ),
];

// This build ships for Ethiopian Airlines: opening the app lands on the ET login
// (no TG→ET switch every launch). TG/PR remain selectable in the picker.
export const DEFAULT_AIRLINE = 'ET';

// Test credentials for the airline picker's prefill (dev/QA convenience only —
// the login form itself now starts empty, see LoginScreen).
export const TEST_CREW_ID = '35459';
export const TEST_CREW_PW = 'Pier2026';

// Per-airline test-crew prefill (sim/QA). Lets the login screen swap the
// auto-filled crew id/pw when the operator switches airline — but ONLY while the
// fields still hold an untouched known test value, so real typed input is never
// clobbered. TG 44117 & PR 433535 are the two switch-test crews.
export const TEST_CREDENTIALS: Record<string, { crewId: string; password: string }> = {
  TG: { crewId: TEST_CREW_ID, password: TEST_CREW_PW },
  PR: { crewId: '433535', password: 'Pier2020' },
  // K1003 (Khalid Al Nuaimi, CA, A380, DXB) is EK's default login: a real
  // Emirates crew from the ROIS live DB, not an EVACC C9000xx demo account.
  EK: { crewId: 'K1003', password: 'Pier2026' },
  F8: { crewId: '113', password: '' },
  ET: { crewId: 'J4002', password: 'Pier2026' },
};

export function airlineByCode(code: string): Airline {
  return AIRLINES.find(a => a.code === code) ?? AIRLINES[0];
}

export function prefillForAirline(code: string, crewId: string, password: string) {
  const next = TEST_CREDENTIALS[code];
  // "Untouched" = the fields are empty (the login form no longer opens with a
  // remembered/last login) or still hold another carrier's test values. Real
  // typed input is never clobbered.
  const untouched = (crewId === '' && password === '')
    || Object.values(TEST_CREDENTIALS).some(
      credential => credential.crewId === crewId && credential.password === password,
    );
  return next && untouched ? next : { crewId, password };
}

// Carriers whose crew IDs are alphanumeric (EK K1003, ET J4002); every other
// wired carrier uses purely numeric staff numbers and gets the number pad.
const ALPHANUMERIC_CREW_ID_AIRLINES = new Set(['EK', 'ET']);
export function crewIdKeyboardType(code: string): 'default' | 'number-pad' {
  return ALPHANUMERIC_CREW_ID_AIRLINES.has(code) ? 'default' : 'number-pad';
}

export function loginRouteForAirline(code: string): 'Capture' | 'EkRoster' | null {
  const airline = airlineByCode(code);
  if (airline.portalKind === 'rois') return 'Capture';
  if (airline.portalKind === 'rois-api') return 'EkRoster';
  return null;
}
