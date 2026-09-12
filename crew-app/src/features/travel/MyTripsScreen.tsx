import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useAppDispatch, useAppSelector } from '../../store';
import { addTrips, syncCapturedTrips } from './tripsSlice';
import { classifyTrips, type Trip } from './tripCsv';
import { pickAndParseTrips, TripImportCancelled } from './importTrips';
import { TripCards, type AlarmDisplay } from './TripCards';
import { PortalCaptureScreen } from './PortalCaptureScreen';
import type { PortalDuty } from './portalCapture';
import { setDuties, saveDuties } from '../roster/dutiesSlice';
import { classifyGroundDuties } from '../roster/dutyDisplay';
import { classifyMeetings, meetingAlarmHhmm, meetingStart } from '../meetings/meetingSetup';
import { toggleMeetingMute } from '../meetings/meetingsSlice';
import { airlineByCode } from '../auth/airlines';
import { alarmOptions, computeEffectiveAlarms } from '../settings/alarmSetup';
import { setDutyOverride, reconcileAlarms, setAgendaFilter, type AgendaFilter } from '../alarms/alarmsSlice';
import { toggleDutyCalendar } from '../calendar/flightCalendarSlice';
import { describeCalendarToggle } from '../calendar/dutyCalendarMessages';
import { colors, font, space } from '../../theme';
import {
  SuitcaseIllustration,
  MapIllustration,
  ActionButton,
} from './components/TripEmptyStates';

type Tab = 'upcoming' | 'past';

// ─── Tab Panels ───────────────────────────────────────────────────────────────

const ICON_STROKE = colors.muted;

function FilterIcon({ active }: { active: boolean }) {
  const stroke = active ? colors.primary : colors.ink;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Line x1={3} y1={5} x2={21} y2={5} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <Line x1={6} y1={10} x2={18} y2={10} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <Line x1={9} y1={15} x2={15} y2={15} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function AddTripIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Line x1={12} y1={5} x2={12} y2={19} stroke={ICON_STROKE} strokeWidth={2} strokeLinecap="round" />
      <Line x1={5} y1={12} x2={19} y2={12} stroke={ICON_STROKE} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// "or … Sign In" — only rendered when the crew is NOT signed in.
function SignInBlock() {
  return (
    <>
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orLine} />
      </View>
      <ActionButton
        label="Sign In"
        icon={
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={8} r={4} stroke={ICON_STROKE} strokeWidth={2} fill="none" />
            <Path d="M4 20C4 16.7 7.6 14 12 14C16.4 14 20 16.7 20 20" stroke={ICON_STROKE} strokeWidth={2} strokeLinecap="round" fill="none" />
          </Svg>
        }
      />
    </>
  );
}

function UpcomingPanel({ onAddTrip, showSignIn }: { onAddTrip: () => void; showSignIn: boolean }) {
  return (
    <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
      <SuitcaseIllustration />
      <Text style={styles.emptyTitle}>Look where you are heading next.</Text>
      <Text style={styles.emptySub}>
        Add a trip to keep track and get updates on your flight status.
      </Text>
      <View style={styles.actions}>
        <ActionButton
          label="Book Flights"
          icon={
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill={ICON_STROKE} />
            </Svg>
          }
        />
        <ActionButton label="Add Trip" onPress={onAddTrip} icon={<AddTripIcon />} />
        {showSignIn && <SignInBlock />}
      </View>
    </ScrollView>
  );
}

