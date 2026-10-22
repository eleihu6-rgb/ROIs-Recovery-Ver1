import { tripDestination } from '../home/cities';
import {
  DEFAULT_ALARM_OPTIONS,
  airportTimeZone,
  minusHours,
  parseRosterDateUTC,
  toAlarmInstant,
} from '../settings/alarmSetup';
import { parseRosterUTC } from '../settings/timeFormat';
import { nextTrip } from '../v2/model';
import type { Trip } from '../travel/tripCsv';

export const M5_DISPLAY_SERVICE_UUID = '7D2A0001-6C6F-4F69-732D-435245570001';
export const M5_DISPLAY_SNAPSHOT_UUID = '7D2A0002-6C6F-4F69-732D-435245570001';

export interface M5TripSnapshot {
  version: 1;
  city: string;
  destination: string;
  flight: string;
  route: string;
  checkInLocal: string;
  checkInEpoch: number;
  departureEpoch: number;
  legCount: number;
  syncedEpoch: number;
}

function cleanField(value: string, maxLength: number): string {
  return value
    .replace(/[|\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function tripRoute(trip: Trip): string {
  const airports: string[] = [];
  for (const leg of trip.legs) {
    const dep = cleanField(leg.depArp.toUpperCase(), 3);
    const arv = cleanField(leg.arvArp.toUpperCase(), 3);
    if (dep && airports.at(-1) !== dep) {
      airports.push(dep);
    }
    if (arv && airports.at(-1) !== arv) {
      airports.push(arv);
    }
  }
  return airports.join('-').slice(0, 31);
}

export function buildM5TripSnapshot(
  trips: Trip[],
  base: string,
  now: Date = new Date(),
): M5TripSnapshot | null {
  const trip = nextTrip(trips, now);
  const first = trip?.legs[0];
  if (!trip || !first) {
    return null;
  }

  const departure = parseRosterDateUTC(first.flightDateUTC);
  if (!departure) {
    return null;
  }
  const publishedCheckIn = parseRosterUTC(trip.checkInDateUTC);
  const checkIn = publishedCheckIn
    ?? minusHours(departure, DEFAULT_ALARM_OPTIONS.checkInHoursBefore);
  const destination = tripDestination(trip, base);

  return {
    version: 1,
    city: cleanField(destination.name.toUpperCase(), 22),
    destination: cleanField(destination.airport.toUpperCase(), 3),
    flight: cleanField(first.fltNumber.toUpperCase(), 10),
    route: tripRoute(trip),
    checkInLocal: toAlarmInstant(checkIn, airportTimeZone(first.depArp)).hhmm,
    checkInEpoch: Math.floor(checkIn.getTime() / 1000),
    departureEpoch: Math.floor(departure.getTime() / 1000),
    legCount: trip.legs.length,
    syncedEpoch: Math.floor(now.getTime() / 1000),
  };
}

export function encodeM5TripSnapshot(snapshot: M5TripSnapshot | null): string {
  if (!snapshot) {
    return '1|NO TRIP|||||0|0|0|0';
  }
  return [
    snapshot.version,
    cleanField(snapshot.city, 22),
    cleanField(snapshot.destination, 3),
    cleanField(snapshot.flight, 10),
    cleanField(snapshot.route, 31),
    cleanField(snapshot.checkInLocal, 5),
    snapshot.checkInEpoch,
    snapshot.departureEpoch,
    snapshot.legCount,
    snapshot.syncedEpoch,
  ].join('|');
}

export function formatCountdown(targetEpoch: number, now: Date = new Date()): string {
  const seconds = Math.max(0, targetEpoch - Math.floor(now.getTime() / 1000));
  if (seconds === 0) {
    return 'CHECK IN NOW';
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}
