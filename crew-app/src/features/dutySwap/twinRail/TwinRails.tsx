import React, { useMemo, useRef, useState } from 'react';
import Svg, { Line } from 'react-native-svg';
import { FlatList, PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type ViewToken } from 'react-native';
import { Icon } from '../../../components/v2/icons';
import { useLayout } from '../../../components/v2/useLayout';
import { colors, space } from '../../../theme';
import { glassTint, type CarrierPalette } from '../../../theme/carrier';
import { dayLabel, DAY_MS, detailFor, flightRouteOf, isoDay, naiveMs, type ApiCompare, type SwapCrew, type SwapDuty } from '../dutySwapModel';
import { precheck, precheckLabel, spanLabel } from '../market/marketModel';
import { RAIL_ZOOMS, puckLines, railBlocks, zoomForPinch, type RailZoom } from './twinRailModel';
import { s } from './styles';

interface Props {
  p: CarrierPalette; carrier: string; me: SwapCrew; others: SwapCrew[]; start: string; zoom: RailZoom;
  give: string[]; take: string[]; crewB: string | null; details: Record<string, ApiCompare>;
  onPick: (d: SwapDuty) => void; onMove: (days: number) => void; onZoom: (z: RailZoom) => void;
  onVisible: (ids: string[]) => void;
  actions?: React.ReactNode;
  controlsInHeader?: boolean;
}

export function TwinRangeControls({ p, start, zoom, onMove, onZoom, actions }: {
  p: CarrierPalette; start: string; zoom: RailZoom; onMove: (days: number) => void;
  onZoom: (z: RailZoom) => void; actions?: React.ReactNode;
}): React.JSX.Element {
  const days = Array.from({ length: zoom }, (_, i) => isoDay(naiveMs(start) + i * DAY_MS));
  return <View style={r.rangeControls} testID="twin-range-controls">
    <Pressable onPress={() => onMove(-zoom)} accessibilityLabel="Earlier days" testID="twin-earlier" style={r.arrow}><Icon name="back" size={18} color={p.btn} /></Pressable>
    <Text numberOfLines={1} style={[s.text, r.window, { color: p.cardInk }]} testID="twin-window">{dayLabel(start).day} {dayLabel(start).month} – {dayLabel(days[zoom - 1]).day} {dayLabel(days[zoom - 1]).month}</Text>
    <Pressable onPress={() => onMove(zoom)} accessibilityLabel="Later days" testID="twin-later" style={r.arrow}><Icon name="chev" size={18} color={p.btn} /></Pressable>
    {RAIL_ZOOMS.map(z => <Pressable key={z} onPress={() => onZoom(z)} accessibilityLabel={`${z} days`} accessibilityState={{ selected: z === zoom }} testID={`twin-zoom-${z}`} style={[r.zoom, { backgroundColor: z === zoom ? p.cardInset : p.cardSolid }]}><Text style={[s.label, { color: p.btn }]}>{z}d</Text></Pressable>)}
    {actions}
  </View>;
}

const distance = (e: GestureResponderEvent): number => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
};

