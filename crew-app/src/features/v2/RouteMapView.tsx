// Schedule tab ▸ Roster view ▸ Route map (mock Ver11).
//
// Where the month's flying went: every destination reached from the crew's base
// drawn as a great-circle line over a light-on-dark world outline, with the
// month's numbers underneath (flights / distance / block / duty, plus routes /
// airports / countries).
//
// The map is drawn from `worldLand.ts` (generated Natural Earth 110m outline,
// web-Mercator) rather than a tile SDK on purpose: no Mapbox token, no native
// map module, and it renders offline — so it works the same for API-backed
// carriers (ET/F8) and portal-captured ones (TG/PR). Coordinates come from the
// airline's own `airport` table via `airportCoords.ts`.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Line, G } from 'react-native-svg';
import { Icon } from '../../components/v2/icons';
import type { CarrierPalette } from '../../theme/carrier';
import { MON, type MonthModel } from './model';
import {
  formatHM,
  formatKm,
  greatCirclePath,
  mercatorX,
  mercatorY,
  monthRoutes,
  monthStats,
  positionOf,
  routeViewBox,
} from './schedView';
import { WORLD_LAND_PATHS } from './worldLand';

const MAP_HEIGHT = 240;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export interface RouteMapViewProps {
  month: MonthModel;
  base: string;
  palette: CarrierPalette;
}

