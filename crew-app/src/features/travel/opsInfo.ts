// Operational detail for a flight leg — the extra rows Ryan asked for on the
// destination page and in Trip Details.
//
// REAL (comes off the live-server flight row, mapped in ekRosterApi):
//   • ETD / ETA — f.est_dep_dt_utc / f.est_arv_dt_utc (rolling estimate), falling
//                 back to the filed schedule when the airline filed none.
//   • ATD / ATA — f.act_dep_dt_utc / f.act_arv_dt_utc, shown only once the leg has
//                 actually operated (a planned row repeats the schedule there,
//                 which would otherwise read as a bogus "actual").
//   • tail      — f.register
//   • block     — f.blk_min
//
// MOCKED (Ryan: "mock up some hotel info if there is a layover"): terminal + gate,
// the layover hotel when the roster carries no booking, and the whole transfer
// block — pick-up / drop-off times, vehicle, plate, driver, contact number. They
// are DETERMINISTIC (derived from the flight number + airports) so a duty always
// shows the same value, and every mocked field is flagged so the UI can label it
// instead of pretending it is confirmed. A live `hotel` table exists
// (airport, name, phone, address, pick_up/drop_off minutes) but is empty in SIT,
// so hotel data stays a stand-in for now.
import { airportZone } from '../settings/airportZones';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { formatLegTime, hhmmForInstant, parseRosterUTC, withZoneSuffix } from '../settings/timeFormat';
import type { Trip, TripLeg } from './tripCsv';

export interface GateInfo {
  terminal: string;
  gate: string;
}

export interface HotelInfo {
  /** IATA code of the airport the hotel serves. */
  airport: string;
  name: string;
  address: string;
  phone: string;
  /** "HH:MM" at the layover airport. */
  checkIn: string;
  checkOut: string;
  nights: number;
  /** e.g. "Crew shuttle every 30 min · 15 min to T2". */
  transfer: string;
  /** false when the roster itself carried the booking. */
  mocked: boolean;
}

export interface TransferInfo {
  /** Hotel → airport, "HH:MM" at the layover airport. */
  pickup: string;
  /** Crew dropped at the terminal, "HH:MM". */
  dropOff: string;
  /** Everything below is a stand-in: the crewing feed has no transport columns. */
  vehicle: string;
  plate: string;
  driver: string;
  phone: string;
}

export interface LegOps {
  /** "HH:MM" in the app's display zone, '' when the leg carries no times. */
  etd: string;
  eta: string;
  atd: string;
  ata: string;
  /** True when ETD/ETA is a live estimate rather than the filed schedule. */
  estimated: boolean;
  dep: GateInfo;
  arv: GateInfo;
  /** Aircraft tail, '' when the roster has none. */
  register: string;
  /** "2h 45m" from the filed block time, '' when unknown. */
  block: string;
  /** Hotel pick-up + airport drop-off for a leg that starts at a layover. */
  transfer: TransferInfo | null;
  /** Which parts of this block are stand-ins (see the module header). */
  mocked: { gates: boolean; transports: boolean };
}

/** Stable 32-bit hash so a mocked value never changes between renders/sessions. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Mock terminal + gate for one end of a flight (deterministic per flight+airport). */
export function mockGate(airport: string, fltNumber: string): GateInfo {
  const seed = hash(`${(airport || 'XXX').toUpperCase()}:${fltNumber}`);
  return {
    terminal: ['T1', 'T2', 'T3'][seed % 3],
    gate: `${['A', 'B', 'C', 'D', 'E'][(seed >> 3) % 5]}${(seed % 32) + 1}`,
  };
}

