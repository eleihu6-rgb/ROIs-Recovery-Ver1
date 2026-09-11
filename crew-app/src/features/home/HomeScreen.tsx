import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ImageBackground,
  TouchableOpacity,
  FlatList,
  Dimensions,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ImageSourcePropType,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Path,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { MainTabParamList } from '../../navigation/RootNavigator';
import { useAppSelector } from '../../store';
import { classifyTrips, type Trip } from '../travel/tripCsv';
import {
  legDisplayDate,
  parseRosterUTC,
  type DisplayDate,
} from '../settings/timeFormat';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { tripDestination } from './cities';
import { airlineByCode } from '../auth/airlines';
import { HotelIcon } from '../travel/components/TripIcons';
import { colors, font, space } from '../../theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD = space.lg16;
const CARD_W = SCREEN_W - H_PAD * 2;
// Tall postcard that fills most of the screen height (leaves room for the
// header, page dots and the tab bar) so the landmark photo dominates rather
// than floating in white space. Floored to the old width-based height on very
// short screens so the card never gets shorter than before.
const CARD_H = Math.max(Math.round(CARD_W * 0.92), Math.round(SCREEN_H * 0.62));
const CARD_RADIUS = 22;
const CARD_STRIDE = CARD_W + space.md12;

// ─── Postcard overlay palette (enhance-Ver5 #16) ──────────────────────────────
// All the on-photo gradient/overlay/shadow literals consolidated here so visual
// tuning lives in one named place instead of being scattered through the file.
const OVERLAY = {
  gradient: [
    { offset: '0', color: '#0b1026', opacity: 0 },
    { offset: '0.55', color: '#15123a', opacity: 0 },
    { offset: '0.74', color: '#1a1540', opacity: 0.38 },
    { offset: '0.88', color: '#1d1747', opacity: 0.78 },
    { offset: '1', color: '#241653', opacity: 0.96 },
  ],
  textStrong: 'rgba(255,255,255,0.92)', // dates
  text: 'rgba(255,255,255,0.85)',       // hotel icon / layover line
  textMuted: 'rgba(255,255,255,0.8)',   // flight numbers
  stamp: 'rgba(255,255,255,0.78)',      // postmark stamp ink
  dot: 'rgba(255,255,255,0.45)',        // inactive page dot
  shadow: '#1d1747',                    // card drop shadow
} as const;

// Hoisted so FlatList reuses one component identity (an inline arrow would remount
// every separator each render). Cards are fixed-width, so getItemLayout lets the
// list skip measuring — cheaper first paint + correct snap offsets.
const CardSeparator = () => <View style={styles.cardSep} />;
const getCardLayout = (_: unknown, index: number) => ({
  length: CARD_W,
  offset: CARD_STRIDE * index,
  index,
});

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d: DisplayDate): string {
  return `${String(d.day).padStart(2, '0')} ${MON[d.monthIdx]} ${d.year}`;
}

/** "18 Mar 2026" or "18 Mar – 22 Mar 2026" or a cross-year full range. */
function fmtRange(start: DisplayDate | null, end: DisplayDate | null): string {
  if (!start) {
    return '';
  }
  const e = end ?? start;
  if (fmtDate(start) === fmtDate(e)) {
    return fmtDate(start);
  }
  const sameYear = start.year === e.year;
  if (sameYear) {
    return `${String(start.day).padStart(2, '0')} ${MON[start.monthIdx]} – ${fmtDate(e)}`;
  }
  return `${fmtDate(start)} – ${fmtDate(e)}`;
}

/**
 * The trip's date range exactly as the trip cards show it: first leg's
 * departure date → last leg's arrival date, in the user's chosen time mode.
 * Legs are ordered by their real UTC instant so first/last are chronological.
 */
function tripDisplayRange(
  trip: Trip,
  mode: TimeZoneMode,
  baseTz: string,
): { start: DisplayDate | null; end: DisplayDate | null } {
  const legs = trip.legs
    .slice()
    .sort(
      (a, b) =>
        (parseRosterUTC(a.flightDateUTC)?.getTime() ?? 0) -
        (parseRosterUTC(b.flightDateUTC)?.getTime() ?? 0),
    );
  const first = legs[0];
  const last = legs[legs.length - 1];
  const start = first
    ? legDisplayDate({ flightDateUTC: first.flightDateUTC, localTime: first.localDepTime, mode, baseTz })
    : null;
  const end = last
    ? legDisplayDate({ flightDateUTC: last.arvDateUTC, localTime: last.localArvTime, mode, baseTz })
    : null;
  return { start, end };
}