export function RouteMapView({ month, base, palette: p }: RouteMapViewProps): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [focused, setFocused] = useState<string | null>(null);
  const home = useMemo(() => positionOf(base), [base]);
  const routes = useMemo(() => monthRoutes(month, base), [month, base]);
  const stats = useMemo(() => monthStats(month, base), [month, base]);

  if (!home || routes.length === 0) {
    return (
      <ScrollView contentContainerStyle={s.wrap} testID="route-empty">
        <StatsCard stats={stats} month={month} palette={p} />
        <Text style={[s.empty, { color: p.inkSoft }]}>
          {month.flightCount === 0 ? `No flights published for ${MON[month.monthIdx]} ${month.year}` : 'No airport coordinates for this month’s routes yet'}
        </Text>
      </ScrollView>
    );
  }

  const viewBox = routeViewBox(home, routes.map(r => r.position), zoom);
  const selected = routes.find(r => r.code === focused) ?? null;
  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} testID="route-view">
      <View style={[s.mapCard, { backgroundColor: p.g1, borderColor: p.frostLine }]} testID="route-map">
        <Svg width="100%" height={MAP_HEIGHT} viewBox={viewBox} testID="route-svg">
          <G opacity={0.9}>
            {WORLD_LAND_PATHS.map((d, i) => (
              <Path key={`land-${i}`} d={d} fill={p.g4} fillOpacity={0.34} stroke={p.frostLine} strokeWidth={0.4} />
            ))}
          </G>
          {graticule(viewBox, p.inkFaint)}
          {routes.map(r => (
            <Path
              key={`line-${r.code}`}
              d={greatCirclePath(home, r.position)}
              fill="none"
              stroke={selected && selected.code !== r.code ? p.g4 : p.dockLight}
              strokeOpacity={selected && selected.code !== r.code ? 0.45 : 0.95}
              strokeWidth={selected?.code === r.code ? 2.6 : 1.6}
            />
          ))}
          {routes.map(r => (
            <G key={`mark-${r.code}`}>
              <Circle cx={mercatorX(r.position.lon)} cy={mercatorY(r.position.lat)} r={selected?.code === r.code ? 5 : 3.4} fill={p.dockLight} />
              <Circle cx={mercatorX(r.position.lon)} cy={mercatorY(r.position.lat)} r={9} fill="none" stroke={p.dockLight} strokeOpacity={selected?.code === r.code ? 0.9 : 0} strokeWidth={1} />
            </G>
          ))}
          {/* The crew's own base is the one filled hub every line starts from. */}
          <Circle cx={mercatorX(home.lon)} cy={mercatorY(home.lat)} r={6} fill={p.dockInk} stroke={p.dockLight} strokeWidth={2} />
        </Svg>
        {/* Base + selected-airport labels ride on the map, not in a legend. */}
        <View style={s.mapBadge} pointerEvents="none">
          <Text style={s.mapBadgeText}>{`${base.toUpperCase()} · BASE`}</Text>
        </View>
        {selected ? (
          <View style={[s.mapBadge, s.mapBadgeBottom]} pointerEvents="none">
            <Text style={s.mapBadgeText}>{`${selected.code} · ${formatKm(selected.km)} · ${selected.legs} leg${selected.legs > 1 ? 's' : ''}`}</Text>
          </View>
        ) : null}
        <View style={s.zoomCol}>
          <Pressable onPress={() => setZoom(z => Math.min(MAX_ZOOM, z + 1))} testID="route-zoom-in" style={[s.zoomBtn, { backgroundColor: p.card }]} accessibilityLabel="Zoom in">
            <Icon name="zoomIn" size={18} color={p.cardInk} />
          </Pressable>
          <Pressable onPress={() => setZoom(z => Math.max(MIN_ZOOM, z - 1))} testID="route-zoom-out" style={[s.zoomBtn, { backgroundColor: p.card }]} accessibilityLabel="Zoom out">
            <Icon name="zoomOut" size={18} color={p.cardInk} />
          </Pressable>
        </View>
      </View>

      <StatsCard stats={stats} month={month} palette={p} />

      <Text style={[s.listHead, { color: p.inkSoft }]}>Routes</Text>
      {routes.map(r => (
        <Pressable
          key={r.code}
          onPress={() => setFocused(f => (f === r.code ? null : r.code))}
          testID={`route-${r.code}`}
          style={[s.routeRow, { backgroundColor: p.card, borderColor: focused === r.code ? p.btn : p.cardLine }]}
        >
          <View style={[s.routeCode, { backgroundColor: 'rgba(255,255,255,0.72)' }]}>
            <Text style={[s.routeCodeText, { color: p.btn }]}>{r.code}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.routeTitle, { color: p.cardInk }]} numberOfLines={1}>
              {`${base.toUpperCase()} → ${r.code}`}
            </Text>
            <Text style={[s.routeSub, { color: p.cardSoft }]} numberOfLines={1}>
              {r.label}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.routeKm, { color: p.cardInk }]}>{formatKm(r.km)}</Text>
            <Text style={[s.routeSub, { color: p.cardSoft }]}>{`${r.legs} leg${r.legs > 1 ? 's' : ''}`}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function StatsCard({ stats, month, palette: p }: { stats: ReturnType<typeof monthStats>; month: MonthModel; palette: CarrierPalette }): React.JSX.Element {
  const cells: Array<[string, string]> = [
    [String(stats.flights), 'Flights'],
    // Distances are long; the unit lives in the label so four cells fit one row.
    [Math.round(stats.km).toLocaleString('en-US'), 'Distance km'],
    [formatHM(stats.blockMinutes), 'Block'],
    [formatHM(stats.dutyMinutes), 'Duty'],
  ];
  const rows: Array<[string, string]> = [
    ['Routes', String(stats.routes)],
    ['Airports', String(stats.airports)],
    ['Countries', String(stats.countries)],
  ];
  return (
    <View style={[s.stats, { backgroundColor: p.card, borderColor: p.cardLine }]} testID="route-stats">
      <Text style={[s.statsTitle, { color: p.cardSoft }]}>{`${MON[month.monthIdx]} ${month.year} summary`}</Text>
      <View style={s.statsGrid}>
        {cells.map(([value, label]) => (
          <View key={label} style={s.statsCell}>
            <Text style={[s.statsValue, { color: p.cardInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
            <Text style={[s.statsLabel, { color: p.cardSoft }]}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={[s.statsRows, { borderTopColor: p.cardLine }]}>
        {rows.map(([label, value]) => (
          <View key={label} style={[s.statsRow, { borderBottomColor: p.cardLine }]}>
            <Text style={[s.statsRowLabel, { color: p.cardSoft }]}>{label}</Text>
            <Text style={[s.statsRowValue, { color: p.cardInk }]}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Faint 30°/30° graticule inside the current view box — reads as a chart, not a void. */
function graticule(viewBox: string, color: string): React.JSX.Element[] {
  const [x, y, w, h] = viewBox.split(' ').map(Number);
  const lines: React.JSX.Element[] = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const gx = mercatorX(lon);
    if (gx >= x && gx <= x + w) {
      lines.push(<Line key={`gx-${lon}`} x1={gx} y1={y} x2={gx} y2={y + h} stroke={color} strokeWidth={0.4} strokeOpacity={0.35} />);
    }
  }
  for (let lat = -60; lat <= 75; lat += 15) {
    const gy = mercatorY(lat);
    if (gy >= y && gy <= y + h) {
      lines.push(<Line key={`gy-${lat}`} x1={x} y1={gy} x2={x + w} y2={gy} stroke={color} strokeWidth={0.4} strokeOpacity={0.35} />);
    }
  }
  return lines;
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 130, gap: 10 },
  mapCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  mapBadge: { position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 0 },
  mapBadgeBottom: { top: undefined, bottom: 10 },
  mapBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  zoomCol: { position: 'absolute', right: 8, bottom: 8, gap: 8 },
  zoomBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stats: { borderRadius: 16, borderWidth: 1, padding: 14 },
  statsTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', marginTop: 10, gap: 8 },
  statsCell: { flex: 1, minWidth: 0 },
  statsValue: { fontSize: 16, fontWeight: '700' },
  statsLabel: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 },
  statsRows: { marginTop: 12, borderTopWidth: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  statsRowLabel: { fontSize: 13 },
  statsRowValue: { fontSize: 13, fontWeight: '600' },
  listHead: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, marginTop: 6 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 10 },
  routeCode: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeCodeText: { fontSize: 13, fontWeight: '700' },
  routeTitle: { fontSize: 14, fontWeight: '600' },
  routeSub: { fontSize: 12, marginTop: 2 },
  routeKm: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 22 },
});
