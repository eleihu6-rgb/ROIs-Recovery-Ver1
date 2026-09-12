// Copy for the "airline schedule → iOS Calendar" toggle, shared by the v2
// Schedule / Trip Details entry points and the legacy My Trips screen.
import { describeCalendarSync, describeCalendarToggle } from '../../src/features/calendar/dutyCalendarMessages';
import type { CalendarSyncResult, CalendarToggleResult } from '../../src/features/calendar/flightCalendarSlice';

const oneLeg = { legs: [{} as never] };
const threeLegs = { legs: [{}, {}, {}] as never[] };

const result = (over: Partial<CalendarToggleResult>): CalendarToggleResult =>
  ({ status: 'added', count: 0, ...over }) as CalendarToggleResult;

describe('describeCalendarToggle', () => {
  it('names how many entries landed and what they cover, per duty shape', () => {
    const single = describeCalendarToggle(result({ status: 'added', count: 4 }), oneLeg)!;
    expect(single.title).toBe('Added to Calendar');
    expect(single.body).toContain('4 entries');
    expect(single.body).toContain('the flight');

    const multi = describeCalendarToggle(result({ status: 'added', count: 6 }), threeLegs)!;
    expect(multi.body).toContain('each flight');
  });

  it('tells the crew how to undo it', () => {
    expect(describeCalendarToggle(result({ status: 'removed' }), oneLeg)!.title)
      .toBe('Removed from Calendar');
    expect(describeCalendarToggle(result({ status: 'added', count: 5 }), oneLeg)!.body)
      .toContain('Tap the icon again to remove them');
  });

  it('explains a denied permission, an unsupported platform and empty data', () => {
    expect(describeCalendarToggle(result({ status: 'denied' }), oneLeg)!.title)
      .toBe('Calendar access needed');
    expect(describeCalendarToggle(result({ status: 'unavailable' }), oneLeg)!.body)
      .toContain('needs iOS');
    expect(describeCalendarToggle(result({ status: 'empty' }), oneLeg)!.body)
      .toContain('no usable departure time');
  });

  it('surfaces the native error text when the write fails', () => {
    const failed = describeCalendarToggle(
      result({ status: 'error', message: 'No default iOS calendar is available to add flights to.' }),
      oneLeg,
    )!;
    expect(failed.title).toBe('Could not update Calendar');
    expect(failed.body).toContain('No default iOS calendar');
  });

  it('stays quiet on a second tap while a write is already in flight', () => {
    expect(describeCalendarToggle(result({ status: 'busy' }), oneLeg)).toBeNull();
  });
});

// ─── Option B: the Profile ▸ Preferences "iOS Calendar sync" master switch ───

const sync = (over: Partial<CalendarSyncResult>): CalendarSyncResult =>
  ({ status: 'enabled', added: 0, removed: 0, duties: 0, failed: 0, ...over });

describe('describeCalendarSync', () => {
  it('summarises what the bulk write put in the calendar', () => {
    const m = describeCalendarSync(sync({ added: 42, duties: 9 }))!;
    expect(m.title).toBe('Calendar sync on');
    expect(m.body).toContain('42 entries');
    expect(m.body).toContain('9 duties');
    expect(m.body).toContain('New duties are added as your roster updates');
  });

  it('singularises a one-duty sync', () => {
    expect(describeCalendarSync(sync({ added: 4, duties: 1 }))!.body).toContain('1 duty.');
  });

  it('says so when the calendar already matches the roster', () => {
    const m = describeCalendarSync(sync({ status: 'in-sync' }))!;
    expect(m.title).toBe('Already in sync');
    expect(m.body).toContain('already in your iPhone Calendar');
  });

  it('reports the removal count when switched off', () => {
    const m = describeCalendarSync(sync({ status: 'disabled', removed: 42 }))!;
    expect(m.title).toBe('Calendar sync off');
    expect(m.body).toContain('42 entries removed');
  });

  it('names the duties that failed without hiding the ones that landed', () => {
    const m = describeCalendarSync(sync({ added: 8, duties: 2, failed: 1, message: 'No default iOS calendar.' }))!;
    expect(m.body).toContain('8 entries');
    expect(m.body).toContain('1 duty could not be added (No default iOS calendar.)');
  });

  it('explains a refused permission, an unsupported platform and a failure', () => {
    expect(describeCalendarSync(sync({ status: 'denied' }))!.title).toBe('Calendar access needed');
    expect(describeCalendarSync(sync({ status: 'unavailable' }))!.body).toContain('needs iOS');
    expect(describeCalendarSync(sync({ status: 'error', message: 'boom' }))!.body).toBe('boom');
  });
});
