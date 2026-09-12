// User-facing copy for one "airline schedule → iOS Calendar" toggle result.
// Pure and shared by the v2 Schedule / Trip Details entry points and the legacy
// My Trips screen, so the same tap always tells the crew the same thing.
import type { Trip } from '../travel/tripCsv';
import type { CalendarSyncResult, CalendarToggleResult } from './flightCalendarSlice';

export interface CalendarToggleMessage {
  title: string;
  body: string;
}

/**
 * Map a `CalendarToggleResult` to the alert the crew sees. Returns `null` for
 * 'busy' — a tap already in flight, so the second tap stays quiet.
 */
export function describeCalendarToggle(
  result: CalendarToggleResult,
  trip: Pick<Trip, 'legs'>,
): CalendarToggleMessage | null {
  switch (result.status) {
    case 'added':
      return {
        title: 'Added to Calendar',
        body:
          `${result.count} entries added to your iPhone calendar — wake-up, leave home, ` +
          `check-in and ${trip.legs.length === 1 ? 'the flight' : 'each flight'}. ` +
          'Tap the icon again to remove them.',
      };
    case 'removed':
      return {
        title: 'Removed from Calendar',
        body: 'This duty is no longer in your iPhone calendar.',
      };
    case 'denied':
      return {
        title: 'Calendar access needed',
        body: 'Allow calendar access in iOS Settings → Privacy → Calendars to add your flights.',
      };
    case 'unavailable':
      return { title: 'Not available', body: 'Adding flights to the calendar needs iOS.' };
    case 'empty':
      return { title: 'Nothing to add', body: 'This duty has no usable departure time.' };
    case 'error':
      return {
        title: 'Could not update Calendar',
        body: result.message ?? 'Please try again.',
      };
    default:
      return null; // 'busy'
  }
}

/** "1 duty" / "3 duties". */
function duties(n: number): string {
  return `${n} dut${n === 1 ? 'y' : 'ies'}`;
}

/**
 * Copy for the Profile ▸ Preferences ▸ "iOS Calendar sync" switch (option B).
 * `null` only when there is genuinely nothing to say.
 */
export function describeCalendarSync(
  result: CalendarSyncResult,
): CalendarToggleMessage | null {
  const failed = result.failed > 0
    ? ` ${duties(result.failed)} could not be added (${result.message ?? 'unknown error'}).`
    : '';
  switch (result.status) {
    case 'enabled':
      return {
        title: 'Calendar sync on',
        body:
          `${result.added} entries added to your iPhone Calendar across ${duties(result.duties)}. ` +
          `New duties are added as your roster updates; turn this off to remove them all.${failed}`,
      };
    case 'in-sync':
      return {
        title: 'Already in sync',
        body:
          'Every upcoming duty is already in your iPhone Calendar. New ones will be added as your roster updates.' +
          failed,
      };
    case 'disabled':
      return {
        title: 'Calendar sync off',
        body: `${result.removed} entries removed from your iPhone Calendar.`,
      };
    case 'denied':
      return {
        title: 'Calendar access needed',
        body: 'Allow calendar access in iOS Settings → Privacy → Calendars to sync your schedule.',
      };
    case 'unavailable':
      return {
        title: 'Not available',
        body: 'Keeping your schedule in the calendar needs iOS.',
      };
    case 'error':
      return {
        title: 'Could not sync Calendar',
        body: result.message ?? 'Please try again.',
      };
    default:
      return null;
  }
}
