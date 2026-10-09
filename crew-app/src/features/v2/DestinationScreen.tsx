// Full-screen destination viewer (Home ▸ Explore your destinations ▸ tap a card).
//
// Ver1 style (mock `.dest .grad`): the landmark photo carries the whole page and
// the detail is WRITTEN ON THE PICTURE over a bottom gradient — no white panel:
//   city + flight line, then FLIGHT (STD/STA → ETD/ETA → ATD/ATA, gate, tail,
//   block), then booked hotel detail when available, all in white type.
// Swiping left/right pages through the other upcoming cities.
//
// One photo page per city; the scrim, header and info block are single instances
// that follow the visible page, so a screen reader (and Maestro) sees one of each.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
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
import { hotelFor, legOps, type HotelInfo, type LegOps } from '../travel/opsInfo';
import { useBase, useDestinations, type DestinationEntry } from './useV2';
import { MON } from './model';
import { useV2Nav, type V2StackParamList } from './nav';
import { useLayout } from '../../components/v2/useLayout';

type Props = NativeStackScreenProps<V2StackParamList, 'Destination'>;

/** How much of the screen the (compact) type-on-photo block may occupy. */
const INFO_MAX = '54%';
/** Duo inner, landscape: the photo's share of the width (the info card takes the rest). */
const WIDE_PHOTO_SHARE = 0.55;
/** Duo inner, rotated: the photo's share of the height (the info panel sits below). */
const TALL_PHOTO_SHARE = 0.5;

/** Dark bottom gradient so white type stays readable on any photo. */
function Scrim({ width, height }: { width: number; height: number }) {
  return (
    <View style={s.scrimWrap} pointerEvents="none">
      <Svg key={`${width}x${height}`} width={width} height={height}>
        <Defs>
          <LinearGradient id="destScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.42" stopColor="#000" stopOpacity={0.42} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.88} />
          </LinearGradient>
        </Defs>
        <Rect testID="dest-scrim-paint" x={0} y={0} width={width} height={height} fill="url(#destScrim)" />
      </Svg>
    </View>
  );
}

