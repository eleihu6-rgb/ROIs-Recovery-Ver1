// ─── Crew-portal roster capture & parsing (doc/Add Trip Ver2) ────────────────
// The crew portal (ROIS Cloud) is a Vue SPA: the roster is fetched as JSON from a
// backend API after login and rendered client-side. The WebView captures those
// API responses (and, as a fallback, the rendered DOM rows) and posts them here.
//
// This module turns those raw captures into the same Trip[] shape the CSV path
// produces, so downstream (display, alarms) is identical. The portal's exact JSON
// schema is unknown up front, so parsing is intentionally heuristic + tolerant:
// we hunt for arrays of flight-like records anywhere in the captured payloads and
// map their fields by fuzzy key matching.

import type { Trip, TripLeg, RawRow } from './tripCsv';
import { groupIntoTrips } from './tripCsv';

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

const FLIGHT_RE = /^[A-Z]{1,3}\s?\d{2,4}[A-Z]?$/;
const IATA_RE = /^[A-Z]{3}$/;

// A raw captured payload from the WebView bridge.
//   'roster' = came from the /api/roster endpoint (definitive)
//   'net'    = other intercepted fetch/XHR JSON matched by content heuristic
//   'global' = SPA global state store snapshot
//   'dom'    = rendered DOM text fallback
export interface PortalCapture {
  source: 'roster' | 'net' | 'global' | 'dom';
  url?: string;
  body: unknown;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Normalise a flight number like "tg 0202" / "TG202" → "TG202". */
function normFlight(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

/**
 * Coerce many date/time representations into the roster format the rest of the
 * app expects: "DD MMM YYYY HHMM" (e.g. "03 Jun 2026 0900"). Returns '' if it
 * can't be parsed.
 */
export function toRosterDateString(value: unknown): string {
  if (value == null) {
    return '';
  }
  // Epoch millis or seconds.
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    let ms = Number(value);
    if (ms < 1e12) {
      ms *= 1000; // seconds → ms
    }
    return formatUTC(new Date(ms));
  }
  const s = String(value).trim();
  if (!s) {
    return '';
  }
  // Already in "DD MMM YYYY HHMM".
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{4}$/.test(s)) {
    return s;
  }
  // ISO 8601: 2026-06-03T09:00:00Z / 2026-06-03 09:00.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    return `${d} ${capMonth(Number(mo))} ${y} ${h}${mi}`;
  }
  // Date only: 2026-06-03.
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return `${d} ${capMonth(Number(mo))} ${y} 0000`;
  }
  // Fallback: let Date try.
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return formatUTC(parsed);
  }
  return '';
}

function capMonth(m1to12: number): string {
  const idx = m1to12 - 1;
  const name = MONTHS[idx] ?? 'jan';
  return name[0].toUpperCase() + name.slice(1);
}

function formatUTC(d: Date): string {
  return `${pad(d.getUTCDate())} ${capMonth(d.getUTCMonth() + 1)} ${d.getUTCFullYear()} ${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}`;
}

// The ROIS calendar's `startDateTime`/`endDateTime` are NOT UTC — they are the
// crew's BASE-timezone wall clock (a fixed offset with no DST ever). For TG that
// base is Asia/Bangkok (UTC+7); for PR it's Asia/Manila (UTC+8). The offset is a
// per-airline config value (Airline.portalConfig.baseOffsetMin) — these defaults
// keep TG's original behaviour when no config is threaded through.
// `localStartDateTime`/`localEndDateTime` are the airport's own local wall clock.
// (Verified live 2026-06-01: TG648 BKK→FUK has endDateTime 06:00 vs localEnd
// 08:00 — FUK is UTC+9, 08:00 FUK = 06:00 Bangkok, so endDateTime is base time.
// Re-verified for PR 2026-08-12: PR434 CEB→NRT endDateTime 13:01 vs localEnd
// 14:01 — NRT is UTC+9, 14:01 NRT = 13:01 Manila, so PR is Manila base time.)
// Treating base time as UTC was an off-by-Nh bug that broke the UTC + Base display
// modes and the alarm firing instant. Convert a base-time "YYYY-MM-DD HH:mm" into
// the real UTC roster string by subtracting the fixed base offset.
const BASE_OFFSET_MIN = 420; // Default = Asia/Bangkok (TG), UTC+7, no DST, ever.

