// Schedule tab — whole month as one list; every day is the same white card
// (flights, standby, training, layover, days off with an illustration). The
// date strip and the list stay in sync both ways. Opens on today if it holds a
// duty, else the next flight.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, type ViewToken } from 'react-native';
import Svg, { Rect, Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { GradientScreen } from '../../components/v2/GradientScreen';
import { Icon } from '../../components/v2/icons';
import { TicketCard, DashedLine } from '../../components/v2/TicketCard';
import { useMonth } from './useV2';
import { hasDutyCard, MON, resolveCardIndex, type DayModel, type DayKind, type LegView } from './model';
import { useV2Nav } from './nav';
import { IconButton } from './HomeScreen';
import { codeAddsInfo, type GroundDuty } from '../roster/dutyDisplay';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { hhmmForInstant, parseRosterUTC } from '../settings/timeFormat';
import { airportZone } from '../settings/airportZones';

/** Inner surface (icon disc, marker strip, meeting row) — a touch lighter than the
 *  card itself, and equally translucent so the carrier ground shows through. */
const CARD_INSET = 'rgba(255,255,255,0.72)';

export function ScheduleScreen() {
  const p = useCarrier();
  const insets = useSafeAreaInsets();
  const nav = useV2Nav();
  const alertCount = useAppSelector(s => s.notifications.notifications.length);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const [now] = useState(() => new Date());
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const month = useMonth(ym.y, ym.m, now);
  const [active, setActive] = useState(month.focusIndex);
  const list = useRef<FlatList<DayModel>>(null);
  const strip = useRef<FlatList<DayModel>>(null);
  const lock = useRef(0);

  // The strip shows every calendar day; the list only carries days that actually
  // have something on them (see hasDutyCard), so the two indexes diverge.
  const listDays = useMemo(() => month.days.filter(hasDutyCard), [month.days]);
  const stripToList = useMemo(() => {
    const map = new Map<number, number>();
    let listIndex = 0;
    month.days.forEach((day, stripIndex) => {
      if (hasDutyCard(day)) {
        map.set(stripIndex, listIndex++);
      }
    });
    return map;
  }, [month.days]);
  const listToStrip = useMemo(() => {
    const map = new Map<number, number>();
    let stripIndex = 0;
    listDays.forEach((_day, listIndex) => {
      while (stripIndex < month.days.length && month.days[stripIndex] !== listDays[listIndex]) {
        stripIndex++;
      }
      map.set(listIndex, stripIndex);
    });
    return map;
  }, [listDays, month.days]);

  const focus = useCallback((i: number, animated = true) => {
    lock.current = Date.now();
    setActive(i);
    // A month with nothing published has no cards — scrolling an empty list to
    // index 0 throws, so only scroll when there is something to land on.
    const listIndex = resolveCardIndex(stripToList, i, listDays.length);
    if (listIndex !== null) {
      list.current?.scrollToIndex({ index: listIndex, animated, viewPosition: 0 });
    }
    strip.current?.scrollToIndex({ index: i, animated, viewPosition: 0.5 });
  }, [stripToList, listDays.length]);
  useEffect(() => { const t = setTimeout(() => focus(month.focusIndex, false), 50); return () => clearTimeout(t); }, [month.focusIndex, focus]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (Date.now() - lock.current < 700) return;
    const first = viewableItems[0]?.index;
    if (first == null) return;
    const stripIndex = listToStrip.get(first);
    if (stripIndex == null) return;
    setActive(stripIndex);
    strip.current?.scrollToIndex({ index: stripIndex, animated: true, viewPosition: 0.5 });
  }).current;

  // Month only — the credit figure lives on Profile ▸ Block hours, and repeating
  // it in the title made the header read as a statistic instead of a date.
  const title = `Sched ${MON[ym.m]} ${ym.y}`;
  return (
    <GradientScreen palette={p}>
      <View style={[s.head, { paddingTop: insets.top + 4 }]}>
        <View style={s.titleRow}>
          <Pressable onPress={() => setYm(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} style={s.iconBtn} testID="sched-prev-month"><Icon name="back" size={24} color={p.ink} strokeWidth={1.8} /></Pressable>
          <Text style={[s.title, { color: p.ink }]} numberOfLines={1} testID="sched-title">{title}</Text>
          <IconButton name="bell" badge={alertCount} palette={p} onPress={() => nav.navigate('Alerts')} testID="sched-alerts" />
        </View>
        <FlatList
          ref={strip} horizontal data={month.days} keyExtractor={d => String(d.key)} showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.strip} getItemLayout={(_, i) => ({ length: 60, offset: 60 * i, index: i })}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => focus(index)} testID={`day-${item.day}`}
              style={[s.chip, { backgroundColor: index === active ? '#fff' : p.frost, borderColor: index === active ? '#fff' : p.frostLine }]}>
              <Text style={[s.dow, { color: index === active ? p.g2 : p.inkSoft }]}>{item.dow.toUpperCase()}</Text>
              <Text style={[s.dnum, { color: index === active ? p.g1 : p.ink }, item.isToday && s.today]}>{item.day}</Text>
              <View style={[s.dot, { backgroundColor: index === active ? p.g2 : '#fff', opacity: item.kind !== 'off' && item.kind !== 'layover' ? 1 : 0 }]} />
            </Pressable>
          )}
        />
      </View>
      <FlatList
        ref={list} data={listDays} keyExtractor={d => String(d.key)} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 30 }}
        onScrollToIndexFailed={info => setTimeout(() => list.current?.scrollToIndex({ index: info.index, animated: false }), 200)}
        ListEmptyComponent={<Text style={[s.empty, { color: p.inkSoft }]}>No duties published for {MON[ym.m]} {ym.y}.</Text>}
        renderItem={({ item }) => (
          <DayCard day={item} monthIdx={ym.m} mode={mode} baseTz={baseTz} palette={p} onTrip={id => nav.navigate('TripDetails', { tripId: id })} />
        )}
        testID="sched-list"
      />
    </GradientScreen>
  );
}

