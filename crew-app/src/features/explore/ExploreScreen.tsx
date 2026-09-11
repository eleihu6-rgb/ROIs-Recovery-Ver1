import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HotelIcon } from '../travel/components/TripIcons';
import { LayoverBadge } from '../travel/components/LayoverBadge';
import { HeaderBackdrop } from '../../components/HeaderBackdrop';
import { CategoryIcon, StarIcon, WalkIcon } from './exploreIcons';
import { useAppSelector, useAppDispatch } from '../../store';
import { setExplorePrefs } from '../settings/settingsSlice';
import { classifyTrips, type Trip } from '../travel/tripCsv';
import { tripDestination } from '../home/cities';
import {
  EXPLORE_CATEGORIES,
  suggestionsFor,
  hasPlaces,
  placeDirectionsUrl,
  placeDirectionsAppUrl,
  type ExploreSuggestion,
  type Place,
} from './explorePlaces';
import { colors, font, space, radius, shadow } from '../../theme';

// ─── Explore (doc/Explore Ver1) ───────────────────────────────────────────────
// Shows every upcoming layover with its hours, then — by the layover city + crew
// hotel — the top-rated places within a 15-min walk, filtered to the interests
// the crew picked. Replaces the old "Book Flights" centre tab.

interface LayoverInfo {
  tripId: string;
  city: string;
  airport: string;
  hotelName: string;
  layoverHours?: number;
  suggestions: ExploreSuggestion[];
  covered: boolean; // do we have curated places for this city yet?
}

/** Resolve the layover city, airport and crew hotel for one trip. */
function layoverFor(trip: Trip, prefs: string[]): LayoverInfo {
  const dest = tripDestination(trip);
  const hotelLeg = trip.legs.find(l => l.hotelBooking || (l.hotel && l.hotel.trim()));
  const booking = hotelLeg?.hotelBooking;
  const airport = (booking?.airport || dest.airport || '').trim().toUpperCase();
  const hotelName = booking?.hotelName || hotelLeg?.hotel?.trim() || '';
  return {
    tripId: trip.id,
    city: dest.name,
    airport,
    hotelName,
    layoverHours: trip.layoverHours,
    suggestions: suggestionsFor(airport, prefs),
    covered: hasPlaces(airport),
  };
}

