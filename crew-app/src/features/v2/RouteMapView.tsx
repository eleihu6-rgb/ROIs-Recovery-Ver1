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
import { View, Text, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path, Line, G } from 'react-native-svg';
import { Icon } from '../../components/v2/icons';
import { bottomDockClearance, useLayout } from '../../components/v2/useLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CarrierPalette } from '../../theme/carrier';
import { MON, type MonthModel } from './model';
import {
  formatHM,
  formatKm,
  greatCirclePath,
  greatCirclePoints,
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
import { layoutRouteLabels, type Rect, type RouteLabelPlacement } from './routeMapLabels';
import { RouteShareDialog } from './RouteShareDialog';
import { WORLD_LAND_PATHS } from './worldLand';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
/** On-map label: 12pt code + 9pt meta on one accent rule, 2pt left rule + 7pt gap. */
const LABEL_HEIGHT = 28;
const LABEL_RULE_AND_GAP = 15;

function routeMeta(km: number, legs: number): string {
  return `${formatKm(km)} · ${legs} leg${legs > 1 ? 's' : ''}`;
}

/** Explicit row width so the placement maths and the rendered label agree. */
function labelWidth(code: string, meta: string): number {
  return Math.ceil(Math.max(code.length * 7.8, meta.length * 5.15)) + LABEL_RULE_AND_GAP;
}

export interface RouteMapViewProps {
  month: MonthModel;
  base: string;
  palette: CarrierPalette;
  /** Carrier IATA code / display name for the share card's header. */
  airlineCode?: string;
  airlineName?: string;
}

export function RouteMapView({
  month,
  base,
  palette: p,
  airlineCode = '',
  airlineName = '',
}: RouteMapViewProps): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [focused, setFocused] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Frame the map at the card's real ratio (measured below), so the route graph
  // fills whatever area the current screen gives it instead of a fixed band.
  const [cardAspect, setCardAspect] = useState(MAP_ASPECT);
  // Rendered card size, used to convert map coordinates into label pixels.
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  // Measured chrome (base badge / zoom / stats): a label must never sit behind it.
  const [overlays, setOverlays] = useState<Record<string, Rect>>({});
  const onOverlayLayout = (key: string) => (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setOverlays(prev => {
      const current = prev[key];
      if (current && current.x === x && current.y === y && current.width === width && current.height === height) {
        return prev;
      }
      return { ...prev, [key]: { x, y, width, height } };
    });
  };
  // Guest demo trips have a real departure airport but no assigned crew base.
  // Use their first departure for this map only; do not claim it as their base
  // elsewhere in the app.
  const mapBase = useMemo(() => base || monthLegs(month)[0]?.dep || '', [base, month]);
  const home = useMemo(() => positionOf(mapBase), [mapBase]);
  const routes = useMemo(() => monthRoutes(month, mapBase), [month, mapBase]);
  const stats = useMemo(() => monthStats(month, mapBase), [month, mapBase]);
  // Rotated Duo: all seven stats share one row. Wide: a short strip.
  const { wide, tall, width, height } = useLayout();
  const insets = useSafeAreaInsets();
  // On the Duo the navigation lives in the right rail, so the map runs to the
  // bottom edge instead of reserving the phone dock's band.
  const bottomPad = bottomDockClearance(width, height, insets, 110);

  if (!home || routes.length === 0) {
    return (
      <ScrollView contentContainerStyle={[s.wrap, { paddingBottom: bottomDockClearance(width, height, insets, 130) }]} testID="route-empty">
        <StatsCard stats={stats} month={month} palette={p} />
        <Text style={[s.empty, { color: p.inkSoft }]}>
          {month.flightCount === 0 ? `No flights published for ${MON[month.monthIdx]} ${month.year}` : 'No airport coordinates for this month’s routes yet'}
        </Text>
      </ScrollView>
    );
  }

  // Framed on the base: destinations unwrapped around its longitude, so the base
  // sits in the middle and a trans-Pacific route stays one line on its side.
  const viewBox = routeViewBox(home, routes.map(r => r.position), zoom, cardAspect);
  const [vbX, vbY, vbW, vbH] = viewBox.split(' ').map(Number);
  // The world outline is one 0…1000 strip; repeat it wherever the box runs past.
  const landShifts: number[] = [];
  for (let k = Math.floor(vbX / MERCATOR_GRID); k * MERCATOR_GRID < vbX + vbW; k++) landShifts.push(k * MERCATOR_GRID);
  const xOf = (lon: number) => mercatorX(unwrapLon(lon, home.lon));
  const selected = routes.find(r => r.code === focused) ?? null;

  // SVG → card pixels (xMidYMid meet). The view box follows the measured card
  // ratio, so the offsets are normally zero but stay part of the mapping.
  const renderScale = cardSize.width > 0 && cardSize.height > 0
    ? Math.min(cardSize.width / vbW, cardSize.height / vbH)
    : 0;
  const offsetX = renderScale > 0 ? (cardSize.width - vbW * renderScale) / 2 : 0;
  const offsetY = renderScale > 0 ? (cardSize.height - vbH * renderScale) / 2 : 0;
  const toLabelPx = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: offsetX + (point.x - vbX) * renderScale,
    y: offsetY + (point.y - vbY) * renderScale,
  });
  const toMap = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: vbX + (point.x - offsetX) / renderScale,
    y: vbY + (point.y - offsetY) / renderScale,
  });

  // Each destination's label sits outside its arrival tangent; the helper scores
  // every candidate against all arcs, the other labels and the map chrome.
  const labelPlacements: RouteLabelPlacement[] = renderScale > 0
    ? layoutRouteLabels({
        endpoints: routes.map(route => {
          const point = toLabelPx({
            x: mercatorX(unwrapLon(route.position.lon, home.lon)),
            y: mercatorY(route.position.lat),
          });
          const meta = routeMeta(route.km, route.legs);
          return {
            code: route.code,
            x: point.x,
            y: point.y,
            width: labelWidth(route.code, meta),
            height: LABEL_HEIGHT,
            weight: route.km,
          };
        }),
        home: toLabelPx({ x: mercatorX(home.lon), y: mercatorY(home.lat) }),
        polylines: routes.map(route => ({
          code: route.code,
          points: greatCirclePoints(home, route.position, undefined, home.lon).map(toLabelPx),
        })),
        bounds: cardSize,
        obstacles: Object.values(overlays),
      })
    : [];
  const mapCard = (
      <View style={[s.mapCard, { backgroundColor: p.mapBg, borderColor: p.frostLine }]} testID="route-map"
        onLayout={e => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (!(w > 0 && h > 0)) return;
          setCardSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
          setCardAspect(prev => (prev === w / h ? prev : w / h));
        }}>
        <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" testID="route-svg">
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
          {/* A short leader joins each label to its endpoint without covering an arc. */}
          {labelPlacements.map(placement => {
            const start = toMap(placement.leaderStart);
            const end = toMap(placement.leaderEnd);
            const dimmed = focused !== null && focused !== placement.code;
            return (
              <Line
                key={`leader-${placement.code}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={p.mapLabel}
                strokeOpacity={dimmed ? 0.2 : 0.5}
                strokeWidth={1.2}
              />
            );
          })}
        </Svg>

        {/* Endpoint block: code + distance/legs on an accent rule, no surface.
            Placement keeps every label clear of the arcs and the chrome below. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="route-map-labels">
          {labelPlacements.map(placement => {
            const route = routes.find(r => r.code === placement.code);
            if (!route) return null;
            const isFocus = focused === placement.code;
            const dimmed = focused !== null && !isFocus;
            return (
              <Pressable
                key={`label-${placement.code}`}
                testID={`route-map-label-${placement.code}`}
                onPress={() => setFocused(f => (f === placement.code ? null : placement.code))}
                accessibilityRole="button"
                accessibilityLabel={`${placement.code}, ${routeMeta(route.km, route.legs)}`}
                style={[s.mapLabel, {
                  left: placement.left,
                  top: placement.top,
                  width: placement.width,
                  height: placement.height,
                  opacity: dimmed ? 0.48 : 1,
                }]}
              >
                <View
                  testID={`route-map-label-rule-${placement.code}`}
                  style={[s.mapLabelRule, { backgroundColor: isFocus ? p.mapLabel : p.mapRoute }]}
                />
                <View style={s.mapLabelText}>
                  <Text numberOfLines={1} style={[s.mapLabelCode, { color: p.mapLabel, textShadowColor: p.mapBg }]}>
                    {placement.code}
                  </Text>
                  <Text numberOfLines={1} style={[s.mapLabelMeta, { color: p.mapLabel, textShadowColor: p.mapBg, opacity: isFocus ? 0.9 : 0.74 }]}>
                    {routeMeta(route.km, route.legs)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Base label rides on the map in the same block treatment, not a black slab. */}
        <View
          style={[s.mapBadge, { borderLeftColor: p.mapRoute }]}
          pointerEvents="none"
          onLayout={onOverlayLayout('base')}
        >
          <Text style={[s.mapBadgeText, { color: p.mapLabel, textShadowColor: p.mapBg }]}>
            {`${mapBase.toUpperCase()} · ${base ? 'BASE' : 'START'}`}
          </Text>
        </View>
        {/* Keep the zoom column clear of the measured summary card. */}
        <View style={[s.zoomCol, { bottom: overlays.stats ? overlays.stats.height + 18 : 174 }]} onLayout={onOverlayLayout('zoom')}>
          <Pressable onPress={() => setZoom(z => Math.min(MAX_ZOOM, z + 1))} testID="route-zoom-in" style={[s.zoomBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]} accessibilityLabel="Zoom in">
            <Icon name="zoomIn" size={18} color={p.cardInk} />
          </Pressable>
          <Pressable onPress={() => setZoom(z => Math.max(MIN_ZOOM, z - 1))} testID="route-zoom-out" style={[s.zoomBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]} accessibilityLabel="Zoom out">
            <Icon name="zoomOut" size={18} color={p.cardInk} />
          </Pressable>
        </View>
        {/* Share the month as a picture. The card carries its own month + year,
            so a posted image always says when it happened. */}
        <Pressable
          onPress={() => setShareOpen(true)}
          onLayout={onOverlayLayout('share')}
          testID="route-share"
          accessibilityRole="button"
          accessibilityLabel="Share route map"
          style={[s.shareBtn, { backgroundColor: p.isLight ? p.cardSolid : p.card }]}
        >
          <Icon name="send" size={18} color={p.cardInk} />
        </Pressable>
        <View style={s.statsOverlay} onLayout={onOverlayLayout('stats')}>
          <StatsCard stats={stats} month={month} palette={p} oneRow={tall} compactWide={wide} inMap />
        </View>
      </View>
  );
  // One map that fills whatever screen it is given. The endpoint blocks carry the
  // destination list, so there is no separate rows panel below or beside it.
  return (
    <View style={[s.page, { paddingBottom: bottomPad }]} testID="route-view">
      {mapCard}
      {shareOpen ? (
        <RouteShareDialog
          month={month}
          base={mapBase}
          palette={p}
          airlineCode={airlineCode}
          airlineName={airlineName}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </View>
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
  // The map owns the screen area the schedule leaves it, on every device class.
  page: { flex: 1, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 110 },
  mapCard: { flex: 1, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  statsOverlay: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  mapBadge: { position: 'absolute', left: 10, top: 10, paddingLeft: 9, paddingRight: 4, paddingVertical: 2, borderLeftWidth: 2, borderRadius: 1 },
  mapBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  shareBtn: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Endpoint block: an accent rule + open type. No background, border or shadow
  // surface — the map-ground text halo is the only backing.
  mapLabel: { position: 'absolute', flexDirection: 'row', alignItems: 'stretch' },
  mapLabelRule: { width: 2, borderRadius: 1, marginRight: 7 },
  mapLabelText: { flexDirection: 'column', justifyContent: 'center' },
  mapLabelCode: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, lineHeight: 14, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  mapLabelMeta: { fontSize: 9, fontWeight: '500', letterSpacing: 0.2, lineHeight: 11, marginTop: 2, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
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
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 22 },
});