/** Unique flight numbers in order, e.g. "TG431 · TG432". */
function tripFlights(trip: Trip): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of trip.legs) {
    const f = (l.fltNumber || '').trim();
    if (f && !seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out.join('  ·  ');
}

// Precomputed postcard view model so each card's destination/date/flight/layover
// labels are derived once (in a useMemo), not on every render (enhance-Ver5 #14).
interface PostcardVM {
  id: string;
  cityName: string;
  image: ImageSourcePropType;
  dateRange: string;
  flights: string;
  layoverHours?: number;
}

function buildPostcard(trip: Trip, mode: TimeZoneMode, baseTz: string, base: string): PostcardVM {
  const dest = tripDestination(trip, base);
  const { start, end } = tripDisplayRange(trip, mode, baseTz);
  return {
    id: trip.id,
    cityName: dest.name,
    image: dest.image,
    dateRange: fmtRange(start, end),
    flights: tripFlights(trip),
    layoverHours: trip.layoverHours,
  };
}

// ─── Dusk gradient overlay (SVG) — keeps the landmark visible up top, darkens
// toward the bottom so the white text + the brand purple read cleanly. ──────────
function CardGradient() {
  return (
    <Svg width={CARD_W} height={CARD_H} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="trip-grad" x1="0" y1="0" x2="0" y2="1">
          {/* Keep the top ~55% of the photo fully clear so the landmark reads
              at a glance; only darken the lower strip behind the text. */}
          {OVERLAY.gradient.map(s => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#trip-grad)" />
    </Svg>
  );
}

// ─── Travel postmark stamp (top-right), echoing the reference card. ────────────
function TravelStamp() {
  const w = 96;
  const h = 60;
  const c = OVERLAY.stamp;
  return (
    <Svg width={w} height={h + 26} style={styles.stamp}>
      {/* wavy postmark lines */}
      {[0, 7, 14].map(dy => (
        <Path
          key={dy}
          d={`M2 ${6 + dy} q8 -5 16 0 t16 0 t16 0 t16 0`}
          stroke={c}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {/* dashed stamp frame */}
      <Rect
        x={1}
        y={28}
        width={w - 2}
        height={h - 4}
        rx={6}
        stroke={c}
        strokeWidth={1.4}
        strokeDasharray="4 3"
        fill="none"
      />
      <SvgText
        x={w / 2}
        y={44}
        fill={c}
        fontSize={11}
        fontWeight="700"
        letterSpacing={1.5}
        textAnchor="middle">
        ✦ TRAVEL ✦
      </SvgText>
      <Line x1={12} y1={52} x2={w - 12} y2={52} stroke={c} strokeWidth={1} />
      <Line x1={12} y1={62} x2={w - 12} y2={62} stroke={c} strokeWidth={1} />
    </Svg>
  );
}

function ArrowRight({ color = '#fff' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M5 12h14M13 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const TripPostcard = React.memo(function TripPostcard({
  vm,
  onPress,
}: {
  vm: PostcardVM;
  onPress: () => void;
}) {
  return (
    <View style={styles.cardShadow}>
      <ImageBackground
        source={vm.image}
        style={styles.card}
        imageStyle={styles.cardImage}
        resizeMode="cover">
        <CardGradient />
        <TravelStamp />
        <View style={styles.cardContent}>
          <Text style={styles.tripTo}>Trip to</Text>
          <Text style={styles.cityName} numberOfLines={1} adjustsFontSizeToFit>
            {vm.cityName.toUpperCase()}
          </Text>
          <Text style={styles.dates}>{vm.dateRange}</Text>
          <Text style={styles.flights}>{vm.flights}</Text>
          {vm.layoverHours != null && vm.layoverHours > 0 && (
            <View style={styles.layoverRow}>
              <HotelIcon color={OVERLAY.text} size={15} />
              <Text style={styles.layover}>Layover {vm.layoverHours}+ hrs</Text>
            </View>
          )}
          <TouchableOpacity style={styles.viewBtn} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.viewText}>View Details</Text>
            <ArrowRight />
          </TouchableOpacity>
        </View>
      </ImageBackground>
    </View>
  );
});

// ─── Home: a swipeable carousel of the crew's upcoming FLIGHT trips ────────────
// (closest next trip first). Ground duties live on My Trips; Home is the visual
// "where am I heading next" postcard wall (doc: Home tab new features).
export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<MainTabParamList>>();
  const trips = useAppSelector(s => s.trips.trips);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);
  // Active airline's home base (TG=BKK, PR=MNL) so a return-to-base leg is never
  // shown as the postcard destination.
  const base = useAppSelector(s => airlineByCode(s.auth.airline).portalConfig?.baseAirport) ?? 'BKK';
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<PostcardVM>>(null);

  // Upcoming flight trips, soonest first (classifyTrips already sorts upcoming asc),
  // mapped to precomputed postcard view models so labels aren't re-derived per render.
  const cards = useMemo(() => {
    const upcoming = classifyTrips(trips, new Date()).upcoming;
    return upcoming.map(t => buildPostcard(t, mode, baseTz, base));
  }, [trips, mode, baseTz, base]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / CARD_STRIDE);
    setPage(i);
  }, []);

  const goToTrips = useCallback(() => navigation.navigate('MyTrips'), [navigation]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PostcardVM>) => (
      <TripPostcard vm={item} onPress={goToTrips} />
    ),
    [goToTrips],
  );

  return (
    <SafeAreaView style={styles.container} testID="home-screen">
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <View style={styles.header}>
        <Text style={styles.hello}>Next Adventure</Text>
        <Text style={styles.sub}>Your upcoming trips</Text>
      </View>

      {cards.length > 0 ? (
        <View style={styles.carousel}>
          <FlatList
            ref={listRef}
            data={cards}
            keyExtractor={c => c.id}
            renderItem={renderItem}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_STRIDE}
            decelerationRate="fast"
            snapToAlignment="start"
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={CardSeparator}
            getItemLayout={getCardLayout}
            initialNumToRender={2}
            windowSize={3}
            removeClippedSubviews
            onMomentumScrollEnd={onScroll}
          />
          {cards.length > 1 && (
            // Page dots float inside the card's dark lower strip so they never
            // collide with the centre Book-Flights FAB below the carousel.
            <View style={styles.dots} pointerEvents="none">
              {cards.map((c, i) => (
                <View key={c.id} style={[styles.dot, i === page && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No upcoming trips yet</Text>
          <Text style={styles.emptySub}>
            Capture your roster from My Trips and your next destinations will appear here.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: H_PAD, paddingTop: space.lg16, paddingBottom: space.md12 },
  hello: { ...font.title, fontSize: 26, fontWeight: '800', color: colors.ink },
  sub: { ...font.sub, color: colors.muted, marginTop: 2 },

  carousel: { alignSelf: 'stretch' },
  listContent: { paddingHorizontal: H_PAD, paddingVertical: space.sm8 },
  cardSep: { width: space.md12 },

  cardShadow: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: CARD_RADIUS,
    backgroundColor: colors.card,
    shadowColor: OVERLAY.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  card: { width: CARD_W, height: CARD_H, justifyContent: 'flex-end' },
  cardImage: { borderRadius: CARD_RADIUS },
  stamp: { position: 'absolute', top: 16, right: 16 },

  cardContent: { paddingHorizontal: space.xl24, paddingTop: space.xl24, paddingBottom: 46 },
  tripTo: { ...font.body, color: OVERLAY.text, fontSize: 16 },
  cityName: {
    color: colors.white,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
    marginBottom: space.sm8,
  },
  dates: { color: OVERLAY.textStrong, fontSize: 16, fontWeight: '600' },
  flights: {
    color: OVERLAY.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  layoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  layover: {
    color: OVERLAY.text,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm8, marginTop: space.lg16 },
  viewText: { color: colors.white, fontSize: 18, fontWeight: '800' },

  dots: {
    position: 'absolute',
    bottom: 22,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: OVERLAY.dot },
  dotActive: { backgroundColor: colors.white, width: 20 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl32 },
  emptyTitle: { ...font.h2, fontSize: 20, color: colors.ink, marginBottom: space.sm8 },
  emptySub: { ...font.body, color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