function PastPanel({ onAddTrip, showSignIn }: { onAddTrip: () => void; showSignIn: boolean }) {
  return (
    <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
      <MapIllustration />
      <Text style={styles.emptyTitle}>Creating a beautiful timeline of your adventures.</Text>
      <Text style={styles.emptySub}>
        See the record of your past trips by adding a trip{showSignIn ? ' or signing in' : ''}.
      </Text>
      <View style={styles.actions}>
        <ActionButton label="Add Trip" onPress={onAddTrip} icon={<AddTripIcon />} />
        {showSignIn && <SignInBlock />}
      </View>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function MyTripsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [importing, setImporting] = useState(false);
  const [portalVisible, setPortalVisible] = useState(false);

  const dispatch = useAppDispatch();
  const trips = useAppSelector(s => s.trips.trips);
  const duties = useAppSelector(s => s.duties.duties);
  const meetings = useAppSelector(s => s.meetings.meetings);
  const meetingsEnabled = useAppSelector(s => s.meetings.enabled);
  const meetingMinutesBefore = useAppSelector(s => s.meetings.minutesBefore);
  const meetingMutedIds = useAppSelector(s => s.meetings.mutedIds);
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const alarmOverrides = useAppSelector(s => s.alarms.overrides);
  const agendaFilter = useAppSelector(s => s.alarms.agendaFilter);
  const wakeUpHours = useAppSelector(s => s.alarms.wakeUpHours);
  const leaveHomeHours = useAppSelector(s => s.alarms.leaveHomeHours);
  const calendarEventIds = useAppSelector(s => s.flightCalendar.eventIds);
  const crewId = useAppSelector(s => s.auth.crewId) ?? '';
  const password = useAppSelector(s => s.auth.password) ?? '';
  // Only offer "Sign In" in the empty states when the crew isn't already signed
  // in. In the normal app the crew is always signed in here, so it stays hidden.
  const signedIn = useAppSelector(s => s.auth.loggedIn);
  const airlineCode = useAppSelector(s => s.auth.airline);
  const airlineCfg = airlineByCode(airlineCode);
  const portalUrl = airlineCfg.portalUrl ?? undefined;

  // A ticking "now" so activities move from Upcoming → Past automatically as time
  // passes while the screen is open. The classifiers below split on "end < now",
  // but they're memoised on the data arrays — without a changing `now` they'd
  // never re-run on a screen that just sits there (tab toggles don't remount it).
  // One re-render per minute is enough (boundaries are minute-level) and cheap.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Classify the stored trips into upcoming / past relative to now.
  const { upcoming, past } = useMemo(
    () => classifyTrips(trips, now),
    [trips, now],
  );

  // Classify the non-flight ground duties (days off, leave, training, sim,
  // standby, meetings, deadhead, reserve) the same way, to interleave by date.
  // Calendar meetings (Outlook/Exchange, when enabled) render as 'meeting' cards
  // alongside the portal duties — merged here, then sorted by TripCards.
  const { upcoming: upcomingDuties, past: pastDuties } = useMemo(() => {
    const ground = classifyGroundDuties(duties, now);
    if (!meetingsEnabled || meetings.length === 0) {
      return ground;
    }
    const mtg = classifyMeetings(meetings, now);
    return {
      upcoming: [...ground.upcoming, ...mtg.upcoming],
      past: [...ground.past, ...mtg.past],
    };
  }, [duties, meetings, meetingsEnabled, now]);

  // Alarm display data for upcoming trips (null = alarm disabled for that duty).
  const alarmDisplays = useMemo((): Record<string, AlarmDisplay> => {
    if (!alarmsEnabled) {
      return {};
    }
    const options = alarmOptions(wakeUpHours, leaveHomeHours);
    const effective = computeEffectiveAlarms(upcoming, options, alarmOverrides);
    const map: Record<string, AlarmDisplay> = {};
    for (const a of effective) {
      map[a.dutyId] = {
        wakeHhmm: a.wakeUp?.hhmm ?? null,
        leaveHhmm: a.leaveHome?.hhmm ?? null,
        wakeHours:
          alarmOverrides[a.dutyId] !== undefined
            ? alarmOverrides[a.dutyId].wakeUpHours
            : options.wakeUpHoursBefore,
        leaveHours:
          alarmOverrides[a.dutyId] !== undefined
            ? alarmOverrides[a.dutyId].leaveHomeHours
            : options.leaveHomeHoursBefore,
        wakeWord: a.wakeWord,
      };
    }
    return map;
  }, [alarmsEnabled, upcoming, alarmOverrides, wakeUpHours, leaveHomeHours]);

  // Per-meeting alarm display: maps "meeting:<id>" → HH:MM string (active) or
  // null (muted). Undefined key = not a calendar meeting or meetings disabled.
  const meetingAlarms = useMemo((): Record<string, string | null> => {
    if (!meetingsEnabled || !alarmsEnabled) {
      return {};
    }
    const muted = new Set(meetingMutedIds);
    const result: Record<string, string | null> = {};
    for (const m of meetings) {
      const start = meetingStart(m);
      if (!start || start.getTime() <= now.getTime()) {
        continue;
      }
      const dutyId = `meeting:${m.id}`;
      result[dutyId] = muted.has(m.id) ? null : meetingAlarmHhmm(m, meetingMinutesBefore);
    }
    return result;
  }, [meetings, meetingsEnabled, alarmsEnabled, meetingMinutesBefore, meetingMutedIds, now]);

  // Which upcoming duties are currently written into the iOS calendar — drives
  // the plus/tick state of the calendar icon on each flight card.
  const calendarAdded = useMemo((): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const [dutyId, ids] of Object.entries(calendarEventIds)) {
      map[dutyId] = ids.length > 0;
    }
    return map;
  }, [calendarEventIds]);

  // Tap the calendar icon on any leg → write (or remove) the WHOLE duty: the
  // Wake Up / Get Ready, Leave Home and Check-in markers plus one block per leg.
  const handleToggleCalendar = useCallback(
    async (tripId: string) => {
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        return;
      }
      const result = await dispatch(toggleDutyCalendar(trip));
      // 'busy' (a tap already in flight) maps to null → stay quiet.
      const message = describeCalendarToggle(result, trip);
      if (message) {
        Alert.alert(message.title, message.body);
      }
    },
    [dispatch, trips],
  );

  const toggleMeetingAlarm = useCallback((dutyId: string) => {
    dispatch(toggleMeetingMute(dutyId.replace(/^meeting:/, '')));
  }, [dispatch]);

  // Re-schedule all alarms with the updated override applied. Memoised so its
  // identity is stable — it flows into the memoised <TripCards>, so a fresh
  // closure each render would re-render every section header.
  const rescheduleWithOverride = useCallback((
    dutyId: string,
    type: 'wake' | 'leave',
    newHours: number | null,
  ) => {
    const current = alarmOverrides[dutyId] ?? {
      wakeUpHours,
      leaveHomeHours,
    };
    const updated = {
      wakeUpHours: type === 'wake' ? newHours : current.wakeUpHours,
      leaveHomeHours: type === 'leave' ? newHours : current.leaveHomeHours,
    };
    dispatch(setDutyOverride({ dutyId, override: updated }));
    // Re-sync every alarm to the new override (reads fresh state after dispatch).
    dispatch(reconcileAlarms());
  }, [alarmOverrides, dispatch, wakeUpHours, leaveHomeHours]);

  // Shared ingest path for both CSV import and crew-portal capture: store the
  // trips, jump to the right tab, and auto-schedule alarms when enabled.
  // `authoritative` (portal re-capture) REPLACES the crew's window so stale
  // cards are cleaned up; CSV import upserts so it can't wipe other data.
  const ingestTrips = async (parsed: Trip[], authoritative = false) => {
    dispatch(authoritative ? syncCapturedTrips(parsed) : addTrips(parsed));

    const { upcoming: u } = classifyTrips(parsed, new Date());
    setActiveTab(u.length > 0 ? 'upcoming' : 'past');

    // Every roster reload re-syncs the alarms: reconcileAlarms reads the freshly
    // stored trips (after the dispatch above) and clears every native alarm before
    // rescheduling, so flights dropped by an authoritative re-capture lose their
    // alarms and new flights gain them — no stale alarms survive a reload.
    dispatch(reconcileAlarms());
  };

  const importFromCsv = async () => {
    if (importing) {
      return;
    }
    setImporting(true);
    try {
      const parsed = await pickAndParseTrips();
      await ingestTrips(parsed);
    } catch (err) {
      if (!(err instanceof TripImportCancelled)) {
        Alert.alert('Could not add trip', (err as Error).message);
      }
    } finally {
      setImporting(false);
    }
  };

  // Trips captured from the crew portal WebView.
  const handlePortalCaptured = async (parsed: Trip[], duties: PortalDuty[]) => {
    setPortalVisible(false);
    await ingestTrips(parsed, true);
    if (duties.length) {
      dispatch(setDuties(duties));
      await saveDuties(duties);
    }
    Alert.alert(
      'Roster refreshed',
      `Captured ${parsed.length} trip${parsed.length === 1 ? '' : 's'} and ${duties.length} dut${
        duties.length === 1 ? 'y' : 'ies'
      } from the crew portal.`,
    );
  };

  // Add Trip → choose source (doc/Add Trip Ver2): CSV or crew portal.
  const handleAddTrip = () => {
    if (importing) {
      return;
    }
    Alert.alert('Add Trip', 'How would you like to add your trip?', [
      { text: 'Import CSV file', onPress: importFromCsv },
      { text: 'Capture from Crew Portal', onPress: () => setPortalVisible(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleFilter = () => {
    const label = (f: AgendaFilter) => agendaFilter === f ? '✓ ' : '';
    Alert.alert('Show', undefined, [
      { text: `${label('all')}All`, onPress: () => dispatch(setAgendaFilter('all')) },
      { text: `${label('work')}Work (crew portal)`, onPress: () => dispatch(setAgendaFilter('work')) },
      { text: `${label('personal')}Personal (iPhone calendar)`, onPress: () => dispatch(setAgendaFilter('personal')) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const allTrips = activeTab === 'upcoming' ? upcoming : past;
  const allDuties = activeTab === 'upcoming' ? upcomingDuties : pastDuties;
  // Apply the agenda filter: 'work' hides meetings, 'personal' shows only meetings.
  const activeTrips = agendaFilter === 'personal' ? [] : allTrips;
  const activeDuties = useMemo(() => {
    if (agendaFilter === 'work') return allDuties.filter(d => !d.id.startsWith('meeting:'));
    if (agendaFilter === 'personal') return allDuties.filter(d => d.id.startsWith('meeting:'));
    return allDuties;
  }, [agendaFilter, allDuties]);

  return (
    <SafeAreaView style={styles.container} testID="agenda-screen">
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Top nav */}
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.navIcon}>
          <Svg width={22} height={16} viewBox="0 0 22 16">
            <Line x1={0} y1={2} x2={22} y2={2} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
            <Line x1={0} y1={8} x2={22} y2={8} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
            <Line x1={0} y1={14} x2={22} y2={14} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Agenda</Text>
        <View style={styles.navRight}>
          {/* Refresh roster from the crew portal (doc/App Flow Ver1) */}
          <TouchableOpacity
            style={styles.navIcon}
            onPress={() => setPortalVisible(true)}
            testID="refresh-roster">
            <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
              <Path
                d="M20 11A8 8 0 1 0 18.4 16"
                stroke={colors.ink}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <Path d="M20 4v5h-5" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIcon} onPress={handleFilter} testID="filter-agenda">
            <FilterIcon active={agendaFilter !== 'all'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIcon} onPress={handleAddTrip} testID="add-trip-header">
            <Svg width={22} height={22} viewBox="0 0 22 22">
              <Line x1={11} y1={3} x2={11} y2={19} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
              <Line x1={3} y1={11} x2={19} y2={11} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
          testID="tab-upcoming">
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
          testID="tab-past">
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {importing && (
        <View style={styles.importingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.importingText}>Importing trips…</Text>
        </View>
      )}


      {/* Panel: trip + ground-duty cards when present, otherwise the empty state. */}
      {activeTrips.length > 0 || activeDuties.length > 0 ? (
        <TripCards
          trips={activeTrips}
          duties={activeDuties}
          sortDir={activeTab === 'upcoming' ? 'asc' : 'desc'}
          alarmDisplays={activeTab === 'upcoming' ? alarmDisplays : undefined}
          alarmsEnabled={alarmsEnabled}
          onAdjustAlarm={rescheduleWithOverride}
          meetingAlarms={activeTab === 'upcoming' ? meetingAlarms : undefined}
          onToggleMeetingAlarm={toggleMeetingAlarm}
          calendarAdded={calendarAdded}
          // Past flights aren't worth calendaring — the icon only shows on Upcoming.
          onToggleCalendar={activeTab === 'upcoming' ? handleToggleCalendar : undefined}
        />
      ) : activeTab === 'upcoming' ? (
        <UpcomingPanel onAddTrip={handleAddTrip} showSignIn={!signedIn} />
      ) : (
        <PastPanel onAddTrip={handleAddTrip} showSignIn={!signedIn} />
      )}

      {/* Crew-portal capture (doc/Add Trip Ver2). Mounted ONLY while visible so
          every refresh starts a FRESH capture: a React Native <Modal> keeps its
          children mounted across visibility toggles, which would otherwise leave
          PortalCaptureScreen's one-shot build guard + stale captures (and the
          WebView's rostersFetched flag) in place — so a second refresh never
          re-fetched. The conditional mount resets all of that each time. */}
      <Modal
        visible={portalVisible}
        animationType="slide"
        onRequestClose={() => setPortalVisible(false)}
        presentationStyle="fullScreen">
        {portalVisible ? (
          <PortalCaptureScreen
            portalUrl={portalUrl}
            crewId={crewId}
            password={password}
            carrier={airlineCfg.carrier}
            portalConfig={airlineCfg.portalConfig}
            onClose={() => setPortalVisible(false)}
            onCaptured={handlePortalCaptured}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },

  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xl24,
    paddingVertical: space.md12,
  },
  navRight: { flexDirection: 'row', alignItems: 'center' },
  navIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...font.title, fontSize: 18, color: colors.ink },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...font.body, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.primary },

  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm8,
    paddingVertical: space.md12,
    backgroundColor: colors.tintBg,
  },
  importingText: { ...font.sub, color: colors.accent, fontWeight: '600' },

  panel: {
    alignItems: 'center',
    paddingBottom: space.xxl32,
  },

  emptyTitle: {
    ...font.h2,
    fontSize: 19,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: space.xxl32,
    lineHeight: 26,
    marginBottom: space.md12,
  },
  emptySub: {
    ...font.body,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 28,
    lineHeight: 21,
    marginBottom: space.xxl32,
  },

  actions: { width: '100%', paddingHorizontal: space.xl24 },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md12,
    marginBottom: space.md12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  orText: { ...font.sub, color: colors.faint },
});
