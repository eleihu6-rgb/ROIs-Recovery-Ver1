// Profile ▸ Alarms & Meetings — the existing ProfileScreen "Clock Setup" and
// "Meetings" sections re-homed on a full page (mock alarms page). Same slices,
// same actions, same presets; only the presentation changed.
import React, { useCallback, useMemo, useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, Alert, StyleSheet, Pressable } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { ChipRow, SectionLabel, ToggleRow } from '../../components/v2/rows';
import { Icon } from '../../components/v2/icons';
import { PageShell, ListCard } from './PageShell';
import { setEnabled, setGlobalAlarmHours } from '../alarms/alarmsSlice';
import { PRESET_HOURS } from '../settings/alarmSetup';
import { MEETING_MINUTES_PRESETS, ISLAND_MINUTES_PRESETS } from '../meetings/meetingSetup';
import { setIslandCountdown, setIslandLeadMinutes, setMeetingMinutes, setMeetingsEnabled } from '../meetings/meetingsSlice';
import { isAlarmModuleAvailable, requestAlarmAuthorization, scheduleTestAlarm } from '../settings/alarmModule';

export const alertAlarmsUnavailable = () =>
  Alert.alert('Alarms unavailable', 'iOS clock alarms need a device build with AlarmKit; they are not available in this build.');
import { useAlarms } from './useV2';

const fmtHours = (h: number) => `${h}h`;
const fmtMinutes = (m: number) => `${m} min`;

