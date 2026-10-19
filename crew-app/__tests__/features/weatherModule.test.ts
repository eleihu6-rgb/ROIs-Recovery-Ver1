import { weatherDateKey, weatherTimeZone } from '../../src/features/weather/weatherModule';

jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'ios', select: (values: Record<string, unknown>) => values.ios },
}));

describe('WeatherKit roster-date helpers', () => {
  it('uses the roster base time zone, including the PR MNL base', () => {
    expect(weatherTimeZone('mnl')).toBe('Asia/Manila');
    expect(weatherTimeZone('BKK')).toBe('Asia/Bangkok');
    expect(weatherTimeZone('ADD')).toBe('Africa/Addis_Ababa');
  });

  it('builds the same zero-padded local date key as the native forecast bridge', () => {
    expect(weatherDateKey(2026, 0, 2)).toBe('2026-01-02');
    expect(weatherDateKey(2026, 9, 17)).toBe('2026-10-17');
  });
});