// ─── Interest chips (the crew-preference setup) ───────────────────────────────
// All row/card components are React.memo'd so unrelated parent re-renders don't
// rebuild the Explore list (enhance-Ver5 #12).
const InterestChips = React.memo(function InterestChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <View style={styles.chipsWrap}>
      {EXPLORE_CATEGORIES.map(c => {
        const on = selected.includes(c.key);
        return (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onToggle(c.key)}
            activeOpacity={0.8}
            testID={`explore-chip-${c.key}`}>
            <CategoryIcon category={c.key} color={on ? colors.primary : colors.muted} size={15} />
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ─── A single place row — tap to open Google Maps directions ──────────────────
const PlaceRow = React.memo(function PlaceRow({ place, city }: { place: Place; city?: string }) {
  const openMaps = () => {
    // Prefer the Google Maps app via x-callback so it shows a "‹ R'Bot" back
    // button to return here; fall back to the universal web URL if the app
    // isn't installed (openURL rejects on an unhandled scheme).
    const appUrl = placeDirectionsAppUrl(place, city);
    Linking.openURL(appUrl).catch(() => {
      Linking.openURL(placeDirectionsUrl(place, city)).catch(() => {});
    });
  };
  return (
    <TouchableOpacity
      style={styles.placeRow}
      onPress={openMaps}
      activeOpacity={0.7}
      testID="explore-place"
      accessibilityLabel={`Navigate to ${place.name} in Google Maps`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.placeName} numberOfLines={1}>
          {place.name}
        </Text>
        {(place.note || place.area) && (
          <Text style={styles.placeSub} numberOfLines={1}>
            {place.note || place.area}
          </Text>
        )}
      </View>
      <View style={styles.placeMeta}>
        <View style={styles.metaRow}>
          <StarIcon color={colors.accent} size={13} />
          <Text style={styles.placeRating}>{place.rating.toFixed(1)}</Text>
        </View>
        <View style={styles.metaRow}>
          <WalkIcon color={colors.muted} size={13} />
          <Text style={styles.placeWalk}>{place.walkMins} min</Text>
        </View>
      </View>
      <View style={styles.navBtn} testID="explore-navigate">
        <NavArrow />
        <Text style={styles.navText}>Go</Text>
      </View>
    </TouchableOpacity>
  );
});

// Small "navigate" arrow (Google-Maps style filled chevron).
function NavArrow() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3 11l18-8-8 18-2-7-8-3z" fill={colors.accent} />
    </Svg>
  );
}

// ─── A layover card with its grouped recommendations ─────────────────────────
const LayoverCard = React.memo(function LayoverCard({ info }: { info: LayoverInfo }) {
  return (
    <View style={styles.card} testID="explore-layover-card">
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardCity}>{info.city}</Text>
          {!!info.hotelName && (
            <View style={styles.cardHotelRow}>
              <HotelIcon color={colors.muted} size={14} />
              <Text style={styles.cardHotel} numberOfLines={1}>
                {info.hotelName}
              </Text>
            </View>
          )}
        </View>
        <LayoverBadge hours={info.layoverHours} />
      </View>

      {info.covered ? (
        info.suggestions.length > 0 ? (
          info.suggestions.map(s => (
            <View key={s.category.key} style={styles.group}>
              <View style={styles.groupTitle}>
                <CategoryIcon category={s.category.key} color={colors.ink} size={16} />
                <Text style={styles.groupTitleText}>{s.category.label}</Text>
              </View>
              {s.places.map(p => (
                <PlaceRow key={p.name} place={p} city={info.city} />
              ))}
            </View>
          ))
        ) : (
          <Text style={styles.emptyNote}>
            Pick an interest above to see top spots near your hotel.
          </Text>
        )
      ) : (
        <Text style={styles.emptyNote}>
          We’re still scouting {info.city}. Top spots arrive in a later update.
        </Text>
      )}
    </View>
  );
});

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const trips = useAppSelector(s => s.trips.trips);
  const prefs = useAppSelector(s => s.settings.explorePrefs);

  // Upcoming trips that actually have a layover (hotel + hours), soonest first.
  const layovers = useMemo(() => {
    const upcoming = classifyTrips(trips, new Date()).upcoming;
    return upcoming
      .filter(t => (t.layoverHours != null && t.layoverHours > 0) || t.legs.some(l => l.hotelBooking))
      .map(t => layoverFor(t, prefs));
  }, [trips, prefs]);

  const onToggle = useCallback(
    (key: string) => {
      const next = prefs.includes(key)
        ? prefs.filter(p => p !== key)
        : [...prefs, key];
      dispatch(setExplorePrefs(next));
    },
    [prefs, dispatch],
  );

  return (
    <View style={styles.container} testID="explore-screen">
      <StatusBar barStyle="light-content" backgroundColor={colors.accent} />
      {/* Header fills behind the status bar / island (paddingTop = safe inset). */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm8 }]}>
        <HeaderBackdrop variant="explore" />
        <Text style={styles.headerTitle}>Explore</Text>
        <Text style={styles.headerSub}>Top spots near your layover hotels</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>YOUR INTERESTS</Text>
        <InterestChips selected={prefs} onToggle={onToggle} />

        {layovers.length > 0 ? (
          layovers.map(info => <LayoverCard key={info.tripId} info={info} />)
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No layovers yet</Text>
            <Text style={styles.emptySub}>
              Capture your roster from My Trips. Trips with an overnight hotel show
              their best nearby spots here.
            </Text>
          </View>
        )}

        <Text style={styles.footnote}>
          Places & ratings are a curated sample of Google Maps results within a
          15-minute walk.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.xl24,
    paddingBottom: space.xl24,
    overflow: 'hidden', // clip the backdrop texture to the header
  },
  headerTitle: { ...font.h1, color: colors.onPrimary },
  headerSub: { ...font.sub, color: colors.onPrimaryMuted, marginTop: space.xs4 },

  content: { padding: space.lg16, gap: space.md12, paddingBottom: 40 },

  sectionLabel: { ...font.overline, color: colors.muted, marginLeft: space.xs4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md12,
    paddingVertical: space.sm8,
    borderRadius: radius.op,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipOn: { backgroundColor: colors.tintBg, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  chipTextOn: { color: colors.primary },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg16,
    gap: space.md12,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md12 },
  cardCity: { ...font.title, color: colors.ink },
  cardHotelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardHotel: { ...font.sub, color: colors.muted, flex: 1 },

  group: { gap: space.xs4 },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.xs4,
    marginBottom: 2,
  },
  groupTitleText: { fontSize: 13, fontWeight: '800', color: colors.ink },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md12,
    backgroundColor: colors.bg,
    borderRadius: radius.op,
    paddingHorizontal: space.md12,
    paddingVertical: space.sm8,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  placeName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  placeSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  placeMeta: { alignItems: 'flex-end', gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  placeRating: { fontSize: 13, fontWeight: '800', color: colors.accent },
  placeWalk: { fontSize: 11, color: colors.muted },
  navBtn: { alignItems: 'center', justifyContent: 'center', paddingLeft: space.sm8, minWidth: 34 },
  navText: { fontSize: 10, fontWeight: '700', color: colors.accent, marginTop: 1 },

  emptyNote: { fontSize: 13, color: colors.muted, lineHeight: 19 },

  empty: { alignItems: 'center', paddingVertical: space.xxl32, paddingHorizontal: space.lg16 },
  emptyTitle: { ...font.h2, fontSize: 20, color: colors.ink, marginBottom: space.sm8 },
  emptySub: { ...font.body, color: colors.muted, textAlign: 'center', lineHeight: 21 },

  footnote: {
    fontSize: 11,
    color: colors.faint,
    textAlign: 'center',
    marginTop: space.sm8,
    lineHeight: 16,
  },
});
