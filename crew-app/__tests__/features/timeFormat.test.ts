import {
  formatLegTime,
  hhmmForInstant,
  legDisplayDate,
  parseRosterUTC,
  wallClockInZone,
  withZoneSuffix,
  zoneSuffix,
} from '../../src/features/settings/timeFormat';

// Sample leg: 03 Jun 2026 0900 UTC == 16:00 Asia/Bangkok (UTC+7).
const flightDateUTC = '03 Jun 2026 0900';
const localTime = '2026-06-03 16:00';

describe('parseRosterUTC', () => {
  it('parses "DD MMM YYYY HHMM" as a real UTC instant', () => {
    const d = parseRosterUTC(flightDateUTC)!;
    expect(d.toISOString()).toBe('2026-06-03T09:00:00.000Z');
  });

  it('returns null for malformed input', () => {
    expect(parseRosterUTC('garbage')).toBeNull();
    expect(parseRosterUTC(undefined)).toBeNull();
  });
});

describe('formatLegTime', () => {
  it('airport mode uses the airport-local time when present', () => {
    expect(
      formatLegTime({ flightDateUTC, localTime, mode: 'airport', baseTz: 'Asia/Bangkok' }),
    ).toBe('03 Jun 16:00');
  });

  it('airport mode falls back to the UTC roster time for CSV legs (no local)', () => {
    expect(
      formatLegTime({ flightDateUTC, mode: 'airport', baseTz: 'Asia/Bangkok' }),
    ).toBe('03 Jun 09:00');
  });

  it('utc mode shows the UTC roster time', () => {
    expect(
      formatLegTime({ flightDateUTC, localTime, mode: 'utc', baseTz: 'Asia/Bangkok' }),
    ).toBe('03 Jun 09:00');
  });

  it('base mode converts the UTC instant into the base timezone (Bangkok = UTC+7)', () => {
    expect(
      formatLegTime({ flightDateUTC, localTime, mode: 'base', baseTz: 'Asia/Bangkok' }),
    ).toBe('03 Jun 16:00');
  });

  it('base mode handles a day rollover correctly', () => {
    // 03 Jun 2300 UTC + 7h => 04 Jun 06:00 Bangkok.
    expect(
      formatLegTime({ flightDateUTC: '03 Jun 2026 2300', mode: 'base', baseTz: 'Asia/Bangkok' }),
    ).toBe('04 Jun 06:00');
  });

  it('base mode honours a non-default base timezone (UTC)', () => {
    expect(
      formatLegTime({ flightDateUTC, mode: 'base', baseTz: 'UTC' }),
    ).toBe('03 Jun 09:00');
  });
});

// ─── Airport-local conversion + the L/B/Z marker (2026-09-11 convention) ──────
// ET877 ADD→LLW: STD 07:10Z == 10:10 airport-local (ADD = UTC+3), STA 11:10Z ==
// 13:10 LLW local (Africa/Blantyre = UTC+2, same zone as Lilongwe).
describe('airport-local display', () => {
  it('resolves the airport zone when the roster carries UTC only', () => {
    expect(
      formatLegTime({
        flightDateUTC: '11 Sep 2026 0710',
        mode: 'airport',
        baseTz: 'Africa/Addis_Ababa',
        airportTz: 'Africa/Addis_Ababa',
      }),
    ).toBe('11 Sep 10:10');
    expect(
      formatLegTime({
        flightDateUTC: '11 Sep 2026 1110',
        mode: 'airport',
        baseTz: 'Africa/Addis_Ababa',
        airportTz: 'Africa/Blantyre',
      }),
    ).toBe('11 Sep 13:10');
  });

  it('still prefers an explicit airport-local wall clock when the source has one', () => {
    expect(
      formatLegTime({
        flightDateUTC: '11 Sep 2026 0710',
        localTime: '2026-09-11 10:10',
        mode: 'airport',
        baseTz: 'Africa/Addis_Ababa',
        airportTz: 'Africa/Addis_Ababa',
      }),
    ).toBe('11 Sep 10:10');
  });

  it('legDisplayDate follows the same conversion (day rollover included)', () => {
    // 13 Sep 21:25Z is already 14 Sep 00:25 in Addis — airport mode must say 14 Sep.
    expect(
      legDisplayDate({
        flightDateUTC: '13 Sep 2026 2125',
        mode: 'airport',
        baseTz: 'Africa/Addis_Ababa',
        airportTz: 'Africa/Addis_Ababa',
      }),
    ).toEqual({ year: 2026, monthIdx: 8, day: 14 });
  });

  it('wallClockInZone renders the local calendar day a ground duty covers', () => {
    // A day-off row stored as 08 Sep 21:00Z – 09 Sep 20:59Z is the ADD day of 9 Sep.
    expect(wallClockInZone(new Date('2026-09-08T21:00:00.000Z'), 'Africa/Addis_Ababa'))
      .toBe('2026-09-09 00:00');
  });
});

describe('zone markers', () => {
  it('marks airport / base / UTC and leaves phone-local unmarked', () => {
    expect(zoneSuffix('airport')).toBe('L');
    expect(zoneSuffix('base')).toBe('B');
    expect(zoneSuffix('utc')).toBe('Z');
    expect(zoneSuffix('device')).toBe('');
  });

  it('appends the marker to a real time and never to a placeholder', () => {
    expect(withZoneSuffix('10:10', 'airport')).toBe('10:10L');
    expect(withZoneSuffix('13:10', 'base')).toBe('13:10B');
    expect(withZoneSuffix('07:10', 'utc')).toBe('07:10Z');
    expect(withZoneSuffix('—', 'airport')).toBe('—');
  });

  it('formats an instant in the zone the mode selects', () => {
    const instant = new Date('2026-09-11T07:10:00.000Z');
    expect(hhmmForInstant(instant, 'airport', 'Africa/Addis_Ababa', 'Africa/Addis_Ababa')).toBe('10:10L');
    expect(hhmmForInstant(instant, 'base', 'Africa/Addis_Ababa', 'Africa/Addis_Ababa')).toBe('10:10B');
    expect(hhmmForInstant(instant, 'utc', 'Africa/Addis_Ababa', 'Africa/Addis_Ababa')).toBe('07:10Z');
  });
});
