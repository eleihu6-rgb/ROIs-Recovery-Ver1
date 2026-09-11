import { NativeModules, Platform } from 'react-native';
import type { DutyAlarm } from './alarmSetup';

// Bridge to the native AlarmModule (Swift / AlarmKit, iOS 26+). Falls back to a
// clear error if the native module isn't available (Android, iOS < 26, or a
// build that predates the native module).

interface AlarmNativeModule {
  requestAuthorization(): Promise<'authorized' | 'denied'>;
  scheduleAlarm(payload: {
    id: string;
    title: string;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
    timeZone: string;
  }): Promise<string>;
  removeAllAlarms(): Promise<number>;
  removeAlarm(alarmId: string): Promise<void>;
  getScheduledAlarms(): Promise<Array<{ id: string; state: string }>>;
}

const native: AlarmNativeModule | undefined = NativeModules.AlarmModule;

export function isAlarmModuleAvailable(): boolean {
  return Platform.OS === 'ios' && native != null;
}

export async function requestAlarmAuthorization(): Promise<'authorized' | 'denied'> {
  if (!native) {
    throw new Error('Alarms require iOS 26 or later.');
  }
  return native.requestAuthorization();
}

export async function removeAllAlarms(): Promise<number> {
  if (!native) {
    return 0;
  }
  return native.removeAllAlarms();
}

export interface ScheduledItem {
  id: string;
  /** 'wake' = Wake Up, 'leave' = Leave Home. */
  type: 'wake' | 'leave';
  title: string;
  /** Local fire time for display, e.g. "03 Jun 07:00". */
  whenLocal: string;
  timeZone: string;
}

