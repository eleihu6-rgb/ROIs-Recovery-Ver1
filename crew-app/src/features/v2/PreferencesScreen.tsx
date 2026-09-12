// Profile ▸ Preferences — Language / Appearance / Connected accounts
// plus Explore destination preferences (settings.explorePrefs), re-homed.
import React, { useState } from 'react';
import { DashedLine } from '../../components/v2/TicketCard';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { isCalendarWriteAvailable, requestCalendarAccess, saveCalendarEvents } from '../meetings/calendarModule';
import { setMeetingsEnabled, syncMeetings } from '../meetings/meetingsSlice';
import { deviceTimeZone } from '../settings/timeFormat';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectCrewCarrier } from '../auth/authSlice';
import { THEME_LABELS, resolveTheme, useCarrier } from '../../theme/carrier';
import { NavRow, SectionLabel, ToggleRow } from '../../components/v2/rows';
import { PageShell, ListCard, KvRow } from './PageShell';
import { setExplorePrefs } from '../settings/settingsSlice';
import { EXPLORE_CATEGORIES } from '../explore/explorePlaces';
import { useV2Nav } from './nav';

export function PreferencesScreen() {
  const p = useCarrier();
  const nav = useV2Nav();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(s => s.settings.explorePrefs);
  // Theme rows name the crew's own carrier (K1003 = EK) once the roster resolved it.
  const airline = useAppSelector(selectCrewCarrier) ?? '';
  const themePreset = useAppSelector(s => s.settings.themePreset);
  const themeLabel = THEME_LABELS[resolveTheme(themePreset, airline)];
  const [push, setPush] = useState(true);
  const [roster, setRoster] = useState(true);
  const divider = {};
  const toggle = (id: string) => dispatch(setExplorePrefs(prefs.includes(id) ? prefs.filter(x => x !== id) : [...prefs, id]));

  // Dev-only: seed synthetic meetings into the iOS Calendar (EventKit write) so the
  // meeting reminder (AlarmKit) and Dynamic Island countdown can be exercised on a
  // simulator that has no synced calendar. First one lands 10 min out.
  // Two of them carry a real Teams join link so the Schedule tab's "Join" button
  // and the per-meeting reminder can be exercised on device too.
  const addDemoMeetings = async () => {
    if (!isCalendarWriteAvailable()) { Alert.alert('Calendar unavailable', 'This build has no EventKit module.'); return; }
    const access = await requestCalendarAccess();
    if (access !== 'authorized') { Alert.alert('Permission needed', 'Allow calendar access to add demo meetings.'); return; }
    const tz = deviceTimeZone();
    const at = (minsFromNow: number, days = 0, h?: number, m = 0) => {
      const d = new Date(Date.now() + minsFromNow * 60000 + days * 86400000);
      if (h != null) d.setHours(h, m, 0, 0);
      return d;
    };
    const ev = (title: string, start: Date, mins: number, notes: string) => ({ title, startISO: start.toISOString(), endISO: new Date(start.getTime() + mins * 60000).toISOString(), timeZone: tz, notes });
    const teams = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_NDA2MjM4%40thread.v2/0?context=%7b%22Tid%22%3a%22demo%22%7d';
    const ids = await saveCalendarEvents([
      ev('Fleet standardisation briefing', at(10), 60, `Ops Centre · Room 3B\nJoin: ${teams}`),
      ev('CRM refresher (online)', at(0, 1, 14, 0), 45, `Teams\n${teams}`),
      ev('Crew scheduling sync', at(0, 5, 10, 30), 30, 'Crew Control'),
      ev('A350 recurrent ground school', at(0, 9, 8, 30), 480, 'Training Centre 2A'),
    ]);
    await dispatch(setMeetingsEnabled(true));
    await dispatch(syncMeetings());
    Alert.alert('Demo meetings added', `${ids.length} events written to the iOS Calendar. Meeting alarms are on.`);
  };

  return (
    <PageShell title="Preferences" testID="page-preferences">
      <SectionLabel palette={p}>Notifications</SectionLabel>
      <ListCard palette={p}>
        <View style={divider}><ToggleRow label="Push notifications" value={push} onValueChange={setPush} palette={p} /><DashedLine color={p.cardLine} /></View>
        <ToggleRow label="Roster changes" value={roster} onValueChange={setRoster} palette={p} />
      </ListCard>
      <SectionLabel palette={p}>Display</SectionLabel>
      <ListCard palette={p}>
        <View style={divider}><NavRow icon="sliders" label="Appearance" value={themeLabel} palette={p} onPress={() => nav.navigate('Appearance')} testID="row-appearance" /><DashedLine color={p.cardLine} /></View>
        <NavRow icon="doc" label="Language" value="English" palette={p} onPress={() => nav.navigate('Spec', { id: 'lang' })} />
      </ListCard>
      <SectionLabel palette={p}>Explore</SectionLabel>
      <ListCard palette={p}>
        <View style={s.col}>
          <Text style={[s.lb, { color: p.cardInk }]}>Destination preferences</Text>
          <Text style={[s.sub, { color: p.cardSoft }]}>What the Explore cards highlight for each layover.</Text>
          <View style={s.chips}>
            {EXPLORE_CATEGORIES.map(c => {
              const on = prefs.includes(c.key);
              return <Pressable key={c.key} onPress={() => toggle(c.key)} style={[s.chip, { borderColor: on ? p.btn : p.cardLine, backgroundColor: on ? p.btn : 'transparent' }]} testID={`pref-${c.key}`}><Text style={{ color: on ? '#fff' : p.cardInk, fontSize: 13, fontWeight: '500' }}>{c.label}</Text></Pressable>;
            })}
          </View>
        </View>
      </ListCard>
      <SectionLabel palette={p}>Sync</SectionLabel>
      <ListCard palette={p}>
        <KvRow label="Connected accounts" value="None" palette={p} last={!__DEV__} />
        {__DEV__ && <NavRow icon="cal" label="Add demo meetings (dev)" value="4 events" palette={p} onPress={addDemoMeetings} testID="dev-demo-meetings" />}
      </ListCard>
    </PageShell>
  );
}

const s = StyleSheet.create({
  col: { paddingVertical: 15, gap: 10 },
  lb: { fontSize: 15, fontWeight: '500' },
  sub: { fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