export function AlarmsSettingsScreen() {
  const p = useCarrier();
  const dispatch = useAppDispatch();
  const alarmsEnabled = useAppSelector(s => s.alarms.enabled);
  const wakeUpHours = useAppSelector(s => s.alarms.wakeUpHours);
  const leaveHomeHours = useAppSelector(s => s.alarms.leaveHomeHours);
  const meetingsEnabled = useAppSelector(s => s.meetings.enabled);
  const meetingMinutes = useAppSelector(s => s.meetings.minutesBefore);
  const meetingCount = useAppSelector(s => s.meetings.meetings.length);
  const islandCountdown = useAppSelector(s => s.meetings.islandCountdown);
  const islandLeadMinutes = useAppSelector(s => s.meetings.islandLeadMinutes);
  const [now] = useState(() => new Date());
  const { all: effective } = useAlarms(now);
  const [busy, setBusy] = useState(false);
  const divider = {};

  const onToggleAlarms = useCallback(async (value: boolean) => {
    if (value && !isAlarmModuleAvailable()) { alertAlarmsUnavailable(); return; }
    setBusy(true);
    try {
      const res = await dispatch(setEnabled(value));
      if (value && res.available && res.scheduled === 0 && effective.length > 0) {
        Alert.alert('Permission needed', 'Allow alarm access in iOS Settings to set your flight alarms.');
      }
    } finally { setBusy(false); }
  }, [dispatch, effective.length]);

  const onToggleMeetings = useCallback(async (value: boolean) => {
    if (value && !isAlarmModuleAvailable()) { alertAlarmsUnavailable(); return; }
    setBusy(true);
    try { await dispatch(setMeetingsEnabled(value)); } finally { setBusy(false); }
  }, [dispatch]);

  const onTestAlarm = useCallback(async () => {
    if (!isAlarmModuleAvailable()) { alertAlarmsUnavailable(); return; }
    try {
      const auth = await requestAlarmAuthorization();
      if (auth !== 'authorized') { Alert.alert('Permission needed', 'Allow alarm access to set a test alarm.'); return; }
      await scheduleTestAlarm(60);
      Alert.alert('Test alarm set', 'Rings in 1 minute.');
    } catch (err) { Alert.alert('Could not set test alarm', (err as Error).message); }
  }, []);

  return (
    <PageShell title="Alarms & Meetings" testID="page-alarms">
      <SectionLabel palette={p}>Clock setup</SectionLabel>
      <ListCard palette={p}>
        <View style={divider}><ToggleRow label="Enable iOS clock alarms" sub="Set Get Ready and Leave Home alarms before each flight duty." value={alarmsEnabled} onValueChange={v => { if (!busy) onToggleAlarms(v); }} palette={p} testID="alarms-toggle" /><DashedLine color={p.cardLine} /></View>
        <View style={[divider, s.chipWrap]}><ChipRow label="Get Ready" icon="clock" rightLabel={`Dep − ${fmtHours(wakeUpHours)}`} options={PRESET_HOURS} value={wakeUpHours} formatOption={fmtHours} palette={p} onSelect={h => dispatch(setGlobalAlarmHours({ wakeUpHours: h, leaveHomeHours }))} /><DashedLine color={p.cardLine} /></View>
        <View style={[divider, s.chipWrap]}><ChipRow label="Leave Home" icon="house" rightLabel={`Dep − ${fmtHours(leaveHomeHours)}`} options={PRESET_HOURS} value={leaveHomeHours} formatOption={fmtHours} palette={p} onSelect={h => dispatch(setGlobalAlarmHours({ wakeUpHours, leaveHomeHours: h }))} /><DashedLine color={p.cardLine} /></View>
        <View style={[divider, s.sched]}>
          <Text style={[s.schedH, { color: p.cardInk }]}>Scheduled alarms</Text>
          <Text style={[s.schedS, { color: p.cardSoft }]}>{effective.length > 0 ? `Set automatically for ${effective.length} upcoming flight${effective.length === 1 ? '' : 's'} (local airport time).` : 'No upcoming flights yet — alarms set themselves once a roster is loaded.'}</Text>
          {effective.flatMap(a => [
            a.wakeUp && <AlarmLine key={`${a.dutyId}-w`} icon="clock" text={`${a.wakeWord} · ${a.fltNumber} ${a.dep} – ${a.arv}`} when={`${a.wakeUp.hhmm} · ${a.timeZone}`} />,
            a.leaveHome && <AlarmLine key={`${a.dutyId}-l`} icon="house" text={`Leave Home · ${a.fltNumber} ${a.dep} – ${a.arv}`} when={`${a.leaveHome.hhmm} · ${a.timeZone}`} />,
          ])}
        </View>
        <Pressable onPress={onTestAlarm} style={s.test} testID="test-alarm"><Text style={{ color: p.btn, fontSize: 15, fontWeight: '500' }}>Send a test alarm (rings in 1 min)</Text></Pressable>
      </ListCard>

      <SectionLabel palette={p}>Meetings</SectionLabel>
      <ListCard palette={p}>
        <View style={divider}><ToggleRow label="Alarm for meeting events" sub="Read meetings from your calendar (Outlook/Exchange synced to iOS) and ring before each one." value={meetingsEnabled} onValueChange={v => { if (!busy) onToggleMeetings(v); }} palette={p} testID="meetings-toggle" /><DashedLine color={p.cardLine} /></View>
        <View style={[divider, s.chipWrap]}><ChipRow label="Reminder" icon="cal" rightLabel={`${fmtMinutes(meetingMinutes)} before`} options={MEETING_MINUTES_PRESETS} value={meetingMinutes} formatOption={fmtMinutes} palette={p} onSelect={m => dispatch(setMeetingMinutes(m))} /><DashedLine color={p.cardLine} /></View>
        <View style={divider}><ToggleRow label="Dynamic Island countdown" sub="Live countdown in the Dynamic Island before a meeting starts." value={islandCountdown} onValueChange={v => dispatch(setIslandCountdown(v))} palette={p} testID="island-toggle" /><DashedLine color={p.cardLine} /></View>
        <View style={[divider, s.chipWrap]}><ChipRow label="Countdown" icon="clock" rightLabel={`${fmtMinutes(islandLeadMinutes)} before`} options={ISLAND_MINUTES_PRESETS} value={islandLeadMinutes} formatOption={fmtMinutes} palette={p} onSelect={m => dispatch(setIslandLeadMinutes(m))} /><DashedLine color={p.cardLine} /></View>
        <Text style={[s.schedS, { color: p.cardSoft, paddingVertical: 14 }]}>{meetingCount > 0 ? `Reading ${meetingCount} upcoming meeting${meetingCount === 1 ? '' : 's'} from your calendar — each rings ${fmtMinutes(meetingMinutes)} before it starts.` : 'No upcoming meetings found on your calendar yet. New invites are picked up on next launch.'}</Text>
      </ListCard>
    </PageShell>
  );
}

export function AlarmLine({ icon, text, when, sub }: { icon: 'clock' | 'house' | 'cal'; text: string; when: string; sub?: string }) {
  const p = useCarrier();
  return (
    <View style={s.line}>
      <Icon name={icon} size={18} color={p.btn} />
      <View style={{ flex: 1 }}><Text style={{ color: p.cardInk, fontSize: 13 }} numberOfLines={2}>{text}</Text>{!!sub && <Text style={{ color: p.cardSoft, fontSize: 12 }}>{sub}</Text>}</View>
      <Text style={{ color: p.cardSoft, fontSize: 12 }}>{when}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chipWrap: { paddingVertical: 14 },
  sched: { paddingVertical: 14, gap: 4 },
  schedH: { fontSize: 15, fontWeight: '600' },
  schedS: { fontSize: 12, lineHeight: 17 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  test: { paddingVertical: 15 },
});