interface ScheduleSummary {
  scheduled: number;
  /** Alarms skipped because their fire time is already in the past. */
  skippedPast: number;
  ids: string[];
  /** The alarms actually scheduled, for in-app display. */
  items: ScheduledItem[];
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function whenLabel(local: { month: number; day: number; hour: number; minute: number }): string {
  return `${pad(local.day)} ${MONTHS[local.month - 1]} ${pad(local.hour)}:${pad(local.minute)}`;
}

// An alarm must fire at least this far in the future; AlarmKit rejects a fixed
// alarm whose date is at/behind "now" (surfaces as "AlarmKit.Alarm error 0").
const MIN_LEAD_MS = 60_000;

function isFuture(instant: Date | string): boolean {
  return new Date(instant).getTime() > Date.now() + MIN_LEAD_MS;
}

/**
 * Schedule the Wake Up + Leave Home alarms for the given duties. Per the spec,
 * existing alarms are removed first. Alarms whose fire time has already passed
 * are skipped (you can't set an alarm in the past). Returns counts.
 */
export async function scheduleDutyAlarms(
  alarms: DutyAlarm[],
  which: { wakeUp: boolean; leaveHome: boolean } = { wakeUp: true, leaveHome: true },
): Promise<ScheduleSummary> {
  if (!native) {
    throw new Error('Alarms require iOS 26 or later.');
  }

  // Delete all existing alarms before setting up (Clock Setup Ver1 test note).
  await native.removeAllAlarms();

  const ids: string[] = [];
  const items: ScheduledItem[] = [];
  let skippedPast = 0;
  for (const a of alarms) {
    if (which.wakeUp) {
      if (isFuture(a.wakeUp.instant)) {
        const id = await native.scheduleAlarm({
          id: `${a.dutyId}-wake`,
          title: a.wakeUpLabel,
          year: a.wakeUp.local.year,
          month: a.wakeUp.local.month,
          day: a.wakeUp.local.day,
          hour: a.wakeUp.local.hour,
          minute: a.wakeUp.local.minute,
          timeZone: a.timeZone,
        });
        ids.push(id);
        items.push({
          id,
          type: 'wake',
          title: a.wakeUpLabel,
          whenLocal: whenLabel(a.wakeUp.local),
          timeZone: a.timeZone,
        });
      } else {
        skippedPast++;
      }
    }
    if (which.leaveHome) {
      if (isFuture(a.leaveHome.instant)) {
        const id = await native.scheduleAlarm({
          id: `${a.dutyId}-leave`,
          title: a.leaveHomeLabel,
          year: a.leaveHome.local.year,
          month: a.leaveHome.local.month,
          day: a.leaveHome.local.day,
          hour: a.leaveHome.local.hour,
          minute: a.leaveHome.local.minute,
          timeZone: a.timeZone,
        });
        ids.push(id);
        items.push({
          id,
          type: 'leave',
          title: a.leaveHomeLabel,
          whenLocal: whenLabel(a.leaveHome.local),
          timeZone: a.timeZone,
        });
      } else {
        skippedPast++;
      }
    }
  }

  return { scheduled: ids.length, skippedPast, ids, items };
}

/**
 * Schedule alarms from a pre-computed EffectiveAlarm list (which already has
 * per-duty overrides applied and null for disabled alarms). Removes all existing
 * alarms first, then schedules only the non-null, future-dated ones.
 */
export async function scheduleEffectiveAlarms(
  alarms: import('./alarmSetup').EffectiveAlarm[],
): Promise<ScheduleSummary> {
  if (!native) {
    throw new Error('Alarms require iOS 26 or later.');
  }
  await native.removeAllAlarms();

  const ids: string[] = [];
  const items: ScheduledItem[] = [];
  let skippedPast = 0;

  for (const a of alarms) {
    if (a.wakeUp) {
      if (isFuture(a.wakeUp.instant)) {
        const id = await native.scheduleAlarm({
          id: `${a.dutyId}-wake`,
          title: a.wakeUpLabel,
          year: a.wakeUp.local.year,
          month: a.wakeUp.local.month,
          day: a.wakeUp.local.day,
          hour: a.wakeUp.local.hour,
          minute: a.wakeUp.local.minute,
          timeZone: a.timeZone,
        });
        ids.push(id);
        items.push({ id, type: 'wake', title: a.wakeUpLabel, whenLocal: whenLabel(a.wakeUp.local), timeZone: a.timeZone });
      } else {
        skippedPast++;
      }
    }
    if (a.leaveHome) {
      if (isFuture(a.leaveHome.instant)) {
        const id = await native.scheduleAlarm({
          id: `${a.dutyId}-leave`,
          title: a.leaveHomeLabel,
          year: a.leaveHome.local.year,
          month: a.leaveHome.local.month,
          day: a.leaveHome.local.day,
          hour: a.leaveHome.local.hour,
          minute: a.leaveHome.local.minute,
          timeZone: a.timeZone,
        });
        ids.push(id);
        items.push({ id, type: 'leave', title: a.leaveHomeLabel, whenLocal: whenLabel(a.leaveHome.local), timeZone: a.timeZone });
      } else {
        skippedPast++;
      }
    }
  }

  return { scheduled: ids.length, skippedPast, ids, items };
}

/** How many alarms iOS currently has registered for this app (source of truth). */
export async function getScheduledAlarmCount(): Promise<number> {
  if (!native) {
    return 0;
  }
  const list = await native.getScheduledAlarms();
  return list.length;
}

export interface TestAlarmResult {
  id: string;
  /** Absolute epoch-ms the test alarm is scheduled to fire (for a countdown). */
  fireAt: number;
}

/**
 * Schedule a one-off test alarm a given number of seconds from now (device-local
 * time, second-precise) so the AlarmKit alert can be observed firing. Returns the
 * alarm id and the exact fire time for an in-app countdown.
 */
export async function scheduleTestAlarm(secondsFromNow = 60): Promise<TestAlarmResult> {
  if (!native) {
    throw new Error('Alarms require iOS 26 or later.');
  }
  const fireAt = Date.now() + secondsFromNow * 1_000;
  const when = new Date(fireAt);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const id = await native.scheduleAlarm({
    id: `test-${fireAt}`,
    title: 'Royce test alarm',
    year: when.getFullYear(),
    month: when.getMonth() + 1,
    day: when.getDate(),
    hour: when.getHours(),
    minute: when.getMinutes(),
    second: when.getSeconds(),
    timeZone,
  });
  return { id, fireAt };
}
