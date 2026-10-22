import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { CarrierPalette } from '../../theme/carrier';
import { font, space } from '../../theme';
import type { AppleWeatherAttribution, AppleWeatherState } from './weatherModule';

/** Outline weather glyphs driven by the actual WeatherKit condition symbol. */
export function WeatherSymbol({ symbol, color }: { symbol: string; color: string }) {
  const rain = /rain|drizzle|sleet/.test(symbol);
  const cloud = /cloud|fog|smoke|haze/.test(symbol);
  const snow = /snow|hail/.test(symbol);
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    {cloud || rain || snow ? <Path d="M6 16a4 4 0 0 1-1-7.9A6 6 0 0 1 16.5 7a4.5 4.5 0 0 1 1 9H6Z" /> : /moon/.test(symbol) ? <Path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z" /> : <><Circle cx={12} cy={12} r={4} /><Path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
    {rain ? <Path d="m7 19-1 3m6-3-1 3m6-3-1 3" /> : null}
    {snow ? <Path d="M8 19v3m-1.5-1.5h3M16 19v3m-1.5-1.5h3" /> : null}
    {/bolt/.test(symbol) ? <Path d="m13 13-3 5h4l-2 5" /> : null}
  </Svg>;
}

export function WeatherAttribution({
  attribution,
  lightMark,
  compact = false,
  testID,
}: {
  attribution: AppleWeatherAttribution;
  lightMark: boolean;
  compact?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      style={s.attribution}
      accessibilityRole="link"
      accessibilityLabel="Apple Weather legal attribution"
      testID={testID}
      onPress={() => { void Linking.openURL(attribution.legalPageURL); }}
    >
      <Image
        resizeMode="contain"
        source={{ uri: lightMark ? attribution.combinedMarkLightURL : attribution.combinedMarkDarkURL }}
        style={compact ? s.markCompact : s.mark}
      />
    </Pressable>
  );
}

export function WeatherStrip({ weather, palette: p }: { weather: AppleWeatherState; palette: CarrierPalette }) {
  if (weather.status !== 'ready') return <View testID="cal-weather-status" style={s.status}>
    <Text style={[s.caption, { color: p.inkSoft }]}>{weather.status === 'loading' ? 'Loading Apple Weather…' : weather.status === 'out-of-range' ? 'No forecast for this date' : `Weather unavailable${weather.base ? ` · ${weather.base}` : ''}`}</Text>
    {weather.status === 'unavailable' ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Apple Weather" onPress={weather.retry} testID="cal-weather-retry"><Text style={[s.caption, { color: p.ink, textDecorationLine: 'underline' }]}>Retry</Text></Pressable> : null}
  </View>;
  return <View testID="cal-day-weather" style={s.wrap}>
    <View style={s.status}><Text style={[s.caption, { color: p.inkSoft }]}>{`${weather.base} · ${weather.day?.condition} · ${Math.round(weather.day?.lowC ?? 0)}–${Math.round(weather.day?.highC ?? 0)}°C`}</Text></View>
    <View style={s.outlook}>{weather.outlook.map(day => <View key={day.date} style={s.day} accessibilityLabel={`${day.date}, ${day.condition}, ${Math.round(day.highC)} degrees Celsius`}>
      <WeatherSymbol symbol={day.symbolName} color={p.ink} />
      <Text style={[s.caption, { color: p.inkSoft }]}>{new Date(`${day.date}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })}</Text>
      <Text style={[s.temperature, { color: p.ink }]}>{`${Math.round(day.highC)}°`}</Text>
    </View>)}</View>
    {weather.attribution ? (
      <WeatherAttribution
        attribution={weather.attribution}
        lightMark={!p.isLight}
        testID="cal-weather-attribution"
      />
    ) : null}
  </View>;
}
const s = StyleSheet.create({
  wrap: { gap: space.xs4 }, status: { flexDirection: 'row', gap: space.sm8, alignItems: 'center', minHeight: 28 },
  outlook: { flexDirection: 'row', gap: space.xs4 }, day: { flex: 1, alignItems: 'center', gap: space.xs4 },
  caption: { ...font.caption, flexShrink: 1 }, temperature: { ...font.bodyStrong },
  attribution: { alignSelf: 'flex-end', minHeight: 24, justifyContent: 'center' },
  mark: { width: 80, height: 16 },
  markCompact: { width: 42, height: 12 },
});