// Crew home base. A flight "trip" is one rotation: it begins when the crew
// leaves base and ends when they return to base. Used to group out-and-back
// legs (e.g. BKK→SIN then SIN→BKK) into a single trip even when each leg has
// its own briefStart, so the card lists the outbound first then the inbound.
const BASE_AIRPORT = 'BKK'; // Default = TG; PR overrides to 'MNL' via config.

export function roisBaseToUTC(value: unknown, offsetMin: number = BASE_OFFSET_MIN): string {
  if (value == null) {
    return '';
  }
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) {
    return toRosterDateString(value); // unknown shape — best effort
  }
  const [, y, mo, d, h, mi] = m;
  const utcMs =
    Date.UTC(+y, +mo - 1, +d, +h, +mi) - offsetMin * 60_000;
  return formatUTC(new Date(utcMs));
}

// Fuzzy field lookup: first key whose lowercased name includes any of `needles`.
function pick(obj: Record<string, any>, needles: string[]): any {
  const keys = Object.keys(obj);
  for (const needle of needles) {
    const k = keys.find(key => key.toLowerCase().replace(/[_\s-]/g, '').includes(needle));
    if (k != null && obj[k] != null && obj[k] !== '') {
      return obj[k];
    }
  }
  return undefined;
}

/** Does this object look like a single flight/duty leg? */
function looksLikeFlight(o: any): boolean {
  if (!o || typeof o !== 'object') {
    return false;
  }
  const flt = pick(o, ['fltnumber', 'flightnumber', 'flightno', 'fltno', 'flightnum', 'flt', 'flight']);
  const dep = pick(o, ['deparp', 'depairport', 'departure', 'fromairport', 'depstn', 'origin', 'dep', 'from']);
  const arv = pick(o, ['arvarp', 'arrairport', 'arrival', 'toairport', 'arrstn', 'destination', 'arv', 'arr', 'to']);
  const fltOk = typeof flt === 'string' && FLIGHT_RE.test(normFlight(flt));
  const depOk = typeof dep === 'string' && IATA_RE.test(dep.trim().toUpperCase());
  const arvOk = typeof arv === 'string' && IATA_RE.test(arv.trim().toUpperCase());
  return fltOk && (depOk || arvOk);
}

/** Map a flight-like object → TripLeg (+ checkin for grouping). */
function toLeg(o: Record<string, any>, crewId: string): (TripLeg & { checkInDateUTC: string }) | null {
  const flt = pick(o, ['fltnumber', 'flightnumber', 'flightno', 'fltno', 'flightnum', 'flt', 'flight']);
  if (typeof flt !== 'string' || !FLIGHT_RE.test(normFlight(flt))) {
    return null;
  }
  const dep = pick(o, ['deparp', 'depairport', 'departure', 'fromairport', 'depstn', 'origin', 'dep', 'from']);
  const arv = pick(o, ['arvarp', 'arrairport', 'arrival', 'toairport', 'arrstn', 'destination', 'arv', 'arr', 'to']);
  const depTime = pick(o, ['flightdateutc', 'stdutc', 'depdateutc', 'deptimeutc', 'departureutc', 'std', 'deptime', 'depdate', 'flightdate']);
  const arvTime = pick(o, ['arvdateutc', 'stautc', 'arrdateutc', 'arrtimeutc', 'arrivalutc', 'sta', 'arrtime', 'arrdate']);
  const fleet = pick(o, ['fleet', 'actype', 'aircrafttype', 'aircraft', 'equip', 'acreg']);
  const hotel = pick(o, ['hotel', 'accommodation', 'layoverhotel']);
  const checkIn = pick(o, ['checkindateutc', 'checkinutc', 'checkin', 'reportutc', 'reporttime', 'signon']);

  return {
    crewId: String(pick(o, ['crewid', 'staffid', 'empno', 'employeeid']) ?? crewId ?? ''),
    fltNumber: normFlight(flt),
    flightDateUTC: toRosterDateString(depTime),
    depArp: dep ? String(dep).trim().toUpperCase() : '',
    arvDateUTC: toRosterDateString(arvTime),
    arvArp: arv ? String(arv).trim().toUpperCase() : '',
    fleet: fleet ? String(fleet) : '',
    hotel: hotel ? String(hotel) : '',
    checkInDateUTC: toRosterDateString(checkIn),
  };
}

