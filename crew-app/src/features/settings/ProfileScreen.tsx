import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector, useAppDispatch } from '../../store';
import { HeaderBackdrop } from '../../components/HeaderBackdrop';
import {
  computeEffectiveAlarms,
  alarmOptions,
  PRESET_HOURS,
  type EffectiveAlarm,
} from './alarmSetup';
import { classifyTrips } from '../travel/tripCsv';
import { centerOffset } from '../../components/centerOffset';
import { setEnabled, setGlobalAlarmHours, loadEnabled } from '../alarms/alarmsSlice';
import { MEETING_MINUTES_PRESETS, ISLAND_MINUTES_PRESETS } from '../meetings/meetingSetup';
import {
  setMeetingsEnabled,
  setMeetingMinutes,
  setIslandCountdown,
  setIslandLeadMinutes,
} from '../meetings/meetingsSlice';
import { setTimeZoneMode, type TimeZoneMode } from './settingsSlice';
import { APP_VERSION } from '../../version';
import { logout } from '../auth/authSlice';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  isAlarmModuleAvailable,
  requestAlarmAuthorization,
  getScheduledAlarmCount,
  scheduleTestAlarm,
} from './alarmModule';
import { colors, font, space, radius } from '../../theme';
import { TestAlarmButton } from './components/TestAlarmButton';
import { WakeIcon, LeaveIcon } from '../travel/components/TripIcons';
import { CrewAvatar, avatarForCrew } from './avatars';

// ─── Profile / Settings ───────────────────────────────────────────────────────
// Includes the Clock Setup (Clock Setup Ver1): enable iOS alarms and schedule
// Wake Up + Leave Home alarms per duty from the imported trips.

// Soft heart for the "Travel With Love" tagline.
function HeartIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={colors.onPrimary}
      />
    </Svg>
  );
}

// Shown wherever alarm setup is attempted without AlarmKit (needs iOS 26+ device).
function alertAlarmsUnavailable() {
  Alert.alert(
    'Not available',
    'Setting clock alarms requires iOS 26 or later on a physical device.',
  );
}

