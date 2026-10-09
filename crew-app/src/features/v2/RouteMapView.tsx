// Schedule tab ▸ Roster view ▸ Route map (mock Ver11).
//
// Where the month's flying went: every destination reached from the crew's base
// drawn as a great-circle line over a light-on-dark world outline, with the
// month's numbers inside the map (flights / distance / block / duty, plus routes /
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
import { useLayout } from '../../components/v2/useLayout';
import type { CarrierPalette } from '../../theme/carrier';
import { MON, type MonthModel } from './model';
import {
  formatHM,
  formatKm,
  greatCirclePath,
  mercatorX,
  mercatorY,
  monthRoutes,
  monthLegs,
  monthStats,
  positionOf,
  routeViewBox,
  unwrapLon,
  MAP_ASPECT,
  MERCATOR_GRID,
} from './schedView';
import { WORLD_LAND_PATHS } from './worldLand';

const MAP_HEIGHT = 240;
/** Rotated Duo: map height as a share of the card width (~400pt on a 669pt window). */
const TALL_MAP_RATIO = 0.62;
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
  // The wide card is as tall as the screen allows: frame the map at its real
  // ratio so it fills the card instead of floating in a band.
  const [cardAspect, setCardAspect] = useState(MAP_ASPECT);
  // Guest demo trips have a real departure airport but no assigned crew base.
  // Use their first departure for this map only; do not claim it as their base
  // elsewhere in the app.
  const mapBase = useMemo(() => base || monthLegs(month)[0]?.dep || '', [base, month]);
  const home = useMemo(() => positionOf(mapBase), [mapBase]);
  const routes = useMemo(() => monthRoutes(month, mapBase), [month, mapBase]);
  const stats = useMemo(() => monthStats(month, mapBase), [month, mapBase]);
  // iPhone Duo inner screen: landscape = map left half (full height), details
  // right half; rotated = the map takes the height the width allows, the seven
  // stats share one row, the routes run in two columns.
  const { wide, tall, width } = useLayout();
  const mapHeight = tall ? Math.round((width - 44) * TALL_MAP_RATIO) : MAP_HEIGHT + 100;

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

  // Framed on the base: destinations unwrapped around its longitude, so the base
  // sits in the middle and a trans-Pacific route stays one line on its side.
  const viewBox = routeViewBox(home, routes.map(r => r.position), zoom, wide ? cardAspect : MAP_ASPECT);
  const [vbX, , vbW] = viewBox.split(' ').map(Number);
  // The world outline is one 0…1000 strip; repeat it wherever the box runs past.
  const landShifts: number[] = [];
  for (let k = Math.floor(vbX / MERCATOR_GRID); k * MERCATOR_GRID < vbX + vbW; k++) landShifts.push(k * MERCATOR_GRID);
  const xOf = (lon: number) => mercatorX(unwrapLon(lon, home.lon));
  const selected = routes.find(r => r.code === focused) ?? null;
  const mapCard = (
      <View style={[s.mapCard, { backgroundColor: p.mapBg, borderColor: p.frostLine }, wide && s.mapCardWide]} testID="route-map"
        onLayout={e => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (wide && w > 0 && h > 0) setCardAspect(w / h);
        }}>
        <Svg width="100%" height={wide ? '100%' : mapHeight} viewBox={viewBox} testID="route-svg">
          {landShifts.map(dx => (
            <G key={`world-${dx}`} opacity={0.9} transform={`translate(${dx} 0)`}>
              {WORLD_LAND_PATHS.map((d, i) => (
                <Path key={`land-${i}`} d={d} fill={p.isLight ? p.mapLand : p.g4} fillOpacity={p.isLight ? 0.72 : 0.34} stroke={p.isLight ? p.cardLine : 'rgba(255,255,255,0.2)'} strokeWidth={0.4} />
              ))}
            </G>
          ))}
          {graticule(viewBox, p.mapRoute)}
          {routes.map(r => (
            <Path
              key={`line-${r.code}`}
              d={greatCirclePath(home, r.position, undefined, home.lon)}
              fill="none"
              stroke={selected && selected.code !== r.code ? p.mapMutedRoute : p.mapRoute}
              strokeOpacity={selected && selected.code !== r.code ? 0.45 : 0.95}
              strokeWidth={selected?.code === r.code ? 2.6 : 1.6}
            />
          ))}
          {routes.map(r => (
            <G key={`mark-${r.code}`}>
              <Circle cx={xOf(r.position.lon)} cy={mercatorY(r.position.lat)} r={selected?.code === r.code ? 5 : 3.4} fill={p.mapRoute} />
              <Circle cx={xOf(r.position.lon)} cy={mercatorY(r.position.lat)} r={9} fill="none" stroke={p.mapRoute} strokeOpacity={selected?.code === r.code ? 0.9 : 0} strokeWidth={1} />
            </G>
          ))}
          {/* The crew's own base is the one filled hub every line starts from. */}
          <Circle cx={mercatorX(home.lon)} cy={mercatorY(home.lat)} r={6} fill={p.mapBg} stroke={p.mapRoute} strokeWidth={2} />
        </Svg>
        {/* Base + selected-airport labels ride on the map, not in a legend. */}
        <View style={s.mapBadge} pointerEvents="none">
          <Text style={s.mapBadgeText}>{`${mapBase.toUpperCase()} · ${base ? 'BASE' : 'START'}`}</Text>
        </View>
        {selected ? (
          <View style={[s.mapBadge, s.mapBadgeBottom, { bottom: tall ? 105 : 174 }]} pointerEvents="none">
            <Text style={s.mapBadgeText}>{`${selected.code} · ${formatKm(selected.km)} · ${selected.legs} leg${selected.legs > 1 ? 's' : ''}`}</Text>
          </View>
        ) : null}
        <View style={[s.zoomCol, { bottom: tall ? 105 : 174 }]}>
          <Pressable onPress={() => setZoom(z => Math.min(MAX_ZOOM, z + 1))} testID="route-zoom-in" style={[s.zoomBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]} accessibilityLabel="Zoom in">
            <Icon name="zoomIn" size={18} color={p.cardInk} />
          </Pressable>
          <Pressable onPress={() => setZoom(z => Math.max(MIN_ZOOM, z - 1))} testID="route-zoom-out" style={[s.zoomBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]} accessibilityLabel="Zoom out">
            <Icon name="zoomOut" size={18} color={p.cardInk} />
          </Pressable>
        </View>
        <View style={s.statsOverlay}>
          <StatsCard stats={stats} month={month} palette={p} oneRow={tall} compactWide={wide} inMap />
        </View>
      </View>
  );
  const details = (
    <>
      <Text style={[s.listHead, { color: p.inkSoft }]}>Routes</Text>
      <View style={tall ? s.routeGrid : undefined} testID={tall ? 'route-grid' : undefined}>
      {routes.map(r => (
        <Pressable
          key={r.code}
          onPress={() => setFocused(f => (f === r.code ? null : r.code))}
          testID={`route-${r.code}`}
          style={[s.routeRow, tall && s.routeRowTall, { backgroundColor: p.card, borderColor: focused === r.code ? p.btn : p.cardLine }]}
        >
          <View style={[s.routeCode, { backgroundColor: 'rgba(255,255,255,0.72)' }]}>
            <Text style={[s.routeCodeText, { color: p.btn }]}>{r.code}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.routeTitle, { color: p.cardInk }]} numberOfLines={1}>
              {`${mapBase.toUpperCase()} → ${r.code}`}
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
      </View>
    </>
  );

  if (wide) {
    return (
      <View style={s.wideRow} testID="route-view">
        <View style={s.wideHalf}>{mapCard}</View>
        <ScrollView style={s.wideHalf} contentContainerStyle={s.wideDetails} showsVerticalScrollIndicator={false} testID="route-details">
          {details}
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false} testID="route-view">
      {mapCard}
      {details}
    </ScrollView>
  );
}