/** Recursively collect every flight-like object found anywhere in a payload. */
function collectFlights(node: unknown, out: any[], depth = 0): void {
  if (depth > 8 || node == null) {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectFlights(item, out, depth + 1);
    }
    return;
  }
  if (typeof node === 'object') {
    if (looksLikeFlight(node)) {
      out.push(node);
      return; // don't descend into a matched leg
    }
    for (const v of Object.values(node as Record<string, any>)) {
      collectFlights(v, out, depth + 1);
    }
  }
}

// ─── ROIS Cloud crew portal (THAI) — deterministic parser ────────────────────
// The roster duties come from /rosterFlight/selectPortalCalendar as:
//   { data: [ { assignment:"FLY", fltNum:"319", type:"F",
//               localStartDateTime:"2026-05-02 10:11",  // airport-local
//               localEndDateTime:"2026-05-02 12:40",
//               startDateTime:"2026-05-02 10:11",        // UTC
//               endDateTime:"2026-05-02 13:55",
//               briefStart:"2026-05-02 08:30",           // check-in (local)
//               crewId:"35459", ... }, ... ] }
// We keep only FLY duties (actual flights), prefix the carrier, carry the
// airport-local times for display + alarms, and group flights that share a
// check-in (briefStart) into one trip.

interface RoisDuty {
  assignment?: string;
  type?: string;
  fltNum?: string | number;
  crewId?: string;
  localStartDateTime?: string;
  localEndDateTime?: string;
  startDateTime?: string;
  endDateTime?: string;
  briefStart?: string;
  [k: string]: any;
}

// Training/course detail for a ground duty (TRG/SIM). Sourced from the richer
// `selectPortalCalendarDetailAll` endpoint (portalCalendarDetailRosterGroundInfoVoList[]),
// which the plain calendar lacks. Verified live for crew 36826 (e.g. 21 May =
// course BTCFARE "CA FIRST AID RECURRENT", role TE, device DMK/PB01). The crew
// participant list (portalCalendarDetailTrainingInfoVos) is intentionally NOT
// modelled — only this crew's own training info is shown.
export interface TrainingDetail {
  role?: string;        // this crew's training role for the course, e.g. "TE" / "IP"
  location?: string;    // e.g. "BKK"
  courseType?: string;  // e.g. "Ground"
  courseName?: string;  // course code, e.g. "BTCFARE"
  courseDesc?: string;  // human description, e.g. "CA FIRST AID RECURRENT"
  device?: string;      // e.g. "DMK/PB01"
  programName?: string; // internal program code
}

// A normalised duty of ANY assignment (FLY, MEETING, BLOCK, OFF, SBY, SIM, …).
// We keep every duty (plus its raw object) so future features — duty calendar,
// days-off, standby, statistics — can use the full roster, not just flights.
export interface PortalDuty {
  id: string;
  assignment: string;
  fltNum: string;
  dutyType: string;
  localStart: string;
  localEnd: string;
  startUTC: string;
  endUTC: string;
  briefStart: string;
  crewId: string;
  /** Carrier code of the capturing airline (e.g. 'TG', 'PR'). Used by the ground-
   *  duty display to prefix/strip flight numbers. Optional so pre-existing/inline
   *  duties default to TG. */
  carrier?: string;
  /** Fixed base→UTC offset (minutes) of the capturing airline (TG=420, PR=480).
   *  Baked in at capture so display-time conversion is correct without needing to
   *  know the active airline. Optional so pre-existing duties default to TG's 420. */
  baseOffsetMin?: number;
  /** Training/course detail (TRG/SIM), when captured from detailAll. */
  training?: TrainingDetail;
  /** The original portal object, untouched, for fields we don't model yet. */
  raw: any;
}

