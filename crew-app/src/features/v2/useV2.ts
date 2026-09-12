// Hooks that bind the v2 view model to the store.
import { useMemo } from 'react';
import { useAppSelector } from '../../store';
import { airlineByCode } from '../auth/airlines';
import { tripDestination, type CityCard } from '../home/cities';
import { classifyTrips } from '../travel/tripCsv';
import { alarmsByTrip, buildMonth, dutyAlarmsByTrip, legView, nextTrip, tripStartMs, type LegView, type MonthModel } from './model';
import type { EffectiveAlarm } from '../settings/alarmSetup';
import type { Trip } from '../travel/tripCsv';

export function useBase(): string {
  // The roster's own base wins; the airline config only covers carriers whose
  // portal is not API-backed (TG=BKK, PR=MNL).
  const rosterBase = useAppSelector(s => s.auth.base);
  const airline = useAppSelector(s => s.auth.airline);
  const guest = useAppSelector(s => s.auth.mode === 'guest');
  // A guest is based nowhere: don't borrow an airline's base airport (which is
  // what a blank airline code would otherwise resolve to).
  if (guest && !rosterBase) {
    return '';
  }
  return rosterBase || airlineByCode(airline ?? '').portalConfig?.baseAirport || 'BKK';
}

export function useAlarms(now: Date): { byTrip: Record<string, EffectiveAlarm>; all: EffectiveAlarm[] } {
  const trips = useAppSelector(s => s.trips.trips);
  const wake = useAppSelector(s => s.alarms.wakeUpHours);
  const leave = useAppSelector(s => s.alarms.leaveHomeHours);
  const overrides = useAppSelector(s => s.alarms.overrides);
  return useMemo(() => alarmsByTrip(trips, wake, leave, overrides, now), [trips, wake, leave, overrides, now]);
}

/**
 * Duty markers for the record views (Schedule, Trip Details): every published
 * duty, including the ones that have already flown. iOS alarm scheduling keeps
 * using `useAlarms` (upcoming only) — see dutyAlarmsByTrip.
 */
export function useDutyAlarms(): { byTrip: Record<string, EffectiveAlarm>; all: EffectiveAlarm[] } {
  const trips = useAppSelector(s => s.trips.trips);
  const wake = useAppSelector(s => s.alarms.wakeUpHours);
  const leave = useAppSelector(s => s.alarms.leaveHomeHours);
  const overrides = useAppSelector(s => s.alarms.overrides);
  return useMemo(() => dutyAlarmsByTrip(trips, wake, leave, overrides), [trips, wake, leave, overrides]);
}

export function useNextTrip(now: Date): Trip | null {
  const trips = useAppSelector(s => s.trips.trips);
  return useMemo(() => nextTrip(trips, now), [trips, now]);
}

/** One Home "Explore your destinations" card, and one page of the city viewer. */
export interface DestinationEntry {
  trip: Trip;
  city: CityCard;
  leg: LegView;
}

/**
 * This month's upcoming rotations, one entry per destination (deduped by airport,
 * nearest first, max 6). Shared by the Home strip and the full-screen city viewer
 * so tapping a card lands on that exact city with the same data behind it.
 */
export function useDestinations(now: Date): DestinationEntry[] {
  const trips = useAppSelector(s => s.trips.trips);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useBase();
  // Record view (all duties), so a card for a flight that already departed still
  // carries its markers instead of collapsing.
  const { byTrip } = useDutyAlarms();
  return useMemo(() => {
    const upcoming = classifyTrips(trips, now).upcoming.slice().sort((a, b) => tripStartMs(a) - tripStartMs(b));
    const seen = new Set<string>();
    return upcoming
      .map(t => ({ trip: t, city: tripDestination(t, base), leg: legView(t.legs[0], t, mode, baseTz, byTrip[t.id]) }))
      .filter(x => x.city.airport !== base && !seen.has(x.city.airport) && seen.add(x.city.airport))
      .slice(0, 6);
  }, [trips, now, base, mode, baseTz, byTrip]);
}

export function useMonth(year: number, monthIdx: number, now: Date): MonthModel {
  const trips = useAppSelector(s => s.trips.trips);
  const duties = useAppSelector(s => s.duties.duties);
  const meetings = useAppSelector(s => s.meetings.meetings);
  const meetingMinutes = useAppSelector(s => s.meetings.minutesBefore);
  const mutedIds = useAppSelector(s => s.meetings.mutedIds);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  // Record view: a duty keeps its markers after it has flown.
  const { byTrip } = useDutyAlarms();
  return useMemo(
    () => buildMonth(year, monthIdx, trips, duties, meetings, mode, baseTz, byTrip, now, {
      minutesBefore: meetingMinutes,
      mutedIds,
    }),
    [year, monthIdx, trips, duties, meetings, mode, baseTz, byTrip, now, meetingMinutes, mutedIds],
  );
}
