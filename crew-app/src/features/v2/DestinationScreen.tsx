// Full-screen destination viewer (Home ▸ Explore your destinations ▸ tap a card).
//
// Ver1 style (mock `.dest .grad`): the landmark photo carries the whole page and
// the detail is WRITTEN ON THE PICTURE over a bottom gradient — no white panel:
//   city + flight line, then FLIGHT (STD/STA → ETD/ETA → ATD/ATA, gate, tail,
//   block), LAYOVER HOTEL and TRANSFER blocks, all in white type.
// Swiping left/right pages through the other upcoming cities.
//
// One photo page per city; the scrim, header and info block are single instances
// that follow the visible page, so a screen reader (and Maestro) sees one of each.
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { Icon, type IconName } from '../../components/v2/icons';
import { hotelFor, hotelTransfer, legOps, type HotelInfo, type LegOps } from '../travel/opsInfo';
import { useBase, useDestinations, type DestinationEntry } from './useV2';
import { MON } from './model';
import { useV2Nav, type V2StackParamList } from './nav';

type Props = NativeStackScreenProps<V2StackParamList, 'Destination'>;

/** How much of the screen the (compact) type-on-photo block may occupy. */
const INFO_MAX = '54%';

/** Dark bottom gradient so white type stays readable on any photo. */
function Scrim() {
  return (
    <View style={s.scrimWrap} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="destScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.42" stopColor="#000" stopOpacity={0.42} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.88} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#destScrim)" />
      </Svg>
    </View>
  );
}

/**
 * One compact line: a thin line-icon + a single run of type. Ryan's polish pass —
 * "more compact for less block of city view, less lines, some simple line style
 * icon" — replaced the label/value rows with this so the photo stays the page.
 */
function Line({
  icon,
  text,
  extra,
  muted,
}: {
  icon: IconName;
  text: string;
  extra?: string;
  muted?: boolean;
}) {
  if (!text) {
    return null;
  }
  return (
    <View style={s.line}>
      <Icon name={icon} size={16} color="rgba(255,255,255,0.72)" strokeWidth={1.6} />
      <Text style={[s.lineText, muted ? s.lineTextMuted : null]} numberOfLines={1}>
        {text}
        {extra ? <Text style={s.lineExtra}> {extra}</Text> : null}
      </Text>
    </View>
  );
}

