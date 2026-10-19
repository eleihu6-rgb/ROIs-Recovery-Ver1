// Crew Matrix (Concept D): one row per date, Mine + Date frozen on the left, one
// column per candidate crew scrolling sideways. Multi-day duties are a single
// block spanning their rows; cell text grows with the block (code → route →
// report/release + layover → BLH/CRD + fleet). Spec §5.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, useWindowDimensions, StyleSheet, Text, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { colors, font, radius } from '../../../theme';
import { Icon } from '../../../components/v2/icons';
import type { CarrierPalette } from '../../../theme/carrier';
import {
  cellLines, dayLabel, detailFor, dutyRows, fleetsOf,
  type ApiCompare, type ApiTaskDetail, type SwapCrew, type SwapDuty,
} from '../dutySwapModel';

/** `#rrggbb` + alpha → rgba(), so tints derive from the carrier's one accent. */
export function tint(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface MatrixGeometry {
  mineW: number;
  dateW: number;
  colW: number;
  rowH: number;
  visibleCols: number;
}

/** Column sizes per form factor (spec §5.1). On the Duo inner landscape screen
 *  the columns are sized so a column edge sits on the hinge (width / 2). */
export function matrixGeometry(width: number, height: number, crewCount: number, opts: { hingeAligned?: boolean } = {}): MatrixGeometry {
  const wide = width >= 700;
  const mineW = wide ? 92 : 80;
  const dateW = wide ? 48 : 44;
  const frozen = mineW + dateW;
  const rowH = height >= 600 && wide ? 40 : 34;
  if (opts.hingeAligned) {
    const colW = (width / 2 - frozen) / 3;
    return { mineW, dateW, colW, rowH, visibleCols: 6 };
  }
  const visibleCols = width >= 900 ? 6 : width >= 640 ? 5 : 3;
  const peek = crewCount > visibleCols ? 18 : 0;
  const colW = Math.max(84, (width - frozen - peek) / Math.max(1, Math.min(visibleCols, crewCount || 1)));
  return { mineW, dateW, colW, rowH, visibleCols };
}

interface Props {
  palette: CarrierPalette;
  me: SwapCrew;
  others: SwapCrew[];
  days: string[];
  geometry: MatrixGeometry;
  /** Width the matrix may occupy (the hinge-aligned layout leaves room for a rail). */
  width: number;
  details: Record<string, ApiCompare>;
  give: Set<string>;
  take: Set<string>;
  crewB: string | null;
  onPressDuty: (d: SwapDuty) => void;
  onPressCrew: (crewId: string) => void;
  onVisibleCrews: (crewIds: string[]) => void;
  /** The crew columns in view (1-based first, last), for "1–6 of 123". */
  onRange?: (first: number, last: number) => void;
}

/** Columns drawn either side of the view. A cabin crew search returns 120+ crews
 *  (spec §5.4): drawing every column's duty blocks made the first paint and each
 *  scroll slow, so only the columns in view (± this) are mounted. */
export const COL_OVERSCAN = 3;

/** The column window to mount for a horizontal offset. */
export function columnWindow(x: number, colW: number, viewW: number, count: number): { from: number; to: number } {
  const first = Math.max(0, Math.floor(x / colW));
  const inView = Math.ceil(viewW / colW) + 1;
  return { from: Math.max(0, first - COL_OVERSCAN), to: Math.min(count, first + inView + COL_OVERSCAN) };
}

export function CrewMatrix(props: Props): React.JSX.Element {
  const { palette: p, me, others, days, geometry, width, details, give, take, crewB } = props;
  const { fontScale } = useWindowDimensions();
  const [rowHeight, setRowHeight] = useState(geometry.rowH);
  const [pinching, setPinching] = useState(false);
  const g = { ...geometry, rowH: rowHeight };
  const verticalScroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const pinch = useRef({ distance: 0, height: rowHeight, y: 0 });
  const currentHeight = useRef(rowHeight);
  currentHeight.current = rowHeight;
  const distance = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
  };
  const finishPinch = () => { pinch.current.distance = 0; setPinching(false); };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: e => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponderCapture: e => e.nativeEvent.touches.length === 2,
    onPanResponderGrant: e => {
      pinch.current = { distance: distance(e), height: currentHeight.current, y: scrollY.current };
      setPinching(true);
    },
    onPanResponderMove: e => {
      const d = distance(e);
      const start = pinch.current;
      if (!d || !start.distance) return;
      const next = Math.max(geometry.rowH, Math.min(160, start.height * d / start.distance));
      setRowHeight(next);
      scrollY.current = start.y * next / start.height;
    },
    onPanResponderRelease: finishPinch,
    onPanResponderTerminate: finishPinch,
    onPanResponderTerminationRequest: () => false,
  }), [geometry.rowH]);
  useEffect(() => {
    verticalScroll.current?.scrollTo({ y: scrollY.current, animated: false });
  }, [rowHeight]);
  const headScroll = useRef<ScrollView>(null);
  const bodyScroll = useRef<ScrollView>(null);
  const frozenW = g.mineW + g.dateW;
  const viewW = width - frozenW;
  const [scrollX, setScrollX] = useState(0);
  const win = columnWindow(scrollX, g.colW, viewW, others.length);
  // A new search starts at the first crew again.
  useEffect(() => {
    setScrollX(0);
    bodyScroll.current?.scrollTo({ x: 0, animated: false });
    headScroll.current?.scrollTo({ x: 0, animated: false });
  }, [others]);
  const bodyH = days.length * g.rowH;
  const windowStart = days[0];

  const blockFrame = useCallback((d: SwapDuty) => {
    const pos = dutyRows(d, windowStart, days.length);
    if (!pos) return null;
    const height = Math.max(pos.span * g.rowH - 4, 14 * fontScale + 8);
    return { top: pos.top * g.rowH + 2, height };
  }, [windowStart, days.length, g.rowH, fontScale]);

  // Matrix time flows down rather than across. The Twin Rail's vertical start /
  // end guides therefore become horizontal here, following the outer visual
  // edges of all selected Mine duties through the candidate viewport.
  const guides = useMemo(() => {
    const frames = me.duties.filter(d => give.has(d.key)).map(blockFrame).filter((frame): frame is NonNullable<typeof frame> => !!frame);
    if (!frames.length) return [];
    return [
      { id: 'start', y: Math.min(...frames.map(frame => frame.top)) },
      { id: 'end', y: Math.max(...frames.map(frame => frame.top + frame.height)) },
    ];
  }, [me.duties, give, blockFrame]);

  // My task details: any loaded compare carries my side.
  const myDetails: ApiTaskDetail[] | undefined = useMemo(() => Object.values(details)[0]?.mineTaskDetailList, [details]);
  // Header fleets come from flying duties only (standby rows carry an aircraft too).
  const flying = (l?: ApiTaskDetail[]) => (l ?? []).filter(t => t.assignment === 'FLY');
  const myFleets = useMemo(() => fleetsOf(flying(myDetails)), [myDetails]);

  // Rows of the duties I'm giving are tinted across every column.
  const band = useMemo(() => {
    const rows = new Set<number>();
    for (const d of me.duties) {
      if (!give.has(d.key)) continue;
      const pos = dutyRows(d, windowStart, days.length);
      if (!pos) continue;
      for (let r = Math.floor(pos.top); r < Math.ceil(pos.top + pos.span); r++) rows.add(r);
    }
    return rows;
  }, [me.duties, give, windowStart, days.length]);

  const reportVisible = useCallback((x: number) => {
    const first = Math.max(0, Math.round(x / g.colW));
    props.onVisibleCrews(others.slice(first, first + g.visibleCols + 1).map(c => c.crewId));
    const fit = Math.max(1, Math.floor((viewW + 1) / g.colW));
    props.onRange?.(Math.min(others.length, first + 1), Math.min(others.length, first + fit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others, g.colW, g.visibleCols, viewW, props.onVisibleCrews, props.onRange]);
  useEffect(() => { reportVisible(0); }, [reportVisible]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    headScroll.current?.scrollTo({ x, animated: false });
    // Re-render only when the mounted column window would change.
    const next = columnWindow(x, g.colW, viewW, others.length);
    if (next.from !== win.from || next.to !== win.to) setScrollX(x);
  };
  const shown = others.slice(win.from, win.to);

  const rowsBg = (w: number) => days.map((d, i) => {
    const dl = dayLabel(d);
    const weekend = dl.dow === 'SAT' || dl.dow === 'SUN';
    return (
      <View key={d} style={[s.rowBg, { top: i * g.rowH, height: g.rowH, width: w, borderTopColor: p.cardLine,
        backgroundColor: band.has(i) ? tint(p.btn, 0.09) : weekend ? tint(p.cardLine, 0.25) : 'transparent' }]} />
    );
  });

  const column = (crew: SwapCrew, colW: number, isMe: boolean) => {
    const list = isMe ? myDetails : details[crew.crewId]?.othersTaskDetailList;
    return crew.duties.map(d => {
      const frame = blockFrame(d);
      if (!frame) return null;
      const w = colW - 8;
      const lines = cellLines(d, detailFor(d, list), 3);
      const selected = isMe ? give.has(d.key) : take.has(d.key);
      return (
        <DutyBlock key={d.key} duty={d} lines={lines} palette={p} selected={selected}
          top={frame.top} left={4} width={w} height={frame.height}
          onPress={() => { if (!pinching) props.onPressDuty(d); }} />
      );
    });
  };

  return (
    <View style={[s.wrap, { width, backgroundColor: p.cardSolid }]} testID="crew-matrix">
      {/* Header: frozen labels + crew names (scroll synced with the body). */}
      <View style={[s.head, { borderBottomColor: p.cardLine }]}>
        <View style={[s.headCell, { width: g.mineW }]}>
          <Text style={[s.headId, { color: p.cardInk }]}>Mine</Text>
          <Text style={[s.headSub, { color: p.cardSoft }]} numberOfLines={1}>{me.crewId}{myFleets.length ? ` · ${myFleets.join('/')}` : ''}</Text>
        </View>
        <View style={[s.headCell, s.center, { width: g.dateW }]}>
          <Text style={[s.dateHead, { color: p.cardSoft }]}>DATE</Text>
        </View>
        <ScrollView ref={headScroll} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} style={{ width: viewW }}
          contentContainerStyle={{ width: others.length * g.colW, paddingLeft: win.from * g.colW }}>
          {shown.map(c => {
            const fleets = fleetsOf(flying(details[c.crewId]?.othersTaskDetailList));
            const differs = myFleets.length > 0 && fleets.length > 0 && !fleets.some(f => myFleets.includes(f));
            const on = c.crewId === crewB;
            return (
              <Pressable key={c.crewId} onPress={() => props.onPressCrew(c.crewId)} testID={`matrix-crew-${c.crewId}`}
                style={[s.headCell, { width: g.colW, borderLeftColor: p.cardLine, borderLeftWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: on ? p.btn : 'transparent', borderBottomWidth: 3 }]}>
                <Text style={[s.headId, { color: on ? p.btn : p.cardInk }]}>{c.crewId}</Text>
                <Text style={[s.headSub, { color: differs ? p.crit : p.cardSoft }]} numberOfLines={1}>
                  {fleets.length ? `Fleet ${fleets.join('/')}${differs ? ' · differs' : ''}` : ' '}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={s.flex} {...pan.panHandlers} testID="crew-matrix-zoom">
        <ScrollView ref={verticalScroll} style={s.flex} scrollEnabled={!pinching}
          onScroll={e => { if (!pinching) scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
          contentContainerStyle={{ height: bodyH }} showsVerticalScrollIndicator testID="crew-matrix-days">
          <View style={[s.row, { height: bodyH }]}>
            {/* Frozen: Mine + Date */}
            <View style={{ width: frozenW, height: bodyH }}>
              {rowsBg(frozenW)}
              <View style={{ position: 'absolute', left: 0, top: 0, width: g.mineW, height: bodyH }}>{column(me, g.mineW, true)}</View>
              {days.map((d, i) => {
                const dl = dayLabel(d);
                return (
                  <View key={d} style={[s.dateCell, { left: g.mineW, top: i * g.rowH, width: g.dateW, height: g.rowH }]}>
                    <Text style={[s.dateNum, { color: p.cardInk }]}>{dl.day}</Text>
                    <Text style={[s.dateDow, { color: p.cardSoft }]}>{dl.dow}</Text>
                  </View>
                );
              })}
              <View style={[s.frozenEdge, { left: frozenW - 1, height: bodyH, backgroundColor: p.cardLine }]} />
            </View>
            {/* Crews: horizontal scroll */}
            <ScrollView ref={bodyScroll} horizontal scrollEnabled={!pinching} onScroll={onScroll} scrollEventThrottle={16} snapToInterval={g.colW} decelerationRate="fast"
              onMomentumScrollEnd={e => reportVisible(e.nativeEvent.contentOffset.x)} showsHorizontalScrollIndicator={false}
              style={{ width: viewW }} testID="crew-matrix-scroll">
              <View style={{ width: others.length * g.colW, height: bodyH }}>
                {rowsBg(others.length * g.colW)}
                {shown.map((c, k) => (
                  <View key={c.crewId} style={{ position: 'absolute', left: (win.from + k) * g.colW, top: 0, width: g.colW, height: bodyH,
                    borderLeftColor: p.cardLine, borderLeftWidth: StyleSheet.hairlineWidth }}>
                    {column(c, g.colW, false)}
                  </View>
                ))}
              </View>
            </ScrollView>
            {guides.length ? <View pointerEvents="none" testID="matrix-guides" style={StyleSheet.absoluteFill}>
              {guides.map(guide => <View key={guide.id} testID={`matrix-guide-${guide.id}`}
                style={{ position: 'absolute', left: g.mineW - 4, right: 0, top: guide.y, height: 2, marginTop: -1 }}>
                <Svg width="100%" height="2"><Line x1="0" x2="100%" y1="1" y2="1" stroke={colors.primary} strokeOpacity={0.9} strokeWidth={1.5} strokeDasharray="4 4" /></Svg>
              </View>)}
            </View> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function DutyBlock({ duty, lines, palette: p, selected, top, left, width, height, onPress }: {
  duty: SwapDuty; lines: string[]; palette: CarrierPalette; selected: boolean;
  top: number; left: number; width: number; height: number; onPress: () => void;
}) {
  const locked = !duty.swappable;
  const look = selected
    ? { backgroundColor: p.btn, borderColor: p.btn, color: '#fff' }
    : locked
      ? { backgroundColor: tint(p.cardSoft, 0.14), borderColor: tint(p.cardSoft, 0.3), color: p.cardSoft }
      : duty.kind === 'fly'
        ? { backgroundColor: tint(p.btn, 0.16), borderColor: tint(p.btn, 0.45), color: p.cardInk }
        : duty.kind === 'off'
          ? { backgroundColor: 'transparent', borderColor: p.cardLine, color: p.cardSoft }
          : { backgroundColor: p.cardSolid, borderColor: tint(p.btn, 0.6), color: p.cardInk };
  const { fontScale } = useWindowDimensions();
  const lineHeight = 14;
  const maxLines = Math.max(1, Math.floor((height - 8) / (lineHeight * fontScale)));
  const narrow = width < 100;
  const codeLines = narrow && maxLines >= 3 && lines[0].includes('/') ? 2 : 1;
  const code = codeLines === 2 ? lines[0].replace('/', '/\n') : lines[0];
  const rest = lines.slice(1).map(l => {
    const m = narrow ? /^([A-Z]{3})–([A-Z]{3})–([A-Z]{3})$/.exec(l) : null;
    return m && m[1] === m[3] ? `${m[1]}⇄${m[2]}` : l;
  });
  // Allocate complete lines. Expanded narrow pucks wrap detail instead of
  // remaining permanently ellipsized even when there is spare vertical room.
  let remaining = maxLines - codeLines;
  const detailLines = rest.flatMap((text, i) => {
    if (remaining <= 0) return [];
    const reserve = rest.length - i - 1;
    const count = remaining > reserve + 1 ? 2 : 1;
    remaining -= count;
    return [{ text, count }];
  });
  return (
    <Pressable onPress={onPress} disabled={locked} testID={`duty-${duty.crewId}-${duty.code}`}
      accessibilityLabel={`${duty.code}${locked ? ', not swappable' : ''}${selected ? ', selected' : ''}`}
      style={[s.block, { top, left, width, height, backgroundColor: look.backgroundColor, borderColor: look.borderColor,
        borderStyle: !selected && !locked && duty.kind === 'standby' ? 'dashed' : 'solid' }]}>
      <View style={s.blockHead}>
        {locked ? <Icon name="lock" size={10} color={look.color} strokeWidth={2} /> : null}
        <Text style={[s.code, { color: look.color }]} numberOfLines={codeLines}>{code}</Text>
      </View>
      {detailLines.map(({ text, count }, i) => (
        <Text key={i} style={[s.sub, { color: selected ? 'rgba(255,255,255,0.85)' : p.cardSoft }]} numberOfLines={count}>{text}</Text>
      ))}
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  head: { flexDirection: 'row', borderBottomWidth: 1 },
  headCell: { height: 46, justifyContent: 'center', paddingHorizontal: 8 },
  center: { alignItems: 'center', paddingHorizontal: 0 },
  headId: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  headSub: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  dateHead: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  rowBg: { position: 'absolute', left: 0, borderTopWidth: StyleSheet.hairlineWidth },
  dateCell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dateNum: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dateDow: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  frozenEdge: { position: 'absolute', top: 0, width: 1 },
  block: { position: 'absolute', borderRadius: radius.op, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 3, overflow: 'hidden' },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  code: { ...font.caption, lineHeight: 14, flexShrink: 1 },
  sub: { ...font.caption, fontWeight: '500', letterSpacing: 0, lineHeight: 14 },
});
