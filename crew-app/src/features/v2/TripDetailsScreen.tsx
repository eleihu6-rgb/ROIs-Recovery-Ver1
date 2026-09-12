// Trip Details — full page for a rotation: timeline per leg (leave home / ready /
// check-in / STD / STA), hotel booking when the roster carries one.
import React from 'react';
import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { SectionLabel } from '../../components/v2/rows';
import { PageShell, Hero, ListCard, KvRow } from './PageShell';
import { legView, MON } from './model';
import { useBase, useDutyAlarms } from './useV2';
import { hotelFor, hotelTransfer, legOps } from '../travel/opsInfo';
import type { V2StackParamList } from './nav';

type Props = NativeStackScreenProps<V2StackParamList, 'TripDetails'>;

export function TripDetailsScreen({ route }: Props) {
  const p = useCarrier();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const base = useBase();
  // Record view — a rotation that has already flown still lists the wake-up /
  // leave-home it was reportable against.
  const { byTrip } = useDutyAlarms();
  if (!trip) return <PageShell title="Trip Details"><Text style={{ color: p.ink }}>Trip not found.</Text></PageShell>;
  const legs = trip.legs.map(l => ({
    leg: l,
    v: legView(l, trip, mode, baseTz, byTrip[trip.id]),
    ops: legOps(l, trip, mode, baseTz, { hasLayover: (trip.layoverHours ?? 0) > 0 }),
  }));
  const first = legs[0].v, last = legs[legs.length - 1].v;
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
  return (
    <PageShell title="Trip Details" testID="page-trip-details">
      <Hero h1={`${first.fltNumber} · ${routing}`} h2={`${window} · ${legs.length} leg${legs.length === 1 ? '' : 's'}${trip.layoverHours ? ` · ${Math.round(trip.layoverHours)}h layover` : ''}`} palette={p} />
      {legs.map(({ v, ops }, i) => (
        <View key={i}>
          {/* A single-leg trip already names the flight, route and date in the hero —
              repeating them as a section header is pure duplication. */}
          {legs.length > 1 && (
            <SectionLabel palette={p}>{v.fltNumber} · {v.dep} → {v.arv} · {v.day} {MON[v.monthIdx]}</SectionLabel>
          )}
          <ListCard palette={p}>
            {/* Order = the order the events actually happen (Ryan 2026-09-11):
                wake up → leave home → check in / report, then the flight itself
                schedule (STD/STA) → estimate (ETD/ETA) → actual (ATD/ATA).
                Every row carries a thin line icon, like the city page. */}
            <KvRow icon="alarm" label={v.readyWord} value={v.ready} palette={p} />
            <KvRow icon="run" label="Leave home" value={v.leaveHome} palette={p} />
            <KvRow icon="checkin" label="Check-in / report" value={v.checkIn} palette={p} />
            <KvRow icon="plane" label="STD" value={`${v.depTime} ${v.dep}`} palette={p} />
            <KvRow icon="plane" label="STA" value={`${v.arvTime}${v.arvDayOffset ? ' ' + v.arvDayOffset : ''} ${v.arv}${v.duration ? ` (${v.duration})` : ''}`} palette={p} />
            {ops.etd || ops.eta ? (
              <KvRow icon="clock" label="ETD / ETA" value={`${ops.etd || '—'} → ${ops.eta || '—'}${ops.estimated ? ' · est' : ''}`} palette={p} />
            ) : null}
            {ops.atd || ops.ata ? (
              <KvRow icon="clock" label="ATD / ATA" value={`${ops.atd || '—'} → ${ops.ata || '—'}`} palette={p} />
            ) : null}
            {/* One gate line and one aircraft line — same information, two rows fewer. */}
            <KvRow
              icon="checkin"
              label="Gate"
              value={`${v.dep} ${ops.dep.terminal}·${ops.dep.gate} → ${v.arv} ${ops.arv.terminal}·${ops.arv.gate} (expected)`}
              palette={p}
            />
            <KvRow
              icon="jet"
              label="Aircraft"
              value={[v.fleet, ops.register, `Block ${ops.block || v.duration}`].filter(Boolean).join(' · ')}
              palette={p}
              last={!ops.transfer}
            />
            {/* Departing from a layover: the crew's own hotel transfer, mocked
                (vehicle/plate/driver/contact) until the transport feed exists. */}
            {ops.transfer ? (
              <>
                <KvRow icon="car" label="Hotel pick-up" value={`${ops.transfer.pickup} (expected)`} palette={p} />
                <KvRow icon="car" label="Airport drop-off" value={`${ops.transfer.dropOff} (expected)`} palette={p} />
                <KvRow icon="car" label="Transfer" value={`${ops.transfer.vehicle} · ${ops.transfer.plate}`} palette={p} />
                <KvRow icon="user" label="Driver" value={`${ops.transfer.driver} · ${ops.transfer.phone}`} palette={p} last />
              </>
            ) : null}
          </ListCard>
        </View>
      ))}
      {hotel ? (
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
      ) : null}
    </PageShell>
  );
}