/**
 * The month's numbers as ONE grid in two tiers: flights / distance / block / duty
 * on top, the month's reach — routes / airports / countries — below it.
 *
 * The breakdown used to be three stacked label/value rows whose value hugged the
 * card's right edge, while the totals above were left-aligned inside equal
 * columns: two alignment rules in one card, so `145:05` ended 19 pt short of the
 * `8` under it (measured on the simulator, 1088 px vs 1145 px @3x). Both tiers are
 * now equal-column flex rows inside the same 14 pt card padding, so they share one
 * grid and both edges, and the numbers use tabular figures so a changing count
 * cannot shift a column.
 */
function StatsCard({ stats, month, palette: p, oneRow, compactWide = false, inMap = false }: { stats: ReturnType<typeof monthStats>; month: MonthModel; palette: CarrierPalette; /** Rotated Duo: all seven cells on one row. */ oneRow?: boolean; /** Landscape Duo: a short strip leaves the map visible. */ compactWide?: boolean; inMap?: boolean }): React.JSX.Element {
  const valueColor = inMap && !p.isLight ? '#fff' : p.cardInk;
  const labelColor = inMap ? p.mapLabel : p.cardSoft;
  const totals: Array<{ id: string; value: string; label: string }> = [
    { id: 'flights', value: String(stats.flights), label: 'Flights' },
    // Distances are long; the unit lives in the label so four cells fit one row.
    { id: 'distance', value: Math.round(stats.km).toLocaleString('en-US'), label: 'Distance km' },
    { id: 'block', value: formatHM(stats.blockMinutes), label: 'Block' },
    { id: 'duty', value: formatHM(stats.dutyMinutes), label: 'Duty' },
  ];
  const counts: Array<{ id: string; value: string; label: string }> = [
    { id: 'routes', value: String(stats.routes), label: 'Routes' },
    { id: 'airports', value: String(stats.airports), label: 'Airports' },
    { id: 'countries', value: String(stats.countries), label: 'Countries' },
  ];
  return (
    <View style={[s.stats, inMap && s.statsInMap, compactWide && s.statsWide, { backgroundColor: inMap ? p.mapPanel : p.card, borderColor: inMap && !p.isLight ? 'rgba(255,255,255,0.38)' : p.cardLine }]} testID="route-stats">
      {compactWide ? null : <Text style={[s.statsTitle, { color: labelColor }]}>{`${MON[month.monthIdx]} ${month.year} summary`}</Text>}
      <View style={[s.statsGrid, compactWide && s.statsGridWide]} testID={oneRow ? 'route-stat-row' : 'route-stat-totals'}>
        {(oneRow ? [...totals, ...counts] : totals).map(cell => (
          <View key={cell.id} style={s.statsCell} testID={`route-stat-${cell.id}`}>
            <Text style={[s.statsValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{cell.value}</Text>
            <Text style={[s.statsLabel, { color: labelColor }]}>{cell.label}</Text>
          </View>
        ))}
      </View>
      {oneRow ? null : (
      <View style={[s.statsCounts, compactWide && s.statsCountsWide, { borderTopColor: inMap && !p.isLight ? 'rgba(255,255,255,0.28)' : p.cardLine }]} testID="route-stat-counts">
        {counts.map(cell => (
          <View key={cell.id} style={[s.statsCell, compactWide && s.statsCountInline]} testID={`route-stat-${cell.id}`}>
            <Text style={[s.statsCountValue, { color: valueColor }]} numberOfLines={1}>{cell.value}</Text>
            <Text style={[s.statsLabel, compactWide && s.statsCountLabelInline, { color: labelColor }]}>{cell.label}</Text>
          </View>
        ))}
      </View>
      )}
    </View>
  );
}

/** Faint 30°/30° graticule inside the current view box — reads as a chart, not a void. */
function graticule(viewBox: string, color: string): React.JSX.Element[] {
  const [x, y, w, h] = viewBox.split(' ').map(Number);
  const lines: React.JSX.Element[] = [];
  // Every 30° meridian across the box, also past ±180 when the map is framed on a base.
  const step = mercatorX(30) - mercatorX(0);
  for (let gx = Math.ceil(x / step) * step; gx <= x + w; gx += step) {
    lines.push(<Line key={`gx-${Math.round(gx)}`} x1={gx} y1={y} x2={gx} y2={y + h} stroke={color} strokeWidth={0.4} strokeOpacity={0.35} />);
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
  // Wide (Duo inner): two equal halves; the map card fills its half's height and
  // both halves stop above the floating dock.
  wideRow: { flex: 1, flexDirection: 'row', gap: 14, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 110 },
  wideHalf: { flex: 1, minWidth: 0 },
  mapCardWide: { flex: 1 },
  statsOverlay: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  wideDetails: { gap: 10, paddingBottom: 12 },
  mapBadge: { position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 0 },
  mapBadgeBottom: { top: undefined, bottom: 10 },
  mapBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  zoomCol: { position: 'absolute', right: 8, bottom: 8, gap: 8 },
  zoomBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stats: { borderRadius: 16, borderWidth: 1, padding: 14 },
  statsInMap: { padding: 12 },
  statsWide: { paddingHorizontal: 10, paddingVertical: 8 },
  statsTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', marginTop: 10, gap: 8 },
  statsGridWide: { marginTop: 0 },
  // The second tier of the same grid: one hairline between the tiers, no rule
  // after the last one (the card used to end on a border).
  statsCounts: { flexDirection: 'row', marginTop: 12, paddingTop: 12, gap: 8, borderTopWidth: 1 },
  statsCountsWide: { marginTop: 7, paddingTop: 6 },
  statsCountInline: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statsCountLabelInline: { marginTop: 0 },
  statsCell: { flex: 1, minWidth: 0 },
  statsValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statsCountValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statsLabel: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 },
  listHead: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, marginTop: 6 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 10 },
  // Rotated Duo: two route rows per line.
  routeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  routeRowTall: { flexBasis: '47%', flexGrow: 1 },
  routeCode: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeCodeText: { fontSize: 13, fontWeight: '700' },
  routeTitle: { fontSize: 14, fontWeight: '600' },
  routeSub: { fontSize: 12, marginTop: 2 },
  routeKm: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 22 },
});
