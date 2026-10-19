jest.mock('react-native', () => {
  const ReactNative = jest.requireActual('react-native');
  ReactNative.NativeModules.WeatherModule = { getDailyWeather: jest.fn() };
  return ReactNative;
});

import React from 'react';
import { NativeModules } from 'react-native';
import { Path } from 'react-native-svg';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { PALETTES } from '../../src/theme/carrier';
import { WeatherStrip } from '../../src/features/weather/WeatherStrip';
import {
  useAppleWeather,
  type AppleWeatherResponse,
} from '../../src/features/weather/weatherModule';

const getDailyWeather = NativeModules.WeatherModule.getDailyWeather as jest.MockedFunction<
  (latitude: number, longitude: number, timeZone: string) => Promise<AppleWeatherResponse>
>;

const attribution = {
  serviceName: 'Apple Weather',
  legalPageURL: 'https://weatherkit.apple.com/legal-attribution.html',
  combinedMarkDarkURL: 'https://example.test/dark.png',
  combinedMarkLightURL: 'https://example.test/light.png',
};

function forecast(startDay: number, count: number): AppleWeatherResponse {
  return {
    attribution,
    days: Array.from({ length: count }, (_, index) => {
      const day = startDay + index;
      return {
        date: `2026-10-${String(day).padStart(2, '0')}`,
        symbolName: index % 2 === 0 ? 'cloud.sun.fill' : 'cloud.rain.fill',
        condition: index % 2 === 0 ? 'Partly Cloudy' : 'Rain',
        highC: 30 + index,
        lowC: 23 + index,
      };
    }),
    hours: [
      { date: '2026-10-14', hour: 8, symbolName: 'sun.max.fill', temperatureC: 28 },
      { date: '2026-10-15', hour: 8, symbolName: 'cloud.fill', temperatureC: 27 },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('calendar Apple Weather state', () => {
  beforeEach(() => getDailyWeather.mockReset());

  it('recovers from native failure when the crew retries', async () => {
    getDailyWeather.mockRejectedValueOnce(new Error('WeatherKit unavailable'))
      .mockResolvedValueOnce(forecast(14, 3));
    const { result } = renderHook(() => useAppleWeather('BKK', 2026, 9, 14));

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.day).toBeNull();
    expect(result.current.outlook).toEqual([]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getDailyWeather).toHaveBeenCalledTimes(2);
    expect(result.current.day?.condition).toBe('Partly Cloudy');
  });

  it('reuses the pending forecast when the selected date changes', async () => {
    const pending = deferred<AppleWeatherResponse>();
    getDailyWeather.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ day }) => useAppleWeather('SIN', 2026, 9, day),
      { initialProps: { day: 14 } },
    );
    rerender({ day: 15 });
    expect(getDailyWeather).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(forecast(14, 3)); });
    expect(result.current.day?.date).toBe('2026-10-15');
  });

  it('reports out-of-range when the selected roster date is absent', async () => {
    getDailyWeather.mockResolvedValue(forecast(14, 2));
    const { result } = renderHook(() => useAppleWeather('MNL', 2026, 9, 16));

    await waitFor(() => expect(result.current.status).toBe('out-of-range'));
    expect(result.current.day).toBeNull();
    expect(result.current.outlook).toEqual([]);
  });

  it('clears prior-base weather immediately and ignores its late response', async () => {
    const oldBase = deferred<AppleWeatherResponse>();
    const newBase = deferred<AppleWeatherResponse>();
    getDailyWeather.mockReturnValueOnce(oldBase.promise).mockReturnValueOnce(newBase.promise);
    const { result, rerender } = renderHook(
      ({ base }) => useAppleWeather(base, 2026, 9, 14),
      { initialProps: { base: 'TPE' } },
    );

    await waitFor(() => expect(getDailyWeather).toHaveBeenCalledTimes(1));
    rerender({ base: 'HKG' });
    expect(result.current.status).toBe('loading');
    expect(result.current.base).toBe('HKG');
    expect(result.current.day).toBeNull();
    expect(result.current.attribution).toBeNull();
    await waitFor(() => expect(getDailyWeather).toHaveBeenCalledTimes(2));

    await act(async () => { oldBase.resolve(forecast(14, 1)); });
    expect(result.current.status).toBe('loading');
    expect(result.current.day).toBeNull();

    await act(async () => { newBase.resolve(forecast(14, 1)); });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.base).toBe('HKG');
    expect(result.current.day?.condition).toBe('Partly Cloudy');
  });

  it('caps the selected-day outlook at seven entries and keeps only that date’s hours', async () => {
    getDailyWeather.mockResolvedValue(forecast(10, 15));
    const { result } = renderHook(() => useAppleWeather('DXB', 2026, 9, 14));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.outlook).toHaveLength(7);
    expect(result.current.outlook[0].date).toBe('2026-10-14');
    expect(result.current.outlook[6].date).toBe('2026-10-20');
    expect(result.current.hours).toEqual([
      { date: '2026-10-14', hour: 8, symbolName: 'sun.max.fill', temperatureC: 28 },
    ]);
  });

  it('shows the condition glyph, weekly outlook, attribution, and retry action', async () => {
    getDailyWeather.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(forecast(14, 8));
    const hook = renderHook(() => useAppleWeather('ADD', 2026, 9, 14));
    const unavailable = render(<WeatherStrip weather={hook.result.current} palette={PALETTES.light} />);
    await waitFor(() => expect(hook.result.current.status).toBe('unavailable'));
    unavailable.rerender(<WeatherStrip weather={hook.result.current} palette={PALETTES.light} />);
    expect(unavailable.getByText('Weather unavailable · ADD')).toBeTruthy();
    fireEvent.press(unavailable.getByTestId('cal-weather-retry'));

    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    unavailable.rerender(<WeatherStrip weather={hook.result.current} palette={PALETTES.light} />);
    expect(unavailable.getByTestId('cal-day-weather')).toBeTruthy();
    expect(unavailable.getByText('ADD · Partly Cloudy · 23–30°C')).toBeTruthy();
    expect(unavailable.getByTestId('cal-weather-attribution')).toBeTruthy();
    expect(unavailable.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)).toHaveLength(7);
    expect(unavailable.getAllByText(/^\d+°$/)).toHaveLength(7);
    expect(unavailable.UNSAFE_getAllByType(Path).length).toBeGreaterThanOrEqual(7);
  });
});