function InfoBlock({
  entry,
  ops,
  hotel,
}: {
  entry: DestinationEntry;
  ops: LegOps;
  hotel: HotelInfo | null;
}) {
  const insets = useSafeAreaInsets();
  const leg = entry.leg;
  const transfer = hotel ? hotelTransfer(hotel.airport, leg.fltNumber, hotel) : null;
  return (
    <ScrollView
      style={s.infoWrap}
      contentContainerStyle={[s.infoBody, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      testID="dest-panel"
    >
      <Text style={s.airport}>{entry.city.airport}</Text>
      <Text style={s.city} testID="dest-city">{entry.city.name}</Text>
      <Text style={s.sub}>
        {leg.fltNumber}{leg.fleet ? ` · ${leg.fleet}` : ''} · {leg.day} {MON[leg.monthIdx]} {leg.year}
      </Text>

      {/* Event order (Ryan): schedule → estimate → actual, then the aircraft, then
          the layover. One line each, icon-led, so the photo keeps the screen. */}
      <Line
        icon="plane"
        text={`STD ${leg.depTime} → ${leg.arvTime}${leg.arvDayOffset ? ` ${leg.arvDayOffset}` : ''}`}
      />
      <Line
        icon="clock"
        text={
          ops.estimated
            ? `ETD ${ops.etd || '—'} · ETA ${ops.eta || '—'}`
            : 'ETD / ETA · no update yet'
        }
        muted={!ops.estimated}
      />
      <Line
        icon="clock"
        text={ops.atd || ops.ata ? `ATD ${ops.atd || '—'} · ATA ${ops.ata || '—'}` : ''}
      />
      <Line
        icon="checkin"
        text={`Gate ${ops.dep.terminal}·${ops.dep.gate} → ${ops.arv.terminal}·${ops.arv.gate}`}
        extra="expected"
      />
      <Line
        icon="jet"
        text={[leg.fleet, ops.register, ops.block || leg.duration].filter(Boolean).join(' · ')}
      />

      {hotel ? (
        <View style={s.groupTop}>
          <Line icon="bed" text={hotel.name} extra={hotel.mocked ? 'expected' : 'booked'} />
          <Line icon="house" text={hotel.address} muted />
          <Line
            icon="clock"
            text={`Check-in ${hotel.checkIn} · out ${hotel.checkOut} · ${hotel.nights} night${hotel.nights === 1 ? '' : 's'}`}
          />
          {transfer ? (
            <>
              <Line
                icon="car"
                text={`${transfer.vehicle} · ${transfer.plate}`}
                extra="expected"
              />
              <Line
                icon="user"
                text={`${transfer.driver} · ${transfer.phone}`}
                extra={`· pick-up ${transfer.pickup} · drop-off ${transfer.dropOff}`}
              />
            </>
          ) : null}
        </View>
      ) : (
        <Line icon="bed" text="Day return — no hotel" muted />
      )}
    </ScrollView>
  );
}

export function DestinationScreen({ route }: Props) {
  const p = useCarrier();
  const nav = useV2Nav();
  const base = useBase();
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [now] = useState(() => new Date());
  const destinations = useDestinations(now);
  const list = useRef<FlatList<DestinationEntry>>(null);
  const [page, setPage] = useState(() => Math.max(0, Math.min(route.params.index, destinations.length - 1)));
  const current: DestinationEntry | undefined = destinations[Math.min(page, destinations.length - 1)];

  const ops = useMemo(
    () => (current
      ? legOps(current.trip.legs[0], current.trip, mode, baseTz, { hasLayover: (current.trip.layoverHours ?? 0) > 0 })
      : null),
    [current, mode, baseTz],
  );
  const hotel = useMemo(() => (current ? hotelFor(current.trip, base) : null), [current, base]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.index;
    if (first != null) {
      setPage(first);
    }
  }).current;

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)));
  };

  if (!current || !ops) {
    return (
      <View style={[s.empty, { backgroundColor: p.g1 }]} testID="page-destination">
        <Text style={{ color: p.ink }}>No upcoming destinations.</Text>
        <Pressable onPress={() => nav.goBack()} style={[s.emptyBtn, { backgroundColor: p.btn }]} testID="dest-back">
          <Text style={s.emptyBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  // Carrier ground shows for the instant before the photo decodes.
  return (
    <View style={[s.root, { backgroundColor: p.g1 }]} testID="page-destination">
      <FlatList
        ref={list}
        data={destinations}
        keyExtractor={d => d.city.airport}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={page}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item }) => (
          <ImageBackground
            source={item.city.image}
            style={{ width, height }}
            resizeMode="cover"
            testID={`dest-photo-${item.city.airport}`}
          >
            <View style={s.topScrim} />
          </ImageBackground>
        )}
        testID="dest-pager"
      />

      <Scrim />

      {/* Header floats over the photo: back, page dots, position, trip details. */}
      <View style={[s.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={s.iconBtn} testID="dest-back" accessibilityLabel="back">
          <Icon name="back" size={24} color="#fff" strokeWidth={1.8} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={s.dots} pointerEvents="none">
          {destinations.map((d, i) => (
            <View key={d.city.airport} style={[s.dot, i === page ? s.dotOn : null]} />
          ))}
        </View>
        <Text style={s.position} testID="dest-position">{`${page + 1} / ${destinations.length}`}</Text>
        <Pressable
          onPress={() => nav.navigate('TripDetails', { tripId: current.trip.id })}
          style={s.headCta}
          testID="dest-trip-details"
        >
          <Text style={s.headCtaText}>Trip details</Text>
          <Icon name="chev" size={14} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>

      <InfoBlock
        entry={current}
        ops={ops}
        hotel={hotel}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBtn: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, marginTop: 16 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 170, backgroundColor: 'rgba(0,0,0,0.32)' },
  scrimWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%' },
  head: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { backgroundColor: '#fff', width: 16 },
  position: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.92 },
  headCta: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)' },
  headCtaText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  infoWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: INFO_MAX },
  infoBody: { paddingHorizontal: 22, paddingTop: 6 },
  airport: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  city: { color: '#fff', fontSize: 34, fontWeight: '700', marginTop: 2 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 6 },
  // Compact icon-led lines (Ryan: less block, simple line icons).
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lineText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  lineTextMuted: { fontWeight: '500', color: 'rgba(255,255,255,0.68)' },
  lineExtra: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '400' },
  groupTop: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
});
