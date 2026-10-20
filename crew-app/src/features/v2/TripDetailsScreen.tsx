// Trip Details — the rotation as one timeline: a duty-level rail node with the
// duty's report and published totals, then one pass per sector inside it. A
// layover between duties becomes a dashed rest stop on the same rail.
//
// The rail carries the hierarchy the crew scans for: a square D1/D2 node for
// the duty, small round sector nodes for the flights inside it. The calendar
// write action is pinned to the bottom so it stays reachable on a long rotation.
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppSelector } from '../../store';
import { useCarrier, type CarrierPalette } from '../../theme/carrier';
import { Icon } from '../../components/v2/icons';
import { AppDialog } from '../../components/v2/AppDialog';
import { DashedLine } from '../../components/v2/TicketCard';
import { PageShell, Hero } from './PageShell';
import { legView, MON, type LegView } from './model';
import { useBase, useDutyAlarms, useDutyCalendar } from './useV2';
import { flightOpsDemo } from './flightOpsDemo';
import { hotelFor, hotelTransfer, legOps, type HotelInfo, type LegOps, type TransferInfo } from '../travel/opsInfo';
import { fmtDutyMinutes, groupDuties, type DutyGroup } from './dutyGroups';
import type { V2StackParamList } from './nav';
import type { Trip, TripLeg } from '../travel/tripCsv';
import type { TimeZoneMode } from '../settings/settingsSlice';
import type { EffectiveAlarm } from '../settings/alarmSetup';

type Props = NativeStackScreenProps<V2StackParamList, 'TripDetails'>;

interface PassRow {
  leg: TripLeg;
  v: LegView;
  ops: LegOps;
  dutyStart: boolean;
}

function fmtHours(hours: number): string {
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  return mins ? `${whole}h ${String(mins).padStart(2, '0')}m` : `${whole}h`;
}

export function TripDetailsScreen({ route }: Props) {
  const p = useCarrier();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useBase();
  const calendar = useDutyCalendar();
  const { byTrip } = useDutyAlarms();
  if (!trip) return <PageShell title="Trip Details"><Text style={{ color: p.ink }}>Trip not found.</Text></PageShell>;
  return <TripTimeline trip={trip} p={p} mode={mode} baseTz={baseTz} base={base} calendar={calendar} alarm={byTrip[trip.id]} />;
}

