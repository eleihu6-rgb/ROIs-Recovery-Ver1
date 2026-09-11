// Hooks that bind the v2 view model to the store.
import { useMemo } from 'react';
import { useAppSelector } from '../../store';
import { airlineByCode } from '../auth/airlines';
import { alarmsByTrip, buildMonth, dutyAlarmsByTrip, nextTrip, type MonthModel } from './model';
import type { EffectiveAlarm } from '../settings/alarmSetup';
import type { Trip } from '../travel/tripCsv';

export function useBase(): string {
  // The roster's own base wins; the airline config only covers carriers whose
  // portal is not API-backed (TG=BKK, PR=MNL).
  const rosterBase = useAppSelector(s => s.auth.base);
  const airline = useAppSelector(s => s.auth.airline);
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

export function useMonth(year: number, monthIdx: number, now: Date): MonthModel {
  const trips = useAppSelector(s => s.trips.trips);
  const duties = useAppSelector(s => s.duties.duties);
  const meetings = useAppSelector(s => s.meetings.meetings);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  // Record view: a duty keeps its markers after it has flown.
  const { byTrip } = useDutyAlarms();
  return useMemo(
    () => buildMonth(year, monthIdx, trips, duties, meetings, mode, baseTz, byTrip, now),
    [year, monthIdx, trips, duties, meetings, mode, baseTz, byTrip, now],
  );
}