/** A believable crew hotel per layover airport; falls back to a generic name. */
const HOTELS: Record<string, { name: string; address: string; transfer: string }> = {
  ADD: { name: 'Radisson Blu Hotel, Addis Ababa', address: 'Kazanchis Business District, Addis Ababa', transfer: 'Crew shuttle every 30 min · 15 min to T2' },
  NBO: { name: 'Radisson Blu Hotel Nairobi Upper Hill', address: 'Elgon Road, Upper Hill, Nairobi', transfer: 'Crew shuttle every 30 min · 25 min to T1A' },
  BJM: { name: 'Kiriri Garden Hotel', address: 'Kiriri, Bujumbura', transfer: 'Crew shuttle on call · 10 min to the terminal' },
  DMM: { name: 'Sheraton Dammam Hotel & Convention Centre', address: '1st Street, Al Bathy, Dammam', transfer: 'Crew shuttle every 30 min · 20 min to the terminal' },
  DAR: { name: 'Hyatt Regency Dar es Salaam', address: 'Kivukoni Front, Dar es Salaam', transfer: 'Crew shuttle every 45 min · 25 min to the terminal' },
  JNB: { name: 'Protea Hotel O.R. Tambo Airport', address: 'O.R. Tambo International Airport, Johannesburg', transfer: 'Covered walkway to the terminal · 5 min' },
  ZRH: { name: 'Radisson Blu Hotel, Zurich Airport', address: 'Zurich Airport, 8058 Zurich', transfer: 'Walkway to Terminal 1 · 3 min' },
  LHR: { name: 'Sofitel London Heathrow', address: 'Terminal 5, Heathrow Airport, London', transfer: 'Covered walkway to T5 · 5 min' },
  CAN: { name: 'Pullman Guangzhou Baiyun Airport', address: 'Baiyun International Airport, Guangzhou', transfer: 'Crew shuttle every 20 min · 8 min to T2' },
  HKG: { name: 'Regal Airport Hotel', address: '9 Cheong Tat Road, Hong Kong Airport', transfer: 'Covered walkway to the terminal · 2 min' },
  LOS: { name: 'Lagos Continental Hotel', address: 'Plot 52A Kofo Abayomi Street, Victoria Island, Lagos', transfer: 'Crew shuttle every 45 min · 40 min to the terminal' },
  ACC: { name: 'Kempinski Hotel Gold Coast City', address: 'Gamel Abdul Nasser Avenue, Accra', transfer: 'Crew shuttle every 45 min · 20 min to the terminal' },
  KGL: { name: 'Kigali Marriott Hotel', address: 'KN 3 Avenue, Kigali', transfer: 'Crew shuttle every 30 min · 15 min to the terminal' },
  MPM: { name: 'Radisson Blu Hotel & Residence, Maputo', address: 'Avenida Marginal 141, Maputo', transfer: 'Crew shuttle every 30 min · 20 min to the terminal' },
  MGQ: { name: 'Jazeera Palace Hotel', address: 'Airport Road, Mogadishu', transfer: 'Crew shuttle on call · 10 min to the terminal' },
  GIZ: { name: 'Radisson Blu Resort, Jizan', address: 'King Fahd Road, Jizan', transfer: 'Crew shuttle every 30 min · 12 min to the terminal' },
  HRE: { name: 'Holiday Inn Harare', address: 'Samora Machel Avenue, Harare', transfer: 'Crew shuttle every 45 min · 20 min to the terminal' },
  LUN: { name: 'Taj Pamodzi Hotel', address: 'Church Road, Lusaka', transfer: 'Crew shuttle every 45 min · 25 min to the terminal' },
  // TG network (portal-captured rosters: BKK base + these layovers).
  BKK: { name: 'Novotel Bangkok Suvarnabhumi Airport', address: '999 Suvarnabhumi Airport Hotel, Bang Phli, Samut Prakan', transfer: 'Covered walkway to the terminal · 5 min' },
  PVG: { name: 'Crowne Plaza Shanghai Pudong Airport', address: '5500 Chuansha Road, Pudong, Shanghai', transfer: 'Crew shuttle every 30 min · 15 min to T2' },
  PEK: { name: 'Cordis, Beijing Capital Airport', address: 'Terminal 3, Beijing Capital International Airport', transfer: 'Crew shuttle every 20 min · 8 min to T3' },
  NRT: { name: 'Narita Tobu Hotel Airport', address: '320-1 Tokko, Narita, Chiba', transfer: 'Crew shuttle every 20 min · 10 min to T1' },
  NGO: { name: 'Centrair Hotel', address: '1-1 Centrair, Tokoname, Aichi', transfer: 'Direct access to the terminal · 3 min' },
  ICN: { name: 'Grand Hyatt Incheon', address: '208 Yeongjonghaeannam-ro, Jung-gu, Incheon', transfer: 'Crew shuttle every 30 min · 15 min to T1' },
  SIN: { name: 'Crowne Plaza Changi Airport', address: '75 Airport Boulevard, Singapore', transfer: 'Linked to Terminal 3 · 3 min' },
  CGK: { name: 'Jakarta Airport Hotel', address: 'Terminal 2, Soekarno-Hatta International Airport', transfer: 'Inside the terminal · 2 min' },
  DPS: { name: 'Novotel Bali Ngurah Rai Airport', address: 'Jalan Raya Uluwatu, Kuta Selatan, Bali', transfer: 'Crew shuttle every 20 min · 5 min to the terminal' },
  DAC: { name: 'Best Western Plus Maple Leaf', address: 'Plot 39, Road 4, Banani, Dhaka', transfer: 'Crew shuttle every 45 min · 25 min to the terminal' },
  OSL: { name: 'Radisson Blu Airport Hotel Oslo Gardermoen', address: 'Hotellvegen 2, Gardermoen', transfer: 'Covered walkway to the terminal · 4 min' },
  ARN: { name: 'Radisson Blu Arlandia Hotel, Stockholm Arlanda', address: 'Kabinvägen 3, Arlanda', transfer: 'Crew shuttle every 15 min · 5 min to Terminal 5' },
  DXB: { name: 'Le Méridien Dubai Airport', address: 'Airport Road, Al Garhoud, Dubai', transfer: 'Crew shuttle every 20 min · 8 min to T3' },
  DEL: { name: 'Roseate House New Delhi', address: 'IGI Airport, Aerocity, New Delhi', transfer: 'Crew shuttle every 30 min · 10 min to T3' },
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Mock transfer detail — crew feed carries no vehicle/driver columns yet. */
const DRIVERS = ['Dawit T.', 'Selam A.', 'Bekele M.', 'Yonas G.', 'Hanna K.', 'Fikru B.', 'Meseret D.'];
const VEHICLES = ['Toyota Hiace crew van', 'Ford Transit crew van', 'Mercedes Vito van', 'Toyota Coaster minibus'];
const DIAL_CODES: Record<string, string> = {
  // ET network
  ADD: '+251', NBO: '+254', BJM: '+257', DMM: '+966', DAR: '+255', JNB: '+27',
  KGL: '+250', MPM: '+258', MGQ: '+252', GIZ: '+966', HRE: '+263', LUN: '+260',
  LOS: '+234', ACC: '+233', ZRH: '+41', LHR: '+44', CAN: '+86',
  // TG network
  BKK: '+66', PVG: '+86', PEK: '+86', NRT: '+81', NGO: '+81', ICN: '+82',
  SIN: '+65', CGK: '+62', DPS: '+62', DAC: '+880', OSL: '+47', ARN: '+46',
  HKG: '+852', DXB: '+971', DEL: '+91',
};

/** Dial code → ISO-2 country, used for the mock plate prefix. */
const ISO_BY_DIAL: Record<string, string> = {
  '+251': 'ET', '+254': 'KE', '+257': 'BI', '+966': 'SA', '+255': 'TZ', '+27': 'ZA',
  '+250': 'RW', '+258': 'MZ', '+252': 'SO', '+263': 'ZW', '+260': 'ZM', '+234': 'NG',
  '+233': 'GH', '+41': 'CH', '+44': 'GB', '+86': 'CN', '+66': 'TH', '+81': 'JP',
  '+82': 'KR', '+65': 'SG', '+62': 'ID', '+880': 'BD', '+47': 'NO', '+46': 'SE',
  '+852': 'HK', '+971': 'AE', '+91': 'IN',
};

/** International dial code for a layover airport (fallback: the ET base). */
function dialFor(airport: string): string {
  return DIAL_CODES[(airport || '').toUpperCase()] || '+251';
}

/**
 * Stand-in for the layover transfer: the times come off the crew's own report time
 * (with the mocked transfer buffer), the rest is deterministic make-believe —
 * vehicle, plate, driver and a contact number — until the transport feed lands.
 */
export function mockTransfer(
  airport: string,
  flightNumber: string,
  pickup: string,
  dropOff: string,
): TransferInfo {
  const seed = hash(`transfer:${airport}:${flightNumber}`);
  const dial = dialFor(airport);
  // Plate carries the layover country's ISO code, so a Shanghai transfer never
  // reads as an Ethiopian van.
  const iso = ISO_BY_DIAL[dial] || 'CREW';
  return {
    pickup,
    dropOff,
    vehicle: VEHICLES[seed % VEHICLES.length],
    plate: `${iso} ${(seed % 900) + 100}-${(seed % 9000) + 1000}`,
    driver: DRIVERS[(seed >> 4) % DRIVERS.length],
    phone: `${dial} ${(seed % 90) + 10} ${(seed % 900) + 100} ${(seed % 9000) + 1000}`,
  };
}

/**
 * Arrival-side transfer for a layover (airport → hotel on arrival, hotel → airport
 * for the next departure), using the hotel's own check-in / check-out slots.
 */
export function hotelTransfer(airport: string, flightNumber: string, hotel: HotelInfo): TransferInfo {
  return mockTransfer(airport, flightNumber, hotel.checkIn, hotel.checkOut);
}

/**
 * Where the crew actually sleeps on this rotation, or null for a same-day turn.
 *
 * Three shapes have to work:
 *   • ends away from base (ADD → LHR) — the crew stays at the last airport;
 *   • round trip with an overnight in the middle (ADD → DMM → ADD) — the stop is
 *     the intermediate airport, and the stay is real only when the next leg
 *     departs on a LATER calendar day (an 8-hour same-day turn is not a hotel);
 *   • the roster itself carried a booking — then that wins outright.
 */
function layoverStop(trip: Trip, home: string): { airport: string; arrival: TripLeg; next?: TripLeg } | null {
  const dayOf = (leg: TripLeg, which: 'arv' | 'dep'): string => {
    const local = which === 'arv' ? leg.localArvTime : leg.localDepTime;
    if (local) {
      return local.slice(0, 10);
    }
    const utc = parseRosterUTC(which === 'arv' ? leg.arvDateUTC : leg.flightDateUTC);
    return utc ? utc.toISOString().slice(0, 10) : '';
  };

  for (let i = 0; i < trip.legs.length; i++) {
    const leg = trip.legs[i];
    const airport = (leg.arvArp || '').toUpperCase();
    if (!airport || airport === home) {
      continue;
    }
    const next = trip.legs[i + 1];
    if (!next) {
      return { airport, arrival: leg };
    }
    const continuesHere = (next.depArp || '').toUpperCase() === airport;
    if (continuesHere && dayOf(next, 'dep') > dayOf(leg, 'arv')) {
      return { airport, arrival: leg, next };
    }
  }
  return null;
}

/**
 * The rotation's layover hotel, or null when the crew never stays away. The
 * roster's own booking always wins; otherwise a deterministic stand-in is
 * generated for the layover airport.
 */
export function hotelFor(trip: Trip, base: string): HotelInfo | null {
  const home = (base || '').toUpperCase();
  const booking = trip.legs.find(l => l.hotelBooking)?.hotelBooking;
  const stop = home ? layoverStop(trip, home) : null;
  const layoverHours = trip.layoverHours ?? 0;
  if (!booking && !stop && layoverHours <= 0) {
    return null;
  }

  const airport = (booking?.airport || stop?.airport || '').toUpperCase();
  const preset = HOTELS[airport];
  let nights = booking?.nights;
  if (!nights && stop?.next) {
    const arrive = parseRosterUTC(stop.arrival.arvDateUTC);
    const leave = parseRosterUTC(stop.next.flightDateUTC);
    if (arrive && leave) {
      nights = Math.max(1, Math.round((leave.getTime() - arrive.getTime()) / 86_400_000));
    }
  }
  if (!nights) {
    nights = Math.max(1, Math.round(layoverHours / 24) || 1);
  }
  // Check-in = the real arrival + ~1h of transport (local clock of the arrival
  // airport); check-out = a stand-in morning slot unless the roster has one.
  const arrival = parseRosterUTC(stop?.arrival.arvDateUTC);
  const checkIn = booking?.arrivalTimeLoc
    || (arrival ? `${pad2((arrival.getUTCHours() + 1) % 24)}:15` : '22:30');
  return {
    airport,
    name: booking?.hotelName || preset?.name || `${airport || 'Crew'} Airport Hotel`,
    address: booking?.location || preset?.address || `${airport} airport area`,
    phone: `${dialFor(airport)} ${(hash(airport) % 90) + 10} ${(hash(`${airport}p`) % 9000) + 1000}`,
    checkIn,
    checkOut: booking?.signOnLoc || '09:00',
    nights,
    transfer: preset?.transfer || 'Crew shuttle on call · 15 min to the terminal',
    mocked: !booking,
  };
}

/** "165" → "2h 45m" (block time), '' when unknown. */
export function blockLabel(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) {
    return '';
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${pad2(m)}m` : `${m}m`;
}

/** "16 Sep 00:30" → "00:30" (drops the leading date, keeps the clock). */
function onlyHhmm(value: string): string {
  return (value.match(/(\d{2}:\d{2})/) ?? ['', ''])[1];
}

/** Scheduled fallback for ETD/ETA, marked the same way the duty times are. */
function scheduledHhmm(iso: string, localTime: string | undefined, mode: TimeZoneMode, baseTz: string, airport: string): string {
  const raw = onlyHhmm(formatLegTime({ flightDateUTC: iso, localTime, mode, baseTz, airportTz: airportZone(airport) }));
  return raw ? withZoneSuffix(raw, mode) : '';
}

function instantHhmm(
  iso: string | undefined,
  mode: TimeZoneMode,
  baseTz: string,
  airport: string,
): string {
  if (!iso) {
    return '';
  }
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? '' : hhmmForInstant(instant, mode, baseTz, airportZone(airport));
}

/**
 * Everything the destination page / Trip Details prints about a leg. `now` decides
 * whether the actual times are real yet — they stay hidden until the leg has gone.
 */
export function legOps(
  leg: TripLeg,
  trip: Trip,
  mode: TimeZoneMode,
  baseTz: string,
  options: { now?: Date; hasLayover?: boolean } = {},
): LegOps {
  const now = options.now ?? new Date();
  const dep = (leg.depArp || '').toUpperCase();
  const arv = (leg.arvArp || '').toUpperCase();
  const departed = (iso?: string) => {
    if (!iso) {
      return '';
    }
    const instant = new Date(iso);
    return !Number.isNaN(instant.getTime()) && instant.getTime() <= now.getTime()
      ? instantHhmm(iso, mode, baseTz, dep)
      : '';
  };

  const estimated = !!(leg.estDepUtc || leg.estArvUtc);
  const scheduledDep = scheduledHhmm(leg.flightDateUTC, leg.localDepTime, mode, baseTz, dep);
  const scheduledArv = scheduledHhmm(leg.arvDateUTC, leg.localArvTime, mode, baseTz, arv);

  // A leg that does NOT report at base means the crew left the layover hotel this
  // morning: pick-up is check-in minus the transfer buffer, drop-off right after.
  const isFirstLeg = trip.legs[0] === leg;
  const checkIn = parseRosterUTC(trip.checkInDateUTC);
  const transfer = !isFirstLeg && options.hasLayover && checkIn
    ? mockTransfer(
        dep,
        leg.fltNumber,
        instantHhmm(new Date(checkIn.getTime() - 75 * 60_000).toISOString(), mode, baseTz, dep),
        instantHhmm(new Date(checkIn.getTime() - 40 * 60_000).toISOString(), mode, baseTz, dep),
      )
    : null;

  return {
    etd: instantHhmm(leg.estDepUtc, mode, baseTz, dep) || scheduledDep,
    eta: instantHhmm(leg.estArvUtc, mode, baseTz, arv) || scheduledArv,
    atd: departed(leg.actDepUtc),
    ata: departed(leg.actArvUtc),
    estimated,
    dep: mockGate(dep, leg.fltNumber),
    arv: mockGate(arv, leg.fltNumber),
    register: (leg.register || '').trim().toUpperCase(),
    block: blockLabel(leg.blockMinutes),
    transfer,
    mocked: { gates: true, transports: true },
  };
}