// Two-people glyph for the meeting reminder (matches GroundDutyCard's meeting icon).
function MeetingIcon({ color = colors.accent, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8} r={3} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M16 6.2A3 3 0 0 1 18 12M17 14.3c2.4.5 4 2.4 4 4.7" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

// An editable offset row. The current selection (e.g. "4h" / "8m") is always
// visible AND highlighted in the chip strip, so the user can see and change the
// lead time. Shared by the flight Wake Up / Leave Home offsets and the meeting
// reminder (different presets + formatting via props).
function OffsetChipRow({
  title,
  tooltip,
  value,
  presets,
  format,
  rightLabel,
  icon,
  testIdKey,
  onSelect,
}: {
  title: string;
  tooltip: string;
  value: number;
  presets: number[];
  format: (n: number) => string;
  rightLabel: string;
  icon: React.ReactNode;
  testIdKey: string;
  onSelect: (n: number) => void;
}) {
  // Centre the current offset so it's visible without swiping (see TripCards).
  const scrollRef = useRef<ScrollView>(null);
  const containerW = useRef(0);
  const chipLayout = useRef<Record<number, { x: number; w: number }>>({});
  const centerActive = useCallback(() => {
    const l = chipLayout.current[value];
    const cw = containerW.current;
    if (!l || !cw) {
      return;
    }
    scrollRef.current?.scrollTo({ x: centerOffset(l.x, l.w, cw), animated: false });
  }, [value]);

  return (
    <View style={styles.clockRow}>
      <View style={styles.clockRowTop}>
        <View style={styles.clockTitleWrap}>
          {icon}
          <Text style={styles.clockTitle}>{title}</Text>
        </View>
        <Text style={styles.clockTime}>{rightLabel}</Text>
      </View>
      <Text style={styles.clockTooltip}>{tooltip}</Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hourChips}
        onLayout={e => {
          containerW.current = e.nativeEvent.layout.width;
          centerActive();
        }}>
        {presets.map(n => {
          const active = n === value;
          return (
            <TouchableOpacity
              key={n}
              style={[styles.hourChip, active && styles.hourChipActive]}
              onLayout={e => {
                chipLayout.current[n] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
                if (active) {
                  centerActive();
                }
              }}
              onPress={() => onSelect(n)}
              activeOpacity={0.8}
              testID={`alarm-${testIdKey}-${n}`}>
              <Text style={[styles.hourChipText, active && styles.hourChipTextActive]}>
                {format(n)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function fmtHours(h: number): string {
  return `${h}h`;
}

function fmtMinutes(m: number): string {
  return `${m}m`;
}

function TimeZoneOption({
  title,
  subtitle,
  selected,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.tzOption, selected && styles.tzOptionSelected]}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tzOptionTitle, selected && styles.tzOptionTitleSelected]}>
          {title}
        </Text>
        <Text style={styles.tzOptionSub}>{subtitle}</Text>
      </View>
      <View style={[styles.tzCheck, selected && styles.tzCheckSelected]}>
        {selected && <Text style={styles.tzCheckMark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const crewId = useAppSelector(s => s.auth.crewId);
  const trips = useAppSelector(s => s.trips.trips);
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const wakeUpHours = useAppSelector(s => s.alarms.wakeUpHours);
  const leaveHomeHours = useAppSelector(s => s.alarms.leaveHomeHours);
  const alarmOverrides = useAppSelector(s => s.alarms.overrides);
  const meetingsEnabled = useAppSelector(s => s.meetings.enabled);
  const meetingMinutes = useAppSelector(s => s.meetings.minutesBefore);
  const meetingCount = useAppSelector(s => s.meetings.meetings.length);
  const islandCountdown = useAppSelector(s => s.meetings.islandCountdown);
  const islandLeadMinutes = useAppSelector(s => s.meetings.islandLeadMinutes);
  const timeZoneMode = useAppSelector(s => s.settings.timeZoneMode);

  const onSelectTimeZone = (mode: TimeZoneMode) => {
    dispatch(setTimeZoneMode(mode));
  };

  const onLogout = () => {
    Alert.alert('Log out', 'Log out and return to the login screen?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => dispatch(logout()) },
    ]);
  };

  const [busy, setBusy] = useState(false);
  const [nativeCount, setNativeCount] = useState<number | null>(null);

  // Restore persisted enabled state + offsets on first mount.
  useEffect(() => {
    dispatch(loadEnabled());
  }, [dispatch]);

  // The Wake Up + Leave Home alarms that WILL be set for every upcoming duty,
  // recomputed live as the user changes the offsets — so the list always shows
  // exactly what is scheduled (local airport time), per-duty overrides applied.
  const effective = useMemo<EffectiveAlarm[]>(() => {
    const upcoming = classifyTrips(trips, new Date()).upcoming;
    return computeEffectiveAlarms(
      upcoming,
      alarmOptions(wakeUpHours, leaveHomeHours),
      alarmOverrides,
    );
  }, [trips, wakeUpHours, leaveHomeHours, alarmOverrides]);

  const refreshNativeCount = useCallback(async () => {
    if (!isAlarmModuleAvailable()) {
      return;
    }
    try {
      setNativeCount(await getScheduledAlarmCount());
    } catch {
      // Non-fatal; leave the previous count.
    }
  }, []);

  // Show how many alarms iOS already has registered when the screen opens.
  useEffect(() => {
    refreshNativeCount();
  }, [refreshNativeCount]);

  // Schedule the native test alarm; returns its fire time (epoch ms) so the
  // isolated TestAlarmButton can run its own 1s countdown (enhance-Ver1 #5).
  const handleTestAlarm = useCallback(async (): Promise<number | null> => {
    if (!isAlarmModuleAvailable()) {
      alertAlarmsUnavailable();
      return null;
    }
    try {
      const auth = await requestAlarmAuthorization();
      if (auth !== 'authorized') {
        Alert.alert('Permission needed', 'Allow alarm access to set a test alarm.');
        return null;
      }
      const { fireAt } = await scheduleTestAlarm(10);
      await refreshNativeCount();
      return fireAt;
    } catch (err) {
      Alert.alert('Could not set test alarm', (err as Error).message);
      return null;
    }
  }, [refreshNativeCount]);

  // Flip the master switch. Turning ON auto-schedules alarms for every upcoming
  // flight; turning OFF removes them all (the reconcile thunk handles both).
  const onToggleAlarms = useCallback(
    async (value: boolean) => {
      if (value && !isAlarmModuleAvailable()) {
        alertAlarmsUnavailable();
        return;
      }
      setBusy(true);
      try {
        const res = await dispatch(setEnabled(value));
        await refreshNativeCount();
        if (value && res.available && res.scheduled === 0 && effective.length > 0) {
          Alert.alert(
            'Permission needed',
            'Allow alarm access in iOS Settings to set your flight alarms.',
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [dispatch, refreshNativeCount, effective.length],
  );

  // Flip the meeting-reminder switch. Turning ON reads the device calendar
  // (EventKit) and arms a reminder before each meeting; OFF removes them.
  const onToggleMeetings = useCallback(
    async (value: boolean) => {
      if (value && !isAlarmModuleAvailable()) {
        alertAlarmsUnavailable();
        return;
      }
      setBusy(true);
      try {
        await dispatch(setMeetingsEnabled(value));
        await refreshNativeCount();
      } finally {
        setBusy(false);
      }
    },
    [dispatch, refreshNativeCount],
  );

  // Change the meeting reminder lead time; persists it and re-arms immediately.
  const changeMeetingMinutes = useCallback(
    async (m: number) => {
      await dispatch(setMeetingMinutes(m));
      await refreshNativeCount();
    },
    [dispatch, refreshNativeCount],
  );

  // Dynamic Island countdown: toggle + lead-time. Independent of the alarm.
  const onToggleIsland = useCallback(
    (value: boolean) => {
      dispatch(setIslandCountdown(value));
    },
    [dispatch],
  );
  const changeIslandMinutes = useCallback(
    (m: number) => {
      dispatch(setIslandLeadMinutes(m));
    },
    [dispatch],
  );

  // Change a global offset; persists it and re-syncs every alarm immediately.
  const changeHours = useCallback(
    async (type: 'wake' | 'leave', h: number) => {
      await dispatch(
        setGlobalAlarmHours({
          wakeUpHours: type === 'wake' ? h : wakeUpHours,
          leaveHomeHours: type === 'leave' ? h : leaveHomeHours,
        }),
      );
      await refreshNativeCount();
    },
    [dispatch, refreshNativeCount, wakeUpHours, leaveHomeHours],
  );

  return (
    <View style={styles.container} testID="profile-screen">
      <StatusBar barStyle="light-content" backgroundColor={colors.accent} />
      {/* Header fills behind the status bar / island (paddingTop = safe inset). */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm8 }]}>
        <HeaderBackdrop />
        <View style={styles.avatarWrap}>
          <CrewAvatar index={avatarForCrew(crewId)} size={96} bare />
        </View>
        <View style={styles.tagline}>
          <Text style={styles.taglineText}>Travel With Love</Text>
          <HeartIcon />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Clock Setup ── */}
        <Text style={styles.sectionHeading}>Clock Setup</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Enable iOS clock alarms</Text>
              <Text style={styles.toggleSub}>
                Set Get Ready and Leave Home alarms before each flight duty.
              </Text>
            </View>
            <Switch
              value={alarmsEnabled}
              onValueChange={onToggleAlarms}
              disabled={busy}
              trackColor={{ true: colors.accent, false: colors.neutralWeak }}
              testID="alarms-toggle"
            />
          </View>

          {alarmsEnabled && (
            <View style={styles.clockSection}>
              <OffsetChipRow
                title="Get Ready"
                tooltip="When to rouse you before departure — the alarm reads “Wake Up” when it lands in the morning. Tap to change."
                value={wakeUpHours}
                presets={PRESET_HOURS}
                format={fmtHours}
                rightLabel={`Dep − ${fmtHours(wakeUpHours)}`}
                testIdKey="wake"
                icon={<WakeIcon color={colors.accent} size={18} />}
                onSelect={h => changeHours('wake', h)}
              />
              <OffsetChipRow
                title="Leave Home"
                tooltip="When to head to the airport before departure. Tap to change."
                value={leaveHomeHours}
                presets={PRESET_HOURS}
                format={fmtHours}
                rightLabel={`Dep − ${fmtHours(leaveHomeHours)}`}
                testIdKey="leave"
                icon={<LeaveIcon color={colors.accent} size={18} />}
                onSelect={h => changeHours('leave', h)}
              />

              <Text style={styles.dutyCount}>
                {effective.length > 0
                  ? `Alarms set automatically for ${effective.length} upcoming ${
                      effective.length === 1 ? 'flight' : 'flights'
                    } (local airport time). Adjusting a flight or these hours re-sets them.`
                  : 'No upcoming flights yet — import a roster in My Trips and alarms set themselves.'}
              </Text>

              {/* The Wake Up / Leave Home alarms iOS will ring. AlarmKit alarms do
                  not appear in the system Clock app, so we list them here. */}
              <View style={styles.scheduledBlock}>
                <Text style={styles.scheduledHeading}>
                  Scheduled alarms
                  {nativeCount != null ? ` · iOS reports ${nativeCount}` : ''}
                </Text>
                {effective.length === 0 ? (
                  <Text style={styles.scheduledEmpty}>
                    Nothing upcoming. AlarmKit alarms ring as full-screen alerts and are
                    not shown in the Clock app.
                  </Text>
                ) : (
                  effective.flatMap(a => {
                    const route = `${a.dep} – ${a.arv}`;
                    const rows: React.ReactNode[] = [];
                    if (a.wakeUp) {
                      rows.push(
                        <View key={`${a.dutyId}-wake`} style={styles.alarmItem} testID="scheduled-alarm">
                          <WakeIcon color={colors.accent} size={18} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.alarmItemTitle} numberOfLines={1}>
                              {a.wakeWord} · {a.fltNumber} {route}
                            </Text>
                            <Text style={styles.alarmItemWhen}>
                              {a.wakeUp.hhmm} · {a.timeZone}
                            </Text>
                          </View>
                        </View>,
                      );
                    }
                    if (a.leaveHome) {
                      rows.push(
                        <View key={`${a.dutyId}-leave`} style={styles.alarmItem} testID="scheduled-alarm">
                          <LeaveIcon color={colors.accent} size={18} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.alarmItemTitle} numberOfLines={1}>
                              Leave Home · {a.fltNumber} {route}
                            </Text>
                            <Text style={styles.alarmItemWhen}>
                              {a.leaveHome.hhmm} · {a.timeZone}
                            </Text>
                          </View>
                        </View>,
                      );
                    }
                    return rows;
                  })
                )}
              </View>

              <TestAlarmButton onSchedule={handleTestAlarm} />
            </View>
          )}
        </View>

        {/* ── Meeting reminders ── */}
        <Text style={styles.sectionHeading}>Meetings</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Alarm for meeting events</Text>
              <Text style={styles.toggleSub}>
                Read meetings from your calendar (Outlook/Exchange synced to iOS) and
                ring an alarm before each one.
              </Text>
            </View>
            <Switch
              value={meetingsEnabled}
              onValueChange={onToggleMeetings}
              disabled={busy}
              trackColor={{ true: colors.accent, false: colors.neutralWeak }}
              testID="meetings-toggle"
            />
          </View>

          {meetingsEnabled && (
            <View style={styles.clockSection}>
              <OffsetChipRow
                title="Reminder"
                tooltip="How long before a meeting the alarm fires. Tap to change."
                value={meetingMinutes}
                presets={MEETING_MINUTES_PRESETS}
                format={fmtMinutes}
                rightLabel={`${fmtMinutes(meetingMinutes)} before`}
                testIdKey="meeting"
                icon={<MeetingIcon color={colors.accent} size={18} />}
                onSelect={changeMeetingMinutes}
              />
              <Text style={styles.dutyCount}>
                {meetingCount > 0
                  ? `Reading ${meetingCount} upcoming meeting${
                      meetingCount === 1 ? '' : 's'
                    } from your calendar — each rings ${fmtMinutes(meetingMinutes)} before it starts.`
                  : 'No upcoming meetings found on your calendar yet. New invites are picked up on next launch.'}
              </Text>

              {/* Dynamic Island live countdown to the next meeting. */}
              <View style={styles.islandToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Dynamic Island countdown</Text>
                  <Text style={styles.toggleSub}>
                    Show a live countdown in the Dynamic Island before a meeting starts.
                  </Text>
                </View>
                <Switch
                  value={islandCountdown}
                  onValueChange={onToggleIsland}
                  trackColor={{ true: colors.accent, false: colors.neutralWeak }}
                  testID="island-toggle"
                />
              </View>
              {islandCountdown && (
                <OffsetChipRow
                  title="Countdown"
                  tooltip="How long before a meeting the island countdown appears. Tap to change."
                  value={islandLeadMinutes}
                  presets={ISLAND_MINUTES_PRESETS}
                  format={fmtMinutes}
                  rightLabel={`${fmtMinutes(islandLeadMinutes)} before`}
                  testIdKey="island"
                  icon={<MeetingIcon color={colors.accent} size={18} />}
                  onSelect={changeIslandMinutes}
                />
              )}
            </View>
          )}
        </View>

        {/* ── Time Zone ── */}
        <Text style={styles.sectionHeading}>Time Zone</Text>
        <View style={styles.card}>
          <Text style={styles.tzIntro}>
            Choose how flight and duty times are displayed everywhere in the app.
          </Text>
          <View style={styles.tzOptions}>
            <TimeZoneOption
              title="Airport Local"
              subtitle="Each flight shows its own departure/arrival airport local time."
              selected={timeZoneMode === 'airport'}
              onPress={() => onSelectTimeZone('airport')}
              testID="tz-option-airport"
            />
            <TimeZoneOption
              title="Base time (Bangkok)"
              subtitle="All times shown in the base timezone (Asia/Bangkok)."
              selected={timeZoneMode === 'base'}
              onPress={() => onSelectTimeZone('base')}
              testID="tz-option-base"
            />
            <TimeZoneOption
              title="UTC"
              subtitle="All times shown in Coordinated Universal Time."
              selected={timeZoneMode === 'utc'}
              onPress={() => onSelectTimeZone('utc')}
              testID="tz-option-utc"
            />
            <TimeZoneOption
              title="Phone Local Time"
              subtitle="All times shown in your phone's current timezone."
              selected={timeZoneMode === 'device'}
              onPress={() => onSelectTimeZone('device')}
              testID="tz-option-device"
            />
          </View>
        </View>

        {/* ── Preferences ── */}
        <Text style={styles.sectionHeading}>Preferences</Text>
        <View style={styles.card}>
          <Setting label="Language" value="English" />
          <Setting label="Appearance" value="System" />
          <Setting label="Connected accounts" value="None" />
          <Setting label="Version" value={String(APP_VERSION)} />
        </View>

        <TouchableOpacity style={styles.signOut} activeOpacity={0.8} onPress={onLogout} testID="logout-btn">
          <Text style={styles.signOutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.xl24,
    paddingBottom: 28,
    alignItems: 'center',
    overflow: 'hidden', // clip the backdrop texture to the header
  },
  // No backing disc — the cartoon blends straight onto the purple header.
  avatarWrap: { marginBottom: space.sm8 },
  tagline: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  // Apple Chancery is macOS-only; Snell Roundhand is the iOS-native calligraphic
  // script (the closest equivalent). Ships on iOS, so it renders on device.
  taglineText: { color: colors.onPrimary, fontSize: 30, fontFamily: 'Snell Roundhand', fontWeight: '700', letterSpacing: 0.2 },

  content: { padding: space.lg16, paddingBottom: 40 },

  sectionHeading: {
    ...font.overline,
    color: colors.muted,
    marginTop: space.sm8,
    marginBottom: space.sm8,
    marginLeft: space.xs4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.xs4,
    marginBottom: space.lg16,
    overflow: 'hidden',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg16,
    gap: space.md12,
  },
  toggleLabel: { ...font.bodyStrong, fontWeight: '600', color: colors.ink },
  toggleSub: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },

  // Island toggle sits inside the meetings card body, divided from the reminder
  // row above by a hairline (no outer padding — the clockSection already pads).
  islandToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md12,
    paddingTop: space.md12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },

  clockSection: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    padding: space.lg16,
    gap: space.md12,
  },
  clockRow: {
    backgroundColor: colors.bg,
    borderRadius: radius.op,
    padding: space.md12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  clockRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clockTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm8 },
  clockTitle: { ...font.bodyStrong, color: colors.ink },
  clockTime: { fontSize: 14, fontWeight: '700', color: colors.accent },
  clockTooltip: { fontSize: 12, color: colors.muted, marginTop: space.xs4, lineHeight: 17 },

  // Always-visible offset picker — the current selection stays highlighted.
  hourChips: { gap: space.sm8, paddingTop: space.sm8, paddingRight: space.xs4 },
  hourChip: {
    paddingHorizontal: space.md12,
    paddingVertical: 6,
    borderRadius: radius.op,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  hourChipActive: { backgroundColor: colors.tintBg, borderColor: colors.accent },
  hourChipText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  hourChipTextActive: { color: colors.primary },

  dutyCount: { fontSize: 12, color: colors.muted, lineHeight: 17 },

  scheduledBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: space.md12,
    gap: space.sm8,
  },
  scheduledHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  scheduledEmpty: { fontSize: 12, color: colors.faint, lineHeight: 17 },
  alarmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md12,
    backgroundColor: colors.bg,
    borderRadius: radius.op,
    padding: space.md12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  alarmItemTitle: { fontSize: 12, color: colors.ink, fontWeight: '600', lineHeight: 16 },
  alarmItemWhen: { fontSize: 11, color: colors.accent, fontWeight: '600', marginTop: 2 },

  // Time Zone
  tzIntro: { fontSize: 12, color: colors.muted, lineHeight: 17, padding: space.lg16, paddingBottom: space.xs4 },
  tzOptions: { padding: space.md12, paddingTop: space.xs4, gap: space.sm8 },
  tzOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md12,
    backgroundColor: colors.bg,
    borderRadius: radius.op,
    padding: space.md12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tzOptionSelected: {
    backgroundColor: colors.tintBg,
    borderColor: colors.accent,
  },
  tzOptionTitle: { ...font.bodyStrong, color: colors.ink },
  tzOptionTitleSelected: { color: colors.primary },
  tzOptionSub: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 16 },
  tzCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.tintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tzCheckSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  tzCheckMark: { color: colors.onPrimary, fontSize: 14, fontWeight: '800' },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg16,
    paddingVertical: space.lg16,
  },
  settingLabel: { ...font.body, color: colors.ink },
  settingValue: { ...font.body, color: colors.muted },

  signOut: {
    paddingVertical: space.lg16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  signOutText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