function toPortalDuty(d: RoisDuty, carrier: string, baseOffsetMin: number): PortalDuty {
  return {
    id: String(d.id ?? `${d.startDateTime}-${d.fltNum ?? d.assignment ?? ''}`),
    assignment: String(d.assignment ?? '').toUpperCase(),
    fltNum: d.fltNum != null ? String(d.fltNum) : '',
    dutyType: String(d.type ?? ''),
    localStart: d.localStartDateTime ?? '',
    localEnd: d.localEndDateTime ?? '',
    startUTC: d.startDateTime ?? '',
    endUTC: d.endDateTime ?? '',
    briefStart: d.briefStart ?? '',
    crewId: String(d.crewId ?? ''),
    carrier,
    baseOffsetMin,
    raw: d,
  };
}

function nonEmpty(v: any): string | undefined {
  if (v == null) {
    return undefined;
  }
  const s = String(v).trim();
  return s ? s : undefined;
}

/** Key a training-detail row / duty by assignment + its raw start time string. */
function trainingKey(assignment: string, startDateTime: string): string {
  return `${(assignment || '').toUpperCase()}|${(startDateTime || '').trim()}`;
}

// Build a hotel index from `hotelBookingVo` objects in the `selectPortalCalendarDetailAll`
// payload. Keyed by "arrivalFlight|depDate" (e.g. "TG670|2026-06-01") so we can
// attach the hotel to the inbound leg. The hotel name carries through to TripLeg.hotel
// and the booking details are stored for the layover card.
export interface HotelBooking {
  hotelName: string;
  location?: string;
  airport?: string;
  dateIn?: string;   // "YYYY-MM-DD"
  dateOut?: string;  // "YYYY-MM-DD"
  nights?: number;
  arrivalFlight?: string;
  departureFlight?: string;
  arrivalTimeLoc?: string;   // "HH:mm"
  signOnLoc?: string;        // "HH:mm" sign-in for departure flight (local)
}

