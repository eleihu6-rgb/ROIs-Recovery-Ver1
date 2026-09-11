import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import type { HotelBooking } from './portalCapture';
import type { Trip, TripLeg } from './tripCsv';
import { tripStartDate } from './tripCsv';
import { useAppSelector } from '../../store';
import { formatLegTime } from '../settings/timeFormat';
import { PRESET_HOURS, type ReadyWord } from '../settings/alarmSetup';
import { centerOffset } from '../../components/centerOffset';
import type { TimeZoneMode } from '../settings/settingsSlice';
import { colors, font, space, radius, cardBorder } from '../../theme';
import {
  fleetLabel,
  routeColor,
  routeTintBg,
  tzModeLabel,
  checkInHhmm,
  dateKey,
} from './tripDisplay';
import { GroundDutyCard } from './GroundDutyCard';
import { groundDutyStartMs, type GroundDuty } from '../roster/dutyDisplay';
import {
  WakeIcon,
  LeaveIcon,
  ClockIcon,
  HotelIcon,
  CalendarPlusIcon,
  CalendarCheckIcon,
} from './components/TripIcons';
import { LayoverBadge } from './components/LayoverBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlarmDisplay {
  wakeHhmm: string | null;    // null = removed for this duty
  leaveHhmm: string | null;
  wakeHours: number | null;   // current effective offset (for adjust modal default)
  leaveHours: number | null;
  /** "Wake Up" for a morning alarm, "Get Ready" otherwise (alarmSetup.readyWord). */
  wakeWord: ReadyWord;
}

interface TripCardsProps {
  trips: Trip[];
  /** Non-flight roster duties, interleaved with trips by date. */
  duties?: GroundDuty[];
  /** Chronological order of the merged list: 'asc' (upcoming) or 'desc' (past). */
  sortDir?: 'asc' | 'desc';
  alarmDisplays?: Record<string, AlarmDisplay>; // keyed by trip id
  alarmsEnabled?: boolean;
  onAdjustAlarm?: (dutyId: string, type: 'wake' | 'leave', newHours: number | null) => void;
  /** Per-meeting alarm times: dutyId ("meeting:…") → HH:MM string, or null when muted. */
  meetingAlarms?: Record<string, string | null>;
  onToggleMeetingAlarm?: (dutyId: string) => void;
  /** Trip ids whose duty is currently written into the iOS calendar. */
  calendarAdded?: Record<string, boolean>;
  /** Tapping the calendar icon on any leg toggles the WHOLE duty (option B2). */
  onToggleCalendar?: (tripId: string) => void;
}

// ─── Alarm adjust modal ───────────────────────────────────────────────────────

