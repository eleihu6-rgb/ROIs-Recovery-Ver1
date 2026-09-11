import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store';
import { HeaderBackdrop } from '../../components/HeaderBackdrop';
import type { Trip, TripLeg } from '../travel/tripCsv';
import { classifyTrips, tripStartDate } from '../travel/tripCsv';
import { formatLegTime } from '../settings/timeFormat';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { colors, font, space, radius, shadowHero, cardBorder, formatWeekdayDateYear } from '../../theme';
import { fleetLabel, routeColor, tzModeLabel } from '../travel/tripDisplay';
import Svg, { Circle, Path } from 'react-native-svg';

// ─── Sign On screen ───────────────────────────────────────────────────────────
// Mirrors the THAI crew-portal "check-in" page: shows the user's NEXT check-in
// duty (one trip, possibly several flight legs) with a prominent report time,
// a live countdown, the date, and each leg's route + times. All times respect
// the user's chosen timezone display mode (settingsSlice / timeFormat), matching
// the rest of the app. No layover/hotel content here.

// ─── Time helpers ─────────────────────────────────────────────────────────────

const MON = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
/**
 * The check-in time stored on a trip can be either an airport-local wall-clock
 * string ("YYYY-MM-DD HH:mm", from portal duty-list captures) or a UTC roster
 * string ("DD MMM YYYY HHMM"). Returns a {date, localTime} pair where `date` is
 * the best-effort instant (for sorting / countdown) and `localTime` is the
 * original local string when available (so formatLegTime can honour 'airport').
 */
function parseCheckIn(value: string): { date: Date | null; localTime?: string } {
  const s = (value || '').trim();
  if (!s) {
    return { date: null };
  }
  // "YYYY-MM-DD HH:mm" — airport-local wall clock (portal duty list).
  const local = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (local) {
    const [, y, mo, d, h, mi] = local;
    // Treat the wall-clock as the instant for countdown purposes (best effort:
    // the user reads it in airport-local anyway).
    const date = new Date(
      Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi),
    );
    return { date: isNaN(date.getTime()) ? null : date, localTime: s };
  }
  // "DD MMM YYYY HHMM" — UTC roster string.
  const utc = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2})(\d{2})$/);
  if (utc) {
    const [, d, mon, y, hh, mm] = utc;
    const monIdx = MON.findIndex(m => m.toLowerCase() === mon.toLowerCase());
    if (monIdx >= 0) {
      const date = new Date(Date.UTC(Number(y), monIdx, Number(d), Number(hh), Number(mm)));
      return { date: isNaN(date.getTime()) ? null : date };
    }
  }
  return { date: null };
}

/** Best-effort instant a trip's sign-on happens (check-in, else first departure). */
function checkInInstant(trip: Trip): Date | null {
  const ci = parseCheckIn(trip.checkInDateUTC).date;
  return ci ?? tripStartDate(trip);
}