function TripTimeline({
  trip, p, mode, baseTz, base, calendar, alarm,
}: {
  trip: Trip;
  p: CarrierPalette;
  mode: TimeZoneMode;
  baseTz: string;
  base: string;
  calendar: ReturnType<typeof useDutyCalendar>;
  alarm: EffectiveAlarm | undefined;
}) {
  const groups = groupDuties(trip);
  const rows = groups.map(group => ({
    group,
    passes: group.legs.map<PassRow>((leg, i) => ({
      leg,
      // Alarm markers exist once per rotation, at the first duty's report.
      v: legView(leg, trip, mode, baseTz, i === 0 && group.index === 0 ? alarm : undefined, i === 0 ? group.reportUTC : undefined),
      ops: legOps(leg, trip, mode, baseTz, { hasLayover: (trip.layoverHours ?? 0) > 0 }),
      dutyStart: i === 0,
    })),
  }));
  const all = rows.flatMap(row => row.passes);
  if (!all.length) {
    return (
      <PageShell title="Trip Details" testID="page-trip-details" layout="full">
        <Hero h1="No scheduled sectors" h2="This rotation has no flight legs." palette={p} />
      </PageShell>
    );
  }
  const first = all[0].v;
  const last = all[all.length - 1].v;
  const routing = [first.dep, ...all.map(({ v }) => v.arv)].join(' → ');
  const sameDay = first.day === last.day && first.monthIdx === last.monthIdx && first.year === last.year;
  const window = sameDay
    ? `${first.day} ${MON[first.monthIdx]} ${first.year}`
    : `${first.day} ${MON[first.monthIdx]} – ${last.day} ${MON[last.monthIdx]} ${last.year}`;
  const inCalendar = calendar.isAdded(trip.id);
  const hotel = hotelFor(trip, base);
  const transfer = hotel ? hotelTransfer(hotel.airport, first.fltNumber, hotel) : null;
  const dutyCount = groups.length;
  const h1 = all.length === 1 ? `${first.fltNumber} · ${routing}` : routing;
  const h2 = `${window} · ${dutyCount} dut${dutyCount === 1 ? 'y' : 'ies'} · ${all.length} sector${all.length === 1 ? '' : 's'}${trip.layoverHours ? ` · ${Math.round(trip.layoverHours)}h layover` : ''}`;

  return (
    // PageShell scroll=false: the timeline scrolls, the calendar action stays put.
    <PageShell title="Trip Details" testID="page-trip-details" layout="full" scroll={false}>
      <View style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} testID="trip-timeline-scroll">
          <Hero h1={h1} h2={h2} palette={p} />
          <View style={s.timeline} testID="trip-timeline">
            {rows.map(({ group, passes }, gi) => (
              <View key={group.key}>
                {gi > 0 ? (
                  <RestStop
                    airport={group.layover?.airport ?? ''}
                    hours={group.layover?.hours ?? null}
                    hotel={hotel}
                    transfer={transfer}
                    p={p}
                    testID={`rest-stop-${group.index}`}
                  />
                ) : null}
                <DutyBlock
                  group={group}
                  groups={groups.length}
                  passes={passes}
                  p={p}
                />
              </View>
            ))}
            {/* A single-duty rotation can still end in a layover (the return
                sector is outside this capture): keep the hotel on the rail. */}
            {hotel && dutyCount < 2 ? (
              <RestStop
                airport={hotel.airport}
                hours={null}
                hotel={hotel}
                transfer={transfer}
                p={p}
                testID="rest-stop-after-duty"
              />
            ) : null}
          </View>
        </ScrollView>
        <View style={[s.calBar, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]}>
          <Pressable
            testID="trip-calendar-toggle"
            onPress={() => calendar.toggle(trip)}
            style={({ pressed }) => [s.calPress, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={inCalendar ? 'Remove this duty from iPhone Calendar' : 'Add this duty to iPhone Calendar'}
          >
            <View style={[s.calIcon, { backgroundColor: p.cardInset }]}>
              <Icon name={inCalendar ? 'calcheck' : 'cal'} size={20} color={p.btn} strokeWidth={1.8} />
            </View>
            <View style={s.calText}>
              <Text style={[s.calTitle, { color: p.cardInk }]} numberOfLines={1}>
                {inCalendar ? 'In your iPhone Calendar' : 'Add to iPhone Calendar'}
              </Text>
              <Text style={[s.calSub, { color: p.cardSoft }]} numberOfLines={1}>
                {inCalendar ? 'Tap to remove' : 'Wake-up · leave home · check-in · flights'}
              </Text>
            </View>
            <Icon name="chev" size={16} color={p.cardSoft} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>

      <AppDialog
        visible={calendar.dialog !== null}
        onClose={calendar.closeDialog}
        onConfirm={calendar.closeDialog}
        tone={calendar.dialog?.tone ?? 'neutral'}
        title={calendar.dialog?.title ?? ''}
        message={calendar.dialog?.message}
        confirmLabel="Got it"
        testID="duty-calendar-dialog"
      />
    </PageShell>
  );
}

function DutyBlock({
  group, groups, passes, p,
}: {
  group: DutyGroup;
  groups: number;
  passes: PassRow[];
  p: CarrierPalette;
}) {
  const first = passes[0];
  const v = first.v;
  const metrics = [
    group.fdpMinutes != null ? { label: 'FDP', value: fmtDutyMinutes(group.fdpMinutes) } : null,
    group.dpMinutes != null ? { label: 'DP', value: fmtDutyMinutes(group.dpMinutes) } : null,
    group.blockMinutes != null ? { label: 'BLOCK', value: fmtDutyMinutes(group.blockMinutes) } : null,
    group.restHours != null ? { label: 'REST', value: fmtHours(group.restHours) } : null,
  ].filter((m): m is { label: string; value: string } => m !== null);
  const markers = [
    v.ready !== '—' ? { label: v.readyWord.toUpperCase(), value: v.ready } : null,
    v.leaveHome !== '—' ? { label: 'LEAVE', value: v.leaveHome } : null,
  ].filter((m): m is { label: string; value: string } => m !== null);

  return (
    <View style={s.group} testID={`duty-block-${group.index}`}>
      {/* One solid rail spans the whole duty; its square node is the duty level. */}
      <View style={[s.rail, { backgroundColor: p.btn }]} />
      <View style={s.row}>
        <View style={s.gutter}>
          <View style={[s.dutyNode, { backgroundColor: p.btn }]} testID={`duty-node-${group.index}`}>
            <Text style={s.dutyNodeText}>{group.index + 1}</Text>
          </View>
        </View>
        <View style={[s.dutyBand, { backgroundColor: p.card }]} testID={`duty-band-${group.index}`}>
          <View style={s.dutyHead}>
            <Text style={[s.dutyKicker, { color: p.cardSoft }]}>
              {groups > 1 ? `DUTY ${group.index + 1} OF ${groups}` : `DUTY ${group.index + 1}`}
            </Text>
            <Text style={[s.dutyDate, { color: p.cardSoft }]}>
              {v.day} {MON[v.monthIdx]}
            </Text>
          </View>
          <View style={[s.dutyMain, markers.length ? s.dutyMainRight : null]}>
            {markers.length ? (
              <View style={s.markers}>
                {markers.map(marker => (
                  <View key={marker.label} style={[s.marker, { borderColor: p.cardLine }]}>
                    <Text style={[s.markerLabel, { color: p.cardSoft }]}>{marker.label}</Text>
                    <Text style={[s.markerValue, { color: p.cardInk }]}>{marker.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View>
              <Text style={[s.reportLabel, { color: p.cardSoft }]}>REPORT</Text>
              <Text style={[s.reportValue, { color: p.cardInk }]} testID={`duty-report-${group.index}`}>{v.checkIn}</Text>
            </View>
          </View>
          {metrics.length ? (
            <View style={[s.metrics, { borderTopColor: p.cardLine }]}>
              {metrics.map(metric => (
                <View key={metric.label} style={s.metric}>
                  <Text style={[s.metricLabel, { color: p.cardSoft }]}>{metric.label}</Text>
                  <Text style={[s.metricValue, { color: p.cardInk }]} numberOfLines={1} adjustsFontSizeToFit>
                    {metric.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {passes.map((pass, i) => (
        <View style={s.row} key={`${group.key}-${pass.leg.fltNumber}-${i}`}>
          <View style={s.gutter}>
            <View style={[s.segNode, { borderColor: p.btn, backgroundColor: p.cardSolid }]} testID={`segment-node-${group.index}-${i}`}>
              <Text style={[s.segNodeText, { color: p.btn }]}>{i + 1}</Text>
            </View>
          </View>
          <FlightPass pass={pass} index={i} p={p} />
        </View>
      ))}
    </View>
  );
}

function FlightPass({ pass, index, p }: { pass: PassRow; index: number; p: CarrierPalette }) {
  const { leg, v, ops } = pass;
  const demo = new Map(
    flightOpsDemo({
      fltNumber: v.fltNumber,
      dep: v.dep,
      arv: v.arv,
      fleet: v.fleet,
      stdUtc: leg.flightDateUTC,
      etdUtc: leg.estDepUtc || leg.actDepUtc,
      stdClock: v.depTime,
    }).flat().map(cell => [cell.key, cell] as const),
  );
  const demoValue = (key: string): string => demo.get(key)?.value ?? '—';
  const cells = [
    { key: 'etd', label: 'ETD', value: ops.etd || demoValue('etd') },
    { key: 'eta', label: 'ETA', value: ops.eta || '—' },
    { key: 'atd', label: 'ATD', value: ops.atd || '—' },
    { key: 'ata', label: 'ATA', value: ops.ata || '—' },
  ];
  const progress = [
    { key: 'boarding', label: 'BOARDING', value: demoValue('boarding') },
    { key: 'door', label: 'DOOR CLOSE', value: demoValue('door') },
    { key: 'offblock', label: 'OFF-BLOCK', value: demoValue('offblock') },
    { key: 'block', label: 'BLK', value: ops.block || v.duration || '—' },
  ];
  return (
    <View style={[s.pass, { backgroundColor: p.cardSolid, borderColor: p.cardLine }]} testID={`flight-pass-${index}`}>
      <View style={s.passHead}>
        <Text style={[s.flt, { color: p.cardInk }]}>{v.fltNumber}</Text>
        <Text style={[s.passMeta, { color: p.cardSoft }]} numberOfLines={1}>
          {[v.fleet, ops.register].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={s.route}>
        <View style={s.endpoint}>
          <Text style={[s.arp, { color: p.cardInk }]}>{v.dep}</Text>
          <Text style={[s.arpLabel, { color: p.cardSoft }]}>STD</Text>
          <Text style={[s.arpTime, { color: p.cardInk }]} testID={`ops-std-${index}`}>{v.depTime}</Text>
        </View>
        <View style={s.routeMid}>
          <Text style={[s.routeDur, { color: p.cardSoft }]}>{v.duration || '—'}</Text>
          <View style={[s.routeLine, { backgroundColor: p.cardLine }]} />
        </View>
        <View style={[s.endpoint, s.endpointRight]}>
          <View style={s.arpRow}>
            <Text style={[s.arp, { color: p.cardInk }]}>{v.arv}</Text>
            {!!v.arvDayOffset && (
              <Text style={[s.dayOffset, { color: p.cardSoft, borderColor: p.cardLine }]}>{v.arvDayOffset}</Text>
            )}
          </View>
          <Text style={[s.arpLabel, { color: p.cardSoft }]}>STA</Text>
          <Text style={[s.arpTime, { color: p.cardInk }]} testID={`ops-sta-${index}`}>{v.arvTime}</Text>
        </View>
      </View>

      <View style={[s.grid, { borderTopColor: p.cardLine }]}>
        {[cells, progress].map((row, r) => (
          <View key={r} testID={`flight-ops-row-${index}-${r}`}>
            {r > 0 && <DashedLine color={p.cardLine} />}
            <View style={s.gridRow}>
              {row.map(cell => (
                <View key={cell.key} style={s.gridCell} testID={`ops-cell-${cell.key}-${index}`}>
                  <Text style={[s.gridLabel, { color: p.cardSoft }]} numberOfLines={1}>{cell.label}</Text>
                  <Text
                    style={[s.gridValue, { color: p.cardInk }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    testID={`ops-${cell.key}-${index}`}
                  >
                    {cell.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={[s.whereRow, { borderTopColor: p.cardLine }]}>
        <Text style={[s.whereText, { color: p.cardSoft }]} numberOfLines={1}>
          Terminal <Text style={[s.whereValue, { color: p.cardInk }]} testID={`ops-terminal-${index}`}>{demoValue('terminal')}</Text>
          {' · '}Gate <Text style={[s.whereValue, { color: p.cardInk }]} testID={`ops-gate-${index}`}>{demoValue('gate')}</Text>
          {' · '}Stand <Text style={[s.whereValue, { color: p.cardInk }]} testID={`ops-stand-${index}`}>{demoValue('stand')}</Text>
        </Text>
        <Text style={[s.whereText, { color: p.cardSoft }]} numberOfLines={1}>
          Belt <Text style={[s.whereValue, { color: p.cardInk }]} testID={`ops-belt-${index}`}>{demoValue('belt')}</Text>
        </Text>
      </View>
    </View>
  );
}

/**
 * The off-duty stretch of the spine. RN's `borderStyle: 'dashed'` only supports
 * a uniform border and warns ("Unsupported dashed / dotted border style") for a
 * single-side dashed border, so the rail is drawn with SVG like DashedLine.
 */
function VerticalDashedRail({ color }: { color: string }): React.JSX.Element {
  const [height, setHeight] = React.useState(0);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setHeight(e.nativeEvent.layout.height);
  }, []);
  return (
    <View style={s.railWrap} onLayout={onLayout} testID="rest-rail-dashed">
      {height > 0 ? (
        <Svg width={2} height={height}>
          <Line x1={1} y1={0} x2={1} y2={height} stroke={color} strokeWidth={2} strokeDasharray="4 4" />
        </Svg>
      ) : null}
    </View>
  );
}

function RestStop({
  airport, hours, hotel, transfer, p, testID,
}: {
  airport: string;
  hours: number | null;
  hotel: HotelInfo | null;
  transfer: TransferInfo | null;
  p: CarrierPalette;
  testID: string;
}) {
  return (
    <View style={s.row} testID={testID}>
      <View style={s.gutter}>
        {/* Dashed between duties: the spine pauses while the crew is off duty. */}
        <VerticalDashedRail color={p.inkFaint} />
        <View style={[s.restDot, { backgroundColor: p.inkFaint }]} />
      </View>
      <View style={[s.rest, { backgroundColor: p.cardInset, borderColor: p.cardLine }]}>
        <View style={s.restHead}>
          <Text style={[s.restKicker, { color: p.cardSoft }]}>
            LAYOVER{airport ? ` · ${airport}` : ''}
          </Text>
          {hours != null && <Text style={[s.restHours, { color: p.cardInk }]}>{fmtHours(hours)}</Text>}
        </View>
        {hotel ? (
          <>
            <Text style={[s.hotelName, { color: p.cardInk }]}>
              {hotel.name}{hotel.mocked ? ' (expected)' : ''}
            </Text>
            <Text style={[s.hotelMeta, { color: p.cardSoft }]}>
              {hotel.checkIn} → {hotel.checkOut} · {hotel.nights} night{hotel.nights === 1 ? '' : 's'}
            </Text>
            <Text style={[s.hotelMeta, { color: p.cardSoft }]}>{hotel.address}</Text>
            <Text style={[s.hotelMeta, { color: p.cardSoft }]}>{hotel.transfer}</Text>
            {transfer ? (
              <>
                <Text style={[s.hotelMeta, { color: p.cardSoft }]}>
                  Pick-up {transfer.pickup} → drop-off {transfer.dropOff} (expected)
                </Text>
                <Text style={[s.hotelMeta, { color: p.cardSoft }]}>
                  {transfer.vehicle} · {transfer.plate} · {transfer.driver} · {transfer.phone}
                </Text>
              </>
            ) : null}
            <Text style={[s.hotelMeta, { color: p.cardSoft }]}>{hotel.phone}</Text>
          </>
        ) : (
          <Text style={[s.hotelMeta, { color: p.cardSoft }]}>Hotel details not published.</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 28 },
  timeline: { marginTop: 2 },

  // Rail geometry: 30 pt gutter, 2 pt spine centred at x=14; the row content
  // starts at x=30. Duty nodes are squares, sector nodes are smaller circles.
  group: { position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  gutter: { width: 30, alignSelf: 'stretch' },
  rail: { position: 'absolute', left: 13, top: 16, bottom: 18, width: 2, borderRadius: 1, opacity: 0.55 },
  railWrap: { position: 'absolute', left: 13, top: 0, bottom: 0, width: 2 },
  dutyNode: { width: 22, height: 22, borderRadius: 6, marginTop: 4, marginLeft: 3, alignItems: 'center', justifyContent: 'center' },
  dutyNodeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  segNode: { width: 15, height: 15, borderRadius: 7.5, borderWidth: 1.5, marginTop: 15, marginLeft: 6.5, alignItems: 'center', justifyContent: 'center' },
  segNodeText: { fontSize: 8, fontWeight: '700' },
  restDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 20, marginLeft: 10.5 },

  dutyBand: { flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2, marginBottom: 10 },
  dutyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dutyKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  dutyDate: { fontSize: 11, fontWeight: '500' },
  dutyMain: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  // Markers come first in reading order (wake-up → leave → report); reverse the
  // visual row so the big report time keeps the left edge on the band.
  dutyMainRight: { flexDirection: 'row-reverse' },
  reportLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  reportValue: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
  markers: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  marker: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  markerLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  markerValue: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metrics: { flexDirection: 'row', borderTopWidth: 1, marginTop: 10, paddingTop: 8, paddingBottom: 6 },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  metricValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },

  pass: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 8, marginBottom: 10 },
  passHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  flt: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  passMeta: { flexShrink: 1, textAlign: 'right', fontSize: 11, fontWeight: '500' },
  route: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  endpoint: { minWidth: 64 },
  endpointRight: { alignItems: 'flex-end' },
  arpRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arp: { fontSize: 23, fontWeight: '700', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  arpLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.7, marginTop: 1 },
  arpTime: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayOffset: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 3, fontSize: 9, fontWeight: '700' },
  routeMid: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  routeDur: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'], marginBottom: 4 },
  routeLine: { alignSelf: 'stretch', height: 1 },
  grid: { borderTopWidth: 1, marginTop: 8 },
  gridRow: { flexDirection: 'row', paddingVertical: 6, gap: 6 },
  gridCell: { flex: 1, minWidth: 0 },
  gridLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  gridValue: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },
  whereRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, paddingTop: 6 },
  whereText: { fontSize: 10, fontWeight: '500' },
  whereValue: { fontWeight: '600' },

  rest: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, marginTop: 2, marginBottom: 10 },
  restHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  restKicker: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  restHours: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hotelName: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  hotelMeta: { fontSize: 11, marginTop: 2, lineHeight: 15 },

  calBar: { borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  calPress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calText: { flex: 1, minWidth: 0 },
  calTitle: { fontSize: 14, fontWeight: '600' },
  calSub: { fontSize: 11, marginTop: 1 },
});