/** Fade only the Duo photo edge into its photo-derived information pane. */
function PhotoBlend({ width, height, color, wide }: { width: number; height: number; color: string; wide: boolean }) {
  return (
    <View style={s.photoBlend} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="destPhotoBlend" x1="0" y1="0" x2={wide ? '1' : '0'} y2={wide ? '0' : '1'}>
            <Stop offset="0.72" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect testID="dest-photo-blend-paint" x={0} y={0} width={width} height={height} fill="url(#destPhotoBlend)" />
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
  panel,
}: {
  entry: DestinationEntry;
  ops: LegOps;
  hotel: HotelInfo | null;
  /** Duo inner screen: the block is its own panel beside/under the photo, not type over it. */
  panel?: 'side' | 'below';
}) {
  const insets = useSafeAreaInsets();
  const leg = entry.leg;
  const bookedHotel = hotel && !hotel.mocked ? hotel : null;
  const hotelLines = bookedHotel ? (
    <>
      <Line icon="bed" text={bookedHotel.name} extra="booked" />
      <Line icon="house" text={bookedHotel.address} muted />
      <Line
        icon="clock"
        text={`Check-in ${bookedHotel.checkIn} · out ${bookedHotel.checkOut} · ${bookedHotel.nights} night${bookedHotel.nights === 1 ? '' : 's'}`}
      />
    </>
  ) : null;
  return (
    <ScrollView
      style={panel === 'side' ? s.infoSide : panel === 'below' ? s.infoBelow : s.infoWrap}
      // The side panel ends at the Duo's right-edge status strip, so it keeps clear of it.
      contentContainerStyle={[s.infoBody, panel === 'side' ? [s.infoPanelBody, { paddingRight: 22 + insets.right }] : null, { paddingBottom: insets.bottom + 24 }]}
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
      {ops.estimated ? <Line icon="clock" text={`ETD ${ops.etd || '—'} · ETA ${ops.eta || '—'}`} /> : null}
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
        text={[ops.register, ops.block || leg.duration].filter(Boolean).join(' · ')}
      />

      {bookedHotel ? (
        <View style={s.groupTop}>
          {hotelLines}
        </View>
      ) : null}

      {panel === 'side' ? (
        <View style={s.groupTop} testID="dest-trip-extra">
          <Text style={s.groupLabel}>TRIP · {entry.trip.legs.length} {entry.trip.legs.length === 1 ? 'LEG' : 'LEGS'}</Text>
          <Line icon="plane" text={[entry.trip.legs[0].depArp, ...entry.trip.legs.map(next => next.arvArp)].join(' → ')} />
          {leg.ready !== '—' ? <Line icon="clock" text={`${leg.readyWord} ${leg.ready}`} /> : null}
          {leg.leaveHome !== '—' ? <Line icon="house" text={`Leave home ${leg.leaveHome}`} /> : null}
          {leg.checkIn !== '—' ? <Line icon="checkin" text={`Crew report ${leg.checkIn}`} /> : null}
          {entry.trip.legs.length > 1 ? (
            <View style={s.groupTop}>
              <Text style={s.groupLabel}>NEXT FLIGHTS</Text>
              {entry.trip.legs.slice(1).map((next, index) => (
                <Line key={`${next.fltNumber}-${index}`} icon="plane" text={`${next.fltNumber} · ${next.depArp} → ${next.arvArp}`} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
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
  // iPhone Duo inner screen: landscape = photo (left 55 %) | info card; rotated =
  // photo (top half) over an info panel. A regular iPhone keeps the type-on-photo
  // page, so the pager stays full-window there. (Live window size.)
  const { wide, tall, width, height } = useLayout();
  const pagerW = wide ? Math.round(width * WIDE_PHOTO_SHARE) : width;
  const pagerH = tall ? Math.round(height * TALL_PHOTO_SHARE) : height;
  const [now] = useState(() => new Date());
  const destinations = useDestinations(now);
  const list = useRef<FlatList<DestinationEntry>>(null);
  const [page, setPage] = useState(() => Math.max(0, Math.min(route.params.index, destinations.length - 1)));
  const current: DestinationEntry | undefined = destinations[Math.min(page, destinations.length - 1)];
  // The pager's page width changes when the Duo rotates/unfolds; re-seat the
  // current page or the photo lands between two cities.
  const pageRef = useRef(page);
  pageRef.current = page;
  useEffect(() => {
    list.current?.scrollToOffset({ offset: pageRef.current * pagerW, animated: false });
  }, [pagerW]);

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
    setPage(Math.max(0, Math.round(e.nativeEvent.contentOffset.x / pagerW)));
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

  const pager = (
    <FlatList
      ref={list}
      data={destinations}
      keyExtractor={d => d.city.airport}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={page}
      getItemLayout={(_, i) => ({ length: pagerW, offset: pagerW * i, index: i })}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      onMomentumScrollEnd={onMomentumEnd}
      style={wide || tall ? { width: pagerW, height: pagerH, flexGrow: 0 } : undefined}
      renderItem={({ item }) => (
        <ImageBackground
          source={item.city.image}
          style={{ width: pagerW, height: pagerH }}
          resizeMode="cover"
          testID={`dest-photo-${item.city.airport}`}
        />
      )}
      testID="dest-pager"
    />
  );

  // On the Duo, the information pane takes a dark hue from this landmark photo.
  // Compact iPhones keep the carrier ground behind their full-window image.
  return (
    <View style={[s.root, wide && s.rootWide, { backgroundColor: wide || tall ? current.city.panelColor : p.g1 }]} testID="page-destination">
      <StatusBar barStyle="light-content" />
      {wide || tall ? (
        // Duo: details have their own pane, so the black text scrim is unnecessary.
        // The short edge fade joins the photo to its sampled pane color instead.
        <View style={{ width: pagerW, height: pagerH }} testID={wide ? 'dest-photo-pane-wide' : 'dest-photo-pane-tall'}>
          {pager}
          <PhotoBlend width={pagerW} height={pagerH} color={current.city.panelColor} wide={wide} />
        </View>
      ) : (
        <>
          {pager}
          <Scrim width={pagerW} height={pagerH} />
        </>
      )}

      <InfoBlock
        entry={current}
        ops={ops}
        hotel={hotel}
        panel={wide ? 'side' : tall ? 'below' : undefined}
      />

      {/* Render last so the floating controls receive touches above both panes. */}
      <View style={[s.head, { paddingTop: insets.top + 8, paddingRight: 14 + insets.right }]} pointerEvents="box-none" testID="dest-header">
        <Pressable onPress={() => nav.goBack()} hitSlop={12} style={s.iconBtn} testID="dest-back" accessibilityLabel="back">
          <Icon name="back" size={24} color="#fff" strokeWidth={1.8} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => nav.navigate('TripDetails', { tripId: current.trip.id })}
          style={s.headCta}
          testID="dest-trip-details"
          accessibilityLabel="Trip details"
        >
          <Icon name="chev" size={24} color="#fff" strokeWidth={1.8} />
        </Pressable>
      </View>
      <View style={[s.pageIndicator, { bottom: insets.bottom + 14 }]} pointerEvents="none" testID="dest-page-indicator">
        <View style={s.dots}>
          {destinations.map((d, i) => (
            <View key={d.city.airport} style={[s.dot, i === page ? s.dotOn : null]} />
          ))}
        </View>
        <Text style={s.position} testID="dest-position">{`${page + 1} / ${destinations.length}`}</Text>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBtn: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, marginTop: 16 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scrimWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%' },
  photoBlend: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  head: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pageIndicator: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { backgroundColor: '#fff', width: 16 },
  position: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.92 },
  headCta: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  infoWrap: { position: 'absolute', left: 0, right: 0, bottom: 42, maxHeight: INFO_MAX },
  infoBody: { paddingHorizontal: 22, paddingTop: 6 },
  // Duo inner screen: the info block as its own pane on the carrier ground.
  rootWide: { flexDirection: 'row' },
  infoSide: { flex: 1, minWidth: 0 },
  infoBelow: { flex: 1 },
  infoPanelBody: { paddingTop: 64 },
  airport: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  city: { color: '#fff', fontSize: 34, fontWeight: '700', marginTop: 2 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 6 },
  // Compact icon-led lines (Ryan: less block, simple line icons).
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lineText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  lineTextMuted: { fontWeight: '500', color: 'rgba(255,255,255,0.68)' },
  lineExtra: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '400' },
  groupTop: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  groupLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
});