/** Convert the check-in into a "DD MMM HH:MM" label honouring the display mode. */
function checkInLabel(trip: Trip, mode: TimeZoneMode, baseTz: string): string {
  const parsed = parseCheckIn(trip.checkInDateUTC);
  // If the stored value is already a UTC roster string, hand it straight to
  // formatLegTime. If it's a local wall-clock, synthesise a roster-UTC string so
  // 'base'/'utc' modes still have something to convert from.
  let rosterUtc = trip.checkInDateUTC.trim();
  const isRoster = /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{4}$/.test(rosterUtc);
  if (!isRoster && parsed.date) {
    const d = parsed.date;
    rosterUtc = `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(
      d.getUTCHours(),
    )}${pad(d.getUTCMinutes())}`;
  }
  return formatLegTime({
    flightDateUTC: rosterUtc,
    localTime: parsed.localTime,
    mode,
    baseTz,
  });
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Full date line for the check-in, e.g. "Mon 02 Jun 2026". */
function fullDateLabel(date: Date | null): string {
  return formatWeekdayDateYear(date);
}

/** Human countdown like "in 2 days", "in 5h 20m", "Now". */
function countdownLabel(target: Date | null, now: Date): string {
  if (!target) {
    return '';
  }
  let ms = target.getTime() - now.getTime();
  if (ms <= 0) {
    // Within an hour past report or already started.
    return ms > -60 * 60 * 1000 ? 'Now' : 'In progress';
  }
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  const rem = mins % 60;
  if (days >= 1) {
    return hours > 0 ? `in ${days}d ${hours}h` : `in ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (hours >= 1) {
    return rem > 0 ? `in ${hours}h ${rem}m` : `in ${hours}h`;
  }
  return `in ${rem}m`;
}

// Display helpers (fleetLabel / routeColor / tzModeLabel) are shared with
// TripCards via tripDisplay.ts (enhance-Ver1 #3).

// ─── Leg card ─────────────────────────────────────────────────────────────────

function LegCard({
  leg,
  mode,
  baseTz,
}: {
  leg: TripLeg;
  mode: TimeZoneMode;
  baseTz: string;
}) {
  const accent = routeColor(leg.depArp, leg.arvArp);
  const hasFleet = leg.fleet.trim().length > 0;
  const depTime = formatLegTime({
    flightDateUTC: leg.flightDateUTC,
    localTime: leg.localDepTime,
    mode,
    baseTz,
  });
  const arvTime = formatLegTime({
    flightDateUTC: leg.arvDateUTC,
    localTime: leg.localArvTime,
    mode,
    baseTz,
  });

  return (
    <View style={[styles.legCard, { borderLeftColor: accent }]} testID="signon-leg-card">
      <View style={styles.legHeader}>
        <View style={[styles.flightBadge, { backgroundColor: accent }]}>
          <Text style={styles.flightBadgeText}>{leg.fltNumber || 'DUTY'}</Text>
        </View>
        {hasFleet && (
          <View style={styles.fleetBadge}>
            <Text style={styles.fleetText}>{fleetLabel(leg.fleet)}</Text>
          </View>
        )}
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeAirport}>
          <Text style={styles.iata}>{leg.depArp || '—'}</Text>
          <Text style={styles.legTime}>{depTime}</Text>
        </View>
        <View style={styles.routeArrow}>
          <View style={styles.arrowLine} />
          <Text style={styles.arrowHead}>›</Text>
        </View>
        <View style={[styles.routeAirport, { alignItems: 'flex-end' }]}>
          <Text style={styles.iata}>{leg.arvArp || '—'}</Text>
          <Text style={styles.legTime}>{arvTime}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyWrap} testID="signon-empty">
      <View style={styles.emptyBadge}>
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={colors.accent} strokeWidth={1.8} />
          <Path d="M12 7v5l3.5 2" stroke={colors.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <Text style={styles.emptyTitle}>No upcoming sign-on</Text>
      <Text style={styles.emptyBody}>
        Import your roster in My Trips to see your next check-in here.
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function RosterScreen() {
  const insets = useSafeAreaInsets();
  const trips = useAppSelector(s => s.trips.trips);
  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);

  const nextDuty = useMemo(() => {
    const now = new Date();
    const { upcoming } = classifyTrips(trips, now);
    if (upcoming.length === 0) {
      return null;
    }
    // Prefer the upcoming trip whose check-in is the soonest still in the future;
    // fall back to the soonest upcoming trip overall.
    const future = upcoming
      .map(t => ({ trip: t, at: checkInInstant(t) }))
      .filter((x): x is { trip: Trip; at: Date } => x.at !== null && x.at.getTime() >= now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (future.length > 0) {
      return future[0].trip;
    }
    return upcoming[0];
  }, [trips]);

  const now = new Date();
  const instant = nextDuty ? checkInInstant(nextDuty) : null;

  return (
    <View style={styles.container} testID="signon-screen">
      <StatusBar barStyle="light-content" backgroundColor={colors.accent} />

      {/* Header fills behind the status bar / island (paddingTop = safe inset). */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm8 }]}>
        <HeaderBackdrop variant="signon" />
        <Text style={styles.headerTitle}>Sign On</Text>
        <Text style={styles.headerSub}>Your next check-in</Text>
        <View style={styles.tzChip}>
          <Text style={styles.tzChipText}>Times: {tzModeLabel(mode, baseTz)}</Text>
        </View>
      </View>

      {!nextDuty ? (
        <EmptyState />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Report time hero card */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>REPORT / CHECK-IN</Text>
            <Text style={styles.heroTime} testID="signon-report-time">
              {checkInLabel(nextDuty, mode, baseTz)}
            </Text>
            <Text style={styles.heroDate}>{fullDateLabel(instant)}</Text>
            <View style={styles.countdownPill}>
              <Text style={styles.countdownText} testID="signon-countdown">
                {countdownLabel(instant, now)}
              </Text>
            </View>
          </View>

          {/* Flights */}
          <Text style={styles.sectionLabel}>
            {nextDuty.legs.length} {nextDuty.legs.length === 1 ? 'FLIGHT' : 'FLIGHTS'}
          </Text>
          {nextDuty.legs.map((leg, idx) => (
            <LegCard key={`${leg.fltNumber}-${idx}`} leg={leg} mode={mode} baseTz={baseTz} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.xl24,
    paddingBottom: space.xl24,
    overflow: 'hidden', // clip the backdrop texture to the header
    alignItems: 'flex-end', // text sits on the right, clear of the suitcase motif
  },
  headerTitle: { ...font.h1, color: colors.onPrimary, textAlign: 'right' },
  headerSub: { ...font.sub, color: colors.onPrimaryMuted, marginTop: space.xs4, textAlign: 'right' },
  tzChip: {
    alignSelf: 'flex-end',
    backgroundColor: colors.onPrimaryChip,
    borderRadius: radius.md,
    paddingHorizontal: space.md12,
    paddingVertical: 5,
    marginTop: space.md12,
  },
  tzChipText: { ...font.caption, color: colors.onPrimary },

  // Scroll body
  scrollContent: { padding: space.lg16, paddingBottom: space.xxl32 },

  // Hero report-time card
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: space.xl24,
    paddingHorizontal: space.xl24,
    alignItems: 'center',
    ...shadowHero,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onPrimaryFaint,
    letterSpacing: 2,
  },
  heroTime: { ...font.hero, color: colors.onPrimary, marginTop: space.sm8 },
  heroDate: {
    ...font.bodyStrong,
    color: colors.onPrimaryMuted,
    marginTop: space.xs4,
  },
  // Translucent-white chip on the purple card (one accent + neutral, no gold).
  countdownPill: {
    marginTop: space.lg16,
    backgroundColor: colors.onPrimaryChip,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 7,
  },
  countdownText: { fontSize: 15, fontWeight: '800', color: colors.onPrimary, letterSpacing: 0.3 },

  // Section
  sectionLabel: {
    ...font.overline,
    color: colors.muted,
    marginTop: space.xl24,
    marginBottom: space.xs4,
    marginLeft: space.xs4,
  },

  // Leg card — operational radius + subtle border (enhance-Ver1 #9). The Sign On
  // hero above keeps the single strong shadow treatment.
  legCard: {
    backgroundColor: colors.card,
    borderRadius: radius.op,
    borderLeftWidth: 4,
    padding: space.lg16,
    marginTop: space.md12,
    ...cardBorder,
  },
  legHeader: { flexDirection: 'row', gap: space.sm8, marginBottom: space.md12, alignItems: 'center' },
  flightBadge: { borderRadius: radius.sm, paddingHorizontal: space.md12, paddingVertical: 6 },
  flightBadgeText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  fleetBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: space.md12,
    paddingVertical: 6,
    backgroundColor: colors.tintBgSoft,
  },
  fleetText: { fontSize: 14, fontWeight: '700', color: colors.accent },

  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeAirport: { alignItems: 'flex-start', minWidth: 64 },
  iata: { fontSize: 26, fontWeight: '800', color: colors.inkSoft, letterSpacing: 1 },
  legTime: { ...font.sub, color: colors.muted, marginTop: 3 },
  routeArrow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm8 },
  arrowLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  arrowHead: { fontSize: 22, color: colors.faint, marginLeft: 2 },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.tintBgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl24,
  },
  emptyTitle: { ...font.h2, color: colors.ink },
  emptyBody: {
    ...font.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.sm8,
    lineHeight: 21,
  },
});
