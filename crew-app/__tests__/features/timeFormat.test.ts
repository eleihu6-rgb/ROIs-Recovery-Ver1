import { formatLegTime, parseRosterUTC } from '../../src/features/settings/timeFormat';

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
