// Hooks that bind the v2 view model to the store.
import { useMemo } from 'react';
import { useAppSelector } from '../../store';
import { airlineByCode } from '../auth/airlines';
import { alarmsByTrip, buildMonth, nextTrip, type MonthModel } from './model';
import type { EffectiveAlarm } from '../settings/alarmSetup';
import type { Trip } from '../travel/tripCsv';

export function useBase(): string {
  const airline = useAppSelector(s => s.auth.airline);
  return airlineByCode(airline ?? '').portalConfig?.baseAirport ?? 'BKK';
}

export function useAlarms(now: Date): { byTrip: Record<string, EffectiveAlarm>; all: EffectiveAlarm[] } {
  const trips = useAppSelector(s => s.trips.trips);
  const wake = useAppSelector(s => s.alarms.wakeUpHours);
  const leave = useAppSelector(s => s.alarms.leaveHomeHours);
  const overrides = useAppSelector(s => s.alarms.overrides);
  return useMemo(() => alarmsByTrip(trips, wake, leave, overrides, now), [trips, wake, leave, overrides, now]);
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
  const { byTrip } = useAlarms(now);
  return useMemo(
    () => buildMonth(year, monthIdx, trips, duties, meetings, mode, baseTz, byTrip, now),
    [year, monthIdx, trips, duties, meetings, mode, baseTz, byTrip, now],
  );
}