function buildHotelIndex(captures: PortalCapture[]): Record<string, HotelBooking> {
  const idx: Record<string, HotelBooking> = {};
  const visit = (node: unknown, depth: number) => {
    if (depth > 10 || node == null) return;
    if (Array.isArray(node)) { node.forEach(n => visit(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    const o = node as Record<string, any>;
    // The hotel is in `hotelBookingVo` with `showHotel: true`.
    const hv = o.hotelBookingVo;
    if (o.showHotel === true && hv && typeof hv === 'object' && hv.hotelName) {
      const name = String(hv.hotelName).trim();
      if (!name) { for (const v of Object.values(o)) visit(v, depth + 1); return; }
      // Key by arrival flight + depDate for precise matching.
      const arrFlt = String(hv.arrivalFlight || '').trim().replace(/^TG/i, '');
      const depDate = String(hv.dateInLoc || '').slice(0, 10); // "YYYY-MM-DD"
      const key = `${arrFlt}|${depDate}`;
      if (!idx[key]) {
        idx[key] = {
          hotelName: name,
          location: nonEmpty(hv.location),
          airport: nonEmpty(hv.airport),
          dateIn: nonEmpty(hv.dateInLoc?.slice(0, 10)),
          dateOut: nonEmpty(hv.dateOutLoc?.slice(0, 10)),
          nights: typeof hv.nights === 'number' ? hv.nights : undefined,
          arrivalFlight: nonEmpty(hv.arrivalFlight),
          departureFlight: nonEmpty(hv.departureFlight),
          arrivalTimeLoc: nonEmpty(hv.arrivalTimeLocFormat || hv.arrivalTimeLoc?.slice(11, 16)),
          signOnLoc: nonEmpty(hv.signOnLocFormat || hv.signOnLoc?.slice(11, 16)),
        };
      }
      return;
    }
    for (const v of Object.values(o)) visit(v, depth + 1);
  };
  captures.forEach(c => visit(c.body, 0));
  return idx;
}

// Build an index of training/course detail from the `selectPortalCalendarDetailAll`
// payload. Its ground rows (portalCalendarDetailRosterGroundInfoVoList[]) carry
// course fields the plain calendar omits. We find any object that has an
// assignment + startDateTime + at least one course field, keyed so we can attach
// it back to the matching calendar duty (same assignment + start instant).
function buildTrainingIndex(captures: PortalCapture[]): Record<string, TrainingDetail> {
  const idx: Record<string, TrainingDetail> = {};
  const COURSE_FIELDS = ['courseName', 'courseDesc', 'courseType', 'role', 'device', 'programName'];
  const visit = (node: unknown, depth: number) => {
    if (depth > 9 || node == null) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(n => visit(n, depth + 1));
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    const o = node as Record<string, any>;
    const hasCourse = COURSE_FIELDS.some(k => nonEmpty(o[k]) !== undefined);
    if (hasCourse && o.assignment && o.startDateTime) {
      const key = trainingKey(String(o.assignment), String(o.startDateTime));
      if (!idx[key]) {
        idx[key] = {
          role: nonEmpty(o.role),
          location: nonEmpty(o.location),
          courseType: nonEmpty(o.courseType),
          courseName: nonEmpty(o.courseName),
          courseDesc: nonEmpty(o.courseDesc),
          device: nonEmpty(o.device),
          programName: nonEmpty(o.programName),
        };
      }
    }
    for (const v of Object.values(o)) {
      visit(v, depth + 1);
    }
  };
  captures.forEach(c => visit(c.body, 0));
  return idx;
}

/** Every duty (all assignments) found in the captured payloads, de-duped by id.
 *  `roisDuties` may be passed in when the caller has already collected them (it
 *  is an expensive full-tree walk), otherwise it is collected on demand. */
export function extractPortalDuties(
  captures: PortalCapture[],
  roisDuties: RoisDuty[] = collectRoisDuties(captures),
  carrier = 'TG',
  baseOffsetMin: number = BASE_OFFSET_MIN,
): PortalDuty[] {
  const training = buildTrainingIndex(captures);
  const duties = roisDuties.map(d => toPortalDuty(d, carrier, baseOffsetMin));
  const seen = new Set<string>();
  const out: PortalDuty[] = [];
  for (const d of duties) {
    const key = `${d.id}|${d.startUTC}|${d.fltNum}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    // Attach course detail captured from detailAll, matched by assignment + the
    // raw start time string (which startUTC holds verbatim from startDateTime).
    const t = training[trainingKey(d.assignment, d.startUTC)];
    if (t) {
      d.training = t;
    }
    out.push(d);
  }
  return out.sort((a, b) => a.startUTC.localeCompare(b.startUTC));
}

function isRoisDuty(o: any): o is RoisDuty {
  return (
    o &&
    typeof o === 'object' &&
    typeof o.localStartDateTime === 'string' &&
    (o.fltNum != null || o.assignment != null)
  );
}

/** Pull every ROIS duty array found in the captured payloads. */
function collectRoisDuties(captures: PortalCapture[]): RoisDuty[] {
  const out: RoisDuty[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) {
      return;
    }
    if (Array.isArray(node)) {
      if (node.length && isRoisDuty(node[0])) {
        out.push(...(node as RoisDuty[]));
        return;
      }
      node.forEach(n => visit(n, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      for (const v of Object.values(node as Record<string, any>)) {
        visit(v, depth + 1);
      }
    }
  };
  captures.forEach(c => visit(c.body, 0));
  return out;
}

// The calendar endpoint has no airport codes; the roster-detail panel (a separate
// endpoint the SPA loads) does. Build a flight-number → {dep,arv,fleet} index from
// ANY captured payload by detecting airport-VALUED fields (3-letter codes), so it
// works regardless of that endpoint's exact field names.
//
// Keying strategy: prefer "flightNum|YYYY-MM-DD" when a dep-date is present in the
// same object — this handles month-boundary bleed where the May calendar includes an
// Apr 30 duty but the May roster report does not (so a num-only key would miss it).
// Fall back to "flightNum" alone for payloads that lack a date field.
interface AirportInfo { dep?: string; arv?: string; fleet?: string; hotel?: string }

function flightKey(v: any): string | null {
  if (v == null) {
    return null;
  }
  // Allow 1–4 digit flight numbers — IATA numbers start at 1 digit (e.g. TG8, TG9).
  const m = String(v).toUpperCase().replace(/\s/g, '').match(/(\d{1,4})[A-Z]?$/);
  return m ? m[1] : null;
}

/** Normalise any "YYYY/MM/DD", "YYYY-MM-DD", "DD MMM YYYY …" to "YYYY-MM-DD". */
function normDepDate(v: any): string | null {
  if (v == null) { return null; }
  const s = String(v).trim();
  // "2026/04/30" or "2026-04-30"
  const slash = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (slash) { return `${slash[1]}-${slash[2]}-${slash[3]}`; }
  return null;
}

function buildAirportIndex(captures: PortalCapture[]): Record<string, AirportInfo> {
  const idx: Record<string, AirportInfo> = {};
  const set = (key: string, dep: any, arv: any, fleetV: any, hotelV: any) => {
    const cur = idx[key] || (idx[key] = {});
    const depOk = typeof dep === 'string' && IATA_RE.test(dep.trim().toUpperCase());
    const arvOk = typeof arv === 'string' && IATA_RE.test(arv.trim().toUpperCase());
    if (depOk && !cur.dep) { cur.dep = dep.trim().toUpperCase(); }
    if (arvOk && !cur.arv) { cur.arv = arv.trim().toUpperCase(); }
    if (fleetV && !cur.fleet) { cur.fleet = String(fleetV); }
    if (hotelV && !cur.hotel) { cur.hotel = String(hotelV); }
  };
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || node == null) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(n => visit(n, depth + 1));
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    const o = node as Record<string, any>;
    // 'fltnum' MUST precede the looser 'flt' needle — otherwise sibling keys like
    // `fltOorder` (flight order) match 'flt' first and the real `fltNum` is missed
    // (this is the selectCrewRosterReport shape: {fltOorder, fltNum, dep, arv}).
    const fk = flightKey(pick(o, ['fltnumber', 'flightnumber', 'flightno', 'fltno', 'flightnum', 'fltnbr', 'fltnum', 'flt', 'flight']));
    const dep = pick(o, ['deparp', 'depstn', 'depairport', 'departure', 'fromairport', 'depport', 'origin', 'dep', 'from']);
    const arv = pick(o, ['arvarp', 'arrstn', 'arrairport', 'arrival', 'toairport', 'arrport', 'destination', 'arr', 'arv', 'to']);
    const depOk = typeof dep === 'string' && IATA_RE.test(dep.trim().toUpperCase());
    const arvOk = typeof arv === 'string' && IATA_RE.test(arv.trim().toUpperCase());
    if (fk && (depOk || arvOk)) {
      const fleet = pick(o, ['fleet', 'actype', 'aircrafttype', 'aircraft', 'equip', 'acsubtype']);
      const hotel = pick(o, ['hotel', 'hotelname', 'accommodation', 'layoverhotel', 'hotelinfo']);
      // Store under both a date-specific key (preferred) and the bare num fallback.
      const depDate = normDepDate(pick(o, ['depdate', 'depdt', 'flightdate', 'fltdate', 'date', 'departuredate']));
      if (depDate) {
        set(`${fk}|${depDate}`, dep, arv, fleet, hotel);
      }
      set(fk, dep, arv, fleet, hotel);
      return;
    }
    for (const v of Object.values(o)) {
      visit(v, depth + 1);
    }
  };
  captures.forEach(c => visit(c.body, 0));
  return idx;
}

function parseRoisDuties(
  duties: RoisDuty[],
  carrier: string,
  airports: Record<string, AirportInfo> = {},
  hotels: Record<string, HotelBooking> = {},
  baseAirport: string = BASE_AIRPORT,
  baseOffsetMin: number = BASE_OFFSET_MIN,
  fallbackCrewId = '',
): (TripLeg & { checkInDateUTC: string })[] {
  const seen = new Set<string>();
  const legs: (TripLeg & { checkInDateUTC: string })[] = [];
  // ONLY real revenue flights become trip legs. Match on assignment==='FLY'
  // strictly — NOT `type==='F'`, because ground/non-revenue duties also carry
  // type 'F' (SIM sessions, DHD deadheads, CHMSBA/CHMSBB standby) and would
  // otherwise leak in as broken DEP→ARR flight cards (e.g. the "TGHOSIM:A33|34"
  // card). Those duties are rendered separately as ground-duty cards from the
  // full duty list (see dutyDisplay.ts / extractPortalDuties).
  // Sort by UTC start so multi-leg duties and trips order correctly.
  const flights = duties
    .filter(d => (d.assignment ?? '').toUpperCase() === 'FLY')
    .filter(d => d.fltNum != null && String(d.fltNum).trim() !== '')
    .sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));

  let prevArv: string | null = null; // arrival airport of the previous kept leg
  let prevBrief: string | null = null;
  for (const d of flights) {
    const num = String(d.fltNum).trim();
    const fltNumber = `${carrier}${num}`.toUpperCase();
    // startDateTime/endDateTime are BASE (crew home) time, not UTC — convert.
    const flightDateUTC = roisBaseToUTC(d.startDateTime, baseOffsetMin);
    const key = `${fltNumber}|${flightDateUTC}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    // Airport index lookup key — strip the carrier prefix and any day-suffix (e.g. "8Z"
    // is TG8 delayed to the next day; both share the same route so "8" is the right key).
    // flightKey("8Z") → "8",  flightKey("0622") → "0622",  flightKey("319") → "319".
    const numKey = flightKey(num) ?? num;
    // Airport lookup strategy (handles three tricky cases):
    //
    // 1. Month-boundary bleed: May calendar includes Apr 30 duty; May report doesn't
    //    cover it — keying by depDate picks the right entry from the Apr report.
    //
    // 2. Overnight westbound flights: calendar startDateTime is Bangkok base (UTC+7),
    //    report depDate is local airport time — they differ by one calendar day. We
    //    try both the calendar date and the previous day to find the report entry.
    //
    // 3. Incomplete date-keyed entries: detailAll sometimes creates an entry for the
    //    calendar date but only populates dep (not arv). We MERGE date-keyed and bare
    //    number entries so missing fields are filled from the more complete source.
    const depDateKey = d.startDateTime ? d.startDateTime.slice(0, 10) : '';
    const prevDate = depDateKey
      ? (() => { const t = new Date(depDateKey + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); })()
      : '';
    const dateEnr = (depDateKey && airports[`${numKey}|${depDateKey}`])
                 || (prevDate && airports[`${numKey}|${prevDate}`])
                 || undefined;
    const baseEnr = airports[numKey] || {};
    // Merge: date-keyed wins when present, bare number fills any missing fields.
    const enr: AirportInfo = {
      dep:   dateEnr?.dep   || baseEnr.dep,
      arv:   dateEnr?.arv   || baseEnr.arv,
      fleet: dateEnr?.fleet || baseEnr.fleet,
      hotel: dateEnr?.hotel || baseEnr.hotel,
    };
    const depArp = enr.dep ?? '';
    const arvArp = enr.arv ?? '';
    const brief = (d.briefStart || '').trim();

    // Start a new trip (rotation) when:
    //  - this is the first leg, or
    //  - the previous leg landed back at base (that rotation closed), or
    //  - airports are unknown so we can't chain by routing — fall back to a
    //    briefStart change as the boundary (keeps sims/training separate).
    // Otherwise chain onto the current trip, so an out-and-back like
    // BKK→SIN (out) / SIN→BKK (back) is ONE trip with legs in flight order.
    let isNewDuty: boolean;
    if (prevArv === null || prevArv === baseAirport) {
      isNewDuty = true;
    } else if ((prevArv === '' || depArp === '') && brief !== prevBrief) {
      isNewDuty = true;
    } else {
      isNewDuty = false;
    }
    prevArv = arvArp;
    prevBrief = brief;

    // Hotel: look up by "numKey|local-dep-date" from hotelBookingVo (detailAll).
    // The hotel is on the INBOUND leg (the one that arrives at the layover city).
    const localDepDate = (d.localStartDateTime || '').slice(0, 10);
    const hotelEntry = hotels[`${numKey}|${localDepDate}`] || hotels[`${numKey}|${depDateKey}`] || hotels[`${numKey}|${prevDate}`];
    const hotelName = hotelEntry?.hotelName || enr.hotel || '';

    legs.push({
      // Attribute every leg to the crew: some PR calendar duties omit crewId, so
      // fall back to the logged-in crew. This keeps trips correctly owned (and lets
      // the fresh-login path drop other-crew trips to prevent PR/TG mixing).
      crewId: String(d.crewId ?? '').trim() || fallbackCrewId,
      fltNumber,
      flightDateUTC,
      depArp,
      arvDateUTC: roisBaseToUTC(d.endDateTime, baseOffsetMin),
      arvArp,
      fleet: enr.fleet ?? '',
      hotel: hotelName,
      ...(hotelEntry ? { hotelBooking: hotelEntry } : {}),
      localDepTime: d.localStartDateTime,
      localArvTime: d.localEndDateTime,
      assignment: 'FLY',
      checkInDateUTC: isNewDuty ? (d.briefStart || flightDateUTC) : '',
    });
  }
  return legs;
}

/** Per-airline knobs for the ROIS parse (from Airline.portalConfig). Omitted =
 *  TG defaults (BKK base, UTC+7), so all existing callers are unaffected. */
export interface ParsePortalOptions {
  baseAirport?: string;
  baseOffsetMin?: number;
}

/**
 * Parse captured portal payloads into trips. Prefers the deterministic ROIS
 * schema; falls back to a generic flight-object heuristic for other portals.
 * Returns the grouped Trip[] plus a count of raw legs found.
 */
export function parsePortalCaptures(
  captures: PortalCapture[],
  fallbackCrewId = '',
  carrier = 'TG',
  opts: ParsePortalOptions = {},
): { trips: Trip[]; legCount: number; duties: PortalDuty[] } {
  const baseAirport = opts.baseAirport ?? BASE_AIRPORT;
  const baseOffsetMin = opts.baseOffsetMin ?? BASE_OFFSET_MIN;
  // Collect the ROIS duties once (a full recursive tree walk) and reuse for both
  // the duty list and the deterministic trip parse below.
  const roisDuties = collectRoisDuties(captures);

  // Always extract the full duty list (all assignments) for storage / future use.
  const duties = extractPortalDuties(captures, roisDuties, carrier, baseOffsetMin);

  // 1) ROIS Cloud — deterministic (TG THAI + PR Philippine share this schema).
  if (roisDuties.length) {
    const airports = buildAirportIndex(captures);
    const hotels = buildHotelIndex(captures);
    const legs = parseRoisDuties(roisDuties, carrier, airports, hotels, baseAirport, baseOffsetMin, fallbackCrewId);
    if (legs.length) {
      return { trips: groupIntoTrips(legs as RawRow[]), legCount: legs.length, duties };
    }
  }

  // 2) Generic fallback — hunt for flight-like objects anywhere.
  const flightObjs: any[] = [];
  for (const cap of captures) {
    if (cap.source === 'dom') {
      continue;
    }
    collectFlights(cap.body, flightObjs);
  }

  const seen = new Set<string>();
  const legs: (TripLeg & { checkInDateUTC: string })[] = [];
  for (const o of flightObjs) {
    const leg = toLeg(o, fallbackCrewId);
    if (!leg) {
      continue;
    }
    const key = `${leg.fltNumber}|${leg.flightDateUTC}|${leg.depArp}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    legs.push(leg);
  }
  legs.sort((a, b) => a.flightDateUTC.localeCompare(b.flightDateUTC));

  return { trips: groupIntoTrips(legs as RawRow[]), legCount: legs.length, duties };
}