function AdjustModal({
  visible,
  dutyId,
  type,
  wakeWord,
  currentHours,
  hhmm,
  onSelect,
  onRemove,
  onClose,
}: {
  visible: boolean;
  dutyId: string;
  type: 'wake' | 'leave';
  wakeWord: ReadyWord;
  currentHours: number | null;
  hhmm: string | null;
  onSelect: (dutyId: string, type: 'wake' | 'leave', hours: number) => void;
  onRemove: (dutyId: string, type: 'wake' | 'leave') => void;
  onClose: () => void;
}) {
  const isWake = type === 'wake';
  const current = hhmm ? `Current: ${hhmm}` : 'Currently removed';

  // Auto-scroll the preset strip so the CURRENT value sits in the centre when the
  // sheet opens — otherwise the active chip (e.g. 4h) starts off-screen and the
  // crew has to swipe to find what's selected. We measure the strip width and each
  // chip's position, then offset so the active chip is centred.
  const scrollRef = useRef<ScrollView>(null);
  const containerW = useRef(0);
  const chipLayout = useRef<Record<number, { x: number; w: number }>>({});

  const centerActive = useCallback(() => {
    if (currentHours == null) {
      return;
    }
    const l = chipLayout.current[currentHours];
    const cw = containerW.current;
    if (!l || !cw) {
      return;
    }
    scrollRef.current?.scrollTo({ x: centerOffset(l.x, l.w, cw), animated: false });
  }, [currentHours]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalTitleRow}>
            {isWake ? (
              <WakeIcon color={colors.ink} size={20} />
            ) : (
              <LeaveIcon color={colors.ink} size={20} />
            )}
            <Text style={styles.modalTitle}>
              {isWake ? `${wakeWord} alarm` : 'Leave Home alarm'}
            </Text>
          </View>
          <Text style={styles.modalSub}>{current}</Text>
          <Text style={styles.modalSubLabel}>Hours before departure</Text>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetScroll}
            onLayout={e => {
              containerW.current = e.nativeEvent.layout.width;
              centerActive();
            }}>
            <View style={styles.presets}>
              {PRESET_HOURS.map(h => {
                const active = h === currentHours;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[styles.presetBtn, active && styles.presetBtnActive]}
                    onLayout={e => {
                      chipLayout.current[h] = {
                        x: e.nativeEvent.layout.x,
                        w: e.nativeEvent.layout.width,
                      };
                      if (active) {
                        centerActive();
                      }
                    }}
                    onPress={() => { onSelect(dutyId, type, h); onClose(); }}>
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>
                      {h % 1 === 0 ? `${h}h` : `${h}h`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => { onRemove(dutyId, type); onClose(); }}>
            <Text style={styles.removeBtnText}>Remove this alarm</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Time labels ──────────────────────────────────────────────────────────────
// Display follows the user's chosen mode (settingsSlice / timeFormat).

function depLabel(leg: TripLeg, mode: TimeZoneMode, baseTz: string): string {
  return formatLegTime({
    flightDateUTC: leg.flightDateUTC,
    localTime: leg.localDepTime,
    mode,
    baseTz,
  });
}
function arvLabel(leg: TripLeg, mode: TimeZoneMode, baseTz: string): string {
  return formatLegTime({
    flightDateUTC: leg.arvDateUTC,
    localTime: leg.localArvTime,
    mode,
    baseTz,
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const FlightCard = React.memo(function FlightCard({
  leg,
  mode,
  baseTz,
  tripId,
  calendarAdded,
  onToggleCalendar,
}: {
  leg: TripLeg;
  mode: TimeZoneMode;
  baseTz: string;
  tripId: string;
  calendarAdded?: boolean;
  onToggleCalendar?: (tripId: string) => void;
}) {
  const accent = routeColor(leg.depArp, leg.arvArp);
  const badgeBg = routeTintBg(leg.depArp, leg.arvArp);
  // Show the inline hotel row only when there's NO layover card (which already
  // shows the hotel) — otherwise it duplicates the booking below the leg.
  const hasHotel = leg.hotel.trim().length > 0 && !leg.hotelBooking;
  const hasFleet = leg.fleet.trim().length > 0;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]} testID="trip-flight-card">
      <View style={styles.cardHeader}>
        <View style={[styles.flightBadge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.flightBadgeText, { color: accent }]}>{leg.fltNumber}</Text>
        </View>
        {hasFleet && (
          <View style={styles.fleetBadge}>
            <Text style={styles.fleetText}>{fleetLabel(leg.fleet)}</Text>
          </View>
        )}
        {/* Add the whole duty to the iOS calendar — filled tick once it's in,
            tap again to remove exactly the events the app created. */}
        {onToggleCalendar && (
          <TouchableOpacity
            style={styles.calBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={
              calendarAdded
                ? `Remove ${leg.fltNumber} from iOS Calendar`
                : `Add ${leg.fltNumber} to iOS Calendar`
            }
            onPress={() => onToggleCalendar(tripId)}
            testID={`calendar-toggle-${tripId}`}>
            {calendarAdded ? (
              <CalendarCheckIcon color={colors.accent} />
            ) : (
              <CalendarPlusIcon color={colors.muted} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeAirport}>
          <Text style={styles.iata}>{leg.depArp || 'DEP'}</Text>
          <Text style={styles.dateTime}>{depLabel(leg, mode, baseTz)}</Text>
        </View>
        <View style={styles.routeArrow}>
          <View style={styles.arrowLine} />
          <Text style={styles.arrowHead}>›</Text>
        </View>
        <View style={[styles.routeAirport, { alignItems: 'flex-end' }]}>
          <Text style={styles.iata}>{leg.arvArp || 'ARR'}</Text>
          <Text style={styles.dateTime}>{arvLabel(leg, mode, baseTz)}</Text>
        </View>
      </View>

      {hasHotel && (
        <View style={styles.hotelRow}>
          <HotelIcon color={colors.muted} size={16} />
          <Text style={styles.hotelName}>{leg.hotel}</Text>
        </View>
      )}
    </View>
  );
});

// ─── Hotel layover card ───────────────────────────────────────────────────────
// Rendered between the inbound and outbound flight legs when the trip has a hotel.
const HotelLayoverCard = React.memo(function HotelLayoverCard({
  booking,
  layoverHours,
}: {
  booking: HotelBooking;
  layoverHours?: number;
}) {
  // Layover only — the in/out dates already read off the flight legs above and
  // below this card, so nights + date range would just duplicate them.
  return (
    <View style={styles.hotelCard} testID="hotel-layover-card">
      {/* Connector line from inbound to hotel */}
      <View style={styles.hotelConnector} />
      <View style={styles.hotelCardInner}>
        <View style={styles.hotelCardLeft}>
          <HotelIcon color={colors.muted} size={18} />
        </View>
        <View style={styles.hotelCardBody}>
          <Text style={styles.hotelCardName} numberOfLines={2}>
            {booking.hotelName}
          </Text>
          <View style={styles.hotelBadgeWrap}>
            <LayoverBadge hours={layoverHours} />
          </View>
        </View>
      </View>
      {/* Connector line to outbound */}
      <View style={styles.hotelConnector} />
    </View>
  );
});

interface SectionData {
  // A section is either a flight trip (legs rendered as rows under a check-in
  // header) or a single ground duty (the whole card is the header, no rows).
  kind: 'trip' | 'duty';
  title: string;
  tripId: string;
  data: TripLeg[];
  // Sort key for interleaving trips + duties chronologically.
  startMs: number;
  alarmDisplay?: AlarmDisplay;
  // Precomputed header metadata (enhance-Ver1 #3) — avoids parsing during render.
  ciTime: string;
  prevDay: boolean;
  // duty-only payload (kind === 'duty').
  duty?: GroundDuty;
  // layover hours for multi-leg trips with a hotel.
  layoverHours?: number;
}

const CHIP_ON = colors.accent;
const CHIP_OFF = colors.chipOffStroke;

const CheckInHeader = React.memo(function CheckInHeader({
  section,
  alarmsEnabled,
  onChipPress,
}: {
  section: SectionData;
  alarmsEnabled: boolean;
  onChipPress: (tripId: string, type: 'wake' | 'leave') => void;
}) {
  const legs = section.data.length;
  const ciTime = section.ciTime;
  const prevDay = section.prevDay;
  const d = section.alarmDisplay;
  const showAlarms = alarmsEnabled && !!d;

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTop}>
        {/* One row: alarm chips (when set) then the check-in time. */}
        <View style={styles.chipRow}>
          {showAlarms && (d!.wakeHhmm != null || d!.wakeHours === null) && (
            <TouchableOpacity
              style={[styles.tChip, d!.wakeHhmm == null && styles.tChipOff]}
              onPress={() => onChipPress(section.tripId, 'wake')}
              testID={`alarm-chip-wake-${section.tripId}`}>
              <WakeIcon color={d!.wakeHhmm == null ? CHIP_OFF : CHIP_ON} />
              <Text style={[styles.tChipTime, d!.wakeHhmm == null && styles.tChipTimeOff]}>
                {d!.wakeHhmm ?? 'off'}
              </Text>
            </TouchableOpacity>
          )}
          {showAlarms && (d!.leaveHhmm != null || d!.leaveHours === null) && (
            <TouchableOpacity
              style={[styles.tChip, d!.leaveHhmm == null && styles.tChipOff]}
              onPress={() => onChipPress(section.tripId, 'leave')}
              testID={`alarm-chip-leave-${section.tripId}`}>
              <LeaveIcon color={d!.leaveHhmm == null ? CHIP_OFF : CHIP_ON} />
              <Text style={[styles.tChipTime, d!.leaveHhmm == null && styles.tChipTimeOff]}>
                {d!.leaveHhmm ?? 'off'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Check-in time (HH:MM); flags when check-in is the day before the flight. */}
          <View style={[styles.tChip, styles.ciChip]}>
            <ClockIcon color={colors.primary} />
            <Text style={styles.ciTime}>{ciTime}</Text>
            {prevDay && <Text style={styles.ciPrev}>prev&nbsp;day</Text>}
          </View>
        </View>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>
            {legs} {legs === 1 ? 'leg' : 'legs'}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export function TripCards({
  trips,
  duties,
  sortDir = 'asc',
  alarmDisplays,
  alarmsEnabled = false,
  onAdjustAlarm,
  meetingAlarms,
  onToggleMeetingAlarm,
  calendarAdded,
  onToggleCalendar,
}: TripCardsProps) {
  const [adjusting, setAdjusting] = useState<{
    dutyId: string;
    type: 'wake' | 'leave';
    display: AlarmDisplay;
  } | null>(null);

  const mode = useAppSelector(s => s.settings.timeZoneMode);
  const baseTz = useAppSelector(s => s.settings.baseTimeZone);

  // Precompute section + header display metadata once per trips/alarm change
  // (enhance-Ver1 #2/#3) so list render does no parsing or allocation.
  const sections: SectionData[] = useMemo(
    () => {
      const tripSections: SectionData[] = trips.map(t => {
        const title = t.checkInDateUTC || '';
        const first = t.legs[0];
        const flightStr = first ? first.localDepTime || first.flightDateUTC : '';
        const ciKey = title ? dateKey(title) : null;
        const flKey = flightStr ? dateKey(flightStr) : null;
        return {
          kind: 'trip' as const,
          title,
          tripId: t.id,
          data: t.legs,
          startMs: tripStartDate(t)?.getTime() ?? 0,
          alarmDisplay: alarmDisplays?.[t.id],
          ciTime: title ? checkInHhmm(title) : '—',
          prevDay: ciKey != null && flKey != null && ciKey < flKey,
          layoverHours: t.layoverHours,
        };
      });
      const dutySections: SectionData[] = (duties ?? []).map(g => ({
        kind: 'duty' as const,
        title: g.id,
        tripId: g.id,
        data: [], // no rows — the whole card is the section header
        startMs: groundDutyStartMs(g),
        ciTime: '',
        prevDay: false,
        duty: g,
      }));
      // Interleave trips + duties by start instant in the active direction.
      const merged = [...tripSections, ...dutySections];
      merged.sort((a, b) => (sortDir === 'asc' ? a.startMs - b.startMs : b.startMs - a.startMs));
      return merged;
    },
    [trips, duties, sortDir, alarmDisplays],
  );

  const handleChipPress = useCallback(
    (tripId: string, type: 'wake' | 'leave') => {
      const display = alarmDisplays?.[tripId];
      if (!display) {
        return;
      }
      setAdjusting({ dutyId: tripId, type, display });
    },
    [alarmDisplays],
  );

  const handleSelect = useCallback(
    (dutyId: string, type: 'wake' | 'leave', hours: number) => {
      onAdjustAlarm?.(dutyId, type, hours);
    },
    [onAdjustAlarm],
  );

  const handleRemove = useCallback(
    (dutyId: string, type: 'wake' | 'leave') => {
      onAdjustAlarm?.(dutyId, type, null);
    },
    [onAdjustAlarm],
  );

  // Stable leg-level key from flight number + route + dep time (enhance-Ver1 #2).
  const keyExtractor = useCallback(
    (item: TripLeg, idx: number) =>
      `${item.fltNumber}-${item.depArp}-${item.arvArp}-${item.localDepTime || item.flightDateUTC || idx}`,
    [],
  );

  const renderItem = useCallback(
    ({ item, section }: { item: TripLeg; section: SectionData }) => {
      const card = (
        <FlightCard
          leg={item}
          mode={mode}
          baseTz={baseTz}
          tripId={section.tripId}
          calendarAdded={calendarAdded?.[section.tripId]}
          onToggleCalendar={onToggleCalendar}
        />
      );
      if (!item.hotelBooking) {
        return card;
      }
      // section.layoverHours is already the per-trip value — no lookup needed.
      return (
        <>
          {card}
          <HotelLayoverCard booking={item.hotelBooking} layoverHours={section.layoverHours} />
        </>
      );
    },
    [mode, baseTz, calendarAdded, onToggleCalendar],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionData }) => {
      if (section.kind === 'duty' && section.duty) {
        const isMeeting = section.duty.id.startsWith('meeting:');
        const alarmHhmm = isMeeting ? meetingAlarms?.[section.duty.id] : undefined;
        return (
          <GroundDutyCard
            duty={section.duty}
            mode={mode}
            baseTz={baseTz}
            alarmHhmm={alarmHhmm}
            onToggleAlarm={isMeeting ? () => onToggleMeetingAlarm?.(section.duty!.id) : undefined}
          />
        );
      }
      return (
        <CheckInHeader
          section={section}
          alarmsEnabled={alarmsEnabled}
          onChipPress={handleChipPress}
        />
      );
    },
    [alarmsEnabled, handleChipPress, mode, baseTz, meetingAlarms, onToggleMeetingAlarm],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.tzBar}>
        <View style={styles.tzChip} testID="tz-mode-chip">
          <Text style={styles.tzChipText}>
            Times: {tzModeLabel(mode, baseTz)}
          </Text>
        </View>
      </View>
    ),
    [mode, baseTz],
  );

  return (
    <>
      <SectionList
        testID="trip-list"
        sections={sections}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader as any}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        // Virtualization tuning for long rosters (enhance-Ver1 #6). Heights are
        // not fixed (variable legs/hotel rows) so getItemLayout is omitted to
        // keep scroll positions correct.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={11}
        removeClippedSubviews={Platform.OS === 'android'}
      />
      {adjusting && (
        <AdjustModal
          visible
          dutyId={adjusting.dutyId}
          type={adjusting.type}
          wakeWord={adjusting.display.wakeWord}
          currentHours={
            adjusting.type === 'wake'
              ? adjusting.display.wakeHours
              : adjusting.display.leaveHours
          }
          hhmm={
            adjusting.type === 'wake'
              ? adjusting.display.wakeHhmm
              : adjusting.display.leaveHhmm
          }
          onSelect={handleSelect}
          onRemove={handleRemove}
          onClose={() => setAdjusting(null)}
        />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: { paddingBottom: space.xl24, backgroundColor: colors.bg },

  tzBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg16,
    paddingTop: space.md12,
    paddingBottom: 2,
  },
  tzChip: {
    backgroundColor: colors.tintBgSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.tintBorder,
  },
  tzChipText: { ...font.caption, color: colors.accent },

  sectionHeader: {
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg16,
    paddingTop: space.md12,
    paddingBottom: space.sm8,
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs4,
    backgroundColor: colors.tintBgSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.tintBorder,
  },
  tChipOff: { backgroundColor: colors.offFill, borderColor: colors.offBorder },
  tChipTime: { fontSize: 13, fontWeight: '700', color: colors.accent },
  tChipTimeOff: { fontSize: 13, fontWeight: '600', color: colors.offInk },
  ciChip: { backgroundColor: colors.tintBg, borderColor: colors.ciChipBorder },
  ciTime: { fontSize: 14, fontWeight: '800', color: colors.primary },
  ciPrev: { fontSize: 10, fontWeight: '800', color: colors.muted, marginLeft: 2 },
  sectionBadge: {
    backgroundColor: colors.tintBgSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md12,
    paddingVertical: 5,
  },
  sectionBadgeText: { fontSize: 13, fontWeight: '700', color: colors.accent },

  // Flight card — operational radius + subtle border instead of a heavy shadow
  // (enhance-Ver1 #9: dense list rows should feel compact, not floating).
  card: {
    backgroundColor: colors.card,
    marginHorizontal: space.lg16,
    marginTop: space.md12,
    borderRadius: radius.op,
    borderLeftWidth: 4,
    padding: space.lg16,
    ...cardBorder,
  },
  cardHeader: { flexDirection: 'row', gap: space.sm8, marginBottom: space.md12, alignItems: 'center' },
  flightBadge: { borderRadius: radius.sm, paddingHorizontal: space.md12, paddingVertical: 6 },
  // colour is set per-leg to the route accent (see FlightCard).
  flightBadgeText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  fleetBadge: { borderRadius: radius.sm, paddingHorizontal: space.md12, paddingVertical: 6, backgroundColor: colors.tintBgSoft },
  fleetText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  // Calendar toggle sits at the far right of the header row (marginLeft:'auto'),
  // clear of the flight + fleet badges on the left.
  calBtn: { marginLeft: 'auto', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeAirport: { alignItems: 'flex-start', minWidth: 64 },
  iata: { fontSize: 26, fontWeight: '800', color: colors.inkSoft, letterSpacing: 1 },
  dateTime: { ...font.sub, color: colors.muted, marginTop: 3 },
  routeArrow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm8 },
  arrowLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  arrowHead: { fontSize: 22, color: colors.faint, marginLeft: 2 },

  hotelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md12,
    paddingTop: space.md12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: space.sm8,
  },
  hotelName: { ...font.sub, color: colors.ink, flex: 1 },

  // Adjust modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    padding: space.xl24,
    paddingBottom: 40,
    gap: space.md12,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm8 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  modalSub: { ...font.sub, color: colors.muted, textAlign: 'center' },
  modalSubLabel: { fontSize: 12, fontWeight: '600', color: colors.faint, letterSpacing: 0.5, marginTop: space.xs4 },
  presetScroll: { flexGrow: 0 },
  presets: { flexDirection: 'row', gap: space.sm8, paddingVertical: space.xs4 },
  presetBtn: {
    paddingHorizontal: space.lg16,
    paddingVertical: space.sm8 + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.tintBg,
    borderWidth: 1,
    borderColor: colors.presetBorder,
  },
  presetBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  presetTextActive: { color: colors.onPrimary },
  removeBtn: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    paddingVertical: space.lg16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    marginTop: space.xs4,
  },
  removeBtnText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    paddingVertical: space.md12,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.faint, fontSize: 14, fontWeight: '600' },

  // Hotel layover card — appears between inbound and outbound flight legs.
  hotelCard: {
    marginHorizontal: space.lg16,
    marginVertical: 2,
  },
  hotelConnector: {
    alignSelf: 'center',
    width: 2,
    height: space.sm8,
    backgroundColor: colors.hairline,
  },
  hotelCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md12,
    gap: space.md12,
  },
  hotelCardLeft: {
    alignSelf: 'flex-start',
    paddingTop: 1,
  },
  hotelCardBody: {
    flex: 1,
  },
  hotelCardName: {
    ...font.bodyStrong,
    fontSize: 14,
    color: colors.muted, // same gray as the flight date — one neutral on the card
  },
  hotelBadgeWrap: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
});
