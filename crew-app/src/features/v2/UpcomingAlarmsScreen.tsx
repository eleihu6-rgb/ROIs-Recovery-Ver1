// Home ▸ alarm icon: every upcoming iOS alarm with the same master switch as
// Profile ▸ Alarms & Meetings (mock upalarms page).
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store';
import { useCarrier } from '../../theme/carrier';
import { NavRow, SectionLabel, ToggleRow } from '../../components/v2/rows';
import { PageShell, ListCard } from './PageShell';
import { setEnabled } from '../alarms/alarmsSlice';
import { isAlarmModuleAvailable } from '../settings/alarmModule';
import { useAlarms } from './useV2';
import { AlarmLine, alertAlarmsUnavailable } from './AlarmsSettingsScreen';
import { useV2Nav } from './nav';

export function UpcomingAlarmsScreen() {
  const p = useCarrier();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(s => s.alarms.enabled);
  const wake = useAppSelector(s => s.alarms.wakeUpHours);
  const leave = useAppSelector(s => s.alarms.leaveHomeHours);
  const meetings = useAppSelector(s => s.meetings.meetings);
  const meetingsEnabled = useAppSelector(s => s.meetings.enabled);
  const minutesBefore = useAppSelector(s => s.meetings.minutesBefore);
  const [now] = useState(() => new Date());
  const { all } = useAlarms(now);
  const dim = enabled ? 1 : 0.35;
  const upcomingMeetings = meetings.filter(m => !m.allDay && new Date(m.startISO).getTime() > now.getTime()).slice(0, 8);

  return (
    <PageShell title="Upcoming Alarms" testID="page-upcoming-alarms">
      <ListCard palette={p}>
        <ToggleRow label="iOS clock alarms" sub="Get Ready and Leave Home before each flight duty · meeting reminders from your calendar." value={enabled} palette={p} testID="upalarms-master"
          onValueChange={v => { if (v && !isAlarmModuleAvailable()) { alertAlarmsUnavailable(); return; } dispatch(setEnabled(v)); }} />
      </ListCard>
      <SectionLabel palette={p}>Flights · local airport time</SectionLabel>
      <ListCard palette={p} style={{ opacity: dim }}>
        {all.length === 0 && <Text style={[s.empty, { color: p.cardSoft }]}>No upcoming flights.</Text>}
        {all.flatMap(a => [
          a.wakeUp && <AlarmLine key={`${a.dutyId}-w`} icon="clock" text={`${a.wakeWord} · ${a.fltNumber} ${a.dep} – ${a.arv}`} sub={a.checkInLabel} when={`${a.wakeUp.hhmm} · ${a.timeZone}`} />,
          a.leaveHome && <AlarmLine key={`${a.dutyId}-l`} icon="house" text={`Leave Home · ${a.fltNumber} ${a.dep} – ${a.arv}`} sub={a.checkInLabel} when={`${a.leaveHome.hhmm} · ${a.timeZone}`} />,
        ])}
      </ListCard>
      <SectionLabel palette={p}>Meetings · {minutesBefore} min before</SectionLabel>
      <ListCard palette={p} style={{ opacity: meetingsEnabled ? 1 : 0.35 }}>
        {upcomingMeetings.length === 0 && <Text style={[s.empty, { color: p.cardSoft }]}>No upcoming meetings on your calendar.</Text>}
        {upcomingMeetings.map(m => {
          const t = new Date(new Date(m.startISO).getTime() - minutesBefore * 60000);
          return <AlarmLine key={m.id} icon="cal" text={m.title} sub={m.calendarTitle} when={`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`} />;
        })}
      </ListCard>
      <ListCard palette={p} style={{ marginTop: 14 }}>
        <NavRow icon="sliders" label="Alarm settings" value={`Dep − ${wake}h · Dep − ${leave}h`} palette={p} onPress={() => nav.navigate('AlarmsSettings')} testID="upalarms-settings" />
      </ListCard>
    </PageShell>
  );
}

const s = StyleSheet.create({ empty: { fontSize: 13, paddingVertical: 12 } });