export function TwinRails(props: Props): React.JSX.Element {
  const { height } = useLayout();
  const shortScreen = height < 560;
  const { p, carrier, me, others, start, zoom, give, take, crewB, details, onPick, onMove, onZoom } = props;
  const pinch = useRef(0);
  const currentZoom = useRef(zoom);
  currentZoom.current = zoom;
  const pinchZoom = useRef(zoom);
  const callbacks = useRef({ onMove, onZoom });
  callbacks.current = { onMove, onZoom };
  const [pinching, setPinching] = useState(false);
  const [railWidth, setRailWidth] = useState(320);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: e => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponderCapture: e => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.touches.length === 2 || (Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2),
    onPanResponderGrant: e => { pinch.current = distance(e); pinchZoom.current = currentZoom.current; setPinching(pinch.current > 0); },
    onPanResponderRelease: (e, g) => {
      setPinching(false);
      if (pinch.current) { pinch.current = 0; return; }
      if (Math.abs(g.dx) > 30) callbacks.current.onMove(g.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: () => { setPinching(false); pinch.current = 0; },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: e => {
      const d = distance(e);
      if (!pinch.current || !d) return;
      callbacks.current.onZoom(zoomForPinch(pinchZoom.current, d / pinch.current));
    },
  }), []);
  const onVisibleRef = useRef(props.onVisible);
  onVisibleRef.current = props.onVisible;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    onVisibleRef.current(viewableItems.map(v => (v.item as SwapCrew).crewId));
  }).current;
  const days = Array.from({ length: zoom }, (_, i) => isoDay(naiveMs(start) + i * DAY_MS));
  const layoutBlocks = (crew: SwapCrew) => {
    // Keep the time bar exact, with a 44pt touch label for short ground duties.
    // Labels that would collide get their own lane.
    const ends: number[] = [];
    return railBlocks(crew.duties, start, zoom).map(block => {
      const width = Math.max(block.width, 44 / railWidth);
      const left = Math.min(block.left, 1 - width);
      let lane = ends.findIndex(end => end <= left);
      if (lane < 0) lane = ends.length;
      ends[lane] = left + width;
      return { ...block, touchLeft: left, touchWidth: width, lane };
    });
  };
  const selectedBlocks = layoutBlocks(me).filter(b => give.includes(b.duty.key));
  const first = selectedBlocks.reduce<typeof selectedBlocks[number] | undefined>((a, b) => !a || b.touchLeft < a.touchLeft ? b : a, undefined);
  const last = selectedBlocks.reduce<typeof selectedBlocks[number] | undefined>((a, b) => !a || b.touchLeft + b.touchWidth > a.touchLeft + a.touchWidth ? b : a, undefined);
  const guides = first && last ? [
    { id: 'start', x: first.touchLeft, top: first.lane * 46 + 44 },
    { id: 'end', x: last.touchLeft + last.touchWidth, top: last.lane * 46 + 44 },
  ] : [];
  const renderRail = (crew: SwapCrew, mine: boolean): React.JSX.Element => {
    const blocks = layoutBlocks(crew);
    const cmp = details[crew.crewId];
    const myDuty = me.duties.find(d => give.includes(d.key));
    const myDetail = myDuty ? detailFor(myDuty, cmp?.mineTaskDetailList) : undefined;
    const checks = cmp?.othersTaskDetailList.map(d => precheck(d, myDetail)).filter(c => c?.fleetDiffers || c?.rankDiffers) ?? [];
    const warning = checks[0];
    const lanes = Math.max(1, ...blocks.map(b => b.lane + 1));
    return <View testID={mine ? 'twin-me-rail' : `twin-crew-${crew.crewId}`} style={[r.rail, { borderColor: glassTint(p.cardSoft, 0.22), backgroundColor: mine ? p.cardInset : p.cardSolid }]}>
      <View style={r.name}>
        <Text style={[s.label, { color: p.cardInk }]} numberOfLines={1}>{mine ? 'Me' : crew.crewId}</Text>
        <Text style={[s.label, { color: p.cardSoft }]} numberOfLines={1}>{mine ? crew.crewId : crew.crewName}</Text>
        {warning ? <Text style={[s.label, { color: p.btn }]}>{precheckLabel(warning)}</Text> : null}
      </View>
      <View onLayout={e => setRailWidth(Math.max(44, e.nativeEvent.layout.width))} style={[s.flex, { height: lanes * 46 + 8 }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[s.row, { flex: 1, gap: 0, opacity: 0.22 }]}>{days.map(day => <View key={day} style={{ flex: 1, height: '100%', borderLeftWidth: 1, borderColor: p.cardSoft }} />)}</View>
        </View>
        {blocks.map(({ duty: d, left, width, touchLeft, touchWidth, lane }) => {
          const selected = mine ? give.includes(d.key) : crewB === crew.crewId && take.includes(d.key);
          const detail = detailFor(d, mine ? Object.values(details).find(c => c.mineCrewId === me.crewId)?.mineTaskDetailList : cmp?.othersTaskDetailList);
          const lines = puckLines(d, detail, touchWidth * railWidth);
          const route = d.kind === 'fly' ? flightRouteOf(detail, carrier) : null;
          return <Pressable key={d.key} disabled={!d.swappable} onPress={() => onPick(d)}
            testID={`twin-duty-${d.key}`} accessibilityRole="button"
            accessibilityLabel={`${mine ? 'Give' : `Take from ${crew.crewId}`} ${d.code}, ${d.startDt}, ${spanLabel(d)}${route ? `, ${route}` : ''}${d.swappable ? '' : ', locked'}`}
            accessibilityState={{ selected, disabled: !d.swappable }}
            style={[r.block, { left: `${touchLeft * 100}%`, width: `${touchWidth * 100}%`, top: lane * 46 + 4,
              backgroundColor: selected ? p.btn : p.cardInset, borderColor: selected || d.swappable ? p.btn : p.cardLine,
              opacity: d.swappable ? 1 : 0.55, borderStyle: d.kind === 'standby' ? 'dashed' : 'solid' }]}>
            {lines.map((line, i) => <Text key={i} numberOfLines={1} style={[s.label, selected ? s.onPrimary : { color: i ? p.cardSoft : p.cardInk }]}>{i === 0 && !d.swappable ? 'Locked · ' : ''}{line}</Text>)}
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, height: 3, left: `${(left - touchLeft) / touchWidth * 100}%`, width: `${width / touchWidth * 100}%`, backgroundColor: selected ? p.g1 : p.btn }} />
          </Pressable>;
        })}
        {!blocks.length ? <Text style={[s.label, r.noDuty, { color: p.cardSoft }]}>No duties in view</Text> : null}
      </View>
    </View>;
  };
  return <View style={[s.flex, s.panel, { borderColor: p.cardLine, backgroundColor: p.cardSolid }]} testID="twin-rails" {...pan.panHandlers}>
    {!props.controlsInHeader ? <View style={[s.bar, shortScreen && s.shortBar]}><TwinRangeControls p={p} start={start} zoom={zoom} onMove={onMove} onZoom={onZoom} actions={props.actions} /></View> : null}
    <View style={[s.row, r.dateBand, { backgroundColor: p.cardInset, borderColor: p.cardLine }]} testID="twin-date-band"><View style={r.name} /><View style={[s.row, s.flex, { gap: 0 }]}>{days.map(day => <View key={day} style={[r.date, shortScreen && railWidth / zoom >= 72 && r.shortDate]}><Text testID={`twin-date-dow-${day}`} style={[s.label, { color: p.cardSoft }]} numberOfLines={1}>{dayLabel(day).dow}</Text><Text testID={`twin-date-day-${day}`} style={[s.number, { color: p.btn }]}>{dayLabel(day).day}</Text></View>)}</View></View>
    <View style={s.flex}>
    {renderRail(me, true)}
    <Text style={[s.label, { color: p.cardSoft, paddingHorizontal: 8, paddingVertical: shortScreen ? 4 : 8 }]}>{others.length} crew · tap my block, then theirs</Text>
    <FlatList testID="twin-candidates" style={s.flex} data={others} scrollEnabled={!pinching} keyExtractor={c => c.crewId} renderItem={({ item }) => renderRail(item, false)}
      onViewableItemsChanged={onViewableItemsChanged} initialNumToRender={7} windowSize={5}
      extraData={{ give, take, crewB, details, start, zoom }}
      ListEmptyComponent={<Text style={[s.text, s.body, { color: p.cardSoft }]}>No matching crew. Edit search to widen the results.</Text>} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { left: 76, overflow: 'hidden' }]}>
      {guides.map(guide => <View key={guide.id} testID={`twin-guide-${guide.id}`} style={{ position: 'absolute', left: `${guide.x * 100}%`, top: guide.top, bottom: 0, width: 2, marginLeft: -1 }}>
        <Svg width="2" height="100%"><Line x1="1" x2="1" y1="0" y2="100%" stroke={colors.primary} strokeOpacity={0.9} strokeWidth={1.5} strokeDasharray="4 4" /></Svg>
      </View>)}
    </View>
    </View>
  </View>;
}

const r = StyleSheet.create({
  name: { width: 76, padding: 4, gap: 2 },
  rail: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  block: { position: 'absolute', height: 40, borderRadius: 6, borderWidth: 1, padding: 3, overflow: 'hidden' },
  noDuty: { padding: 12 },
  dateBand: { gap: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  date: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  shortDate: { flexDirection: 'row', justifyContent: 'center', gap: space.xs4 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoom: { minWidth: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rangeControls: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  window: { flexShrink: 1, textAlign: 'center', minWidth: 112 },
});