function DayCard({ day, monthIdx, mode, baseTz, palette: p, onTrip }: { day: DayModel; monthIdx: number; mode: TimeZoneMode; baseTz: string; palette: CarrierPalette; onTrip: (tripId: string) => void }) {
  const head = `${day.dow.toUpperCase()} ${day.day} ${MON[monthIdx].toUpperCase()}${day.isToday ? ' · TODAY' : ''}`;
  const meetings = day.meetings.map(m => (
    <View key={m.id} style={[s.meet, { backgroundColor: CARD_INSET }]}>
      <Text style={[s.meetT, { color: p.cardInk }]}>{m.hhmm}</Text>
      <View style={{ flex: 1 }}><Text style={[s.meetTitle, { color: p.cardInk }]} numberOfLines={2}>{m.title}</Text><Text style={{ color: p.cardSoft, fontSize: 12 }}>{m.where}</Text></View>
      <Text style={[s.meetCal, { color: p.cardSoft, borderColor: p.cardLine }]}>iOS CAL</Text>
    </View>
  ));
  if (day.kind === 'flight') {
    return (
      <View style={s.card}>
        {day.legs.map(({ leg, trip }, i) => (
          <FlightCard key={`${trip.id}-${i}`} leg={leg} palette={p} onPress={() => onTrip(trip.id)} last={i === day.legs.length - 1} head={head} meetings={i === 0 ? meetings : null} />
        ))}
      </View>
    );
  }
  const info = dayInfo(day, mode, baseTz);
  return (
    <View style={s.card}>
      <TicketCard palette={p} testID={`day-card-${day.day}`} style={{ padding: 0, overflow: 'hidden' }}>
        <Text style={[s.dayHead, { color: p.cardSoft, paddingHorizontal: 18, paddingTop: 14 }]}>{head}</Text>
        <Art kind={day.kind} day={day.day} />
        <View style={{ padding: 18, paddingTop: 10 }}>
          <View style={s.dhead}>
            <View style={[s.logo, { backgroundColor: CARD_INSET }]}><Icon name={info.icon} size={24} color={p.btn} /></View>
            <View><Text style={[s.ac, { color: p.cardInk }]}>{info.title}</Text><Text style={{ color: p.cardSoft, fontSize: 12, marginTop: 2 }}>{info.sub}</Text></View>
          </View>
          {!!info.note && <Text style={{ color: p.cardSoft, fontSize: 13, marginTop: 10, lineHeight: 19 }}>{info.note}</Text>}
          {meetings}
        </View>
      </TicketCard>
    </View>
  );
}

const CARD_PAD = 18;

