import { formatLegTime, legDisplayDate, deviceTimeZone } from '../../src/features/settings/timeFormat';

// ─── "Phone Local Time" display mode (device timezone) ────────────────────────
// New TimeZoneMode 'device' shows every flight/duty/meeting time in the phone's
// own timezone. These tests pin the conversion assuming the phone is UTC+8
// (Asia/Singapore — fixed +8, no DST), injected via opts.deviceTz so the result
// is deterministic regardless of where the test host runs.

const PHONE_TZ = 'Asia/Singapore'; // UTC+8 year-round

describe('formatLegTime — device (phone local) mode, phone = UTC+8', () => {
  // Every display in the app (flight legs, check-in, ground duties, meeting
  // cards, postcards) routes through formatLegTime/legDisplayDate, so pinning
  // these covers "all timing displays".
  it('converts a UTC instant into +8 wall clock', () => {
    // 17:30 UTC + 8h = 01:30 the next day.
    expect(
      formatLegTime({ flightDateUTC: '20 Jun 2026 1730', mode: 'device', baseTz: 'Asia/Bangkok', deviceTz: PHONE_TZ }),
    ).toBe('21 Jun 01:30');
  });

  it('handles a same-day instant', () => {
    // 02:00 UTC + 8h = 10:00 same day.
    expect(
      formatLegTime({ flightDateUTC: '21 Jun 2026 0200', mode: 'device', baseTz: 'Asia/Bangkok', deviceTz: PHONE_TZ }),
    ).toBe('21 Jun 10:00');
  });

  it('rolls the date forward across midnight (+8)', () => {
    // 20:05 UTC + 8h = 04:05 next day.
    expect(
      formatLegTime({ flightDateUTC: '03 Jun 2026 2005', mode: 'device', baseTz: 'Asia/Bangkok', deviceTz: PHONE_TZ }),
    ).toBe('04 Jun 04:05');
  });

  it('TG960 BKK→ARN: dep & arr both shown in +8', () => {
    // From the real fixture: dep 17:30 UTC (20 Jun), arr 05:25 UTC (21 Jun).
    expect(
      formatLegTime({ flightDateUTC: '20 Jun 2026 1730', mode: 'device', baseTz: 'Asia/Bangkok', deviceTz: PHONE_TZ }),
    ).toBe('21 Jun 01:30'); // dep in phone +8
    expect(
      formatLegTime({ flightDateUTC: '21 Jun 2026 0525', mode: 'device', baseTz: 'Asia/Bangkok', deviceTz: PHONE_TZ }),
    ).toBe('21 Jun 13:25'); // arr in phone +8
  });

  it('the display date follows the +8 wall clock (legDisplayDate)', () => {
    // 17:30 UTC 20 Jun → 01:30 21 Jun in +8, so the calendar day is the 21st.
    expect(
      legDisplayDate({ flightDateUTC: '20 Jun 2026 1730', mode: 'device', baseTz: 'Asia/Bangkok', deviceTz: PHONE_TZ }),
    ).toEqual({ year: 2026, monthIdx: 5, day: 21 });
  });

  it('deviceTimeZone() resolves a usable zone string', () => {
    expect(typeof deviceTimeZone()).toBe('string');
    expect(deviceTimeZone().length).toBeGreaterThan(0);
  });
});
