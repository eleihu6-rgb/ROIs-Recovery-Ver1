import { useCallback, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import { positionOf } from '../v2/schedView';
import { airportZone } from '../settings/airportZones';

export interface AppleDailyWeather {
  date: string;
  symbolName: string;
  condition: string;
  highC: number;
  lowC: number;
}

export interface AppleWeatherAttribution {
  serviceName: string;
  legalPageURL: string;
  combinedMarkDarkURL: string;
  combinedMarkLightURL: string;
}

export interface AppleWeatherResponse {
  days: AppleDailyWeather[];
  attribution: AppleWeatherAttribution;
  hours?: Array<{ date: string; hour: number; symbolName: string; temperatureC: number }>;
}

type WeatherNativeModule = {
  getDailyWeather(latitude: number, longitude: number, timeZone: string): Promise<AppleWeatherResponse>;
};

const native: WeatherNativeModule | undefined = NativeModules.WeatherModule;
const cache = new Map<string, { response: AppleWeatherResponse; fetchedAt: number }>();
const MAX_AGE_MS = 30 * 60 * 1000;

// airportZones predates the PR portal and does not yet contain MNL. Keep the
// WeatherKit correction local until the shared table can be changed separately.
const WEATHER_BASE_ZONE: Record<string, string> = { MNL: 'Asia/Manila' };

export function weatherTimeZone(base: string): string {
  const normalized = base.trim().toUpperCase();
  return WEATHER_BASE_ZONE[normalized] ?? airportZone(normalized);
}

export function weatherDateKey(year: number, monthIdx: number, day: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface AppleWeatherState {
  base: string;
  status: 'loading' | 'ready' | 'unavailable' | 'out-of-range';
  day: AppleDailyWeather | null;
  outlook: AppleDailyWeather[];
  hours: NonNullable<AppleWeatherResponse['hours']>;
  attribution: AppleWeatherAttribution | null;
  retry: () => void;
}

export function useAppleWeather(base: string, year: number, monthIdx: number, day: number | null): AppleWeatherState {
  const cacheKey = base.trim().toUpperCase();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ base: string; response: AppleWeatherResponse | null; loading: boolean }>({ base: cacheKey, response: null, loading: true });
  const retry = useCallback(() => { cache.delete(cacheKey); setAttempt(value => value + 1); }, [cacheKey]);
  useEffect(() => {
    const point = positionOf(cacheKey);
    if (!point || Platform.OS !== 'ios' || !native) {
      setState({ base: cacheKey, response: null, loading: false });
      return;
    }
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) {
      setState({ base: cacheKey, response: cached.response, loading: false });
      return;
    }
    let live = true;
    setState({ base: cacheKey, response: null, loading: true });
    native.getDailyWeather(point.lat, point.lon, weatherTimeZone(cacheKey)).then(response => {
      cache.set(cacheKey, { response, fetchedAt: Date.now() });
      if (live) setState({ base: cacheKey, response, loading: false });
    }).catch(() => {
      if (live) setState({ base: cacheKey, response: null, loading: false });
    });
    return () => { live = false; };
  }, [cacheKey, attempt]);
  // Never render the previous airline/base's weather, even for one render.
  const response = state.base === cacheKey ? state.response : null;
  const key = day == null ? '' : weatherDateKey(year, monthIdx, day);
  const selected = response?.days.find(row => row.date === key) ?? null;
  return {
    base: cacheKey,
    status: state.base !== cacheKey || state.loading ? 'loading' : !response ? 'unavailable' : !selected ? 'out-of-range' : 'ready',
    day: selected,
    outlook: response?.days.filter(row => row.date >= key).slice(0, 7) ?? [],
    hours: response?.hours?.filter(row => row.date === key) ?? [],
    attribution: response?.attribution ?? null,
    retry,
  };
}