/** One flight leg as a ticket card; the hole cut is measured from the dashed line's real position. */
function FlightCard({ leg, palette: p, onPress, last, head, meetings }: { leg: LegView; palette: CarrierPalette; onPress: () => void; last: boolean; head: string; meetings: React.ReactNode }) {
  const [holeY, setHoleY] = useState<number | undefined>(undefined);
  return (
    <TicketCard palette={p} holeY={holeY} onPress={onPress} testID={`duty-${leg.fltNumber}`} style={{ padding: CARD_PAD, marginBottom: last ? 0 : 12 }}>
      <Text style={[s.dayHead, { color: p.cardSoft }]}>{head}</Text>
      {meetings}
      <View style={s.dhead}>
        <View style={[s.logo, { backgroundColor: CARD_INSET }]}><Icon name="jet" size={24} color={p.btn} /></View>
        {/* The jet glyph already says "flight", so the word is dropped; the fleet
            code sits beside the flight number. */}
        <View style={s.fltRow}>
          <Text style={[s.ac, { color: p.cardInk }]}>{leg.fltNumber}</Text>
          {!!leg.fleet && <Text style={[s.fleet, { color: p.cardSoft, borderColor: p.cardLine }]}>{leg.fleet}</Text>}
        </View>
      </View>
            <View style={s.fleg}>
              <View style={s.port}><Text style={[s.code, { color: p.cardInk }]}>{leg.dep}</Text><Text style={[s.tm, { color: p.cardSoft }]}>{leg.depTime}</Text></View>
              <View style={s.mid}>
                <View style={s.midLine}><View style={s.dash}><DashedLine color={p.cardLine} /></View><Icon name="plane" size={24} color={p.cardInk} /><View style={s.dash}><DashedLine color={p.cardLine} /></View></View>
                <Text style={{ color: p.cardSoft, fontSize: 12, marginTop: 4 }}>{leg.duration}</Text>
              </View>
              <View style={[s.port, { alignItems: 'flex-end' }]}><Text style={[s.code, { color: p.cardInk }]}>{leg.arv}</Text><Text style={[s.tm, { color: p.cardSoft }]}>{leg.arvTime}{leg.arvDayOffset ? ` ${leg.arvDayOffset}` : ''}</Text></View>
            </View>
      <View style={{ marginVertical: 14 }} onLayout={e => setHoleY(CARD_PAD + e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}><DashedLine color={p.cardLine} /></View>
      {/* Wake up / leave home / check-in are duty-level markers anchored to the FIRST
          leg only; later legs of the same rotation repeat none of them. Report and
          check-in are the same instant, so check-in carries the report time. Alarm
          cells with no value (a duty that has already started — alarms are computed
          for upcoming duties only) are dropped rather than shown as dashes. */}
      {leg.firstLeg && (leg.ready !== '—' || leg.leaveHome !== '—' || leg.checkIn !== '—') ? (
        <View style={[s.prep, { backgroundColor: CARD_INSET }]}>
          {leg.ready !== '—' ? <View><Text style={[s.pk, { color: p.cardSoft }]}>{leg.readyWord.toUpperCase()}</Text><Text style={[s.pv, { color: p.btn }]}>{leg.ready}</Text></View> : null}
          {leg.leaveHome !== '—' ? <View><Text style={[s.pk, { color: p.cardSoft }]}>LEAVE HOME</Text><Text style={[s.pv, { color: p.cardInk }]}>{leg.leaveHome}</Text></View> : null}
          {leg.checkIn !== '—' ? <View><Text style={[s.pk, { color: p.cardSoft }]}>CHECK-IN</Text><Text style={[s.pv, { color: p.cardInk }]}>{leg.checkIn}</Text></View> : null}
        </View>
      ) : null}
    </TicketCard>
  );
}

function dayInfo(d: DayModel, mode: TimeZoneMode, baseTz: string): { icon: 'house' | 'clock' | 'book'; title: string; sub: string; note: string } {
  const g = d.ground;
  const window = g ? dutyWindow(g, mode, baseTz) : '';
  // Never print a code the title already spells out ("Annual Leave" + "AL",
  // "Day Off" + "DO"). Only a code we had to guess at still carries meaning.
  const code = g && codeAddsInfo(g.code) ? g.code : '';
  switch (d.kind) {
    case 'standby': return { icon: 'clock', title: g?.label ?? 'Standby', sub: window, note: g?.code === 'RES' ? 'Reserve duty.' : 'Be reachable. Call-out within 90 minutes.' };
    case 'training': return { icon: 'book', title: g?.label ?? 'Training', sub: window, note: g?.detail ?? code };
    case 'ground': return { icon: g?.category === 'leave' ? 'house' : 'clock', title: g?.label ?? 'Duty', sub: window, note: g?.detail ?? code };
    case 'layover': { const h = d.layoverTrip?.legs[0]?.hotel; return { icon: 'house', title: `Layover${d.layoverTrip ? ' · ' + (d.layoverTrip.legs[0]?.arvArp ?? '') : ''}`, sub: h || 'Hotel', note: '' }; }
    // An explicit airline days-off row — the only kind of day off that gets a card.
    default: return { icon: 'house', title: g?.label ?? 'Day Off', sub: window || 'Off', note: code };
  }
}

/** Local window of a ground duty, in the crew's chosen time display mode. */
function dutyWindow(g: GroundDuty, mode: TimeZoneMode, baseTz: string): string {
  if (g.allDay) {
    return 'All day';
  }
  const zone = airportZone(g.airport);
  const start = parseRosterUTC(g.startRosterUTC);
  const end = parseRosterUTC(g.endRosterUTC);
  if (!start || !end) {
    return `${(g.localStart || '').slice(11, 16) || '—'} – ${(g.localEnd || '').slice(11, 16) || '—'}`;
  }
  return `${hhmmForInstant(start, mode, baseTz, zone)} – ${hhmmForInstant(end, mode, baseTz, zone)}`;
}

/** Flat two-tone illustration strip (mock art-beach / art-cafe / art-standby / art-training). */
function Art({ kind, day }: { kind: DayKind; day: number }) {
  const a = kind === 'standby' ? 'standby' : kind === 'training' ? 'training' : kind === 'layover' ? 'cafe' : day % 2 ? 'beach' : 'cafe';
  return (
    <Svg width="100%" height={96} viewBox="0 0 340 96" preserveAspectRatio="xMidYMid slice">
      {a === 'beach' && <><Rect width="340" height="96" fill="#dbeefb" /><Circle cx="270" cy="30" r="18" fill="#ffd66b" /><Path d="M0 70 Q60 58 120 70 T240 70 T360 70 V96 H0z" fill="#8fc7ea" /><Path d="M0 82 Q80 74 160 82 T340 82 V96 H0z" fill="#5fa8d8" /><Path d="M60 92 V44" stroke="#8a5a3a" strokeWidth={4} strokeLinecap="round" /><Path d="M60 44 q-26-18-44-4 q22-4 44 4z M60 44 q-4-30 22-36 q-12 14-22 36z M60 44 q28-14 46 6 q-24-8-46-6z" fill="#3fa66d" /></>}
      {a === 'cafe' && <><Rect width="340" height="96" fill="#f6e7d6" /><Rect x="0" y="66" width="340" height="30" fill="#e2c9ad" /><Rect x="150" y="34" width="46" height="34" rx="6" fill="#fff" /><Path d="M196 42 h8 a8 8 0 0 1 0 16 h-8" fill="none" stroke="#fff" strokeWidth={5} /><Path d="M160 26 q4-6 0-12 M172 26 q4-6 0-12 M184 26 q4-6 0-12" fill="none" stroke="#c9a27e" strokeWidth={2.5} strokeLinecap="round" /><Rect x="140" y="68" width="66" height="5" rx="2.5" fill="#c9a27e" /></>}
      {a === 'standby' && <><Rect width="340" height="96" fill="#e6ecf3" /><Rect x="120" y="22" width="100" height="58" rx="8" fill="#fff" /><Rect x="132" y="34" width="76" height="8" rx="4" fill="#c9d5e1" /><Rect x="132" y="48" width="50" height="8" rx="4" fill="#c9d5e1" /><Circle cx="196" cy="64" r="8" fill="#3fa66d" /><Path d="M192 64l3 3 5-6" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" /></>}
      {a === 'training' && <><Rect width="340" height="96" fill="#e9e6f5" /><Rect x="110" y="24" width="120" height="50" rx="6" fill="#fff" /><Path d="M170 74 v10 M150 84 h40" stroke="#b8b0d8" strokeWidth={4} strokeLinecap="round" /><Path d="M125 60 l18-14 14 8 18-20 16 12" fill="none" stroke="#7a3aa0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></>}
    </Svg>
  );
}


const s = StyleSheet.create({
  head: { paddingHorizontal: 22, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  strip: { paddingHorizontal: 22, gap: 8, paddingVertical: 4 },
  chip: { width: 52, paddingVertical: 10, borderRadius: 15, alignItems: 'center', borderWidth: 1 },
  dow: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
  dnum: { fontSize: 18, fontWeight: '600', marginTop: 4 },
  today: { textDecorationLine: 'underline' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  list: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 120, gap: 14 },
  card: {},
  dayHead: { fontSize: 12, fontWeight: '600', letterSpacing: 0.7 },
  dhead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 16 },
  fltRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fleet: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  logo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  ac: { fontSize: 17, fontWeight: '600', marginTop: 1 },
  fleg: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  port: { minWidth: 80 },
  code: { fontSize: 28, fontWeight: '600' },
  tm: { fontSize: 13, marginTop: 6 },
  mid: { flex: 1, alignItems: 'center' },
  midLine: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  dash: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prep: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 12, padding: 12, marginTop: 14 },
  pk: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6 },
  pv: { fontSize: 16, fontWeight: '600', marginTop: 3 },
  meet: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, marginTop: 10 },
  meetT: { fontSize: 15, fontWeight: '600', width: 44 },
  meetTitle: { fontSize: 13, fontWeight: '600' },
  meetCal: { fontSize: 10, letterSpacing: 0.8, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 60 },
});
