// Trip Details — full page for a rotation: timeline per leg (leave home / ready /
// check-in / STD / STA), hotel booking when the roster carries one.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { NavRow, SectionLabel } from '../../components/v2/rows';
import { AppDialog } from '../../components/v2/AppDialog';
import { DashedLine } from '../../components/v2/TicketCard';
import { PageShell, Hero, ListCard, KvRow, Columns } from './PageShell';
import { useLayout } from '../../components/v2/useLayout';
import { legView, MON } from './model';
import { useBase, useDutyAlarms, useDutyCalendar } from './useV2';
import { flightOpsDemo } from './flightOpsDemo';
import { hotelFor, hotelTransfer, legOps } from '../travel/opsInfo';
import type { V2StackParamList } from './nav';
import type { TripLeg } from '../travel/tripCsv';

type Props = NativeStackScreenProps<V2StackParamList, 'TripDetails'>;

export function TripDetailsScreen({ route }: Props) {
  const p = useCarrier();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useBase();
  // Airline schedule → iOS Calendar (restored from v1): one row writes / removes
  // this rotation's wake-up, leave-home, check-in and per-leg entries.
  const calendar = useDutyCalendar();
  // Record view — a rotation that has already flown still lists the wake-up /
  // leave-home it was reportable against.
  const { byTrip } = useDutyAlarms();
  const { wide, tall } = useLayout();
  if (!trip) return <PageShell title="Trip Details"><Text style={{ color: p.ink }}>Trip not found.</Text></PageShell>;
  const legs = trip.legs.map(l => ({
    leg: l,
    v: legView(l, trip, mode, baseTz, byTrip[trip.id]),
    ops: legOps(l, trip, mode, baseTz, { hasLayover: (trip.layoverHours ?? 0) > 0 }),
  }));
  const first = legs[0].v, last = legs[legs.length - 1].v;
  const inCalendar = calendar.isAdded(trip.id);
  // Layover hotel: the roster's own booking when it has one, otherwise a
  // deterministic stand-in (the F8/NOC feed has no hotel table yet) — labelled
  // "expected" so it can never be mistaken for a confirmation.
  const hotel = hotelFor(trip, base);
  const transfer = hotel ? hotelTransfer(hotel.airport, first.fltNumber, hotel) : null;
  // Full routing, not just base→base: a same-base turn rendered "ADD → ADD", which
  // hides where the crew actually went.
  const routing = [first.dep, ...legs.map(({ v }) => v.arv)].join(' → ');
  const sameDay = first.day === last.day && first.monthIdx === last.monthIdx && first.year === last.year;
  const window = sameDay
    ? `${first.day} ${MON[first.monthIdx]} ${first.year}`
    : `${first.day} ${MON[first.monthIdx]} – ${last.day} ${MON[last.monthIdx]} ${last.year}`;
  const calendarSection = (
    <>
      <SectionLabel palette={p}>iPhone Calendar</SectionLabel>
      <ListCard palette={p}>
        <NavRow
          icon={inCalendar ? 'calcheck' : 'cal'}
          label={inCalendar ? 'In your iPhone Calendar' : 'Add to iPhone Calendar'}
          value={inCalendar ? 'Tap to remove' : 'Wake-up · leave home · check-in · flights'}
          palette={p}
          onPress={() => calendar.toggle(trip)}
          testID="trip-calendar-toggle"
        />
      </ListCard>
    </>
  );
  const legSections = legs.map(({ leg, v, ops }, i) => (
    <View key={i}>
      {/* A single-leg trip already names the flight, route and date in the hero —
          repeating them as a section header is pure duplication. */}
      {legs.length > 1 && (
        <SectionLabel palette={p}>{v.fltNumber} · {v.dep} → {v.arv} · {v.day} {MON[v.monthIdx]}</SectionLabel>
      )}
      {/* One leg = one grid card (Ryan 2026-10-08: one style, not list rows + a
          grid). Cells run in the order things happen: the crew's own markers,
          departure (STD/ETD … off-block, ATD), arrival (STA/ETA/ATA, block),
          then where (terminal / gate / stand, the arrival's belt). Same marker
          style as the Schedule card's wake-up / leave-home / check-in cells.
          Ops values other than STD / ETD / STA / ETA / actuals are DEMO
          (flightOpsDemo.ts); its passenger check-in time is not shown — it read
          as a second "check-in" next to the crew's report. */}
      <ListCard palette={p}>
        <View style={s.ops} testID={`flight-ops-grid-${i}`}>
          {legGrid(leg, v, ops).map((row, r) => (
            <View key={r}>
              {r > 0 && <DashedLine color={p.cardLine} />}
              <View style={s.opsRow}>
                {row.map((c, j) => {
                  const align = j === 0 ? s.left : j === row.length - 1 ? s.right : s.center;
                  return (
                    <View key={c.key} style={s.opsCell}>
                      <Text style={[s.pk, align, { color: p.cardSoft }]} numberOfLines={1}>{c.label.toUpperCase()}</Text>
                      <Text style={[s.pv, align, { color: p.cardInk }]} numberOfLines={1} adjustsFontSizeToFit testID={`ops-${c.key}-${i}`}>{c.value}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ListCard>
      {/* Departing from a layover: the crew's own hotel transfer, mocked
          (vehicle/plate/driver/contact) until the transport feed exists. */}
      {ops.transfer ? (
        <>
          <SectionLabel palette={p}>Hotel transfer</SectionLabel>
          <ListCard palette={p}>
            <KvRow icon="car" label="Hotel pick-up" value={`${ops.transfer.pickup} (expected)`} palette={p} />
            <KvRow icon="car" label="Airport drop-off" value={`${ops.transfer.dropOff} (expected)`} palette={p} />
            <KvRow icon="car" label="Transfer" value={`${ops.transfer.vehicle} · ${ops.transfer.plate}`} palette={p} />
            <KvRow icon="user" label="Driver" value={`${ops.transfer.driver} · ${ops.transfer.phone}`} palette={p} last />
          </ListCard>
        </>
      ) : null}
    </View>
  ));
  const hotelSection = hotel ? (
    <View>
      <SectionLabel palette={p}>Layover</SectionLabel>
      <ListCard palette={p}>
        <KvRow icon="bed" label="Hotel" value={`${hotel.name}${hotel.mocked ? ' (expected)' : ''}`} palette={p} />
        <KvRow icon="house" label="Location" value={hotel.address} palette={p} />
        <KvRow icon="clock" label="Check-in / out" value={`${hotel.checkIn} → ${hotel.checkOut}`} palette={p} />
        <KvRow icon="moon" label="Nights" value={String(hotel.nights)} palette={p} />
        <KvRow icon="car" label="Transport" value={hotel.transfer} palette={p} />
        <KvRow icon="headset" label="Phone" value={hotel.phone} palette={p} last={!transfer} />
        {transfer ? (
          <>
            <KvRow icon="car" label="Pick-up / drop-off" value={`${transfer.pickup} → ${transfer.dropOff} (expected)`} palette={p} />
            <KvRow icon="car" label="Vehicle" value={`${transfer.vehicle} · ${transfer.plate}`} palette={p} />
            <KvRow icon="user" label="Driver" value={`${transfer.driver} · ${transfer.phone}`} palette={p} last />
          </>
        ) : null}
      </ListCard>
    </View>
  ) : null;
  return (
    // The page lays itself out on the Duo (full-width hero over its own columns).
    <PageShell title="Trip Details" testID="page-trip-details" layout="full">
      <Hero h1={`${first.fltNumber} · ${routing}`} h2={`${window} · ${legs.length} leg${legs.length === 1 ? '' : 's'}${trip.layoverHours ? ` · ${Math.round(trip.layoverHours)}h layover` : ''}`} palette={p} />
      {wide ? (
        // iPhone Duo inner screen: legs left, calendar + layover hotel right.
        <Columns>
          <View>{legSections}</View>
          <View>{calendarSection}{hotelSection}</View>
        </Columns>
      ) : tall ? (
        // Rotated Duo: the two short cards (calendar, hotel) side by side under
        // the hero, then the legs at full width.
        <>
          <View testID="trip-tall-cards">
            <Columns>
              <View>{calendarSection}</View>
              {hotelSection ? <View>{hotelSection}</View> : null}
            </Columns>
          </View>
          {legSections}
        </>
      ) : (
        <>
          {calendarSection}
          {legSections}
          {hotelSection}
        </>
      )}

      {/* Airline schedule → iOS Calendar outcome (pop-up standard). */}
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

type Cell = { key: string; label: string; value: string };

/** The leg card's chronological rows (see the comment where it renders). */
function legGrid(leg: TripLeg, v: ReturnType<typeof legView>, ops: ReturnType<typeof legOps>): Cell[][] {
  const demo = new Map(flightOpsDemo({
    fltNumber: v.fltNumber,
    dep: v.dep,
    arv: v.arv,
    fleet: v.fleet,
    stdUtc: leg.flightDateUTC,
    etdUtc: leg.estDepUtc || leg.actDepUtc,
    stdClock: v.depTime,
  }).flat().map(c => [c.key, c] as const));
  const d = (key: string): Cell => demo.get(key) ?? { key, label: key, value: '—' };
  return [
    [
      { key: 'ready', label: v.readyWord, value: v.ready },
      { key: 'leave', label: 'Leave home', value: v.leaveHome },
      { key: 'report', label: 'Report', value: v.checkIn },
      { key: 'aircraft', label: 'Aircraft', value: [v.fleet, ops.register].filter(Boolean).join(' · ') || '—' },
    ],
    [d('std'), d('etd')],
    [d('boarding'), d('door'), d('offblock'), { key: 'atd', label: 'ATD', value: ops.atd || '—' }],
    [
      { key: 'sta', label: 'STA', value: `${v.arvTime}${v.arvDayOffset ? ' ' + v.arvDayOffset : ''}` },
      { key: 'eta', label: 'ETA', value: ops.eta || '—' },
      { key: 'ata', label: 'ATA', value: ops.ata || '—' },
      { key: 'block', label: 'Block', value: ops.block || v.duration || '—' },
    ],
    [d('terminal'), d('gate'), d('stand'), d('belt')],
  ];
}

// Marker typography shared with the Schedule card's wake-up / leave-home / check-in
// cells: small spaced label over a semibold value.
const s = StyleSheet.create({
  ops: { paddingVertical: 6 },
  opsRow: { flexDirection: 'row', paddingVertical: 9, gap: 6 },
  opsCell: { flex: 1, minWidth: 0 },
  pk: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6 },
  pv: { fontSize: 16, fontWeight: '600', marginTop: 3 },
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
});
