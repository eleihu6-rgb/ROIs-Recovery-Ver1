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
import { useDutyAlarms } from './useV2';
import type { V2StackParamList } from './nav';

type Props = NativeStackScreenProps<V2StackParamList, 'TripDetails'>;

export function TripDetailsScreen({ route }: Props) {
  const p = useCarrier();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  // Record view — a rotation that has already flown still lists the wake-up /
  // leave-home it was reportable against.
  const { byTrip } = useDutyAlarms();
  if (!trip) return <PageShell title="Trip Details"><Text style={{ color: p.ink }}>Trip not found.</Text></PageShell>;
  const legs = trip.legs.map(l => ({ leg: l, v: legView(l, trip, mode, baseTz, byTrip[trip.id]) }));
  const first = legs[0].v, last = legs[legs.length - 1].v;
  const hotel = trip.legs.find(l => l.hotelBooking)?.hotelBooking;
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
      {legs.map(({ v }, i) => (
        <View key={i}>
          {/* A single-leg trip already names the flight, route and date in the hero —
              repeating them as a section header is pure duplication. */}
          {legs.length > 1 && (
            <SectionLabel palette={p}>{v.fltNumber} · {v.dep} → {v.arv} · {v.day} {MON[v.monthIdx]}</SectionLabel>
          )}
          <ListCard palette={p}>
            {/* Chronological: you wake up, then leave home, then check in — the
                page used to list Leave home before Wake Up. */}
            <KvRow label={v.readyWord} value={v.ready} palette={p} />
            <KvRow label="Leave home" value={v.leaveHome} palette={p} />
            <KvRow label="Check-in / report" value={v.checkIn} palette={p} />
            <KvRow label="STD" value={`${v.depTime} ${v.dep}`} palette={p} />
            <KvRow label="STA" value={`${v.arvTime}${v.arvDayOffset ? ' ' + v.arvDayOffset : ''} ${v.arv}${v.duration ? ` (${v.duration})` : ''}`} palette={p} />
            <KvRow label="Aircraft" value={v.fleet || '—'} palette={p} last />
          </ListCard>
        </View>
      ))}
      {hotel && (
        <View>
          <SectionLabel palette={p}>Layover</SectionLabel>
          <ListCard palette={p}>
            <KvRow label="Hotel" value={hotel.hotelName} palette={p} />
            <KvRow label="Location" value={hotel.location ?? '—'} palette={p} />
            <KvRow label="Nights" value={String(hotel.nights ?? '—')} palette={p} />
            <KvRow label="Check-out" value={hotel.dateOut ?? '—'} palette={p} last />
          </ListCard>
        </View>
      )}
    </PageShell>
  );
}
